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
  setItemState: vi.fn(), markAllRead: vi.fn(), markFeedRead: vi.fn(),
  updateSyncedPreferences: vi.fn(),
}));
vi.mock("./settings", () => ({
  loadSettings: vi.fn(() => ({ ...DEFAULT_SETTINGS, webdavUrl: "https://dav.example/" })),
  saveSettings: vi.fn(), applyAppearance: vi.fn(),
}));
vi.mock("./backend", () => ({
  backendEnabled: () => false, backendOffline: () => false, connectBackend: vi.fn(),
}));
vi.mock("./webdav", () => ({ syncWithWebDav: vi.fn(), testWebDav: vi.fn(() => "连接成功") }));

const feeds = ["A", "B"].map(id => ({
  id, title: id, customName: "", url: `https://${id}.example/feed`,
  siteUrl: "", folder: "", addedAt: 0, updatedAt: 0, deleted: false, version: [0, "test"],
})) as FeedRecord[];
const items = feeds.map(feed => ({
  id: feed.id, feedId: feed.id, title: `文章 ${feed.id}`, read: false,
  starred: false, content: "", snippet: "", url: "", author: "", publishedAt: 0,
  fetchedAt: 0, guid: feed.id,
})) as ItemRecord[];
const syncResult = { subscriptions: 2, itemStates: 2, etag: null };
let root: HTMLDivElement;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function button(selector: string): HTMLButtonElement {
  const result = root.querySelector<HTMLButtonElement>(selector);
  if (!result) { throw new Error(`缺少按钮：${selector}`); }
  return result;
}

async function click(selector: string) {
  await act(async () => { button(selector).click(); });
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(repository.listFeeds).mockResolvedValue(feeds);
  vi.mocked(repository.listItems).mockResolvedValue(items.map(item => ({ ...item })));
  vi.mocked(repository.getItemCounts).mockResolvedValue({ total: 2, unread: 2, starred: 0 });
  vi.mocked(repository.getFeedUnreadCounts).mockResolvedValue({ A: 1, B: 1 });
  vi.mocked(syncWithWebDav).mockResolvedValue(syncResult);
  root = document.createElement("div");
  document.body.append(root);
  await act(async () => { render(h(App, {}), root); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  vi.clearAllMocks();
});

afterEach(() => {
  render(null, root);
  root.remove();
  vi.useRealTimers();
});

describe("pending reader actions", () => {
  it("keeps feed A busy across A/B/A and releases the lock on failure", async () => {
    const pending = deferred<number>();
    vi.mocked(repository.markFeedRead).mockReturnValueOnce(pending.promise);
    const feedMark = '.items-header button[title="全部标为已读"]';
    await click('.feed-row:first-child > button');
    await click(feedMark);
    await click('.feed-row:nth-child(2) > button');
    expect(button(feedMark).disabled).toBe(true);
    expect(button(feedMark).querySelector('.spin')).toBeNull();
    await click('.feed-row:first-child > button');
    expect(button(feedMark).querySelector('.spin')).not.toBeNull();
    await click(feedMark);
    expect(repository.markFeedRead).toHaveBeenCalledTimes(1);
    await act(async () => { pending.reject(new Error("写入失败")); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(button(feedMark).disabled).toBe(false);
    expect(root.textContent).toContain("写入失败");
  });

  it("shares the read lock with automatic marking when opening an article", async () => {
    const pending = deferred<void>();
    vi.mocked(repository.setItemState).mockReturnValueOnce(pending.promise);
    await click('.item-row');
    const toggle = '.article-toolbar button[title="标为已读"]';
    expect(button(toggle).disabled).toBe(true);
    expect(button(toggle).querySelector('.spin')).not.toBeNull();
    await click(toggle);
    await click('.item-row');
    expect(repository.setItemState).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(button('.article-toolbar button[title="标为未读"]').disabled).toBe(false);
  });

  it("retains sync feedback after reopening settings", async () => {
    const pending = deferred<typeof syncResult>();
    vi.mocked(syncWithWebDav).mockReturnValueOnce(pending.promise);
    await click('.topbar button[title="同步"]');
    await click('.topbar button[title="设置"]');
    const syncButton = () => Array.from(root.querySelectorAll<HTMLButtonElement>('.inline-actions button')).find(b => /同步/.test(b.textContent!))!;
    expect(syncButton().disabled).toBe(true);
    expect(syncButton().querySelector('.spin')).not.toBeNull();
    await click('.settings-dialog button[title="关闭"]');
    await click('.topbar button[title="设置"]');
    expect(syncButton().querySelector('.spin')).not.toBeNull();
    await act(async () => { pending.resolve(syncResult); });
  });
});
