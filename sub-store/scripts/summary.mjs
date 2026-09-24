#!/usr/bin/env node
/** 把本次部署的上游版本写进 GitHub Actions 任务摘要。 */

import fs from 'node:fs';
import path from 'node:path';
import { MODULE_ROOT } from './upstream-plugin.mjs';

const BACKEND_RELEASE = path.join(MODULE_ROOT, 'build', 'release.json');
const FRONTEND_RELEASE = path.resolve(
    MODULE_ROOT,
    '..',
    'sub-store-front-end',
    'build',
    'release.json',
);

const lines = [
    '### Sub-Store 部署完成',
    '',
    `- 后端 sub-store：${readTag(BACKEND_RELEASE)}`,
    `- 前端 sub-store-front-end：${readTag(FRONTEND_RELEASE)}`,
    '',
];

console.log(lines.join('\n'));

if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}

function readTag(file) {
    if (!fs.existsSync(file)) {
        return '未知（缺少构建记录）';
    }

    return JSON.parse(fs.readFileSync(file, 'utf8')).tag;
}
