/**
 * 上游「脚本过滤 / 脚本操作 / 修改响应」的解释器。
 *
 * Workers 禁止 eval / new Function，上游用 new Function(script) 生成脚本函数的做法走不通。
 * 这里换成 QuickJS（Wasm）执行同一段脚本，并按上游 new Function 的参数表注入全局对象：
 *
 *   宿主 (JS)                           QuickJS (Wasm)
 *   ────────────────────────────────    ──────────────────────────────
 *   节点列表 / 返回值   ──── JSON ────▶ 真实对象，脚本可原地改
 *   $options / context  ──── Proxy ───▶ 读写直接落回宿主对象
 *   lodash / ProxyUtils ──── Proxy ───▶ 属性按需桥接，不预先展开
 *   宿主异步函数        ── Promise ──▶ QuickJS promise，由驱动循环推进
 *
 * 批量数据走 JSON 而不是逐属性桥接：节点动辄几千个，逐个过桥太贵。
 *
 * 成本：QuickJS 解释执行的 CPU 远高于原生，免费档 10 ms 基本跑不完一条脚本，
 * 本功能实际需要 Workers 付费档（默认 30 s CPU）。
 */

import quickjsWasm from './quickjs.wasm';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import { Scope, newVariant, newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';

const MEMORY_LIMIT_BYTES = 64 * 1024 * 1024;
const STACK_LIMIT_BYTES = 2 * 1024 * 1024;

// Workers 里 Date.now() 在执行期间冻结，做不了墙钟超时，只能按字节码指令数给预算。
const INTERRUPT_BUDGET = 4_000_000;
const BUDGET_MESSAGE = '脚本执行超出 CPU 预算被中止；免费档 10 ms 上限下基本必然触发';
const DANGLING_AWAIT_MESSAGE = '脚本 await 的异步操作无法在 Worker 中完成';

/** 上游闭包里按引用共享的对象：脚本改完要传回宿主，所以不能用 JSON 复制。 */
const BY_REFERENCE = new Set(['$arguments', '$options']);

/** VM 内的桥接助手。宿主对象带一个 HOST 符号，用来识别「这是宿主引用」并还原。 */
const PRELUDE = `
globalThis.__dox = (() => {
    const HOST = Symbol('doxHost');

    return {
        HOST,
        fromJson(text) { return JSON.parse(text); },
        toJson(value) { return JSON.stringify(value); },

        // 宿主函数：apply 转发调用，construct 转发 new，get 转发静态属性（Buffer.from 之类）。
        makeFunction(id, apply, construct, get) {
            const target = function doxHostFunction() {};
            target[HOST] = id;

            return new Proxy(target, {
                get(t, key) {
                    if (key === HOST) return id;
                    if (typeof key === 'symbol') return undefined;
                    return get(String(key));
                },
                apply(t, thisArg, args) { return apply(thisArg, args); },
                construct(t, args) { return construct(args); },
            });
        },

        // 宿主数组按引用桥接后，for...of / 展开只能自己按索引迭代到底。
        makeIterator(get) {
            return function () {
                let index = 0;

                return {
                    next() {
                        const value = get(String(index));
                        if (value === undefined) return { done: true, value: undefined };
                        index += 1;
                        return { done: false, value };
                    },
                };
            };
        },

        // 宿主对象：读、写、删除都落回宿主对象，Object.keys / 展开 / in 也要正确。
        makeObject(id, get, set, has, ownKeys, del, desc, iterate) {
            const target = {};
            target[HOST] = id;

            return new Proxy(target, {
                get(t, key) {
                    if (key === HOST) return id;
                    // 宿主数组按引用桥接后，for...of / 展开只能自己实现索引迭代。
                    if (key === Symbol.iterator) return iterate();
                    if (typeof key === 'symbol') return undefined;
                    return get(String(key));
                },
                set(t, key, value) { set(String(key), value); return true; },
                has(t, key) { return key === HOST ? true : has(String(key)); },
                deleteProperty(t, key) { del(String(key)); return true; },
                ownKeys() { return ownKeys(); },
                getOwnPropertyDescriptor(t, key) {
                    if (typeof key === 'symbol' || !desc(String(key))) return undefined;
                    return { value: undefined, enumerable: true, configurable: true, writable: true };
                },
            });
        },
    };
})();
`;

/**
 * 首次调用才实例化 Wasm。Workers 只接受预编译模块（WebAssembly.instantiate 不收字节码），
 * wasm 由 wrangler 静态打包，这里只负责 init。
 * 失败留到真正用脚本时再抛，避免拖垮其它功能。
 */
let modulePromise;

function loadQuickJS() {
    modulePromise ??= newQuickJSWASMModuleFromVariant(
        newVariant(variant, { wasmModule: () => quickjsWasm }),
    );

    return modulePromise;
}

/**
 * 对应上游的 createDynamicFunction：把脚本包成函数并立即执行，取回脚本定义的入口函数。
 *
 * @param {string} name    入口函数名（operator / filter / transformFunction）
 * @param {string} script  用户脚本
 * @param {object} globals 上游 new Function 的参数表
 * @returns {Promise<Function>} 入口函数，签名与上游一致
 */
export async function createScriptFunction(name, script, globals) {
    const QuickJS = await loadQuickJS();

    return (...callArgs) => runScript(QuickJS, name, script, globals, callArgs);
}

async function runScript(QuickJS, name, script, globals, callArgs) {
    return Scope.withScopeAsync(async (scope) => {
        // newContext() 不把 runtime 选项转发给 newRuntime()，只能建完再配置。
        const ctx = scope.manage(QuickJS.newContext());
        const runtime = ctx.runtime;
        let budget = INTERRUPT_BUDGET;

        runtime.setMemoryLimit(MEMORY_LIMIT_BYTES);
        runtime.setMaxStackSize(STACK_LIMIT_BYTES);
        runtime.setInterruptHandler(() => --budget <= 0);

        try {
            return await createBridge(scope, ctx, runtime)(name, script, globals, callArgs);
        } catch (error) {
            throw normalizeError(error);
        }
    });
}

/** 宿主 <-> QuickJS 的双向搬运。脚本执行一次对应一个 bridge。 */
function createBridge(scope, ctx, runtime) {
    const hostRefs = new Map();
    const hostProxies = new Map();
    const pending = new Set();

    scope.manage(ctx.unwrapResult(ctx.evalCode(PRELUDE)));

    const dox = manage(ctx.getProp(ctx.global, '__dox'));
    const fromJson = manage(ctx.getProp(dox, 'fromJson'));
    const toJson = manage(ctx.getProp(dox, 'toJson'));
    const makeFunction = manage(ctx.getProp(dox, 'makeFunction'));
    const makeObject = manage(ctx.getProp(dox, 'makeObject'));
    const makeIteratorFactory = manage(ctx.getProp(dox, 'makeIterator'));
    const hostSymbol = manage(ctx.getProp(dox, 'HOST'));

    function manage(handle) {
        return scope.manage(handle);
    }

    /** 宿主 -> VM。纯数据走 JSON，宿主对象/函数走 Proxy。 */
    function bridgeIn(value) {
        return needsBridge(value) ? hostRef(value) : jsonIn(value);
    }

    function jsonIn(value) {
        const text = JSON.stringify(value);

        if (text === undefined) {
            return ctx.undefined;
        }

        return manage(ctx.unwrapResult(ctx.callFunction(fromJson, ctx.undefined, manage(ctx.newString(text)))));
    }

    /** VM -> 宿主。宿主替身还原成原对象，其余走 JSON。 */
    function jsonOut(handle) {
        const original = unwrapHost(handle);

        if (original !== undefined) {
            return original;
        }

        if (ctx.typeof(handle) === 'undefined') {
            return undefined;
        }

        const text = manage(ctx.unwrapResult(ctx.callFunction(toJson, ctx.undefined, handle)));

        return ctx.typeof(text) === 'undefined' ? undefined : JSON.parse(ctx.getString(text));
    }

    /** 参数数组要逐个搬运，才能把宿主替身还原成原对象（Buffer.isBuffer(buf) 之类）。 */
    function jsonOutArgs(handle) {
        const length = ctx.getNumber(manage(ctx.getProp(handle, 'length')));
        const args = [];

        for (let index = 0; index < length; index += 1) {
            args.push(jsonOut(manage(ctx.getProp(handle, index))));
        }

        return args;
    }

    function unwrapHost(handle) {
        const type = ctx.typeof(handle);

        if (type !== 'object' && type !== 'function') {
            return undefined;
        }

        const id = manage(ctx.getProp(handle, hostSymbol));

        return ctx.typeof(id) === 'number' ? hostRefs.get(ctx.getNumber(id)) : undefined;
    }

    /** 宿主对象在 VM 内的替身；同一个宿主对象只桥接一次，保持 === 语义。 */
    function hostRef(target) {
        if (hostProxies.has(target)) {
            return hostProxies.get(target);
        }

        const id = hostRefs.size + 1;
        hostRefs.set(id, target);

        const idHandle = manage(ctx.newNumber(id));
        const handle =
            typeof target === 'function' ? hostFunction(idHandle, target) : hostObject(idHandle, target);

        hostProxies.set(target, handle);
        return handle;
    }

    function hostFunction(idHandle, target) {
        // thisArg 必须传下去：array.push / yaml.safeLoad 这类方法都依赖调用者。
        const apply = fn(
            (thisHandle, argsHandle) => settle(target.apply(jsonOut(thisHandle), jsonOutArgs(argsHandle))),
            'apply',
        );
        const construct = fn((argsHandle) => settle(Reflect.construct(target, jsonOutArgs(argsHandle))), 'construct');
        const get = fn((keyHandle) => member(target, ctx.getString(keyHandle)), 'get');

        return manage(
            ctx.unwrapResult(ctx.callFunction(makeFunction, ctx.undefined, idHandle, apply, construct, get)),
        );
    }

    function hostObject(idHandle, target) {
        const get = fn((keyHandle) => member(target, ctx.getString(keyHandle)), 'get');
        const set = fn((keyHandle, valueHandle) => {
            target[ctx.getString(keyHandle)] = jsonOut(valueHandle);
        }, 'set');
        const has = fn((keyHandle) => jsonIn(ctx.getString(keyHandle) in target), 'has');
        const ownKeys = fn(
            () => jsonIn(Reflect.ownKeys(target).filter((key) => typeof key === 'string')),
            'ownKeys',
        );
        const del = fn((keyHandle) => {
            delete target[ctx.getString(keyHandle)];
        }, 'del');
        const desc = fn((keyHandle) => jsonIn(ctx.getString(keyHandle) in target), 'desc');
        const iterate = fn(() => makeIterator(get), 'iterate');
        return manage(
            ctx.unwrapResult(
                ctx.callFunction(makeObject, ctx.undefined, idHandle, get, set, has, ownKeys, del, desc, iterate),
            ),
        );
    }

    /** 宿主对象上读到的成员一律按引用桥接，原始值除外：脚本改了要落回宿主。 */
    function member(target, key) {
        const value = target[key];

        return isObject(value) || typeof value === 'function' ? hostRef(value) : jsonIn(value);
    }

    /** 宿主数组的迭代器：索引读到 undefined 为止，够 for...of 和展开用。 */
    function makeIterator(get) {
        return manage(ctx.unwrapResult(ctx.callFunction(makeIteratorFactory, ctx.undefined, get)));
    }

    function fn(impl, name) {
        return manage(ctx.newFunction(name, impl));
    }

    /** 宿主异步函数：挂一个 QuickJS promise，由驱动循环在宿主侧落地后推进。 */
    function settle(result) {
        if (!result || typeof result.then !== 'function') {
            return bridgeIn(result);
        }

        const deferred = manage(ctx.newPromise());
        pending.add(deferred.settled);

        result.then(
            (value) => {
                deferred.resolve(bridgeIn(value));
                pending.delete(deferred.settled);
            },
            (error) => {
                deferred.reject(manage(ctx.newError(String((error && error.message) || error))));
                pending.delete(deferred.settled);
            },
        );

        return deferred.handle;
    }

    /** 推进 QuickJS 微任务队列，直到脚本返回的 promise 落地。 */
    async function drive(handle) {
        for (;;) {
            const jobs = runtime.executePendingJobs();

            if (jobs.error) {
                throw new Error(dumpError(manage(jobs.error)));
            }

            const state = ctx.getPromiseState(handle);

            if (state.type === 'fulfilled') {
                return manage(state.value);
            }

            if (state.type === 'rejected') {
                throw new Error(dumpError(manage(state.error)));
            }

            if (pending.size === 0) {
                throw new Error(DANGLING_AWAIT_MESSAGE);
            }

            // 等宿主侧任意一个异步操作落地，再回到上面重跑 QuickJS 微任务。
            await Promise.race(pending);
        }
    }

    return async function callEntry(name, script, globals, callArgs) {
        const names = Object.keys(globals);
        const factory = manage(
            ctx.unwrapResult(
                ctx.evalCode(
                    `(function (${names.join(', ')}) {\n${script}\n; return ${name};\n})`,
                    'sub-store-script.js',
                ),
            ),
        );

        const globalHandles = names.map((key) =>
            BY_REFERENCE.has(key) && isObject(globals[key]) ? hostRef(globals[key]) : bridgeIn(globals[key]),
        );
        const entry = manage(ctx.unwrapResult(ctx.callFunction(factory, ctx.undefined, ...globalHandles)));

        // 第一个参数是批量数据（节点列表 / 响应体），其余是 targetPlatform 与 context。
        const [input, ...rest] = callArgs;
        const inputHandle = jsonIn(input);
        const restHandles = rest.map((value) => (isObject(value) ? hostRef(value) : jsonIn(value)));
        const result = ctx.callFunction(entry, ctx.undefined, inputHandle, ...restHandles);

        if (result.error) {
            throw new Error(dumpError(manage(result.error)));
        }

        const returned = jsonOut(await drive(manage(result.value)));

        // 上游按引用把数据交给脚本；脚本原地改完不返回时，改动要写回原对象。
        if (!returned && isObject(input)) {
            writeBack(input, jsonOut(inputHandle));
        }

        return returned;
    };

    function dumpError(handle) {
        if (ctx.typeof(handle) !== 'object') {
            return String(ctx.dump(handle));
        }

        const message = manage(ctx.getProp(handle, 'message'));
        const name = manage(ctx.getProp(handle, 'name'));
        const text = ctx.typeof(message) === 'string' ? ctx.getString(message) : String(ctx.dump(handle));
        const kind = ctx.typeof(name) === 'string' ? ctx.getString(name) : '';

        return kind && kind !== 'Error' ? `${kind}: ${text}` : text;
    }
}

/** 浅层出现函数就说明不是纯数据；lodash 这一层必然带函数，节点列表则不带。 */
function needsBridge(value) {
    if (typeof value === 'function') {
        return true;
    }

    if (!isObject(value)) {
        return false;
    }

    if (Array.isArray(value)) {
        return value.some((item) => typeof item === 'function');
    }

    const prototype = Object.getPrototypeOf(value);

    if (prototype !== Object.prototype && prototype !== null) {
        return true;
    }

    return Object.keys(value).some((key) => typeof value[key] === 'function');
}

function isObject(value) {
    return value !== null && typeof value === 'object';
}

/** 原地改写宿主对象，保持上游「同一个引用」的语义。 */
function writeBack(target, source) {
    if (!isObject(source)) {
        return;
    }

    if (Array.isArray(target) && Array.isArray(source)) {
        target.length = 0;

        for (const item of source) {
            target.push(item);
        }

        return;
    }

    for (const key of Object.keys(target)) {
        if (!(key in source)) {
            delete target[key];
        }
    }

    for (const key of Object.keys(source)) {
        target[key] = source[key];
    }
}

/** QuickJS 的中断错误对用户没有意义，翻译成能直接照做的说明。 */
function normalizeError(error) {
    const message = String((error && error.message) || error);

    return message.includes('interrupted') ? new Error(BUDGET_MESSAGE) : error;
}
