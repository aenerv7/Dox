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
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { build } from 'esbuild';
import { MODULE_ROOT, upstreamPlugin } from './upstream-plugin.mjs';

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
const SCRIPT_GUARD = '不支持脚本过滤';

const hostRequire = createRequire(import.meta.url);
const workerSource = await bundle('src/index.js', upstreamPlugin());
const probeSource = await bundle('scripts/probe.entry.js', upstreamPlugin({ expected: PEGGY_PATCHES }));

// 静态兜底：确认脚本操作已经被换成明确报错，且构建产物里不再有 new Function。
assert.ok(!workerSource.includes('new Function('), '构建产物里仍有 new Function');
assert.ok(workerSource.includes(SCRIPT_GUARD), '脚本操作的兜底报错缺失');

const db = createFakeD1();
const worker = load(workerSource).default;

await checkEnv();
await checkCors();
await checkRouting();
await checkStateRoundTrip();
await checkDownload();
await checkConcurrency();
await checkParsers();

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

async function call(pathname, init) {
    const env = { SUB_STORE_TOKEN: TOKEN, SUB_STORE_DB: db };

    return worker.fetch(new Request(`${ORIGIN}${pathname}`, init), env);
}

async function bundle(entry, plugin) {
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
        plugins: [plugin],
        logLevel: 'silent',
    });

    return result.outputFiles[0].text;
}

function load(source) {
    const sandbox = {
        module: { exports: {} },
        require: (id) => hostRequire(id),
        console: createConsole(),
        fetch,
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
