import {
  env,
  SELF,
  runInDurableObject,
  runDurableObjectAlarm,
} from "cloudflare:test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  FREE_LIMITS,
  PAID_LIMITS,
  RETENTION_FULL_MESSAGE,
  boundedContent,
  clampConfig,
  feedUrl,
  limitedText,
  planName,
  resolveLimits,
  validateConfig,
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
    expect(new TextEncoder().encode(article.content).length).toBeLessThanOrEqual(FREE_LIMITS.maxContentBytes);
  });
  it("cancels a stream exceeding 5 MiB even without Content-Length", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
      cancel,
    });
    await expect(limitedText(new Response(stream), FREE_LIMITS.maxFeedBytes)).rejects.toThrow("内容超过大小限制");
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
      plan: "free",
      config: { intervalMinutes: 60, maxArticles: 10000 },
      limits: {
        maxFeeds: FREE_LIMITS.maxFeeds,
        dailyFetchAttempts: FREE_LIMITS.dailyFetchAttempts,
        dailyWriteUnits: FREE_LIMITS.dailyWriteUnits,
      },
    });
  });
  it("keeps the paid profile behind its own plan and clamps on downgrade", () => {
    expect(resolveLimits(undefined)).toBe(FREE_LIMITS);
    expect(resolveLimits("free")).toBe(FREE_LIMITS);
    expect(resolveLimits("unknown")).toBe(FREE_LIMITS);
    expect(resolveLimits(" paid ")).toBe(PAID_LIMITS);
    expect(resolveLimits("PAID")).toBe(PAID_LIMITS);
    expect(planName(FREE_LIMITS)).toBe("免费");
    expect(planName(PAID_LIMITS)).toBe("付费");

    // 免费档不接受付费档的范围，付费档接受双方的合法值。
    expect(() =>
      validateConfig({ intervalMinutes: 5, maxArticles: 50000 }, FREE_LIMITS),
    ).toThrow();
    expect(
      validateConfig(
        { intervalMinutes: 5, maxArticles: 100000 },
        PAID_LIMITS,
      ),
    ).toEqual({ intervalMinutes: 5, maxArticles: 100000 });
    expect(
      validateConfig({ intervalMinutes: 60, maxArticles: 10000 }, PAID_LIMITS),
    ).toEqual({ intervalMinutes: 60, maxArticles: 10000 });
    expect(() =>
      validateConfig({ intervalMinutes: 4, maxArticles: 1000 }, PAID_LIMITS),
    ).toThrow();
    expect(() =>
      validateConfig({ intervalMinutes: 5, maxArticles: 100001 }, PAID_LIMITS),
    ).toThrow();

    // 降级到免费档后，已存的付费档配置必须立即收敛回免费档上限。
    expect(
      clampConfig({ intervalMinutes: 5, maxArticles: 50000 }, FREE_LIMITS),
    ).toEqual({ intervalMinutes: 30, maxArticles: 10000 });
    expect(
      clampConfig({ intervalMinutes: 5, maxArticles: 50000 }, PAID_LIMITS),
    ).toEqual({ intervalMinutes: 5, maxArticles: 50000 });
    expect(clampConfig(null, PAID_LIMITS)).toEqual(PAID_LIMITS.defaultConfig);

    // 正文上限随档位增大，免费档仍按 48 KiB 截断。
    const long = "文".repeat(30000);
    expect(
      new TextEncoder().encode(
        boundedContent(long, FREE_LIMITS.maxContentBytes),
      ).length,
    ).toBeLessThanOrEqual(FREE_LIMITS.maxContentBytes);
    expect(boundedContent(long, PAID_LIMITS.maxContentBytes)).toBe(long);
    expect(PAID_LIMITS.maxFeeds).toBeGreaterThan(FREE_LIMITS.maxFeeds);
    expect(PAID_LIMITS.maxLibraryBytes).toBeGreaterThan(FREE_LIMITS.maxLibraryBytes);
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
      validateConfig({ intervalMinutes: 1, maxArticles: 10000 }, FREE_LIMITS),
    ).toThrow();
    expect(() =>
      validateConfig({ intervalMinutes: 60, maxArticles: 10001 }, FREE_LIMITS),
    ).toThrow();
    expect(
      new TextEncoder().encode(
        boundedContent("文".repeat(50000), FREE_LIMITS.maxContentBytes),
      ).length,
    ).toBeLessThanOrEqual(FREE_LIMITS.maxContentBytes);
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
  it("retains the latest articles globally while keeping starred ones", async () => {
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
        .exec("SELECT COUNT(*) AS n,MIN(publishedAt) AS first,SUM(starred) AS starred FROM articles")
        .one(),
    );
    // 最旧的 50 篇是收藏，淘汰跳过它们，改删紧随其后的 50 篇未收藏文章。
    expect(range).toMatchObject({ n: 10000, first: 0, starred: 50 });
    await stub.command("configure", {
      config: { intervalMinutes: 120, maxArticles: 100 },
    });
    expect(
      await runInDurableObject(stub, (_i, state) =>
        state.storage.sql.exec("SELECT count FROM totals").one(),
      ),
    ).toMatchObject({ count: 100 });
  });
  it("keeps starred articles when the byte budget is exhausted", async () => {
    const stub = make();
    await runInDurableObject(stub, (_instance, state) => {
      // 只写 bytes 列即可超预算：600 MiB 预算下 20 篇各占 600 MiB。
      for (let i = 0; i < 20; i++)
        state.storage.sql.exec(
          "INSERT INTO articles(id,feedId,publishedAt,data,content,bytes,starred) VALUES(?,?,?,?,?,?,?)",
          String(i).padStart(3, "0"),
          "feed",
          i,
          JSON.stringify({ id: String(i), publishedAt: i }),
          "body",
          FREE_LIMITS.maxLibraryBytes,
          i < 10 ? 1 : 0,
        );
    });
    await stub.command("configure", {
      config: { intervalMinutes: 60, maxArticles: 10000 },
    });
    // 删完未收藏文章后预算仍然超支：不能再删收藏，也不能死循环。
    expect(
      await runInDurableObject(stub, (_i, state) =>
        state.storage.sql
          .exec("SELECT COUNT(*) AS n,SUM(starred) AS starred FROM articles")
          .one(),
      ),
    ).toMatchObject({ n: 10, starred: 10 });
  });
  it("stops fetching when the retention limit is filled by starred articles", async () => {
    const stub = make();
    await runInDurableObject(stub, (_instance, state) => {
      for (let i = 0; i < 100; i++)
        state.storage.sql.exec(
          "INSERT INTO articles(id,feedId,publishedAt,data,content,bytes,starred) VALUES(?,?,?,?,?,?,1)",
          String(i).padStart(3, "0"),
          "feed",
          i,
          JSON.stringify({ id: String(i), publishedAt: i }),
          "body",
          10,
        );
    });
    await stub.command("configure", {
      config: { intervalMinutes: 60, maxArticles: 100 },
    });
    await stub.command("addFeed", { url: "https://news.example.com/full" });
    const status = (await stub.command("status", {})) as {
      retention: { articles: number; starred: number; blocked: boolean };
    };
    expect(status.retention).toMatchObject({
      articles: 100,
      starred: 100,
      blocked: true,
    });
    await runDurableObjectAlarm(stub);
    // 收藏占满上限：抓取直接顺延，不发起网络请求，也不消耗每日抓取预算。
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(
      ((await stub.command("status", {})) as { usage: { attempts: number } })
        .usage.attempts,
    ).toBe(0);
    expect(
      await runInDurableObject(stub, async (instance) => {
        try {
          await instance.command("refresh", {});
          return "";
        } catch (e) {
          return (e as Error).message;
        }
      }),
    ).toBe(RETENTION_FULL_MESSAGE);
  });
  it("requires confirmation before the limit drops below the starred count", async () => {
    const stub = make();
    await runInDurableObject(stub, (_instance, state) => {
      for (let i = 0; i < 120; i++)
        state.storage.sql.exec(
          "INSERT INTO articles(id,feedId,publishedAt,data,content,bytes,starred) VALUES(?,?,?,?,?,?,?)",
          String(i).padStart(3, "0"),
          "feed",
          i,
          JSON.stringify({ id: String(i), publishedAt: i }),
          "body",
          10,
          i < 110 ? 1 : 0,
        );
    });
    // 上限 100 小于收藏 110：未确认时必须拒绝，一篇都不删。
    const message = await runInDurableObject(stub, async (instance) => {
      try {
        await instance.command("configure", {
          config: { intervalMinutes: 60, maxArticles: 100 },
        });
        return "";
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(message).toContain("收藏 110 篇");
    const untouched = (await stub.command("status", {})) as {
      config: { maxArticles: number };
      retention: { articles: number };
    };
    expect(untouched.config.maxArticles).toBe(FREE_LIMITS.defaultConfig.maxArticles);
    expect(untouched.retention.articles).toBe(120);
    // 确认后按由旧到新裁剪到新上限：最旧的 20 篇收藏让位，最新的 10 篇未收藏文章保留。
    await stub.command("configure", {
      config: { intervalMinutes: 60, maxArticles: 100 },
      confirmStarred: true,
    });
    const status = (await stub.command("status", {})) as {
      retention: {
        articles: number;
        starred: number;
        limit: number;
        blocked: boolean;
      };
    };
    expect(status.retention).toEqual({
      articles: 100,
      starred: 90,
      limit: 100,
      blocked: false,
    });
    const survivors = (await stub.command("snapshot", {})) as {
      items: { publishedAt: number }[];
    };
    expect(Math.min(...survivors.items.map((item) => item.publishedAt))).toBe(20);
  });
  it("keeps stars when the unstarred articles absorb the reduction", async () => {
    const stub = make();
    await runInDurableObject(stub, (_instance, state) => {
      for (let i = 0; i < 120; i++)
        state.storage.sql.exec(
          "INSERT INTO articles(id,feedId,publishedAt,data,content,bytes,starred) VALUES(?,?,?,?,?,?,?)",
          String(i).padStart(3, "0"),
          "feed",
          i,
          JSON.stringify({ id: String(i), publishedAt: i }),
          "body",
          10,
          i >= 100 ? 1 : 0,
        );
    });
    // 收藏 20 篇远少于新上限 100：不需要确认，删掉的都是未收藏的旧文章。
    await stub.command("configure", {
      config: { intervalMinutes: 60, maxArticles: 100 },
    });
    const page = (await stub.command("snapshot", {})) as {
      items: { publishedAt: number; starred: boolean }[];
    };
    expect(page.items).toHaveLength(100);
    expect(Math.min(...page.items.map((item) => item.publishedAt))).toBe(20);
    expect(page.items.filter((item) => item.starred)).toHaveLength(20);
    // 上限回归硬约束后抓取照常：新文章顶掉最旧的未收藏文章，总数不变。
    const feed = (await stub.command("addFeed", {
      url: "https://news.example.com/resume",
    })) as { id: string };
    vi.mocked(fetch).mockImplementationOnce(
      async () =>
        new Response(
          `<rss><channel><title>Resume</title><item><guid>fresh</guid><pubDate>${new Date(9000).toUTCString()}</pubDate></item></channel></rss>`,
        ),
    );
    await stub.command("refresh", { ids: [feed.id] });
    await runDurableObjectAlarm(stub);
    const after = (await stub.command("snapshot", {})) as {
      items: { guid?: string }[];
    };
    expect(after.items.flatMap((item) => item.guid ?? [])).toEqual(["fresh"]);
    expect(after.items).toHaveLength(100);
  });
  it("skips candidates older than the oldest evictable article", async () => {
    const stub = make();
    await runInDurableObject(stub, (_instance, state) => {
      for (let i = 0; i < 100; i++)
        state.storage.sql.exec(
          "INSERT INTO articles(id,feedId,publishedAt,data,content,bytes,starred) VALUES(?,?,?,?,?,?,?)",
          String(i).padStart(3, "0"),
          "feed",
          i,
          JSON.stringify({ id: String(i), publishedAt: i }),
          "body",
          10,
          i > 0 ? 1 : 0,
        );
    });
    await stub.command("configure", {
      config: { intervalMinutes: 60, maxArticles: 100 },
    });
    await stub.command("addFeed", { url: "https://news.example.com/evict" });
    vi.mocked(fetch).mockImplementationOnce(
      async () =>
        new Response(
          `<rss><channel><title>Full</title><item><guid>new-900</guid><pubDate>${new Date(9000).toUTCString()}</pubDate></item><item><guid>new-800</guid><pubDate>${new Date(8000).toUTCString()}</pubDate></item></channel></rss>`,
          { headers: { etag: '"full"' } },
        ),
    );
    await runDurableObjectAlarm(stub);
    const page = (await stub.command("snapshot", {})) as {
      items: { guid?: string }[];
    };
    // 唯一可淘汰的“000”让位给较新的候选；更旧的候选连它都比不过，直接跳过。
    expect(page.items.flatMap((item) => item.guid ?? [])).toEqual(["new-900"]);
    expect(page.items).toHaveLength(100);
    // 保留窗口主动舍弃过旧候选不算收录中断，验证头照常保存。
    expect(
      await runInDurableObject(stub, (_i, state) =>
        state.storage.sql.exec("SELECT etag FROM feeds").one(),
      ),
    ).toMatchObject({ etag: '"full"' });
    expect(
      (
        (await stub.command("status", {})) as {
          retention: { blocked: boolean };
        }
      ).retention.blocked,
    ).toBe(false);
  });
  it("drops an in-flight feed once the last evictable article is starred", async () => {
    const stub = make();
    await runInDurableObject(stub, (_instance, state) => {
      for (let i = 0; i < 100; i++)
        state.storage.sql.exec(
          "INSERT INTO articles(id,feedId,publishedAt,data,content,bytes,starred) VALUES(?,?,?,?,?,?,?)",
          String(i).padStart(3, "0"),
          "feed",
          i,
          JSON.stringify({ id: String(i), publishedAt: i }),
          "body",
          10,
          i > 0 ? 1 : 0,
        );
    });
    await stub.command("configure", {
      config: { intervalMinutes: 60, maxArticles: 100 },
    });
    const feed = (await stub.command("addFeed", {
      url: "https://news.example.com/race",
    })) as { id: string };
    await runInDurableObject(stub, async (instance) => {
      // 抓取途中用户收藏了最后一篇可淘汰文章，这一轮就再也腾不出位置了。
      vi.mocked(fetch).mockImplementationOnce(async () => {
        await instance.command("state", { id: "000", starred: true });
        return new Response(
          `<rss><channel><title>Full</title><item><guid>new-900</guid><pubDate>${new Date(9000).toUTCString()}</pubDate></item></channel></rss>`,
          { headers: { etag: '"full"' } },
        );
      });
      await instance.alarm();
    });
    const page = (await stub.command("snapshot", {})) as {
      items: { guid?: string }[];
    };
    expect(page.items.flatMap((item) => item.guid ?? [])).toEqual([]);
    expect(page.items).toHaveLength(100);
    // 一条都没收下就必须清掉验证头，否则下次抓取不会再取回这条文章。
    expect(
      await runInDurableObject(stub, (_i, state) =>
        state.storage.sql.exec("SELECT etag FROM feeds WHERE id=?", feed.id).one(),
      ),
    ).toMatchObject({ etag: "" });
    expect(
      (
        (await stub.command("status", {})) as {
          retention: { blocked: boolean };
        }
      ).retention.blocked,
    ).toBe(true);
  });
  it("re-reads feeds without validators when the refresh is full", async () => {
    const stub = make();
    const feed = (await stub.command("addFeed", {
      url: "https://news.example.com/rearchive",
    })) as { id: string };
    vi.mocked(fetch).mockImplementationOnce(
      async () =>
        new Response(
          "<rss><channel><title>Archive</title><item><guid>kept</guid></item></channel></rss>",
          {
            headers: {
              etag: '"v1"',
              "last-modified": "Mon, 07 Sep 2026 00:00:00 GMT",
            },
          },
        ),
    );
    await runDurableObjectAlarm(stub);
    // 误删后重新归档：full 刷新必须先清掉验证头，这一跳不能再带条件请求头。
    vi.mocked(fetch).mockImplementationOnce(async (_url, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.has("if-none-match")).toBe(false);
      expect(headers.has("if-modified-since")).toBe(false);
      return new Response(
        "<rss><channel><title>Archive</title><item><guid>kept</guid></item></channel></rss>",
      );
    });
    await stub.command("refresh", { ids: [feed.id], full: true });
    await runDurableObjectAlarm(stub);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
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
  it("serves only changes since the client watermark", async () => {
    const stub = make();
    expect(await stub.command("status", {})).toMatchObject({ minSeq: 0, maxSeq: 0 });
    expect(await stub.command("delta", { since: 0 })).toMatchObject({
      items: [],
      states: [],
      removed: [],
      next: null,
    });

    await stub.command("addFeed", { url: "https://news.example.com/delta" });
    vi.mocked(fetch).mockImplementationOnce(
      async () =>
        new Response(
          "<rss><channel><title>Delta</title><item><guid>one</guid><description>Body</description></item></channel></rss>",
        ),
    );
    await runDurableObjectAlarm(stub);

    const inserted = (await stub.command("delta", { since: 0 })) as {
      feeds: unknown[];
      items: { id: string }[];
      next: number | null;
    };
    expect(inserted.feeds).toHaveLength(1);
    expect(inserted.items).toHaveLength(1);
    expect(inserted.next).toBeNull();

    // 阅读状态只进变更日志，不再让全量快照的 revision 失效。
    const before = (await stub.command("status", {})) as {
      maxSeq: number;
      revision: number;
    };
    await stub.command("state", { id: inserted.items[0].id, read: true });
    const after = (await stub.command("status", {})) as {
      maxSeq: number;
      revision: number;
    };
    expect(after.revision).toBe(before.revision);
    expect(after.maxSeq).toBeGreaterThan(before.maxSeq);

    const states = (await stub.command("delta", { since: before.maxSeq })) as {
      items: unknown[];
      states: { id: string; read: boolean; starred: boolean }[];
    };
    expect(states.items).toEqual([]);
    expect(states.states).toEqual([
      { id: inserted.items[0].id, read: true, starred: false },
    ]);
  });
  it("pages the change log instead of re-reading the whole library", async () => {
    const stub = make();
    await runInDurableObject(stub, (_instance, state) => {
      for (let i = 0; i < 250; i++) {
        state.storage.sql.exec(
          "INSERT INTO articles(id,feedId,publishedAt,data,content,bytes) VALUES(?,?,?,?,?,?)",
          `item-${i}`,
          "feed",
          i,
          JSON.stringify({ id: `item-${i}`, feedId: "feed", publishedAt: i }),
          "",
          10,
        );
        state.storage.sql.exec(
          "INSERT INTO changes(kind,id) VALUES('item',?)",
          `item-${i}`,
        );
      }
    });
    const first = (await stub.command("delta", { since: 0 })) as {
      items: unknown[];
      next: number | null;
    };
    expect(first.items).toHaveLength(200);
    const second = (await stub.command("delta", {
      since: 0,
      cursor: first.next!,
    })) as { items: unknown[]; next: number | null };
    expect(second.items).toHaveLength(50);
    expect(second.next).toBeNull();
  });
  it("records retention removals in the change log", async () => {
    const stub = make();
    await runInDurableObject(stub, (_instance, state) => {
      for (let i = 0; i < 120; i++)
        state.storage.sql.exec(
          "INSERT INTO articles(id,feedId,publishedAt,data,content,bytes) VALUES(?,?,?,?,?,?)",
          String(i).padStart(3, "0"),
          "feed",
          i,
          JSON.stringify({ id: String(i).padStart(3, "0"), publishedAt: i }),
          "body",
          10,
        );
    });
    await stub.command("configure", {
      config: { intervalMinutes: 60, maxArticles: 100 },
    });
    const page = (await stub.command("delta", { since: 0 })) as {
      removed: string[];
    };
    expect(page.removed).toHaveLength(20);
    expect(page.removed).toContain("000");
    expect(page.removed).not.toContain("119");
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
