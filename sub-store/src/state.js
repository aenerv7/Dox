/**
 * D1 上的键值落盘层，对应 Sub-Store 的 $persistentStore。
 *
 * 读取必须同步（Sub-Store 在模块初始化时读取），所以整表一次读进内存；
 * 写入只在请求结束时批量提交。
 */

const SELECT_ALL = 'SELECT key, value FROM kv';
const UPSERT = 'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value';
const DELETE = 'DELETE FROM kv WHERE key = ?';

export async function loadState(db) {
    const { results } = await db.prepare(SELECT_ALL).all();

    return (results ?? []).map((row) => [row.key, row.value]);
}

export async function saveState(db, pending) {
    if (pending.size === 0) {
        return;
    }

    const statements = [];

    for (const [key, value] of pending) {
        statements.push(
            value == null ? db.prepare(DELETE).bind(key) : db.prepare(UPSERT).bind(key, value),
        );
    }

    await db.batch(statements);
}
