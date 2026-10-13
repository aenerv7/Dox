import { env, runInDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FREE_LIMITS, PAID_LIMITS } from "../src/policy";

// 这个文件在 PLAN=paid 的独立测试工程中运行（见 vitest.config.ts）。
const make = () => env.LIBRARY.getByName(crypto.randomUUID());
const today = () => new Date().toISOString().slice(0, 10);
const setUsage = (stub: ReturnType<typeof make>, usage: { attempts: number; writes: number }) =>
  runInDurableObject(stub, (_instance, state) => {
    state.storage.sql.exec(
      "INSERT OR REPLACE INTO meta VALUES(?,?)",
      "usage",
      JSON.stringify({ day: today(), ...usage }),
    );
  });

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Unexpected network request"),
  );
});
afterEach(() => vi.restoreAllMocks());

describe("paid tier profile", () => {
  it("reports the paid plan and its effective bounds", async () => {
    const status = (await make().command("status", {})) as {
      plan: string;
      config: { intervalMinutes: number; maxArticles: number };
      limits: Record<string, unknown>;
    };
    expect(status.plan).toBe("paid");
    expect(status.config).toEqual(PAID_LIMITS.defaultConfig);
    expect(status.limits).toMatchObject({
      intervalMinutes: PAID_LIMITS.intervalMinutes,
      maxArticles: PAID_LIMITS.maxArticles,
      maxFeeds: PAID_LIMITS.maxFeeds,
      maxFeedBytes: PAID_LIMITS.maxFeedBytes,
      maxContentBytes: PAID_LIMITS.maxContentBytes,
      maxLibraryBytes: PAID_LIMITS.maxLibraryBytes,
      dailyFetchAttempts: PAID_LIMITS.dailyFetchAttempts,
      dailyWriteUnits: PAID_LIMITS.dailyWriteUnits,
    });
  });
  it("accepts the wider refresh interval and retention limit", async () => {
    const stub = make();
    const configured = (await stub.command("configure", {
      config: { intervalMinutes: 5, maxArticles: 100000 },
    })) as { config: { intervalMinutes: number; maxArticles: number } };
    expect(configured.config).toEqual({
      intervalMinutes: 5,
      maxArticles: 100000,
    });
    const back = (await stub.command("configure", {
      config: { intervalMinutes: 60, maxArticles: 10000 },
    })) as { config: { intervalMinutes: number; maxArticles: number } };
    expect(back.config).toEqual({ intervalMinutes: 60, maxArticles: 10000 });
  });
  it("keeps fetching past the free daily attempt budget", async () => {
    const stub = make();
    await stub.command("addFeed", {
      url: "https://news.example.com/paid-attempts",
    });
    await setUsage(stub, { attempts: FREE_LIMITS.dailyFetchAttempts, writes: 0 });
    vi.mocked(fetch).mockImplementationOnce(
      async () =>
        new Response(
          "<rss><channel><title>Paid</title><item><guid>paid-one</guid><title>Article</title><description>Body</description></item></channel></rss>",
        ),
    );
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const page = (await stub.command("snapshot", {})) as {
      items: { id: string }[];
      feeds: { error?: string }[];
    };
    expect(page.feeds[0].error).toBeUndefined();
    expect(page.items).toHaveLength(1);
  });
  it("defers to the next UTC day only after the paid budget is spent", async () => {
    const stub = make();
    await stub.command("addFeed", {
      url: "https://news.example.com/paid-exhausted",
    });
    await setUsage(stub, {
      attempts: PAID_LIMITS.dailyFetchAttempts,
      writes: 0,
    });
    await runDurableObjectAlarm(stub);
    expect(
      ((await stub.command("status", {})) as { nextFetchAt: number })
        .nextFetchAt,
    ).toBeGreaterThan(Date.now());
  });
  it("archives a feed beyond the free proxy limit with the paid excerpt cap", async () => {
    const stub = make();
    await stub.command("addFeed", {
      url: "https://news.example.com/huge",
    });
    const body = "x".repeat(6 * 1024 * 1024);
    vi.mocked(fetch).mockImplementationOnce(
      async () =>
        new Response(
          `<rss><channel><title>Huge</title><item><guid>huge-one</guid><description>${body}</description></item></channel></rss>`,
        ),
    );
    await runDurableObjectAlarm(stub);
    const page = (await stub.command("snapshot", {})) as {
      items: { id: string }[];
      feeds: { error?: string }[];
    };
    expect(page.feeds[0].error).toBeUndefined();
    const article = (await stub.command("article", {
      id: page.items[0].id,
    })) as { content: string };
    const bytes = new TextEncoder().encode(article.content).length;
    expect(bytes).toBeGreaterThan(FREE_LIMITS.maxContentBytes);
    expect(bytes).toBeLessThanOrEqual(PAID_LIMITS.maxContentBytes);
  });
});
