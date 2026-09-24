/**
 * Sub-Store on Cloudflare Workers —— Worker 入口。
 *
 *   https://sub-store.<sub>.workers.dev/<token>/api/...       Sub-Store REST API
 *   https://sub-store.<sub>.workers.dev/<token>/download/...  订阅产物
 *   https://sub-store.<sub>.workers.dev/share/...             公开分享链接
 *   其它                                                      404
 *
 * /share/ 不带 token 前缀：Sub-Store 前端会把后端地址里的路径段裁掉再拼 /share/，
 * 分享链接自带 ?token= 由 Sub-Store 自己校验。
 *
 * 鉴权 = 路径前缀。前端里填的后端地址就是 {sub-store URL}/{token}。
 *
 * 一次请求的处理顺序（顺序不能改）：
 *   D1 预载 -> 导入 upstream 模块（首次）-> 刷新主缓存 -> dispatch -> 等 $done
 *   -> 回写 D1 -> 返回响应
 */

import { createContext, installGlobals, runInContext, takeDirty } from './runtime.js';
import { loadState, saveState } from './state.js';

installGlobals();

const BACKEND_ROUTE = /^\/(api|download|share)(\/|$)/;

// 口令是 URL 路径段，必须是不需要百分号编码的字符，否则前端拼出来的地址对不上。
const TOKEN_PATTERN = /^[A-Za-z0-9._~-]+$/;

// Response 的 body 只能消费一次，不能跨请求复用同一个实例。
const notFound = () => new Response('Not Found', { status: 404 });

let bundlePromise = null;

function loadBundle() {
    bundlePromise ??= import('./upstream-entry.js');
    return bundlePromise;
}

export default {
    async fetch(request, env) {
        const token = env.SUB_STORE_TOKEN;

        if (!token) {
            return new Response('SUB_STORE_TOKEN is not configured', { status: 500 });
        }

        if (!TOKEN_PATTERN.test(token)) {
            return new Response('SUB_STORE_TOKEN 只能包含 A-Z a-z 0-9 . _ ~ -', {
                status: 500,
            });
        }

        if (!env.SUB_STORE_DB) {
            return new Response('SUB_STORE_DB binding is missing', { status: 500 });
        }

        const target = route(request, token);

        if (!target) {
            return notFound();
        }

        const body = hasBody(request.method) ? await request.text() : undefined;
        const context = createContext(await loadState(env.SUB_STORE_DB));

        return runInContext(context, async () => {
            const { dispatch, refreshCache } = await loadBundle();
            refreshCache();

            // Sub-Store 的 express 适配层用正则从绝对 URL 里取 path，必须传完整 URL。
            dispatch({
                url: `${target.origin}${target.path}${target.search}`,
                method: request.method,
                headers: Object.fromEntries(request.headers),
                body,
            });

            const response = unwrap(await context.done);
            await saveState(env.SUB_STORE_DB, takeDirty(context));

            return new Response(response.body ?? '', {
                status: response.status ?? 200,
                headers: response.headers ?? {},
            });
        });
    },
};

/** 解析出 Sub-Store 该看到的路径，未命中返回 null。 */
function route(request, token) {
    const url = new URL(request.url);
    const prefix = `/${token}`;
    const prefixed = url.pathname === prefix || url.pathname.startsWith(`${prefix}/`);
    const path = prefixed ? url.pathname.slice(prefix.length) || '/' : url.pathname;

    // 分享链接只在裸路径上出现；其余裸路径一律隐藏为 404，不暴露 token 是否猜对。
    if (!prefixed && !path.startsWith('/share/')) {
        return null;
    }

    if (!BACKEND_ROUTE.test(path)) {
        return null;
    }

    return { origin: url.origin, path, search: url.search };
}

function hasBody(method) {
    return method !== 'GET' && method !== 'HEAD';
}

/** Surge 形态是 $done({ response })，其它宿主直接给响应体。 */
function unwrap(value) {
    if (value && typeof value === 'object' && value.response) {
        return value.response;
    }

    return value ?? {};
}
