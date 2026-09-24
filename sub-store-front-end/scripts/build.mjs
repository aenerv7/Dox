#!/usr/bin/env node
/**
 * 拉取 Sub-Store-Front-End 最新 release 的 dist.zip 并解压到 dist/。
 *
 * 额外做一件事：把默认后端地址从 https://sub.store 清空。
 * 上游默认指向公开的 sub.store，未配置后端时会误发请求（Sub-Store README 有数据泄露提示）。
 * 需要固定默认后端时设 SUB_STORE_DEFAULT_BACKEND。
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { unzip } from './zip.mjs';

const MODULE_ROOT = path.resolve(import.meta.dirname, '..');
const REPOSITORY = 'https://github.com/sub-store-org/Sub-Store-Front-End.git';
const RELEASE_TAG_PATTERN = /^\d+\.\d+\.\d+$/;
const DIST_DIR = path.join(MODULE_ROOT, 'dist');
const DOWNLOAD_URL = (tag) =>
    `https://github.com/sub-store-org/Sub-Store-Front-End/releases/download/${tag}/dist.zip`;

// 上游把 Vite 注入的默认后端保存成一个常量：oc="hostAPI",ic="https://sub.store"
const DEFAULT_BACKEND = /(=\s*"hostAPI"\s*,\s*[\w$]+\s*=\s*)"https:\/\/sub\.store"/;
const FALLBACK_BACKEND = /"https:\/\/sub\.store"\s*\|\|\s*"https:\/\/sub\.store"/;

const tag = latestTag();
const archive = Buffer.from(await download(DOWNLOAD_URL(tag)));

fs.rmSync(DIST_DIR, { recursive: true, force: true });
extract(archive, DIST_DIR);

const patched = neutralizeDefaultBackend();

assert.ok(
    fs.existsSync(path.join(DIST_DIR, 'index.html')),
    'dist/index.html 缺失，release 结构可能已变化',
);
assert.ok(patched > 0, '未能清除上游默认后端 https://sub.store');

const releaseDir = path.join(MODULE_ROOT, 'build');
fs.mkdirSync(releaseDir, { recursive: true });
fs.writeFileSync(
    path.join(releaseDir, 'release.json'),
    `${JSON.stringify({ tag, builtAt: new Date().toISOString() }, null, 2)}\n`,
);

console.log(`\nSub-Store-Front-End ${tag} -> dist/（清除默认后端 ${patched} 处）`);

function latestTag() {
    const result = spawnSync(
        'git',
        ['ls-remote', '--tags', '--refs', '--sort=-v:refname', REPOSITORY, 'refs/tags/*'],
        { encoding: 'utf8' },
    );

    if (result.status !== 0) {
        throw new Error('无法读取 Sub-Store-Front-End 的 tag 列表');
    }

    const tags = result.stdout
        .split('\n')
        .map((line) => line.split('refs/tags/')[1])
        .filter((value) => value && RELEASE_TAG_PATTERN.test(value));

    if (tags.length === 0) {
        throw new Error('未找到 Sub-Store-Front-End 的 release tag');
    }

    return tags[0];
}

async function download(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`下载 ${url} 失败：HTTP ${response.status}`);
    }

    return response.arrayBuffer();
}

function extract(archive, destination) {
    let written = 0;

    for (const entry of unzip(archive)) {
        const relative = entry.name.replace(/^dist\//, '');

        if (relative === '' || relative.endsWith('/')) {
            continue;
        }

        // 防 zip-slip：只允许解压到 dist/ 之内。
        const target = path.resolve(destination, relative);

        if (!target.startsWith(`${destination}${path.sep}`)) {
            throw new Error(`ZIP 条目越界：${entry.name}`);
        }

        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, entry.data);
        written += 1;
    }

    console.log(`解压 ${written} 个文件到 dist/`);
}

/** 把默认后端换成 SUB_STORE_DEFAULT_BACKEND（默认空串）。 */
function neutralizeDefaultBackend() {
    const replacement = process.env.SUB_STORE_DEFAULT_BACKEND ?? '';
    let patched = 0;

    for (const file of listFiles(DIST_DIR)) {
        if (!file.endsWith('.js')) {
            continue;
        }

        const source = fs.readFileSync(file, 'utf8');
        let next = source.replace(DEFAULT_BACKEND, `$1${JSON.stringify(replacement)}`);

        if (next === source) {
            next = source.replace(FALLBACK_BACKEND, JSON.stringify(replacement));
        }

        if (next === source) {
            continue;
        }

        fs.writeFileSync(file, next);
        patched += 1;
    }

    return patched;
}

function listFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);

        return entry.isDirectory() ? listFiles(full) : [full];
    });
}
