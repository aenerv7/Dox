#!/usr/bin/env node
/**
 * 部署前准备：确保 D1 存在，并把 wrangler 模板渲染成实际配置。
 *
 *   wrangler.jsonc       入库模板，database_id 是占位符
 *   wrangler.deploy.jsonc 渲染产物（忽略）
 *
 * 认证交给 wrangler：本地 `wrangler login` 或 CI 里的 CLOUDFLARE_API_TOKEN。
 */

import fs from 'node:fs';
import path from 'node:path';
import { ensureD1 } from './cloudflare.mjs';
import { MODULE_ROOT } from './upstream-plugin.mjs';

const DATABASE_PLACEHOLDER = '__D1_DATABASE_ID__';
const TEMPLATE = path.join(MODULE_ROOT, 'wrangler.jsonc');
const CONFIG = path.join(MODULE_ROOT, 'wrangler.deploy.jsonc');
const DEPLOY_INFO = path.join(MODULE_ROOT, 'build', 'deploy.json');

const template = fs.readFileSync(TEMPLATE, 'utf8');
const workerName = /"name"\s*:\s*"([^"]+)"/.exec(template)?.[1];
const databaseName = /"database_name"\s*:\s*"([^"]+)"/.exec(template)?.[1];

if (!workerName || !databaseName) {
    throw new Error('wrangler.jsonc 缺少 name 或 database_name');
}

const database = ensureD1(databaseName);

fs.writeFileSync(CONFIG, template.replace(DATABASE_PLACEHOLDER, database.uuid));
fs.mkdirSync(path.dirname(DEPLOY_INFO), { recursive: true });
fs.writeFileSync(
    DEPLOY_INFO,
    `${JSON.stringify({ workerName, databaseId: database.uuid }, null, 2)}\n`,
);

console.log(`D1 ${databaseName}: ${database.uuid}`);