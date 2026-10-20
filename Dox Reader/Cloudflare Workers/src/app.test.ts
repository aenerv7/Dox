// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { App } from "./app";
import { DEFAULT_SETTINGS } from "./model";
import type { FeedRecord, ItemRecord } from "./model";
import * as repository from "./repository";
import { syncWithWebDav, testWebDav } from "./webdav";
import { extractFullArticle } from "./article-extractor";

vi.mock("./repository", () => ({
  listFeeds: vi.fn(), listItems: vi.fn(), getItemCounts: vi.fn(),
  getFeedUnreadCounts: vi.fn(), getLastRefreshAllAt: vi.fn(() => Date.now()),
  migrateLegacyEntities: vi.fn(), hasLocalReaderData: vi.fn(() => true),
  setItemState: vi.fn(), markAllRead: vi.fn(), markFeedRead: vi.fn(),
  updateSyncedPreferences: vi.fn(), updateItemContent: vi.fn(),
}));
vi.mock("./article-extractor", async (importOriginal) => ({
  ...await importOriginal<typeof import("./article-extractor")>(),
  extractFullArticle: vi.fn(),
}));
vi.mock("./settings", () => ({
  loadSettings: vi.fn(() => ({ ...DEFAULT_SETTINGS, webdavUrl: "https://dav.example/" })),
  saveSettings: vi.fn(), applyAppearance: vi.fn(),
}));
vi.mock("./webdav", () => ({ syncWithWebDav: vi.fn(), testWebDav: vi.fn(() => "连接成功") }));

const feeds = ["A", "B"].map(id => ({
  id, title: id, customName: "", url: `https://${id}.example/feed`,
  siteUrl: "", folder: "", addedAt: 0, updatedAt: 0, lastFetchedAt: Date.now(), deleted: false, version: [0, "test"],
})) as FeedRecord[];
const items = feeds.map(feed => ({
  id: feed.id, feedId: feed.id, title: `文章 ${feed.id}`, read: false,
  starred: false, content: "<p>RSS 摘要</p>", snippet: "RSS 摘要", url: `https://example.com/${feed.id}`, author: "", publishedAt: 0,
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
  it("shows WebDAV buttons only for nonempty input and never tests while editing", async () => {
    await click('.topbar button[title="设置"]');
    const actions = () => root.querySelector('.settings-section:first-child .inline-actions');
    const address = root.querySelector<HTMLInputElement>('.settings-dialog input[type="url"]')!;
    const input = async (value: string) => {
      await act(async () => {
        address.value = value;
        address.dispatchEvent(new Event('input', { bubbles: true }));
        await vi.advanceTimersByTimeAsync(1000);
      });
    };
    expect(actions()).not.toBeNull();
    expect(testWebDav).not.toHaveBeenCalled();
    await input('');
    expect(actions()).toBeNull();
    await input('   ');
    expect(actions()).toBeNull();
    await input('https');
    expect(actions()).not.toBeNull();
    await input('https://dav.example/new/');
    for (const selector of ['input[autocomplete="username"]', '#webdav-password']) {
      await act(async () => {
        const field = root.querySelector<HTMLInputElement>(selector)!;
        field.value = 'changed';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    expect(testWebDav).not.toHaveBeenCalled();
    expect(syncWithWebDav).not.toHaveBeenCalled();
    await click('.settings-section .inline-actions button:first-child');
    expect(testWebDav).toHaveBeenCalledTimes(1);
    expect(testWebDav).toHaveBeenCalledWith(expect.objectContaining({
      webdavUrl: 'https://dav.example/new/', webdavUsername: 'changed', webdavPassword: 'changed',
    }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(root.querySelector('.connection-result')?.textContent).toBe('连接成功');
    await input('');
    expect(actions()).toBeNull();
    expect(root.querySelector('.connection-result')).toBeNull();
  });

  it("ignores pending test results after the connection settings change", async () => {
    const pending = deferred<string>();
    vi.mocked(testWebDav).mockReturnValueOnce(pending.promise);
    await click('.topbar button[title="设置"]');
    await click('.settings-section .inline-actions button:first-child');
    expect(button('.settings-section .inline-actions button:first-child').disabled).toBe(true);
    await act(async () => {
      const address = root.querySelector<HTMLInputElement>('.settings-dialog input[type="url"]')!;
      address.value = '';
      address.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { pending.resolve('旧地址连接成功'); await pending.promise; });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(root.querySelector('.settings-section:first-child .inline-actions')).toBeNull();
    expect(root.querySelector('.connection-result')).toBeNull();
    expect(testWebDav).toHaveBeenCalledTimes(1);
  });

  it("extracts only on click, shares the request lock and can switch back to RSS", async () => {
    const pending = deferred<{ content: string; textLength: number }>();
    vi.mocked(extractFullArticle).mockReturnValueOnce(pending.promise);
    const fullContent = '<p>提取的完整正文</p><img src="https://example.com/cover.jpg" onerror="alert(1)"><script>alert(1)</script>';
    vi.mocked(repository.updateItemContent).mockResolvedValueOnce({
      ...items[0], content: fullContent, contentSource: "article", feedContent: items[0].content,
    });
    const enhance = '.article-enhance button';
    await click('.item-row');
    expect(extractFullArticle).not.toHaveBeenCalled();
    await click(enhance);
    expect(button(enhance).disabled).toBe(true);
    expect(button(enhance).getAttribute('aria-busy')).toBe('true');
    await click('.item-row:nth-child(2)');
    expect(button(enhance).disabled).toBe(true);
    expect(button(enhance).querySelector('.spin')).toBeNull();
    await click('.item-row:first-child');
    expect(button(enhance).querySelector('.spin')).not.toBeNull();
    expect(extractFullArticle).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve({ content: fullContent, textLength: 900 }); await pending.promise; });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(repository.updateItemContent).toHaveBeenCalledWith('A', fullContent, items[0].url);
    expect(root.querySelector('.article-body')?.textContent).toContain('提取的完整正文');
    expect(root.querySelector('.article-body script')).toBeNull();
    expect(root.querySelector('.article-body img')?.hasAttribute('onerror')).toBe(false);
    expect(button(enhance).textContent).toContain('显示 RSS 内容');
    await click(enhance);
    expect(root.querySelector('.article-body')?.textContent).toBe('RSS 摘要');
    await click(enhance);
    expect(root.querySelector('.article-body')?.textContent).toContain('提取的完整正文');
    expect(syncWithWebDav).not.toHaveBeenCalled();
  });

  it("keeps RSS content and allows retry when full-text extraction fails", async () => {
    vi.mocked(extractFullArticle).mockRejectedValueOnce(new Error('原文返回 HTTP 403'));
    await click('.item-row');
    await click('.article-enhance button');
    expect(root.querySelector('.article-body')?.textContent).toBe('RSS 摘要');
    expect(root.textContent).toContain('原文返回 HTTP 403');
    expect(button('.article-enhance button').disabled).toBe(false);
    expect(repository.updateItemContent).not.toHaveBeenCalled();
  });

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
