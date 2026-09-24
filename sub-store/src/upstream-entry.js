/**
 * upstream Sub-Store 的挂载点。
 *
 * 本文件在构建时通过 esbuild 的 @/ 别名指向拉取下来的 Sub-Store 源码，
 * 因此源码目录不入库，每次构建都取上游最新 release。
 */

import $ from '@/core/app';
import migrate from '@/utils/migration';
import serve from '@/restful';

// upstream 通过 eval('require("ms")') / eval('require("nanoid")') 取这两个包，
// Workers 禁止 eval，构建脚本会把那两处换成下面两个全局变量。
import ms from 'ms';
import * as nanoid from 'nanoid';

globalThis.__substore_ms__ = ms;
globalThis.__substore_nanoid__ = nanoid;

migrate();
serve();

// serve() 内部会调用 $app.start()，构建脚本在那里把 dispatch 挂到全局。
export const dispatch = globalThis.__substore_dispatch__;

/**
 * 每个请求把主缓存换成 D1 里的最新版本。
 *
 * Sub-Store 把整个数据库放在 $ 的 cache 字段里，isolate 复用时它是上一次请求的残留；
 * 不刷新会让并发/多 isolate 下的写互相覆盖。
 */
export function refreshCache() {
    $.cache = JSON.parse(globalThis.$persistentStore.read($.name) || '{}');
}
