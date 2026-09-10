import {
  env,
  SELF,
  runInDurableObject,
  runDurableObjectAlarm,
} from "cloudflare:test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  feedUrl,
  validateConfig,
  boundedContent,
  MAX_CONTENT_BYTES,
  MAX_FEED_BYTES,
  limitedText,
} from "../src/policy";
import { parseFeedXml } from "../src/shared/feed-parser";
const make = () => env.LIBRARY.getByName(crypto.randomUUID());
beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Unexpected network request"),
  );
});
afterEach(() => vi.restoreAllMocks());
describe("personal backend", () => {
  it("identifies feed requests for origins that reject an empty User-Agent", async () => {
    const stub = make();
    await stub.command("addFeed", {
      url: "https://legacy.example.com/?feed=rss2",
    });
    vi.mocked(fetch).mockImplementationOnce(async (_url, init) => {
      const headers = new Headers(init?.headers);
      if (!headers.get("User-Agent")) {
        return new Response("Forbidden: illegal expression !", {
          headers: { "Content-Type": "text/html" },
        });
      }
      expect(headers.get("User-Agent")).toMatch(/^Dox-Reader\//);
      expect(headers.get("Accept")).toContain("text/xml");
      return new Response(
        "<rss><channel><title>Legacy feed</title><item><guid>one</guid><title>Article</title></item></channel></rss>",
        { headers: { "Content-Type": "text/xml; charset=UTF-8" } },
      );
    });

    await runDurableObjectAlarm(stub);
    const page = (await stub.command("snapshot", {})) as {
      feeds: { error?: string }[];
      items: unknown[];
    };
    expect(page.feeds[0].error).toBeUndefined();
    expect(page.items).toHaveLength(1);
  });
  it("parses the Xunlei Yangtai RSS shape returned to identified clients", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"
      xmlns:content="http://purl.org/rss/1.0/modules/content/"
      xmlns:dc="http://purl.org/dc/elements/1.1/">
      <channel><title>迅雷阳台-晒出新鲜事</title><link>https://yangtai.xunlei.com/</link>
      <item><title>公告</title><link>https://yangtai.xunlei.com/?p=11951</link>
      <dc:creator><![CDATA[迅雷]]></dc:creator><guid isPermaLink="false">11951</guid>
      <content:encoded><![CDATA[<p>公告正文</p>]]></content:encoded></item></channel></rss>`;
    const parsed = await parseFeedXml(
      xml,
      "xunlei",
      "https://yangtai.xunlei.com/?feed=rss2",
    );

    expect(parsed).toMatchObject({
      title: "迅雷阳台-晒出新鲜事",
      siteUrl: "https://yangtai.xunlei.com/",
      items: [
        {
          title: "公告",
          author: "迅雷",
          url: "https://yangtai.xunlei.com/?p=11951",
          content: "<p>公告正文</p>",
        },
      ],
    });
  });
  it("updates a feed URL, drops old validators and fetches the new address", async () => {
    const stub = make();
    const feed = await stub.command("addFeed", { url: "https://news.example.com/old" }) as { id: string };
    vi.mocked(fetch).mockImplementationOnce(async () => new Response('<rss><channel><title>Old</title><item><guid>kept</guid><description>Saved body</description></item></channel></rss>', { headers: { etag: '"old"', 'last-modified': 'Mon, 07 Sep 2026 00:00:00 GMT' } }));
    await runDurableObjectAlarm(stub);
    const original = await stub.command("snapshot", {}) as { items: { id: string }[] };
    await stub.command("state", { id: original.items[0].id, starred: true });
    const updated = await stub.command("updateFeed", { id: feed.id, name: "Renamed", url: "https://news.example.com/new" });
    expect(updated).toMatchObject({ id: feed.id, customName: "Renamed", url: "https://news.example.com/new" });
    vi.mocked(fetch).mockImplementationOnce(async (url, init) => {
      expect(String(url)).toBe("https://news.example.com/new");
      expect(new Headers(init?.headers).has("if-none-match")).toBe(false);
      expect(new Headers(init?.headers).has("if-modified-since")).toBe(false);
      return new Response('<rss><channel><title>New</title><item><guid>new</guid><description>New body</description></item></channel></rss>');
    });
    await runDurableObjectAlarm(stub);
    expect(await stub.command("article", { id: original.items[0].id })).toMatchObject({ content: "Saved body", starred: true });
    const page = await stub.command("snapshot", {}) as { items: unknown[]; feeds: { title: string }[] };
    expect(page.items).toHaveLength(2);
    expect(page.feeds[0].title).toBe("New");
  });
  it("ignores a response from an old URL changed during fetching", async () => {
    const stub = make();
    const feed = await stub.command("addFeed", { url: "https://news.example.com/old-race" }) as { id: string };
    await runInDurableObject(stub, async (instance) => {
      vi.mocked(fetch).mockImplementationOnce(async () => {
        await instance.command("updateFeed", { id: feed.id, name: "Changed", url: "https://news.example.com/new-race" });
        return new Response('<rss><channel><title>Stale title</title><item><guid>stale</guid></item></channel></rss>');
      });
      await instance.alarm();
    });
    expect(await stub.command("snapshot", {})).toMatchObject({ items: [], feeds: [{ url: "https://news.example.com/new-race", customName: "Changed" }] });
    vi.mocked(fetch).mockImplementationOnce(async () => new Response('<rss><channel><title>Fresh title</title><item><guid>fresh</guid></item></channel></rss>'));
    await runDurableObjectAlarm(stub);
    const page = await stub.command("snapshot", {}) as { items: unknown[]; feeds: { title: string }[] };
    expect(page.items).toHaveLength(1);
    expect(page.feeds[0].title).toBe("Fresh title");
  });
  it("archives multi-megabyte Atom feeds while bounding each article", async () => {
    const stub = make();
    await stub.command("addFeed", { url: "https://news.example.com/atom.xml" });
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Large archive</title>${Array.from({ length: 10 }, (_, i) => `<entry><id>large-${i}</id><title>Article ${i}</title><updated>2026-09-07T00:00:00Z</updated><content type="html"><![CDATA[${"文".repeat(116650)}]]></content></entry>`).join("")}</feed>`;
    expect(new TextEncoder().encode(xml).length).toBeGreaterThan(3 * 1024 * 1024);
    vi.mocked(fetch).mockImplementationOnce(async () => new Response(xml));
    await runDurableObjectAlarm(stub);
    const page = await stub.command("snapshot", {}) as { feeds: { error?: string }[]; items: { id: string }[] };
    expect(page.feeds[0].error).toBeUndefined();
    expect(page.items).toHaveLength(10);
    const article = await stub.command("article", { id: page.items[0].id }) as { content: string };
    expect(new TextEncoder().encode(article.content).length).toBeLessThanOrEqual(MAX_CONTENT_BYTES);
  });
  it("cancels a stream exceeding 5 MiB even without Content-Length", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
      cancel,
    });
    await expect(limitedText(new Response(stream), MAX_FEED_BYTES)).rejects.toThrow("内容超过大小限制");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("requires authentication and allows browser preflight without credentials", async () => {
    expect(
      (
        await SELF.fetch("https://backend.test/api/v1", {
          method: "POST",
          body: '{"action":"status"}',
        })
      ).status,
    ).toBe(401);
    expect(
      (await SELF.fetch("https://backend.test/api/v1", { method: "OPTIONS" }))
        .status,
    ).toBe(204);
    const res = await SELF.fetch("https://backend.test/api/v1", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-only-token-not-for-production-123456",
      },
      body: '{"action":"status"}',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      product: "Dox Reader Backend",
      config: { intervalMinutes: 60, maxArticles: 10000 },
    });
  });
  it("rejects unsafe feed URLs and oversized policies", () => {
    for (const url of [
      "http://127.0.0.1",
      "http://2130706433",
      "http://10.1.1.1",
      "http://[::1]",
      "https://user:pass@news.example.com",
      "http://metadata.google.internal",
      "http://192.168.1.1",
      "https://news.example.com:8080",
    ])
      expect(() => feedUrl(url)).toThrow();
    expect(() =>
      validateConfig({ intervalMinutes: 1, maxArticles: 10000 }),
    ).toThrow();
    expect(() =>
      validateConfig({ intervalMinutes: 60, maxArticles: 10001 }),
    ).toThrow();
    expect(
      new TextEncoder().encode(boundedContent("文".repeat(50000))).length,
    ).toBeLessThanOrEqual(MAX_CONTENT_BYTES);
  });
  it("persists a scheduled alarm, fetches without a client, deduplicates and preserves state", async () => {
    const stub = make();
    const feed = (await stub.command("addFeed", {
      url: "https://news.example.com/rss",
    })) as { id: string };
    const xml =
      "<rss><channel><title>News</title><item><guid>one</guid><title>Article</title><description>Body</description><pubDate>Mon, 07 Sep 2026 00:00:00 GMT</pubDate></item></channel></rss>";
    vi.mocked(fetch).mockImplementationOnce(
      async () => new Response(xml, { headers: { etag: '"v1"' } }),
    );
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const page = (await stub.command("snapshot", {})) as {
      items: { id: string }[];
      feeds: { error?: string }[];
    };
    expect(page.feeds[0].error).toBeUndefined();
    expect(page.items).toHaveLength(1);
    await stub.command("state", { id: page.items[0].id, starred: true });
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("UPDATE feeds SET due=0 WHERE id=?", feed.id);
    });
    vi.mocked(fetch).mockImplementationOnce(async (_url, init) => {
      expect(new Headers(init?.headers).get("if-none-match")).toBe('"v1"');
      return new Response(null, { status: 304 });
    });
    await runDurableObjectAlarm(stub);
    expect(
      await stub.command("article", { id: page.items[0].id }),
    ).toMatchObject({ content: "Body", starred: true });
    expect(
      await runInDurableObject(stub, (_i, state) => state.storage.getAlarm()),
    ).toBeGreaterThan(Date.now());
  });
  it("retains the latest articles globally including starred, with deterministic ties", async () => {
    const stub = make();
    await runInDurableObject(stub, (_instance, state) => {
      for (let i = 0; i < 10050; i++)
        state.storage.sql.exec(
          "INSERT INTO articles(id,feedId,publishedAt,data,content,bytes,starred) VALUES(?,?,?,?,?,?,?)",
          String(i).padStart(6, "0"),
          i % 2 ? "a" : "b",
          i,
          JSON.stringify({ id: String(i), publishedAt: i }),
          "body",
          100,
          i < 50 ? 1 : 0,
        );
    });
    await stub.command("configure", {
      config: { intervalMinutes: 60, maxArticles: 10000 },
    });
    const range = await runInDurableObject(stub, (_i, state) =>
      state.storage.sql
        .exec("SELECT COUNT(*) AS n,MIN(publishedAt) AS first FROM articles")
        .one(),
    );
    expect(range).toMatchObject({ n: 10000, first: 50 });
    await stub.command("configure", {
      config: { intervalMinutes: 120, maxArticles: 100 },
    });
    expect(
      await runInDurableObject(stub, (_i, state) =>
        state.storage.sql.exec("SELECT count FROM totals").one(),
      ),
    ).toMatchObject({ count: 100 });
  });
  it("snapshot paging detects concurrent changes instead of mixing revisions", async () => {
    const stub = make();
    const page = (await stub.command("snapshot", {})) as { revision: number };
    await stub.command("addFeed", { url: "https://news.example.com/feed" });
    const message = await runInDurableObject(stub, async (instance) => {
      try {
        await instance.command("snapshot", { revision: page.revision });
        return "";
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(message).toBe("SNAPSHOT_CHANGED");
  });
  it("a redirect into a private address is blocked and retried later", async () => {
    const stub = make();
    await stub.command("addFeed", { url: "https://news.example.com/private" });
    vi.mocked(fetch).mockImplementationOnce(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/admin" },
        }),
    );
    await runDurableObjectAlarm(stub);
    const page = (await stub.command("snapshot", {})) as {
      feeds: { error: string }[];
    };
    expect(page.feeds[0].error).toContain("公开");
  });
  it("budget exhaustion reschedules for the next UTC day", async () => {
    const stub = make();
    await stub.command("addFeed", { url: "https://news.example.com/budget" });
    await runInDurableObject(stub, (_i, state) => {
      state.storage.sql.exec(
        "INSERT OR REPLACE INTO meta VALUES(?,?)",
        "usage",
        JSON.stringify({
          day: new Date().toISOString().slice(0, 10),
          attempts: 4800,
          writes: 0,
        }),
      );
    });
    await runDurableObjectAlarm(stub);
    expect(
      ((await stub.command("status", {})) as { nextFetchAt: number })
        .nextFetchAt,
    ).toBeGreaterThan(Date.now());
    const message = await runInDurableObject(stub, async (instance) => {
      try {
        await instance.command("refresh", {});
        return "";
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(message).toContain("预算");
  });
  it("manual refresh coalesces requests and removing a queued feed completes the job", async () => {
    const stub = make();
    const feed = (await stub.command("addFeed", {
      url: "https://news.example.com/manual",
    })) as { id: string };
    const first = (await stub.command("refresh", { ids: [feed.id] })) as {
      job: { startedAt: number; running: boolean };
    };
    expect(first.job.running).toBe(true);
    const second = (await stub.command("refresh", { ids: [feed.id] })) as {
      job: { startedAt: number };
    };
    expect(second.job.startedAt).toBe(first.job.startedAt);
    await stub.command("removeFeed", { id: feed.id });
    expect(await stub.command("status", {})).toMatchObject({
      job: { running: false },
      nextFetchAt: null,
    });
  });
  it("does not resurrect a feed removed during its network request", async () => {
    const stub = make();
    const feed = (await stub.command("addFeed", {
      url: "https://news.example.com/race",
    })) as { id: string };
    await runInDurableObject(stub, async (instance) => {
      vi.mocked(fetch).mockImplementationOnce(async () => {
        await instance.command("removeFeed", { id: feed.id });
        return new Response(
          "<rss><channel><title>Deleted</title><item><guid>a</guid><description>Body</description></item></channel></rss>",
        );
      });
      await instance.alarm();
    });
    expect(await stub.command("snapshot", {})).toMatchObject({
      items: [],
      feeds: [],
    });
  });
});
