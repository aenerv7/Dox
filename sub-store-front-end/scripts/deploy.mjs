#!/usr/bin/env node
/**
 * 部署 Sub-Store-Front-End 静态资源到 Cloudflare Workers，并做一次线上自检。
 *
 * 纯静态资源 Worker，没有 main 入口，不需要任何 secret 或数据库。
 * 认证交给 wrangler（本地 `wrangler login` 或 CI 里的 CLOUDFLARE_API_TOKEN）。
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const MODULE_ROOT = path.resolve(import.meta.dirname, '..');
const WRANGLER_BIN = path.join(MODULE_ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const WORKER_URL_PATTERN = /https:\/\/[\w.-]+\.workers\.dev/;
const VERIFY_ATTEMPTS = 6;
const VERIFY_DELAY_MS = 3000;

const workerUrl = deploy();

await verify(workerUrl);

console.log(`\n前端就绪：${workerUrl}`);
console.log('首次打开后，在后端地址里填 https://sub-store.<你的子域>.workers.dev/<口令>');

function deploy() {
    const result = spawnSync(
        process.execPath,
        [WRANGLER_BIN, 'deploy', '--config', 'wrangler.jsonc'],
        { cwd: MODULE_ROOT, encoding: 'utf8' },
    );
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

    process.stdout.write(output);

    if (result.status !== 0) {
        throw new Error(`wrangler deploy 失败（退出码 ${result.status}）`);
    }

    const url = WORKER_URL_PATTERN.exec(output)?.[0];

    if (!url) {
        throw new Error(`未能从 wrangler deploy 输出里解析出 workers.dev 地址：\n${output}`);
    }

    return url;
}

async function verify(url) {
    for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt += 1) {
        const html = await fetchText(url);

        if (html.includes('<div id="app">') || html.includes('Sub-Store')) {
            return;
        }

        console.log(`自检第 ${attempt} 次：${url} 尚未返回前端页面`);
        await new Promise((resolve) => setTimeout(resolve, VERIFY_DELAY_MS));
    }

    throw new Error(`部署自检失败：${url} 未返回前端页面`);
}

async function fetchText(url) {
    try {
        const response = await fetch(url);

        return response.ok ? await response.text() : '';
    } catch {
        return '';
    }
}