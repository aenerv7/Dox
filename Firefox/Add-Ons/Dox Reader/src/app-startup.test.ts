// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { App } from "./app";
import { DEFAULT_SETTINGS } from "./model";
import type { FeedRecord, ItemRecord } from "./model";
import * as repository from "./repository";
import { syncWithWebDav } from "./webdav";

vi.mock("./repository", () => ({
  listFeeds: vi.fn(), listItems: vi.fn(), getItemCounts: vi.fn(),
  getFeedUnreadCounts: vi.fn(), getLastRefreshAllAt: vi.fn(() => Date.now()),
  migrateLegacyEntities: vi.fn(), hasLocalReaderData: vi.fn(() => true),
  setItemState: vi.fn(),
}));
vi.mock("./settings", () => ({
  loadSettings: vi.fn(() => ({ ...DEFAULT_SETTINGS, webdavUrl: "https://dav.example/" })),
  saveSettings: vi.fn(), applyAppearance: vi.fn(),
}));
vi.mock("./webdav", () => ({ syncWithWebDav: vi.fn(), isWebdavUrlValid: (value: string) => value.startsWith("https://") }));

const feeds = ["A", "B"].map(id => ({
  id, title: id, customName: "", url: `https://${id}.example/feed`,
  siteUrl: "", folder: "", addedAt: 0, updatedAt: 0, lastFetchedAt: Date.now(), deleted: false, version: [0, "test"],
})) as FeedRecord[];
const items = feeds.map(feed => ({
  id: feed.id, feedId: feed.id, title: `文章 ${feed.id}`, read: false,
  starred: false, content: "", snippet: "", url: "", author: "", publishedAt: 0,
  fetchedAt: 0, guid: feed.id,
})) as ItemRecord[];
let root: HTMLDivElement;

async function settle() {
  await act(async () => {
    for (let tick = 0; tick < 30; tick++) await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(repository.listFeeds).mockResolvedValue(feeds);
  vi.mocked(repository.listItems).mockResolvedValue(items.map(item => ({ ...item })));
  vi.mocked(repository.getItemCounts).mockResolvedValue({ total: 2, unread: 2, starred: 0 });
  vi.mocked(repository.getFeedUnreadCounts).mockResolvedValue({ A: 1, B: 1 });
  root = document.createElement("div");
  document.body.append(root);
});

afterEach(() => {
  render(null, root);
  root.remove();
  vi.useRealTimers();
});

describe("local startup", () => {
  it("shows local articles while WebDAV sync is still pending", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof syncWithWebDav>>) => void;
    vi.mocked(syncWithWebDav).mockReturnValue(new Promise(yes => { resolve = yes; }));
    await act(async () => { render(h(App, {}), root); });
    await settle();
    expect(syncWithWebDav).toHaveBeenCalledTimes(1);
    expect(root.querySelectorAll(".item-row")).toHaveLength(2);
    expect(root.textContent).toContain("文章 A");
    await act(async () => { resolve({ subscriptions: 2, itemStates: 2, etag: null }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(vi.mocked(repository.listFeeds).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the local library readable when WebDAV is unavailable", async () => {
    vi.mocked(syncWithWebDav).mockRejectedValue(new Error("offline"));
    await act(async () => { render(h(App, {}), root); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(root.querySelectorAll(".item-row")).toHaveLength(2);
    const sync = root.querySelector<HTMLButtonElement>('button[title="同步"]');
    expect(sync?.disabled).toBe(false);
    await act(async () => { root.querySelector<HTMLButtonElement>('button[title="设置"]')!.click(); });
    expect(root.textContent).toContain("WebDAV 同步");
    expect(root.querySelector('[aria-label="数据模式"]')).toBeNull();
  });
});
