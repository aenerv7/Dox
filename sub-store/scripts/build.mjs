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
import { MODULE_ROOT, UPSTREAM_ROOT, UPSTREAM_SRC, upstreamPlugin } from './upstream-plugin.mjs';

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
    external: ['node:crypto', 'node:async_hooks'],
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
        ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
        { cwd: backend },
    );
}

function run(command, args, { cwd = MODULE_ROOT, capture = false } = {}) {
    const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
    const result = spawnSync(executable, args, {
        cwd,
        encoding: 'utf8',
        stdio: capture ? 'pipe' : 'inherit',
    });

    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} 失败（退出码 ${result.status}）`);
    }

    return capture ? result.stdout : '';
}
