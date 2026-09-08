import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type ItemRecord, type FeedRecord } from "./model";
import {
  backendCall,
  backendUrl,
  connectBackend,
  pullBackend,
  backendCache,
  backendArticle,
} from "./backend";
import * as local from "./database";
import * as repo from "./repository";
const settings = {
  ...DEFAULT_SETTINGS,
  storageMode: "backend" as const,
  backendUrl: "https://personal.example.com",
  backendToken: "test-token",
};
const feed: FeedRecord = {
  id: "feed",
  url: "https://news.example.com/rss",
  title: "News",
  siteUrl: "",
  customName: "",
  folder: "",
  deleted: false,
  addedAt: 1,
  updatedAt: 1,
  version: [1, "test"],
};
const item: ItemRecord = {
  id: "item",
  feedId: "feed",
  title: "Article",
  author: "",
  guid: "item",
  url: "https://news.example.com/1",
  content: "",
  snippet: "Preview",
  read: false,
  starred: false,
  publishedAt: 1,
  fetchedAt: 1,
};
const status = {
  product: "Dox Reader Backend",
  apiVersion: 1,
  revision: 1,
  config: { intervalMinutes: 60, maxArticles: 10000 },
  job: { running: false },
};
afterEach(async () => {
  if (settings.storageMode === "backend") {
    try {
      await backendCache().delete();
    } catch {}
  }
  await connectBackend(DEFAULT_SETTINGS);
  await local.clearAllData();
  vi.unstubAllGlobals();
});
describe("backend mode isolation", () => {
  it("keeps local feeds and WebDAV data isolated from the backend cache", async () => {
    await local.addFeed("https://local.example.com/rss");
    await connectBackend(settings);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const p = JSON.parse(init.body);
        return Response.json(
          p.action === "status"
            ? status
            : { revision: 1, feeds: [feed], items: [item], next: null },
        );
      }),
    );
    await pullBackend();
    expect((await repo.listFeeds())[0].id).toBe("feed");
    expect((await local.listFeeds())[0].url).toBe(
      "https://local.example.com/rss",
    );
    await connectBackend(DEFAULT_SETTINGS);
    expect((await repo.listFeeds())[0].url).toBe(
      "https://local.example.com/rss",
    );
  });
  it("sends credentials only in the header and refuses insecure or redirecting endpoints", async () => {
    expect(() => backendUrl("http://example.com")).toThrow();
    expect(() => backendUrl("https://u:p@example.com")).toThrow();
    const fetch = vi.fn(async () => Response.json(status));
    vi.stubGlobal("fetch", fetch);
    await backendCall("status", {}, settings);
    expect(fetch).toHaveBeenCalledWith(
      "https://personal.example.com/api/v1",
      expect.objectContaining({
        redirect: "error",
        credentials: "omit",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });
  it("does not replace cached data with an incomplete snapshot", async () => {
    await connectBackend(settings);
    await backendCache().meta.clear();
    await backendCache().items.put({ ...item, content: "Cached" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const p = JSON.parse(init.body);
        if (p.action === "status") return Response.json(status);
        throw new TypeError("offline");
      }),
    );
    await expect(pullBackend()).rejects.toThrow("offline");
    expect((await repo.listItems("all"))[0].content).toBe("Cached");
    expect((await backendArticle(item.id))?.content).toBe("Cached");
  });
  it("does not change local read state when the remote write fails", async () => {
    await connectBackend(settings);
    await backendCache().items.put(item);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "invalid token" }, { status: 401 }),
      ),
    );
    await expect(repo.setItemState("item", { read: true })).rejects.toThrow(
      "invalid token",
    );
    expect((await backendCache().items.get("item"))?.read).toBe(false);
  });
});
