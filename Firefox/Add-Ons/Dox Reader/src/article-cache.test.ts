import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addFeed, applySyncDocument, db, exportSyncDocument, getActor, saveParsedFeed, setFeedError, setItemState, updateItemContent } from "./database";
import type { ParsedFeed } from "./model";

beforeEach(async () => {
  await Promise.all([db.feeds.clear(), db.items.clear(), db.itemStates.clear(), db.meta.clear()]);
});

async function setup() {
  const feed = await addFeed("https://example.com/feed");
  const parsed: ParsedFeed = {
    title: "Feed", siteUrl: "https://example.com/",
    items: [{ id: "one", feedId: feed.id, guid: "one", title: "Title", url: "https://example.com/post", author: "", publishedAt: 1, content: "<p>RSS summary</p>", snippet: "RSS summary" }],
  };
  await saveParsedFeed(feed.id, parsed);
  return { feed, parsed };
}

describe("local article cache", () => {
  it("advances success time for an empty successful feed but never for errors or stale responses", async () => {
    const { feed } = await setup();
    await db.feeds.update(feed.id, { lastFetchedAt: 1234 });
    await setFeedError(feed.id, 'HTTP 503', feed.url);
    expect((await db.feeds.get(feed.id))!.lastFetchedAt).toBe(1234);
    const parsed: ParsedFeed = { title: 'Feed', siteUrl: '', items: [] };
    await saveParsedFeed(feed.id, parsed, 'https://example.com/wrong');
    expect((await db.feeds.get(feed.id))!.lastFetchedAt).toBe(1234);
    const startedAt = Date.now();
    await saveParsedFeed(feed.id, parsed, feed.url);
    const refreshed = (await db.feeds.get(feed.id))!;
    expect(refreshed.lastFetchedAt).toBeGreaterThanOrEqual(startedAt);
    expect(refreshed.error).toBeUndefined();
  });

  it("preserves local success timestamps on sync but invalidates them for changed source URLs", async () => {
    const { feed } = await setup();
    await db.feeds.update(feed.id, { lastFetchedAt: 1234 });
    const document = await exportSyncDocument();
    document.lastRefreshAllAt = Date.now();
    await applySyncDocument(document);
    expect((await db.feeds.get(feed.id))!.lastFetchedAt).toBe(1234);
    document.subscriptions[feed.id].url = 'https://example.com/new-feed';
    await applySyncDocument(document);
    expect((await db.feeds.get(feed.id))!.lastFetchedAt).toBeUndefined();
  });

  it("preserves full text, latest RSS fallback and reading states across refresh without syncing bodies", async () => {
    const { feed, parsed } = await setup();
    await setItemState("one", { read: true, starred: true });
    await updateItemContent("one", "<p>Full article</p>", parsed.items[0].url);
    parsed.items[0].content = "<p>Updated RSS summary</p>";
    await saveParsedFeed(feed.id, parsed);
    expect(await db.items.get("one")).toMatchObject({
      content: "<p>Full article</p>", feedContent: "<p>Updated RSS summary</p>", contentSource: "article", read: true, starred: true,
    });
    const exported = JSON.stringify(await exportSyncDocument());
    expect(exported).not.toContain("Full article");
    expect(exported).not.toContain("Updated RSS summary");
    expect(exported).not.toContain("feedContent");
  });

  it("does not attach stale full text to a changed article URL", async () => {
    const { feed, parsed } = await setup();
    await updateItemContent("one", "<p>Old full article</p>", parsed.items[0].url);
    parsed.items[0].url = "https://example.com/changed";
    await saveParsedFeed(feed.id, parsed);
    expect(await db.items.get("one")).toMatchObject({ contentSource: "feed", content: parsed.items[0].content });
    expect(await updateItemContent("one", "stale", "https://example.com/post")).toBeUndefined();
  });

  it("never recreates an article deleted while extraction was pending", async () => {
    const { parsed } = await setup();
    await db.items.delete("one");
    expect(await updateItemContent("one", "late response", parsed.items[0].url)).toBeUndefined();
    expect(await db.items.count()).toBe(0);
  });

  it("generates ids without crypto.randomUUID in insecure contexts", async () => {
    const original = globalThis.crypto;
    vi.stubGlobal("crypto", {
      getRandomValues: original.getRandomValues.bind(original),
    });
    try {
      const feed = await addFeed("https://example.com/insecure");
      expect(feed.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(await getActor()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
