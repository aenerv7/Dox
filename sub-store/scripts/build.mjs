#!/usr/bin/env node
/**
 * 拉取上游最新 release 并打包成可部署的 Worker。
 *
 *   .upstream/Sub-Store/   上游源码（构建期拉取，不入库）
 *   build/worker.mjs       Worker 产物
 *
 * 上游源码按 release tag 缓存，tag 不变则复用，CI 上每日构建不会重复下载依赖。
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import {
    MODULE_ROOT,
    QUICKJS_WASM,
    UPSTREAM_ROOT,
    UPSTREAM_SRC,
    quickjsWasmPath,
    upstreamPlugin,
} from './upstream-plugin.mjs';

const REPOSITORY = 'https://github.com/sub-store-org/Sub-Store.git';
const RELEASE_TAG_PATTERN = /^\d+\.\d+\.\d+$/;
const BUILD_DIR = path.join(MODULE_ROOT, 'build');
const OUTFILE = path.join(BUILD_DIR, 'worker.mjs');
const TAG_FILE = path.join(UPSTREAM_ROOT, '.dox-release-tag');

const tag = latestTag();

ensureUpstream(tag);

fs.rmSync(BUILD_DIR, { recursive: true, force: true });
fs.mkdirSync(BUILD_DIR, { recursive: true });

const result = await build({
    entryPoints: [path.join(MODULE_ROOT, 'src', 'index.js')],
    absWorkingDir: MODULE_ROOT,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    // Workers 运行时按 UTF-8 读取脚本，保留中文字面量便于排查，也避免转义膨胀。
    charset: 'utf8',
    minify: true,
    legalComments: 'none',
    // Workers 的 nodejs_compat 提供 node:crypto / node:async_hooks；
    // 其余 Node 内建只出现在死分支里。
    // quickjs.wasm 留给 wrangler 打包：Workers 只接受预编译模块，必须由它生成 WebAssembly.Module。
    external: ['node:crypto', 'node:async_hooks', './quickjs.wasm'],
    outfile: OUTFILE,
    metafile: true,
    // 上游死分支（isNode 恒假）里的 eval 是已知无害的，冒烟测试用
    // codeGeneration.strings = false 兜底；静音这条警告，避免淹没真正的构建错误。
    logOverride: { 'direct-eval': 'silent' },
    plugins: [upstreamPlugin()],
});

fs.writeFileSync(
    path.join(BUILD_DIR, 'release.json'),
    `${JSON.stringify({ tag, builtAt: new Date().toISOString() }, null, 2)}\n`,
);

// Worker 里用 import './quickjs.wasm' 引用，wrangler 会把它打包成预编译模块。
fs.copyFileSync(quickjsWasmPath(), path.join(BUILD_DIR, QUICKJS_WASM));

const bytes = Object.values(result.metafile.outputs)[0].bytes;
console.log(`\nSub-Store ${tag} -> build/worker.mjs (${(bytes / 1024).toFixed(1)} KiB)`);

function latestTag() {
    const output = run(
        'git',
        ['ls-remote', '--tags', '--refs', '--sort=-v:refname', REPOSITORY, 'refs/tags/*'],
        { capture: true },
    );
    const tags = output
        .split('\n')
        .map((line) => line.split('refs/tags/')[1])
        .filter((value) => value && RELEASE_TAG_PATTERN.test(value));

    if (tags.length === 0) {
        throw new Error(`未能从 ${REPOSITORY} 解析出 release tag`);
    }

    return tags[0];
}

function ensureUpstream(release) {
    const cached = fs.existsSync(TAG_FILE) ? fs.readFileSync(TAG_FILE, 'utf8').trim() : null;

    if (cached === release && fs.existsSync(UPSTREAM_SRC)) {
        console.log(`复用已缓存的 Sub-Store ${release}`);
        installBackendDeps();
        return;
    }

    console.log(`拉取 Sub-Store ${release}`);
    fs.rmSync(UPSTREAM_ROOT, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(UPSTREAM_ROOT), { recursive: true });

    run('git', [
        'clone',
        '--depth',
        '1',
        '--branch',
        release,
        '--single-branch',
        REPOSITORY,
        UPSTREAM_ROOT,
    ]);

    fs.writeFileSync(TAG_FILE, `${release}\n`);
    installBackendDeps();
}

/** 上游依赖只用于让 esbuild 解析 lodash / js-base64 / yaml 等纯 JS 包。 */
function installBackendDeps() {
    const backend = path.join(UPSTREAM_ROOT, 'backend');

    if (fs.existsSync(path.join(backend, 'node_modules'))) {
        return;
    }

    console.log('安装上游后端依赖');
    run(
        'npm',
        [
            'install',
            '--omit=dev',
            '--ignore-scripts',
            '--no-audit',
            '--no-fund',
            // 2.42.2 起上游依赖里有 GitHub release 直链包（shoutrrr-ts），
            // npm 12 默认拒绝这类包；该包只出现在死分支的 eval 里，不会被 esbuild 解析。
            '--allow-remote=all',
        ],
        { cwd: backend },
    );
}

function run(command, args, { cwd = MODULE_ROOT, capture = false } = {}) {
    const [executable, prefix] = resolveCommand(command);
    const result = spawnSync(executable, [...prefix, ...args], {
        cwd,
        encoding: 'utf8',
        stdio: capture ? 'pipe' : 'inherit',
    });

    if (result.status !== 0) {
        const reason = result.error ? result.error.message : `退出码 ${result.status}`;

        throw new Error(`${command} ${args.join(' ')} 失败（${reason}）`);
    }

    return capture ? result.stdout : '';
}

/**
 * Windows 上 npm 是 .cmd 批处理，Node 从 18.20 起拒绝直接 spawn（CVE-2024-27980）。
 * 改由 node 执行 npm-cli.js：既能跨平台，也不必让 shell 拼接参数。
 */
function resolveCommand(command) {
    if (command !== 'npm') {
        return [command, []];
    }

    const cli = process.env.npm_execpath;

    if (cli && cli.endsWith('.js')) {
        return [process.execPath, [cli]];
    }

    return [process.platform === 'win32' ? 'npm.cmd' : 'npm', []];
}
