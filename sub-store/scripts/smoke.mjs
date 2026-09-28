#!/usr/bin/env node
/**
 * 本地冒烟测试。
 *
 * 关键点：用 node:vm 的 codeGeneration.strings = false 复刻 Workers「禁止 eval /
 * new Function」的约束。任何留在活代码里的 eval 都会在这里抛 EvalError，
 * 而不是等到部署后才以 1101/1102 的形式暴露。
 *
 *   node scripts/smoke.mjs            安静模式
 *   SMOKE_VERBOSE=1 node scripts/smoke.mjs  打印 Sub-Store 日志
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { build } from 'esbuild';
import { MODULE_ROOT, quickjsWasmPath, upstreamPlugin } from './upstream-plugin.mjs';

const TOKEN = 'smoke-token';
const ORIGIN = 'https://sub-store.example.workers.dev';
const PEGGY_PATCHES = {
    'core/proxy-utils/parsers/peggy/loon.js': 1,
    'core/proxy-utils/parsers/peggy/qx.js': 1,
    'core/proxy-utils/parsers/peggy/surge.js': 1,
};
const PARSER_SAMPLES = {
    loon: 'Shadowsocks = shadowsocks, 1.2.3.4, 443, aes-128-gcm, "123456"',
    qx: 'shadowsocks=1.2.3.4:443, method=aes-128-gcm, password=123456, tag=node1',
    surge: 'node1 = ss, 1.2.3.4, 443, encrypt-method=aes-128-gcm, password=123456',
};

/** 两个节点，脚本算子才能测出「保留了谁、干掉了谁」。 */
const SCRIPTED_CONTENT = `${PARSER_SAMPLES.surge}\nnode2 = ss, 5.6.7.8, 8443, encrypt-method=aes-128-gcm, password=123456`;

const hostRequire = createRequire(import.meta.url);
const quickjsWasmModule = new WebAssembly.Module(fs.readFileSync(quickjsWasmPath()));
const workerSource = await bundle('src/index.js', [upstreamPlugin(), quickjsWasmStub()]);
const probeSource = await bundle('scripts/probe.entry.js', [
    upstreamPlugin({ expected: PEGGY_PATCHES }),
    quickjsWasmStub(),
]);
const scriptingSource = await bundle('src/scripting.js', [quickjsWasmStub()]);

// 静态兜底：确认构建产物里没有动态代码生成，脚本走的是 QuickJS 解释器。
assert.ok(!workerSource.includes('new Function('), '构建产物里仍有 new Function');
assert.ok(workerSource.includes('doxHostFunction'), '构建产物里没有脚本解释器');

const db = createFakeD1();
const worker = load(workerSource).default;

await checkEnv();
await checkCors();
await checkRouting();
await checkStateRoundTrip();
await checkDownload();
await checkConcurrency();
await checkParsers();
await checkScripts();
await checkScriptBridge();

console.log('\n冒烟测试通过：Worker 在禁止 eval 的环境下可用。');

async function checkEnv() {
    const response = await call(`/${TOKEN}/api/utils/env`);
    const text = await response.text();

    assert.equal(response.status, 200, `env 端点未返回 200：${text.slice(0, 400)}`);

    const body = JSON.parse(text);
    assert.equal(body.status, 'success', 'env 响应状态异常');
    assert.ok(body.data.backend, 'env 响应缺少 backend');
}

async function checkCors() {
    const response = await call(`/${TOKEN}/api/subs`, {
        method: 'OPTIONS',
        headers: {
            Origin: 'https://any-origin.example',
            'Access-Control-Request-Method': 'POST',
        },
    });

    assert.equal(response.status, 200, 'CORS 预检未返回 200');
    assert.equal(
        response.headers.get('access-control-allow-origin'),
        '*',
        'CORS 未全域放行',
    );
}

async function checkRouting() {
    await assertStatus('/api/utils/env', 404);
    await assertStatus(`/${TOKEN}/api/nope`, 404);
    await assertStatus('/share/nope', 404);
}

async function assertStatus(pathname, expected) {
    const response = await call(pathname);
    const text = await response.text();

    assert.equal(
        response.status,
        expected,
        `${pathname} 期望 ${expected}，实际 ${response.status}：${text.slice(0, 200)}`,
    );
}

async function checkStateRoundTrip() {
    const created = await call(`/${TOKEN}/api/subs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: 'smoke',
            source: 'local',
            content: PARSER_SAMPLES.surge,
        }),
    });

    assert.equal(created.status, 201, '创建订阅失败');
    assert.ok(db.rows.has('sub-store'), 'D1 未写入 sub-store 主缓存');

    const listed = await call(`/${TOKEN}/api/subs`);
    const { data } = await listed.json();

    assert.equal(data.length, 1, '订阅未持久化');
    assert.equal(data[0].name, 'smoke', '订阅名不符');
}

async function checkDownload() {
    const response = await call(`/${TOKEN}/download/smoke?target=ClashMeta`);
    const body = await response.text();

    assert.equal(response.status, 200, `下载订阅失败：${body.slice(0, 200)}`);
    assert.match(body, /1\.2\.3\.4/, '下载结果里没有节点地址');
}

/**
 * 一个 isolate 会并发处理多个请求，而 $done 与数据都是全局约定。
 *
 * 必须混入异步端点（下载会 await 上游），否则 dispatch 到 $done 之间没有 await，
 * 请求根本不会交错，测不出串台。
 */
async function checkConcurrency() {
    const probes = Array.from({ length: 8 }, (_, index) =>
        index % 2 === 0
            ? { path: `/${TOKEN}/download/smoke?target=ClashMeta`, verify: (text) => /1\.2\.3\.4/.test(text) }
            : { path: `/${TOKEN}/api/utils/env`, verify: (text) => JSON.parse(text).status === 'success' },
    );

    const responses = await Promise.all(probes.map((probe) => call(probe.path)));

    for (const [index, response] of responses.entries()) {
        const { path, verify } = probes[index];
        const text = await response.text();

        assert.equal(response.status, 200, `并发请求失败：${path} -> ${text.slice(0, 120)}`);
        assert.ok(verify(text), `并发请求串台：${path} -> ${text.slice(0, 120)}`);
    }
}

async function checkParsers() {
    const { parsers } = load(probeSource);

    for (const [kind, sample] of Object.entries(PARSER_SAMPLES)) {
        const proxy = parsers[kind].parse(sample);

        assert.equal(proxy.server, '1.2.3.4', `${kind} 解析器 server 不符`);
        assert.equal(proxy.port, 443, `${kind} 解析器 port 不符`);
    }
}

/**
 * 脚本功能走 QuickJS 解释器，没有 eval。
 *
 * 覆盖三种脚本算子、原地改写的写回、异步脚本，以及脚本报错时的可读信息。
 */
async function checkScripts() {
    await createSubscription('scripted', [
        scriptOperator('function operator(proxies, targetPlatform, context) {\n' +
            '  context.platform = targetPlatform;\n' +
            '  return proxies.map((p) => ({ ...p, name: "vm-" + p.name }));\n' +
            '}'),
    ], SCRIPTED_CONTENT);

    const renamed = await download('scripted');
    assert.match(renamed, /vm-node1/, 'Script Operator 没有改写节点名');
    assert.match(renamed, /vm-node2/, 'Script Operator 没有覆盖全部节点');

    await replaceProcess('scripted', [
        scriptOperator('function operator(proxies) {\n' +
            '  proxies.forEach((p) => { p.name = "inplace-" + p.name; });\n' +
            '}'),
    ]);

    const inPlace = await download('scripted');
    assert.match(inPlace, /inplace-node1/, 'Script Operator 原地改写的写回失效');

    await replaceProcess('scripted', [
        scriptOperator('async function operator(proxies) {\n' +
            '  await Promise.resolve();\n' +
            '  return proxies.map((p) => ({ ...p, name: p.name + "-async" }));\n' +
            '}'),
    ]);

    const awaited = await download('scripted');
    assert.match(awaited, /node1-async/, '异步 Script Operator 未生效');

    await replaceProcess('scripted', [{
        type: 'Script Filter',
        args: {
            mode: 'script',
            content: 'function filter(proxies) {\n  return proxies.map((p) => p.server === "1.2.3.4");\n}',
        },
    }]);

    const filtered = await download('scripted');
    assert.match(filtered, /1\.2\.3\.4/, 'Script Filter 误删了应保留的节点');
    assert.ok(!filtered.includes('5.6.7.8'), 'Script Filter 没有过滤掉节点');

    await replaceProcess('scripted', [{
        type: 'Response Transformer',
        args: {
            mode: 'script',
            content: 'function transformFunction(res) {\n' +
                '  res.body += "\\n# transformed-by-vm";\n' +
                '  return res;\n' +
                '}',
        },
    }]);

    const transformed = await download('scripted');
    assert.match(transformed, /transformed-by-vm/, 'Response Transformer 未生效');

    // 顶层 throw 才能同时打穿上游的 func 与快捷脚本兜底，拿到 500 而不是静默降级。
    await replaceProcess('scripted', [scriptOperator('throw new Error("脚本自己炸了");')]);

    const failed = await call(`/${TOKEN}/download/scripted?target=ClashMeta`);
    const failedText = await failed.text();
    assert.equal(failed.status, 500, '脚本报错时未返回 500');
    assert.match(failedText, /脚本自己炸了/, '脚本报错信息没有透出');
    assert.doesNotMatch(failedText, /EvalError/, '脚本执行触发了 EvalError');

    await deleteSubscription('scripted');
}

/** $httpClient 之类的宿主异步函数由驱动循环推进；这里用 delay 覆盖同一条路径。 */
function scriptOperator(content) {
    return { type: 'Script Operator', args: { mode: 'script', content } };
}

/**
 * 直接压 src/scripting.js 的桥接规则。
 *
 * 上游那几条链路覆盖不到的部分在这里测：宿主异步函数的 promise 落地、宿主对象身份还原、
 * 按引用共享的 $options、以及跑飞脚本被预算打断。
 */
async function checkScriptBridge() {
    const { createScriptFunction } = load(scriptingSource);

    const asyncHost = await createScriptFunction(
        'operator',
        'async function operator(proxies) {\n' +
            '  const extra = await later();\n' +
            '  return proxies.concat(extra);\n' +
            '}',
        { later: () => new Promise((resolve) => setTimeout(() => resolve([{ name: 'async' }]), 5)) },
    );

    // VM 里的对象来自另一个 realm，原型不同，只能比序列化结果。
    assert.equal(
        JSON.stringify(await asyncHost([{ name: 'a' }], 'ClashMeta', {})),
        JSON.stringify([{ name: 'a' }, { name: 'async' }]),
        '宿主异步函数的返回值没有传回 VM',
    );

    class Bytes {
        constructor(text) {
            this.text = text;
        }
    }

    const identity = await createScriptFunction(
        'operator',
        'function operator() {\n' +
            '  const made = maker("payload");\n' +
            '  return { text: made.text, same: isMaker(made) };\n' +
            '}',
        { maker: (text) => new Bytes(text), isMaker: (value) => value instanceof Bytes },
    );

    assert.equal(
        JSON.stringify(await identity([], 'ClashMeta', {})),
        JSON.stringify({ text: 'payload', same: true }),
        '宿主对象没有按身份还原',
    );

    const shared = { rules: [] };
    const byRef = await createScriptFunction(
        'operator',
        'function operator(proxies) {\n' +
            '  $options.rules.push("from-vm");\n' +
            '  lodash.chunk(proxies, 1);\n' +
            '  return proxies;\n' +
            '}',
        { $options: shared, lodash: { chunk: (list) => list } },
    );

    await byRef([], 'ClashMeta', {});
    assert.deepEqual(shared.rules, ['from-vm'], '$options 的改动没有写回宿主');

    const context = { remove: 1 };
    const usesContext = await createScriptFunction(
        'operator',
        'function operator(proxies, targetPlatform, context) {\n' +
            '  context.platform = targetPlatform;\n' +
            '  delete context.remove;\n' +
            '  return proxies;\n' +
            '}',
        { $options: {} },
    );

    await usesContext([], 'ClashMeta', context);
    assert.equal(context.platform, 'ClashMeta', 'context 的改动没有写回宿主');
    assert.ok(!('remove' in context), 'context 的删除没有写回宿主');

    const runaway = await createScriptFunction('operator', 'function operator() { for (;;) {} }', {});

    await assert.rejects(
        () => runaway([], 'ClashMeta', {}),
        /CPU 预算/,
        '跑飞脚本没有被预算打断',
    );
}

async function createSubscription(name, process, content = PARSER_SAMPLES.surge) {
    const created = await call(`/${TOKEN}/api/subs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, source: 'local', content, process }),
    });

    assert.equal(created.status, 201, `${name} 创建失败：${await created.text()}`);
}

async function replaceProcess(name, process) {
    const patched = await call(`/${TOKEN}/api/sub/${name}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ process }),
    });

    assert.equal(patched.status, 200, `${name} 更新失败：${await patched.text()}`);
}

async function deleteSubscription(name) {
    const removed = await call(`/${TOKEN}/api/sub/${name}`, { method: 'DELETE' });

    assert.equal(removed.status, 200, `${name} 删除失败`);
}

async function download(name) {
    const response = await call(`/${TOKEN}/download/${name}?target=ClashMeta`);
    const body = await response.text();

    assert.equal(response.status, 200, `${name} 下载失败：${body.slice(0, 300)}`);

    return body;
}

async function call(pathname, init) {
    const env = { SUB_STORE_TOKEN: TOKEN, SUB_STORE_DB: db };

    return worker.fetch(new Request(`${ORIGIN}${pathname}`, init), env);
}

async function bundle(entry, plugins) {
    const result = await build({
        entryPoints: [path.join(MODULE_ROOT, entry)],
        absWorkingDir: MODULE_ROOT,
        bundle: true,
        format: 'cjs',
        platform: 'browser',
        target: 'es2022',
        charset: 'utf8',
        // 与线上产物一致：只有压缩后 esbuild 才会把 throw 之后的脚本分支当死代码删掉。
        minify: true,
        write: false,
        external: ['node:crypto', 'node:async_hooks'],
        plugins,
        logLevel: 'silent',
    });

    return result.outputFiles[0].text;
}

/**
 * 线上由 wrangler 把 quickjs.wasm 打包成预编译的 WebAssembly.Module。
 * 这里给出同样的东西：先在宿主里编译好，再作为全局塞进 vm。
 */
function quickjsWasmStub() {
    return {
        name: 'quickjs-wasm-stub',
        setup(build) {
            build.onResolve({ filter: /^\.\/quickjs\.wasm$/ }, () => ({
                path: 'quickjs-wasm',
                namespace: 'dox-quickjs',
            }));
            build.onLoad({ filter: /.*/, namespace: 'dox-quickjs' }, () => ({
                contents: 'export default globalThis.__dox_quickjs_wasm__;',
                loader: 'js',
            }));
        },
    };
}

function load(source) {
    const sandbox = {
        module: { exports: {} },
        require: (id) => hostRequire(id),
        console: createConsole(),
        fetch,
        performance,
        Request,
        Response,
        Headers,
        URL,
        URLSearchParams,
        AbortController,
        AbortSignal,
        TextEncoder,
        TextDecoder,
        Buffer,
        crypto,
        atob,
        btoa,
        structuredClone,
        queueMicrotask,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        __dox_quickjs_wasm__: quickjsWasmModule,
    };

    vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: true } });
    vm.runInContext(source, sandbox, { filename: 'smoke.cjs' });

    return sandbox.module.exports;
}

function createConsole() {
    const verbose = process.env.SMOKE_VERBOSE === '1';
    const passthrough = (...args) => process.stderr.write(`${args.join(' ')}\n`);

    return {
        log: verbose ? passthrough : () => {},
        info: verbose ? passthrough : () => {},
        warn: passthrough,
        error: passthrough,
        debug: () => {},
    };
}

/** D1 的最小替身：只需要 kv 表的整表读和批量写。 */
function createFakeD1() {
    const rows = new Map();

    return {
        rows,
        prepare(sql) {
            return {
                bind: (...args) => ({ sql, args }),
                all: async () => ({
                    results: [...rows].map(([key, value]) => ({ key, value })),
                }),
            };
        },
        batch: async (statements) => {
            for (const { sql, args } of statements) {
                if (sql.includes('DELETE')) {
                    rows.delete(args[0]);
                    continue;
                }

                rows.set(args[0], args[1]);
            }

            return [];
        },
    };
}
