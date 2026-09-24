#!/usr/bin/env node
/**
 * 部署 Sub-Store 后端到 Cloudflare Workers，并做一次线上自检。
 *
 * 顺序：D1 migration -> deploy -> 写入路径口令 secret -> 校验。
 * 口令必须后写：首次部署时 Worker 还不存在，secret put 会失败。
 *
 * 需要 SUB_STORE_TOKEN；认证交给 wrangler（本地 login 或 CI 里的 API Token）。
 */

import { deployAndGetUrl, wrangler } from './cloudflare.mjs';

const CONFIG = 'wrangler.jsonc';
const D1_BINDING = 'SUB_STORE_DB';
const SECRET_NAME = 'SUB_STORE_TOKEN';
const HEALTH_PATH = '/api/utils/env';
const VERIFY_ATTEMPTS = 6;
const VERIFY_DELAY_MS = 3000;

const token = process.env.SUB_STORE_TOKEN;

if (!token) {
    throw new Error('需要设置 SUB_STORE_TOKEN（前端里填的后端路径口令）');
}

wrangler(['d1', 'migrations', 'apply', D1_BINDING, '--remote', '--config', CONFIG]);

const workerUrl = deployAndGetUrl(['--config', CONFIG]);

wrangler(['secret', 'put', SECRET_NAME, '--config', CONFIG], { input: `${token}\n` });

await verify(workerUrl);

console.log(`\n后端就绪：${workerUrl}/${token}`);

async function verify(baseUrl) {
    for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt += 1) {
        const authorized = await status(`${baseUrl}/${token}${HEALTH_PATH}`);
        const bare = await status(`${baseUrl}${HEALTH_PATH}`);

        if (authorized === 200 && bare === 404) {
            return;
        }

        console.log(
            `自检第 ${attempt} 次：带口令 ${authorized}（期望 200），裸路径 ${bare}（期望 404）`,
        );
        await new Promise((resolve) => setTimeout(resolve, VERIFY_DELAY_MS));
    }

    throw new Error('部署自检失败：口令路径未返回 200，或裸路径未返回 404');
}

async function status(url) {
    try {
        const response = await fetch(url, { redirect: 'manual' });

        return response.status;
    } catch {
        return 0;
    }
}