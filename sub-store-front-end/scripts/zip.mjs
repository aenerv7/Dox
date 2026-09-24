/**
 * ZIP 读取器。
 *
 * 上游前端只发布 release 里的 dist.zip，Node 没有内置解压，
 * 而 Expand-Archive / unzip 需要按平台分支。这里只实现 dist.zip 用到的子集：
 * 中央目录 + 本地头 + deflate 存储，不做 ZIP64 与加密。
 */

import assert from 'node:assert/strict';
import zlib from 'node:zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const EOCD_MAX_COMMENT = 0xffff;
const STORED = 0;

export function unzip(buffer) {
    const entries = readCentralDirectory(buffer);

    return entries.map((entry) => ({
        name: entry.name,
        data: readEntry(buffer, entry),
    }));
}

function readCentralDirectory(buffer) {
    const eocd = findEndOfCentralDirectory(buffer);
    const count = buffer.readUInt16LE(eocd + 10);
    const entries = [];
    let offset = buffer.readUInt32LE(eocd + 16);

    for (let index = 0; index < count; index += 1) {
        assert.equal(
            buffer.readUInt32LE(offset),
            CENTRAL_SIGNATURE,
            'ZIP 中央目录签名不符',
        );

        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);

        entries.push({
            name: buffer.toString('utf8', offset + 46, offset + 46 + nameLength),
            method: buffer.readUInt16LE(offset + 10),
            compressedSize: buffer.readUInt32LE(offset + 20),
            localOffset: buffer.readUInt32LE(offset + 42),
        });

        offset += 46 + nameLength + extraLength + commentLength;
    }

    return entries;
}

function readEntry(buffer, entry) {
    assert.equal(
        buffer.readUInt32LE(entry.localOffset),
        LOCAL_SIGNATURE,
        `ZIP 本地头签名不符：${entry.name}`,
    );

    const nameLength = buffer.readUInt16LE(entry.localOffset + 26);
    const extraLength = buffer.readUInt16LE(entry.localOffset + 28);
    const start = entry.localOffset + 30 + nameLength + extraLength;
    const raw = buffer.subarray(start, start + entry.compressedSize);

    return entry.method === STORED ? raw : zlib.inflateRawSync(raw);
}

function findEndOfCentralDirectory(buffer) {
    const earliest = Math.max(0, buffer.length - EOCD_MAX_COMMENT - EOCD_MIN_SIZE);

    for (let offset = buffer.length - EOCD_MIN_SIZE; offset >= earliest; offset -= 1) {
        if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
            return offset;
        }
    }

    throw new Error('不是有效的 ZIP 文件（缺少中央目录结尾记录）');
}
