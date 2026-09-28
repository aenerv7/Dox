/**
 * 上游 Sub-Store 源码的构建期适配。
 *
 * 上游为 Node / 代理 App 设计，直接跑在 Workers 上有三处硬冲突：
 *   1. Workers 禁止 eval / new Function：isNode 探测、脚本操作、peggy 运行时编译
 *   2. eval('require("ms")') / eval('require("nanoid")') 在分享 token 路径上是活代码
 *   3. 未匹配路径会被 302 到官方前端站点
 *
 * 脚本操作不再禁用：createDynamicFunction 改成委托给 src/scripting.js 的 QuickJS 解释器。
 * 持久化不走这里的补丁：上游的 $persistentStore 分支由本项目 src/ 提供实现。
 *
 * 补丁以 esbuild 插件形式在内存里改，不落地修改 .upstream 检出，构建可重复。
 * 每个补丁都带唯一标记并在构建结束时断言命中次数，上游结构变化会直接让构建失败。
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import peggy from 'peggy';

export const MODULE_ROOT = path.resolve(import.meta.dirname, '..');
export const UPSTREAM_ROOT = path.join(MODULE_ROOT, '.upstream', 'Sub-Store');
export const UPSTREAM_SRC = path.join(UPSTREAM_ROOT, 'backend', 'src');

/** QuickJS 的 Wasm，随 Worker 一起上传，由 wrangler 打包成 WebAssembly.Module。 */
export const QUICKJS_WASM = 'quickjs.wasm';

const PEGGY_IMPORT = "import peggy from 'peggy';";
const PEGGY_CALL = 'peggy.generate(grammars)';
const PEGGY_GRAMMAR = /const grammars = String\.raw`([\s\S]*?)`;/;

// 脚本解释器由本项目提供，这里把上游的 new Function 版本整段换掉。
const SCRIPT_IMPORT = "import { createScriptFunction } from 'dox:scripting';\n";
// 上游源码是 CRLF，正则必须容忍 \r\n。
const DYNAMIC_FUNCTION_TAIL =
    /        normalizeFlowHeader,\r?\n    \};\r?\n    if \(\$\.env\.isLoon\) \{[\s\S]*\r?\n\}\s*$/;
const DYNAMIC_FUNCTION_REPLACEMENT = `        normalizeFlowHeader,
    };

    return createScriptFunction(name, script, {
        $arguments,
        $options,
        $substore: $,
        lodash,
        ProxyUtils,
        yaml: ProxyUtils.yaml,
        Buffer: ProxyUtils.Buffer,
        b64d: ProxyUtils.Base64.decode,
        b64e: ProxyUtils.Base64.encode,
        DOMAIN_RESOLVERS,
        scriptResourceCache,
        flowUtils,
        produceArtifact,
        require: undefined,
    });
}
`;

// createDynamicFunction 现在返回 Promise，六个调用点都要 await。
const DYNAMIC_FUNCTION_CALL = /const (\w+) = createDynamicFunction\(/g;
const DYNAMIC_FUNCTION_CALL_COUNT = 6;

// jsrsasign 体积大且在 Workers 上不可靠；证书指纹改用 node:crypto 计算。
const RS_MODULE = `import { createHash } from 'node:crypto';

function pemToDer(caStr) {
    const base64 = String(caStr || '')
        .replace(/-----BEGIN[^-]+-----/g, '')
        .replace(/-----END[^-]+-----/g, '')
        .replace(/\\s+/g, '');

    return Buffer.from(base64, 'base64');
}

export function generateFingerprint(caStr) {
    const digest = createHash('sha256').update(pemToDer(caStr)).digest('hex');

    return digest.match(/.{2}/g).join(':').toUpperCase();
}

export default {
    generateFingerprint,
};
`;

const EXPECTED = {
    'vendor/open-api.js': 1,
    'vendor/express.js': 1,
    'utils/rs.js': 1,
    'restful/token.js': 1,
    'restful/miscs.js': 1,
    'core/proxy-utils/processors/index.js': 1,
    'core/proxy-utils/parsers/peggy/loon.js': 1,
    'core/proxy-utils/parsers/peggy/qx.js': 1,
    'core/proxy-utils/parsers/peggy/surge.js': 1,
    'runtime/dgram.js': 1,
    'runtime/fs.js': 1,
    'runtime/net.js': 1,
    'runtime/path.js': 1,
    'runtime/stream-promises.js': 1,
    'runtime/tls.js': 1,
};

// 这两个模块不在断言清单里，因为非测试代码已经不引用它们：
//   worker-threads  只被上游 main.js 引用，本项目用自己的入口
//   child-process   2.42.2 起只被上游测试引用（open-api.js 改用 eval('import("shoutrrr-ts")')）
// 仍留在过滤器里：上游一旦重新引用，这里会给出明确报错而不是 TypeError。
const RUNTIME_MODULE = /[\\/]runtime[\\/](child-process|dgram|fs|net|path|stream-promises|tls|worker-threads)\.js$/;

/**
 * 上游这些模块的调用点都在 isNode 分支里，本该返回 undefined；
 * 但真在 Workers 上被调到说明功能不支持，显式报错比 TypeError 好排查。
 */
const runtimeShim = (name) => `const unsupported = new Proxy({}, {
    get() {
        throw new Error(
            'Sub-Store on Cloudflare Workers 不支持依赖 Node 内建模块 "${name}" 的功能。',
        );
    },
});

export default function () {
    return unsupported;
}
`;

export function upstreamPlugin({ expected = EXPECTED } = {}) {
    const applied = new Map();
    const bump = (name) => applied.set(name, (applied.get(name) ?? 0) + 1);

    return {
        name: 'sub-store-upstream',

        setup(build) {
            build.onResolve({ filter: /^@\// }, (args) => ({
                path: resolveUpstream(args.path.slice(2)),
            }));

            // dox:xxx 指向本项目 src/xxx.js，用来给上游注入自己的实现。
            build.onResolve({ filter: /^dox:/ }, (args) => ({
                path: path.join(MODULE_ROOT, 'src', `${args.path.slice('dox:'.length)}.js`),
            }));

            build.onLoad({ filter: RUNTIME_MODULE }, (args) => {
                const name = path.basename(args.path, '.js');

                bump(`runtime/${name}.js`);
                return { contents: runtimeShim(name), loader: 'js' };
            });

            build.onLoad({ filter: /[\\/]vendor[\\/]open-api\.js$/ }, (args) => {
                let code = read(args.path);

                code = replaceOnce(
                    code,
                    /const isNode = eval\(`typeof process !== "undefined"`\);/,
                    'const isNode = false;',
                    'open-api.js isNode',
                );

                bump('vendor/open-api.js');
                return { contents: code, loader: 'js' };
            });

            build.onLoad({ filter: /[\\/]vendor[\\/]express\.js$/ }, (args) => {
                let code = read(args.path);

                // 非 Node 分支的 app.start 只做一次 dispatch，这里改成把 dispatch 暴露给 Worker。
                code = replaceOnce(
                    code,
                    /app\.start = \(\) => \{\s*dispatch\(\$request\);\s*\};/,
                    'app.start = () => {\n        globalThis.__substore_dispatch__ = dispatch;\n    };',
                    'express.js app.start',
                );

                bump('vendor/express.js');
                return { contents: code, loader: 'js' };
            });

            build.onLoad({ filter: /[\\/]utils[\\/]rs\.js$/ }, (args) => {
                bump('utils/rs.js');
                return { contents: RS_MODULE, loader: 'js' };
            });

            build.onLoad({ filter: /[\\/]restful[\\/]token\.js$/ }, (args) => {
                let code = read(args.path);

                code = replaceOnce(
                    code,
                    'eval(`require("ms")`)',
                    'globalThis.__substore_ms__',
                    'token.js ms',
                );
                code = replaceOnce(
                    code,
                    'eval(`require("nanoid")`)',
                    'globalThis.__substore_nanoid__',
                    'token.js nanoid',
                );

                bump('restful/token.js');
                return { contents: code, loader: 'js' };
            });

            build.onLoad({ filter: /[\\/]restful[\\/]miscs\.js$/ }, (args) => {
                let code = read(args.path);

                // 非 Node 分支会把所有未匹配路径 302 到官方站点；Worker 入口自己路由，未知路径应当 404。
                code = replaceOnce(
                    code,
                    /\/\/ Redirect sub\.store to vercel webpage[\s\S]*?\.end\(\);\s*\}\);/,
                    '// patched: 路由由 Workers 入口处理，未匹配路径返回 404。',
                    'miscs.js vercel redirect',
                );
                code = replaceOnce(
                    code,
                    /\$app\.all\('\/', \(_, res\) => \{\s*res\.send\('Hello from sub-store[^']*'\);\s*\}\);/,
                    '// patched: 去掉 catch-all 问候路由，避免吞掉未知 API 路径。',
                    'miscs.js hello route',
                );

                bump('restful/miscs.js');
                return { contents: code, loader: 'js' };
            });

            build.onLoad(
                { filter: /[\\/]core[\\/]proxy-utils[\\/]processors[\\/]index\.js$/ },
                (args) => {
                    let code = read(args.path);

                    // 上游的 new Function 版本整段换成本项目的 QuickJS 解释器；
                    // flowUtils 是脚本可见的全局，留在原位不动。
                    code = replaceOnce(
                        code,
                        DYNAMIC_FUNCTION_TAIL,
                        DYNAMIC_FUNCTION_REPLACEMENT,
                        'processors/index.js createDynamicFunction',
                    );
                    code = replaceMany(
                        code,
                        DYNAMIC_FUNCTION_CALL,
                        'const $1 = await createDynamicFunction(',
                        DYNAMIC_FUNCTION_CALL_COUNT,
                        'processors/index.js createDynamicFunction 调用点',
                    );
                    code = `${SCRIPT_IMPORT}${code}`;

                    bump('core/proxy-utils/processors/index.js');
                    return { contents: code, loader: 'js' };
                },
            );

            build.onLoad(
                { filter: /[\\/]parsers[\\/]peggy[\\/](loon|qx|surge)\.js$/ },
                async (args) => {
                    const name = `core/proxy-utils/parsers/peggy/${path.basename(args.path)}`;
                    let code = read(args.path);
                    const grammar = PEGGY_GRAMMAR.exec(code);

                    if (!grammar) {
                        throw new Error(`${name}: 未找到 String.raw 语法定义`);
                    }

                    // peggy 在运行时用 new Function 编译语法，这里改成构建期产出纯源码。
                    const parser = await compileParser(grammar[1]);

                    code = replaceOnce(code, PEGGY_IMPORT, '', `${name} peggy import`);
                    code = replaceOnce(
                        code,
                        PEGGY_GRAMMAR,
                        'const grammars = "";',
                        `${name} grammars`,
                    );
                    code = replaceOnce(
                        code,
                        PEGGY_CALL,
                        `(${parser})`,
                        `${name} peggy.generate`,
                    );

                    bump(name);
                    return { contents: code, loader: 'js' };
                },
            );

            build.onEnd(() => {
                for (const [name, count] of Object.entries(expected)) {
                    const actual = applied.get(name) ?? 0;

                    if (actual !== count) {
                        throw new Error(
                            `上游补丁失效：${name} 期望命中 ${count} 次，实际 ${actual} 次。` +
                                '上游源码结构已变化，请更新 sub-store/scripts/upstream-plugin.mjs。',
                        );
                    }
                }
            });
        },
    };
}

function read(file) {
    return fs.readFileSync(file, 'utf8');
}

// esbuild 并发调用 onLoad，而 peggy 自身语法解析器不是可重入的，必须串行化。
let parserQueue = Promise.resolve();

function compileParser(grammar) {
    const compiled = parserQueue.then(() =>
        peggy.generate(grammar, { output: 'source', format: 'bare' }),
    );

    parserQueue = compiled.then(
        () => undefined,
        () => undefined,
    );

    return compiled;
}

function replaceOnce(code, pattern, replacement, label) {
    const next = code.replace(pattern, replacement);

    if (next === code) {
        throw new Error(`上游补丁未命中：${label}`);
    }

    return next;
}

function replaceMany(code, pattern, replacement, expected, label) {
    const actual = code.match(pattern)?.length ?? 0;

    if (actual !== expected) {
        throw new Error(`上游补丁命中数不符：${label} 期望 ${expected} 处，实际 ${actual} 处`);
    }

    return code.replace(pattern, replacement);
}

/** QuickJS Wasm 在 node_modules 里的位置，构建时复制到 build/ 供 wrangler 打包。 */
export function quickjsWasmPath() {
    return createRequire(import.meta.url).resolve('@jitl/quickjs-wasmfile-release-sync/wasm');
}

/** 复刻上游 jsconfig.json 的 "@/*" -> "src/*" 映射，esbuild 默认不读 jsconfig。 */
function resolveUpstream(specifier) {
    const base = path.resolve(UPSTREAM_SRC, specifier);
    const candidates = [base, `${base}.js`, path.join(base, 'index.js')];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return candidate;
        }
    }

    throw new Error(`无法解析上游别名 @/${specifier}`);
}
