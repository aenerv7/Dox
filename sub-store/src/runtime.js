/**
 * Sub-Store 运行时适配层。
 *
 * Sub-Store 后端为 QX / Loon / Surge / Stash 等宿主设计，通过全局变量访问宿主能力。
 * 这里把 Cloudflare Workers 的 fetch 与 D1 包装成 Surge 形态的全局对象，
 * 于是 upstream 代码走它已经过测试的 Surge 分支，无需改动业务逻辑：
 *
 *   Sub-Store ── $persistentStore.read/write ──▶ 请求上下文 Map ──▶ D1 (kv 表)
 *             ── $httpClient.get/post/...    ──▶ fetch
 *             ── $done(response)             ──▶ 本次请求的 Promise
 *
 * 两个必须守住的约束：
 *
 *   1. $persistentStore 在 Surge 里是同步 API，Sub-Store 在模块初始化时就会调用
 *      read()。所以每次请求必须先预载 D1 数据，再触发 upstream 模块导入。
 *
 *   2. 一个 isolate 会并发处理多个请求，而 $done / 数据 / 待落盘写入都是全局约定。
 *      全部状态挂在 AsyncLocalStorage 的请求上下文上，避免请求间串响应。
 */

import { AsyncLocalStorage } from 'node:async_hooks';

const CONTEXTS = new AsyncLocalStorage();

// Surge 的 $httpClient 超时单位是秒，Sub-Store 已按 Surge 语义换算过。
const DEFAULT_TIMEOUT_SECONDS = 8;

// CORS 全域放行：Sub-Store 从 $argument 读取 cors 参数，'*' 即允许任何 Origin。
const CORS_ARGUMENT = 'cors=*';

/** 建立一次请求的上下文：预载数据、待落盘写入、$done 的落点。 */
export function createContext(entries) {
    const context = {
        store: new Map(entries),
        dirty: new Map(),
        settle: null,
        done: null,
    };

    context.done = new Promise((resolve) => {
        context.settle = resolve;
    });

    return context;
}

export function runInContext(context, handler) {
    return CONTEXTS.run(context, handler);
}

/** 取出并清空本次请求写入的键，交由调用方落盘。 */
export function takeDirty(context) {
    const pending = new Map(context.dirty);
    context.dirty.clear();

    return pending;
}

export function installGlobals() {
    // lodash 等依赖用 self / global 探测全局对象，都缺失时会退化成 Function("return this")()，
    // 而 Workers 禁止动态求值。按 Service Worker 规范补上 self（只补不覆盖）。
    if (typeof globalThis.self === 'undefined') {
        globalThis.self = globalThis;
    }

    globalThis.$argument = CORS_ARGUMENT;

    // 空对象让 Sub-Store 判定为 Surge 环境，同时排除 Stash（它检查 stash-version）。
    globalThis.$environment = {};

    globalThis.$persistentStore = {
        read: (key) => {
            const store = CONTEXTS.getStore()?.store;

            return store?.has(key) ? store.get(key) : null;
        },
        write: writeValue,
    };

    globalThis.$httpClient = createHttpClient();
    globalThis.$notification = { post: notify };
    globalThis.$done = (value) => {
        const context = CONTEXTS.getStore();

        if (!context) {
            console.error('[sub-store] $done 在请求上下文之外被调用，响应无法投递');
            return;
        }

        context.settle(value);
    };
}

function writeValue(value, key) {
    const context = CONTEXTS.getStore();

    if (!context) {
        return false;
    }

    if (value == null) {
        context.dirty.set(key, null);
        context.store.delete(key);
        return true;
    }

    const text = String(value);
    context.dirty.set(key, text);
    context.store.set(key, text);
    return true;
}

function notify(title, subtitle = '', content = '') {
    console.log(`[Notify] ${title}\n${subtitle}\n${content}`);
}

function createHttpClient() {
    const client = {};

    for (const method of ['get', 'post', 'put', 'delete', 'head', 'options', 'patch']) {
        client[method] = (options, callback) => {
            void send(method.toUpperCase(), options, callback);
        };
    }

    return client;
}

async function send(method, options, callback) {
    const controller = new AbortController();
    const timeoutMs = (Number(options.timeout) || DEFAULT_TIMEOUT_SECONDS) * 1000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(options.url, {
            method,
            headers: options.headers,
            body: options.body,
            redirect: 'follow',
            signal: controller.signal,
        });

        // encoding: null 是 Sub-Store 要求原始二进制的约定（DoH 响应等）。
        const body =
            options.encoding === null
                ? await response.arrayBuffer()
                : await response.text();

        callback(null, createResponseInfo(response), body);
    } catch (error) {
        callback(error, null, null);
    } finally {
        clearTimeout(timer);
    }
}

function createResponseInfo(response) {
    return {
        status: response.status,
        statusCode: response.status,
        headers: Object.fromEntries(response.headers),
    };
}
