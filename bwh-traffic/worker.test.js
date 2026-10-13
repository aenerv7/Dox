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

// 用桩 fetch 顶掉上游，记录调用参数，返回可自定义的响应。
async function call(env, { token = env.ACCESS_TOKEN, query = {}, upstream } = {}) {
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
      url.searchParams.set("token", token);
    }

    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    return { calls, response: await worker.fetch(new Request(url), env) };
  } finally {
    globalThis.fetch = original;
  }
}

test("成功时把流量写进 subscription-userinfo", async () => {
  const { calls, response } = await call(ENV);

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "OK");
  assert.equal(
    response.headers.get("subscription-userinfo"),
    "upload=0; download=569810827; total=322122547200; expire=1430193600",
  );
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
    "upload=0; download=750; total=3000",
  );
});

test("缺少 data_next_reset 时不写 expire", async () => {
  const { response } = await call(ENV, {
    upstream: { error: 0, plan_monthly_data: 1000, data_counter: 250 },
  });

  assert.equal(response.headers.get("subscription-userinfo"), "upload=0; download=250; total=1000");
});

test("网关若加上 data 信封也能读", async () => {
  const { response } = await call(ENV, { upstream: { error: 0, data: SERVICE_INFO } });

  assert.equal(
    response.headers.get("subscription-userinfo"),
    "upload=0; download=569810827; total=322122547200; expire=1430193600",
  );
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

test("缺少必要配置时报 500", async () => {
  const noVeid = await call({ ...ENV, BWH_VEID: "" });

  assert.equal(noVeid.response.status, 500);
  assert.equal(await noVeid.response.text(), "Missing BWH_VEID");

  const noKey = await call({ ...ENV, BWH_API_KEY: "" });

  assert.equal(noKey.response.status, 500);
  assert.equal(await noKey.response.text(), "Missing BWH_API_KEY");
});

test("KIWIVM_BASE 指向中转并带上共享口令", async () => {
  const env = {
    ...ENV,
    KIWIVM_BASE: "https://relay.example.com/kiwivm/v1/",
    KIWIVM_RELAY_TOKEN: "relay-s3cret",
  };
  const { calls, response } = await call(env);

  assert.equal(response.status, 200);
  assert.equal(calls[0].url.startsWith("https://relay.example.com/kiwivm/v1/getServiceInfo?"), true);
  assert.equal(calls[0].init.headers["x-relay-token"], "relay-s3cret");
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
  assert.equal(report.userinfo, "upload=0; download=569810827; total=322122547200; expire=1430193600");
  assert.match(report.upstream_body, /"data_counter"/);
});
