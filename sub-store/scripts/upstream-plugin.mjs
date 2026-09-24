/**
 * 上游 Sub-Store 源码的构建期适配。
 *
 * 上游为 Node / 代理 App 设计，直接跑在 Workers 上有三处硬冲突：
 *   1. Workers 禁止 eval / new Function：isNode 探测、脚本操作、peggy 运行时编译
 *   2. eval('require("ms")') / eval('require("nanoid")') 在分享 token 路径上是活代码
 *   3. 未匹配路径会被 302 到官方前端站点
 *
 * 持久化不走这里的补丁：上游的 $persistentStore 分支由本项目 src/ 提供实现。
 *
 * 补丁以 esbuild 插件形式在内存里改，不落地修改 .upstream 检出，构建可重复。
 * 每个补丁都带唯一标记并在构建结束时断言命中次数，上游结构变化会直接让构建失败。
 */

import fs from 'node:fs';
import path from 'node:path';
import peggy from 'peggy';

export const MODULE_ROOT = path.resolve(import.meta.dirname, '..');
export const UPSTREAM_ROOT = path.join(MODULE_ROOT, '.upstream', 'Sub-Store');
export const UPSTREAM_SRC = path.join(UPSTREAM_ROOT, 'backend', 'src');

const PEGGY_IMPORT = "import peggy from 'peggy';";
const PEGGY_CALL = 'peggy.generate(grammars)';
const PEGGY_GRAMMAR = /const grammars = String\.raw`([\s\S]*?)`;/;

const DYNAMIC_FUNCTION_HEAD =
    'function createDynamicFunction(name, script, $arguments, $options) {';

const SCRIPT_UNSUPPORTED = `    // patched: Cloudflare Workers 禁止 eval / new Function
    throw new Error(
        'Sub-Store on Cloudflare Workers 不支持脚本过滤 / 脚本操作 / 修改响应：Workers 运行时禁止 eval 与 new Function。',
    );
`;

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
    'runtime/child-process.js': 1,
    'runtime/dgram.js': 1,
    'runtime/fs.js': 1,
    'runtime/net.js': 1,
    'runtime/path.js': 1,
    'runtime/stream-promises.js': 1,
    'runtime/tls.js': 1,
};

// worker-threads 只被上游 main.js 引用，本项目用自己的入口，因此不在断言清单里。
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

                    // 抛错同时让 esbuild 把 new Function 分支当作死代码删掉。
                    code = replaceOnce(
                        code,
                        DYNAMIC_FUNCTION_HEAD,
                        `${DYNAMIC_FUNCTION_HEAD}\n${SCRIPT_UNSUPPORTED}`,
                        'processors/index.js createDynamicFunction',
                    );

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
