-- Sub-Store 的全部持久化数据都走 $persistentStore，本表是它的落盘形式。
-- 'sub-store' 一行是 Sub-Store 的主缓存 JSON，其余行是 "#key" 形式的旁路键值。
CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
