import test from "node:test";
import assert from "node:assert/strict";

import worker from "./worker.js";

const ENV = { ACCESS_TOKEN: "s3cret", BWH_VEID: " 123456 ", BWH_API_KEY: "private_x" };

const SERVICE_INFO = {
  error: 0,
  hostname: "my.server.com",
  plan_monthly_data: 322122547200,
  data_counter: 569810827,
  monthly_data_multiplier: 1,
  data_next_reset: 1430193600,
};

// expire 不取自上游，按实现写死的规则算期望值：下一年 1 月 1 日 UTC 零点。
function expectedExpire() {
  return Math.floor(Date.UTC(new Date().getUTCFullYear() + 1, 0, 1) / 1000);
}

const USERINFO = `upload=0; download=569810827; total=322122547200; expire=${expectedExpire()}`;

// 复刻 Sub-Store `parseFlowHeaders` 的取值方式：正则扫全文，每个字段认第一个匹配。
function parseLikeSubStore(text) {
  const num = (key) => {
    const match = text.match(
      new RegExp(`${key}=([-+]?)([0-9]*\\.?[0-9]+([eE][-+]?[0-9]+)?)`),
    );

    return match === null ? 0 : Number(match[1] + match[2]);
  };

  return {
    upload: num("upload"),
    download: num("download"),
    total: num("total"),
    expire: num("expire"),
  };
}

// 用桩 fetch 顶掉上游，记录调用参数，返回可自定义的响应。
async function call(env, { token = env.ACCESS_TOKEN, query = {}, upstream, accept } = {}) {
  const calls = [];
  const original = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });

    if (upstream instanceof Response) {
      return upstream;
    }

    return new Response(JSON.stringify(upstream ?? SERVICE_INFO), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const url = new URL("https://bwh-traffic.test/");

    if (token !== undefined) {
      url.pathname = `/${token}`;
    }

    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    return {
      calls,
      response: await worker.fetch(
        new Request(url, accept ? { headers: { accept } } : undefined),
        env,
      ),
    };
  } finally {
    globalThis.fetch = original;
  }
}

test("成功时正文与 subscription-userinfo 同值", async () => {
  const { calls, response } = await call(ENV);
  const value = USERINFO;

  assert.equal(response.status, 200);
  // Sub-Store 读「流量信息 URL」时先解析正文，正文必须也是合法 userinfo
  assert.equal(await response.text(), value);
  assert.equal(response.headers.get("subscription-userinfo"), value);
  assert.equal(response.headers.get("profile-update-interval"), "1");
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.match(response.headers.get("access-control-expose-headers"), /subscription-userinfo/);

  // veid / api_key 去掉首尾空白后再拼进查询串
  const upstream = new URL(calls[0].url);
  assert.equal(upstream.origin + upstream.pathname, "https://api.64clouds.com/v1/getServiceInfo");
  assert.equal(upstream.searchParams.get("veid"), "123456");
  assert.equal(upstream.searchParams.get("api_key"), "private_x");

  // Workers 不支持 redirect: "error"，只能手动拒绝 3xx
  assert.equal(calls[0].init.redirect, "manual");
});

test("上游 3xx 视为失败，不跟随", async () => {
  const { response } = await call(ENV, {
    upstream: new Response("", { status: 302, headers: { location: "https://evil.example/" } }),
  });

  assert.equal(response.status, 502);
  assert.match(await response.text(), /refusing to follow/);
});

test("plan_monthly_data 与 data_counter 都乘 monthly_data_multiplier", async () => {
  const { response } = await call(ENV, {
    upstream: { error: 0, plan_monthly_data: 1000, data_counter: 250, monthly_data_multiplier: 3 },
  });

  assert.equal(
    response.headers.get("subscription-userinfo"),
    `upload=0; download=750; total=3000; expire=${expectedExpire()}`,
  );
});

test("expire 写死为下一年 1 月 1 日 UTC，与上游 reset 时间无关", async () => {
  const { response } = await call(ENV, {
    upstream: { error: 0, plan_monthly_data: 1000, data_counter: 250 },
  });
  const expire = Number(response.headers.get("subscription-userinfo").match(/expire=(\d+)/)[1]);
  const date = new Date(expire * 1000);

  assert.equal(date.getUTCFullYear(), new Date().getUTCFullYear() + 1);
  assert.equal(date.getUTCMonth(), 0);
  assert.equal(date.getUTCDate(), 1);
  assert.equal(date.getUTCHours(), 0);
  assert.notEqual(expire, SERVICE_INFO.data_next_reset);
});

test("网关若加上 data 信封也能读", async () => {
  const { response } = await call(ENV, { upstream: { error: 0, data: SERVICE_INFO } });

  assert.equal(response.headers.get("subscription-userinfo"), USERINFO);
});

test("KiwiVM 报错时原样透出错误码", async () => {
  const { response } = await call(ENV, {
    upstream: { error: 700005, message: "Authentication failure" },
  });

  assert.equal(response.status, 502);
  assert.equal(await response.text(), "KiwiVM API error 700005: Authentication failure");
});

test("Cloudflare 出口被拒时给出中转提示", async () => {
  const { response } = await call(ENV, {
    upstream: { success: true, token: 38481974907714 },
  });

  assert.equal(response.status, 502);
  assert.match(await response.text(), /KIWIVM_BASE/);
});

test("上游返回非 JSON 时报 502", async () => {
  const { response } = await call(ENV, { upstream: new Response("<html>challenge</html>", { status: 200 }) });

  assert.equal(response.status, 502);
  assert.match(await response.text(), /non-JSON/);
});

test("没有流量字段时列出实际字段", async () => {
  const { response } = await call(ENV, { upstream: { error: 0, hostname: "x" } });

  assert.equal(response.status, 502);
  assert.match(await response.text(), /Keys: error, hostname/);
});

test("配置了口令就校验 token", async () => {
  const bad = await call(ENV, { token: "wrong" });

  assert.equal(bad.response.status, 403);
  assert.equal(bad.calls.length, 0, "口令不符时不得请求上游");

  const open = await call({ ...ENV, ACCESS_TOKEN: "" }, { token: undefined });

  assert.equal(open.response.status, 200);
});

test("口令只认路径首段，?token= 不再放行", async () => {
  const ok = await call(ENV);

  assert.equal(ok.response.status, 200);

  // 路径为空（token 传 ""）、正确口令只出现在查询串里 → 仍然 403
  const queryOnly = await call(ENV, { token: "", query: { token: ENV.ACCESS_TOKEN } });

  assert.equal(queryOnly.response.status, 403);
  assert.equal(queryOnly.calls.length, 0);

  // 尾斜杠、多余路径段都不影响首段取值
  const trailing = await call(ENV, { token: `${ENV.ACCESS_TOKEN}/` });

  assert.equal(trailing.response.status, 200);
});

test("缺少必要配置时报 500", async () => {
  const noVeid = await call({ ...ENV, BWH_VEID: "" });

  assert.equal(noVeid.response.status, 500);
  assert.equal(await noVeid.response.text(), "Missing BWH_VEID");

  const noKey = await call({ ...ENV, BWH_API_KEY: "" });

  assert.equal(noKey.response.status, 500);
  assert.equal(await noKey.response.text(), "Missing BWH_API_KEY");
});

test("KIWIVM_BASE 指向中转，共享口令复用 ACCESS_TOKEN", async () => {
  const env = { ...ENV, KIWIVM_BASE: "https://bwh-traffic.example.com/" };
  const { calls, response } = await call(env);

  assert.equal(response.status, 200);
  // 基地址末尾斜杠去掉后直接接 /getServiceInfo
  assert.equal(calls[0].url.startsWith("https://bwh-traffic.example.com/getServiceInfo?"), true);
  assert.equal(calls[0].init.headers["x-relay-token"], ENV.ACCESS_TOKEN);
});

test("没有 ACCESS_TOKEN 时不带中转口令头", async () => {
  const { calls } = await call({ ...ENV, ACCESS_TOKEN: "" }, { token: undefined });

  assert.equal(calls[0].init.headers["x-relay-token"], undefined);
});

test("debug=1 在被拒时给出空 userinfo 与上游正文", async () => {
  const { response } = await call(ENV, {
    query: { debug: "1" },
    upstream: { success: true, token: 1968167796083 },
  });
  const report = await response.json();

  assert.deepEqual(report.upstream_keys, ["success", "token"]);
  assert.equal(report.userinfo, null);
  assert.match(report.upstream_body, /"token"/);
});

test("debug=1 回显上游字段与原始正文", async () => {
  const { response } = await call(ENV, { query: { debug: "1" } });
  const report = await response.json();

  assert.equal(report.upstream_status, 200);
  assert.deepEqual(report.upstream_keys, Object.keys(SERVICE_INFO));
  assert.equal(report.userinfo, USERINFO);
  assert.match(report.upstream_body, /"data_counter"/);
});

test("浏览器拿到 HTML 面板，Sub-Store 的正则解析仍读到同一组数字", async () => {
  const { response } = await call(ENV, { accept: "text/html,application/xhtml+xml" });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(response.headers.get("subscription-userinfo"), USERINFO);
  // 面板里埋的 userinfo 与响应头同值
  assert.match(html, new RegExp(`<meta name="subscription-userinfo" content="${USERINFO}">`));
  // 真被当正文扫描（parseFlowHeaders 是纯正则）时数字也不变
  const parsed = parseLikeSubStore(html);
  assert.equal(parsed.upload, 0);
  assert.equal(parsed.download, 569810827);
  assert.equal(parsed.total, 322122547200);
  assert.equal(parsed.expire, expectedExpire());
  // 标签页图标是内联 SVG，不引用外部主机
  assert.match(html, /<link rel="icon" href="data:image\/svg\+xml,/);
  assert.doesNotMatch(html, /(src|href)="https?:\/\//);
});

test("Accept 不含 text/html 的客户端拿到纯文本正文", async () => {
  const { response } = await call(ENV, { accept: "*/*" });

  assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(await response.text(), USERINFO);
});
