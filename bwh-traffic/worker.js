// bwh-traffic — BandwagonHost KiwiVM 流量，转成 Sub-Store 能读的订阅响应头。
//
// Sub-Store 从远程订阅的响应头里读 `subscription-userinfo`
// （upload/download/total/expire）。本 Worker 把 KiwiVM 的 getServiceInfo
// 变成这个头，正文重复同一串 userinfo：Sub-Store 读「流量信息 URL」时先解析
// 正文、失败才看响应头（backend/src/utils/flow.js 的 getFlowHeaders），
// 两边同值就不用赌它走哪条路。浏览器（Accept: text/html）改拿一张用量面板，
// 两条路都不含节点。
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

const HTML_TYPE = "text/html; charset=utf-8";
const TEXT_TYPE = "text/plain; charset=utf-8";
const ACCEPT_HTML = "text/html";
const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

const BRAND_YELLOW = "#f5a623";

// 面板自动刷新间隔：KiwiVM 的用量变化很慢，60 秒足够，也不会让页面频繁闪烁。
const PANEL_REFRESH_MS = 60000;

// bandwagonhost.com 上没有 favicon（/favicon.ico 等路径全是 404），唯一的官方
// 图形是 814×100 的 wordmark，当标签页图标会糊成一团；这里用品牌配色画一个
// 内联方形标记，既不热链也不发外部请求。
const FAVICON_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
  `<rect width="64" height="64" rx="14" fill="${BRAND_YELLOW}"/>` +
  `<text x="32" y="45" font-family="Arial,Helvetica,sans-serif" font-size="34"` +
  ` font-weight="700" text-anchor="middle" fill="#22282e">BH</text></svg>`;
const FAVICON = `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}`;

const BLOCKED_HINT =
  "KiwiVM 拒绝了来自 Cloudflare 的请求：api.64clouds.com 对 Cloudflare 出口" +
  "返回 {success, token} 而非服务信息。请把 KIWIVM_BASE 指向非 Cloudflare " +
  "中转，见仓库根 README.md。";

function plain(status, message) {
  return new Response(message, {
    status,
    headers: { "content-type": TEXT_TYPE },
  });
}

// 口令放在路径首段（https://<worker>/<token>），与 Sub-Store 后端 URL 的形状
// 一致；只在配置了 ACCESS_TOKEN 时校验。
function tokenFrom(request) {
  return new URL(request.url).pathname.split("/").filter(Boolean)[0] || "";
}

function tokenMismatch(request, env) {
  if (!env.ACCESS_TOKEN) {
    return false;
  }

  return tokenFrom(request) !== env.ACCESS_TOKEN;
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

// 到期时间写死为「下一年的 1 月 1 日」UTC 零点。KiwiVM 的 data_next_reset 是
// 流量重置时间，不是套餐到期时间，而 Sub-Store 的 validCheck 拿 expire 判「订阅
// 已过期」，照抄重置时间会误报；写死一个恒在未来、每年自动前移的值最省事。
function expireAt(now = Date.now()) {
  return Math.floor(Date.UTC(new Date(now).getUTCFullYear() + 1, 0, 1) / 1000);
}

// 口径唯一：userinfo 头和 HTML 面板都从这里取数，避免两处各算一遍 multiplier。
// BWH 的 data_counter 双向合计，于是已用量统一放在 download。
function traffic(info) {
  const multiplier = Number(info.monthly_data_multiplier ?? 1) || 1;
  const total = Math.round(Number(info.plan_monthly_data) * multiplier);
  const used = Math.round(Number(info.data_counter) * multiplier);
  const expire = expireAt();

  return {
    used,
    total,
    expire,
    remaining: Math.max(total - used, 0),
    percent: total > 0 ? Math.min((used / total) * 100, 100) : 0,
  };
}

function userinfo(info) {
  const { used, total, expire } = traffic(info);

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

function wantsHtml(request) {
  return (request.headers.get("accept") || "").includes(ACCEPT_HTML);
}

function humanBytes(bytes) {
  let value = Number(bytes) || 0;
  let unit = 0;

  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value.toFixed(unit === 0 || value >= 100 ? 0 : 2)} ${BYTE_UNITS[unit]}`;
}

// 浏览器直接打开时给一张自包含的用量面板。Sub-Store 不发 Accept: text/html，
// 拿到的一直是纯文本 userinfo；两条路互不干扰。面板里还埋一份同值 userinfo，
// 万一某个客户端拿 HTML 去正则扫描（parseFlowHeaders 认第一个匹配），数字不变。
function page(info) {
  const value = userinfo(info);
  const { used, total, expire, remaining, percent } = traffic(info);
  const percentText = `${percent.toFixed(1)}%`;
  const reset = expire > 0 ? new Date(expire * 1000).toISOString() : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="subscription-userinfo" content="${value}">
<link rel="icon" href="${FAVICON}">
<title>BandwagonHOST</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    background: #14181d;
    color: #e8eaed;
    font: 15px/1.5 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  }
  .card {
    width: min(92vw, 420px);
    padding: 24px;
    border: 1px solid #2c343e;
    border-radius: 18px;
    background: #1d232b;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
  }
  header { display: flex; align-items: center; gap: 12px; }
  .mark { width: 40px; height: 40px; border-radius: 10px; }
  h1 { margin: 0; font-size: 17px; letter-spacing: 0.2px; }
  .sub { margin: 2px 0 0; font-size: 12px; color: #8b949e; }
  .used { margin: 24px 0 10px; font-size: 36px; font-weight: 700; color: ${BRAND_YELLOW}; }
  .used span { margin-left: 6px; font-size: 15px; font-weight: 400; color: #8b949e; }
  .bar { height: 8px; border-radius: 999px; background: #2c343e; overflow: hidden; }
  .bar span { display: block; height: 100%; border-radius: 999px; background: ${BRAND_YELLOW}; }
  dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 22px 0 0; }
  dt { font-size: 12px; color: #8b949e; }
  dd { margin: 4px 0 0; font-size: 16px; font-weight: 600; }
  .expire { margin: 20px 0 0; font-size: 13px; color: #8b949e; }
  footer { margin-top: 14px; padding-top: 14px; border-top: 1px solid #2c343e; font-size: 12px; color: #6e7681; }
</style>
</head>
<body>
<main class="card">
  <header>
    <img class="mark" src="${FAVICON}" alt="">
    <div>
      <h1>BandwagonHOST</h1>
      <p class="sub">KiwiVM 流量用量</p>
    </div>
  </header>

  <p class="used">${humanBytes(used)}<span>／ ${humanBytes(total)}</span></p>
  <div class="bar"><span style="width:${percentText}"></span></div>

  <dl>
    <div><dt>剩余</dt><dd>${humanBytes(remaining)}</dd></div>
    <div><dt>配额</dt><dd>${humanBytes(total)}</dd></div>
    <div><dt>使用率</dt><dd>${percentText}</dd></div>
  </dl>

  <p class="expire">到期 <time datetime="${reset}">${reset || "未知"}</time></p>
  <footer>数据来源 KiwiVM getServiceInfo · 每 ${PANEL_REFRESH_MS / 1000} 秒自动刷新 · <span id="updated">–</span></footer>
</main>
<script>
  const card = document.querySelector("main.card");

  // 服务端只能按 UTC 渲染，交给浏览器换成用户本地时区；到期写死为 UTC 零点，只显示日期。
  function localizeDate() {
    const t = document.querySelector("time[datetime]");

    if (t && t.dateTime) {
      t.textContent = new Date(t.dateTime).toLocaleDateString();
    }
  }

  // 每次刷新都会整体替换卡片内容（footer 也在里面），所以节点必须现查现用。
  function markUpdated(prefix) {
    const updated = document.querySelector("#updated");

    if (updated) {
      updated.textContent = prefix + " " + new Date().toLocaleTimeString();
    }
  }

  // 静默刷新：重取同一地址（带 Accept: text/html 才拿到面板），只换卡片内容，
  // 不整页重载也不闪屏；上游报错时 Worker 回纯文本 502，此时保留上一次的数据。
  async function refresh() {
    try {
      const response = await fetch(location.href, {
        headers: { accept: "text/html" },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }

      const next = new DOMParser().parseFromString(await response.text(), "text/html");
      const fresh = next.querySelector("main.card");

      if (fresh) {
        card.innerHTML = fresh.innerHTML;
        localizeDate();
      }

      markUpdated("最后更新");
    } catch (error) {
      markUpdated("更新失败 · " + error.message);
    }
  }

  localizeDate();
  markUpdated("最后更新");
  setInterval(refresh, ${PANEL_REFRESH_MS});
</script>
</body>
</html>`;
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

    if (wantsHtml(request)) {
      return new Response(page(info), {
        status: HTTP_OK,
        headers: { ...userinfoHeaders(value), "content-type": HTML_TYPE },
      });
    }

    return new Response(value, {
      status: HTTP_OK,
      headers: { ...userinfoHeaders(value), "content-type": TEXT_TYPE },
    });
  },
};
