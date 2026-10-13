// bwh-traffic — BandwagonHost KiwiVM 流量，转成 Sub-Store 能读的订阅响应头。
//
// Sub-Store 从远程订阅的响应头里读 `subscription-userinfo`
// （upload/download/total/expire）。本 Worker 把 KiwiVM 的 getServiceInfo
// 变成这个头，正文重复同一串 userinfo：Sub-Store 读「流量信息 URL」时先解析
// 正文、失败才看响应头（backend/src/utils/flow.js 的 getFlowHeaders），
// 两边同值就不用赌它走哪条路。正文不含节点。
//
// 为什么 KIWIVM_BASE 可配置
// -------------------------
// Cloudflare Worker 无法直连 KiwiVM API。api.64clouds.com 在 Cloudflare 后面，
// 它的网关对来自 Cloudflare 自身出口的 /v1/* 请求一律回
// `{ "success": true, "token": <n> }`，而不是服务信息：GET/POST、任意
// User-Agent、任意路径结果都一样（2026-10 实测）。所以 API 只能经由一个不在
// Cloudflare 上的中转去访问：
//
//   Sub-Store ──▶ 本 Worker ──▶ 中转（自己的 VPS / Deno Deploy 等）──▶ api.64clouds.com
//
// 把 KIWIVM_BASE 指向该中转，中转需要原样转发 `/getServiceInfo` 和查询串。
// 默认值仍指向 API 本身，方便在直连恢复时保持透明。

const KIWIVM_BASE_DEFAULT = "https://api.64clouds.com/v1";
const SERVICE_INFO_PATH = "/getServiceInfo";

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const HTTP_MISCONFIGURED = 500;
const HTTP_BAD_GATEWAY = 502;

const HEADER_USERINFO = "subscription-userinfo";
const HEADER_INTERVAL = "profile-update-interval";
const UPDATE_INTERVAL_HOURS = "1";

const DEBUG_BODY_LIMIT = 400;

const BLOCKED_HINT =
  "KiwiVM 拒绝了来自 Cloudflare 的请求：api.64clouds.com 对 Cloudflare 出口" +
  "返回 {success, token} 而非服务信息。请把 KIWIVM_BASE 指向非 Cloudflare " +
  "中转，见仓库根 README.md。";

function plain(status, message) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

// 口令只在配置了 ACCESS_TOKEN 时校验，?token= 必须匹配。
function tokenMismatch(request, env) {
  if (!env.ACCESS_TOKEN) {
    return false;
  }

  return new URL(request.url).searchParams.get("token") !== env.ACCESS_TOKEN;
}

function missingConfig(env) {
  if (!env.BWH_VEID) {
    return "Missing BWH_VEID";
  }

  if (!env.BWH_API_KEY) {
    return "Missing BWH_API_KEY";
  }

  return "";
}

function buildKiwiUrl(base, env) {
  const url = new URL(`${base.replace(/\/+$/, "")}${SERVICE_INFO_PATH}`);

  url.searchParams.set("veid", env.BWH_VEID.trim());
  url.searchParams.set("api_key", env.BWH_API_KEY.trim());

  return url;
}

// 近几个月的 KiwiVM 成功响应是平的；若网关以后加上 `data` 信封也能读。
function unwrap(payload) {
  const inner = payload && payload.data;

  return inner && typeof inner === "object" ? inner : payload;
}

function apiError(payload) {
  if (!payload || payload.error === undefined || Number(payload.error) === 0) {
    return "";
  }

  return `KiwiVM API error ${payload.error}: ${payload.message ?? "unknown"}`;
}

// Cloudflare 出口被拒时的固定形状：{ success: true, token: <n> }。
function cfBlocked(payload) {
  return Boolean(payload) && payload.success !== undefined && payload.token !== undefined;
}

function hasTraffic(info) {
  return Boolean(info) && info.plan_monthly_data !== undefined && info.data_counter !== undefined;
}

function isRedirect(status) {
  return status >= 300 && status < 400;
}

async function callKiwiVM(base, env) {
  const headers = { accept: "application/json" };

  // 中转的共享口令就是访问口令：中转只做这一条 API 转发，不需要第二份凭据。
  if (env.ACCESS_TOKEN) {
    headers["x-relay-token"] = env.ACCESS_TOKEN;
  }

  // Workers 只支持 follow / manual，所以手动把 3xx 当失败，API Key 不会被送到第二个主机。
  const response = await fetch(buildKiwiUrl(base, env), {
    method: "GET",
    headers,
    redirect: "manual",
  });

  if (isRedirect(response.status)) {
    throw new Error(`KiwiVM answered HTTP ${response.status}, refusing to follow`);
  }

  return { status: response.status, body: await response.text() };
}

// BWH 的 data_counter 双向合计，于是已用量统一放在 download。
function userinfo(info) {
  const multiplier = Number(info.monthly_data_multiplier ?? 1) || 1;
  const total = Math.round(Number(info.plan_monthly_data) * multiplier);
  const used = Math.round(Number(info.data_counter) * multiplier);
  const expire = Math.round(Number(info.data_next_reset ?? 0));

  const parts = ["upload=0", `download=${used}`, `total=${total}`];

  if (expire > 0) {
    parts.push(`expire=${expire}`);
  }

  return parts.join("; ");
}

function userinfoHeaders(value) {
  return {
    [HEADER_USERINFO]: value,
    [HEADER_INTERVAL]: UPDATE_INTERVAL_HOURS,
    "access-control-allow-origin": "*",
    "access-control-expose-headers": `${HEADER_USERINFO}, ${HEADER_INTERVAL}`,
  };
}

function report(base, upstream, payload) {
  const info = unwrap(payload);

  return Response.json({
    kiwi_base: base,
    upstream_status: upstream.status,
    upstream_error: payload?.error ?? null,
    upstream_message: payload?.message ?? null,
    upstream_keys: payload && typeof payload === "object" ? Object.keys(payload) : [],
    userinfo: hasTraffic(info) ? userinfo(info) : null,
    upstream_body: upstream.body.slice(0, DEBUG_BODY_LIMIT),
  });
}

export default {
  async fetch(request, env) {
    if (tokenMismatch(request, env)) {
      return plain(HTTP_FORBIDDEN, "Forbidden");
    }

    const missing = missingConfig(env);

    if (missing) {
      return plain(HTTP_MISCONFIGURED, missing);
    }

    const base = env.KIWIVM_BASE || KIWIVM_BASE_DEFAULT;
    const wantsDebug = new URL(request.url).searchParams.get("debug") === "1";

    let upstream;

    try {
      upstream = await callKiwiVM(base, env);
    } catch (error) {
      return plain(HTTP_BAD_GATEWAY, `KiwiVM request failed: ${error.message}`);
    }

    let payload = null;

    try {
      payload = JSON.parse(upstream.body);
    } catch {
      payload = null;
    }

    if (wantsDebug) {
      return report(base, upstream, payload);
    }

    if (!payload) {
      return plain(
        HTTP_BAD_GATEWAY,
        `KiwiVM returned non-JSON (HTTP ${upstream.status}): ${upstream.body.slice(0, 200)}`,
      );
    }

    const failure = apiError(payload);

    if (failure) {
      return plain(HTTP_BAD_GATEWAY, failure);
    }

    if (cfBlocked(payload)) {
      return plain(HTTP_BAD_GATEWAY, BLOCKED_HINT);
    }

    const info = unwrap(payload);

    if (!hasTraffic(info)) {
      return plain(
        HTTP_BAD_GATEWAY,
        `KiwiVM response has no traffic fields. Keys: ${Object.keys(info).join(", ")}`,
      );
    }

    const value = userinfo(info);

    return new Response(value, { status: HTTP_OK, headers: userinfoHeaders(value) });
  },
};
