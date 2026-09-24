/**
 * wrangler 命令封装。
 *
 * 认证交给 wrangler：本地是 `wrangler login` 的 OAuth，CI 里是
 * CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID 环境变量，两条路都走同一套脚本。
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { MODULE_ROOT } from './upstream-plugin.mjs';

const WRANGLER_BIN = path.join(MODULE_ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const WORKER_URL_PATTERN = /https:\/\/[\w.-]+\.workers\.dev/;

/** 直接跑 wrangler 的 JS 入口，避开 Windows 上的 .cmd shim。 */
export function wrangler(args, { input } = {}) {
    const result = spawnSync(process.execPath, [WRANGLER_BIN, ...args], {
        cwd: MODULE_ROOT,
        encoding: 'utf8',
        input,
        stdio: ['pipe', 'inherit', 'inherit'],
    });

    if (result.status !== 0) {
        throw new Error(`wrangler ${args.join(' ')} 失败（退出码 ${result.status}）`);
    }
}

function capture(args) {
    const result = spawnSync(process.execPath, [WRANGLER_BIN, ...args], {
        cwd: MODULE_ROOT,
        encoding: 'utf8',
    });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

    if (result.status !== 0) {
        throw new Error(`wrangler ${args.join(' ')} 失败：\n${output}`);
    }

    return output;
}

/** 部署并返回 wrangler 打印的 workers.dev 地址。 */
export function deployAndGetUrl(args = []) {
    const output = capture(['deploy', ...args]);
    process.stdout.write(output);

    const url = WORKER_URL_PATTERN.exec(output)?.[0];

    if (!url) {
        throw new Error(`未能从 wrangler deploy 输出里解析出 workers.dev 地址：\n${output}`);
    }

    return url;
}