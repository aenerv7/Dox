// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { App } from "./app";
import { DEFAULT_SETTINGS, type AppSettings, type FeedRecord } from "./model";
import { loadSettings, saveSettings } from "./settings";
import { fetchFeed } from "./runtime-fetch";
import { getFeed, saveParsedFeed } from "./database";

vi.mock('./repository', () => ({
  listFeeds: vi.fn(), listItems: vi.fn(async () => []),
  getItemCounts: vi.fn(async () => ({ total: 0, unread: 0, starred: 0 })),
  getFeedUnreadCounts: vi.fn(async () => ({})), migrateLegacyEntities: vi.fn(),
  setLastRefreshAllAt: vi.fn(), updateSyncedPreferences: vi.fn(),
}));
vi.mock('./settings', () => ({ loadSettings: vi.fn(), saveSettings: vi.fn(), applyAppearance: vi.fn() }));
vi.mock('./database', () => ({ getFeed: vi.fn(), saveParsedFeed: vi.fn(), setFeedError: vi.fn() }));
vi.mock('./runtime-fetch', () => ({ fetchFeed: vi.fn() }));
vi.mock('./feed-parser', () => ({ parseFeedXml: vi.fn(async () => ({ title: 'Feed', siteUrl: '', items: [] })) }));
vi.mock('./webdav', () => ({ syncWithWebDav: vi.fn(), isWebdavUrlValid: (value: string) => value.startsWith('https://') }));
import { getItemCounts, listFeeds } from './repository';

let root: HTMLDivElement;
let feeds: FeedRecord[];
let releases: Array<() => void>;
const hour = 3_600_000;

async function settle() {
  await act(async () => { for (let tick = 0; tick < 80; tick++) await Promise.resolve(); });
}
async function click(selector: string) {
  await act(async () => { root.querySelector<HTMLButtonElement>(selector)!.click(); });
  await settle();
}
async function mount(settings: AppSettings = DEFAULT_SETTINGS) {
  vi.mocked(loadSettings).mockResolvedValue({ ...settings });
  await act(async () => { render(h(App, {}), root); });
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  releases = [];
  feeds = ['A', 'B'].map((id, index) => ({
    id, title: id, customName: '', url: `https://example.com/${id}`, siteUrl: '', folder: '',
    addedAt: 0, updatedAt: Date.now(), lastFetchedAt: Date.now() - (index === 0 ? 25 : 2) * hour,
    deleted: false, version: [0, 'test'],
  }));
  vi.mocked(listFeeds).mockImplementation(async () => feeds.map(feed => ({ ...feed })));
  vi.mocked(getFeed).mockImplementation(async id => feeds.find(feed => feed.id === id));
  vi.mocked(saveParsedFeed).mockImplementation(async id => {
    feeds.find(feed => feed.id === id)!.lastFetchedAt = Date.now();
  });
  vi.mocked(fetchFeed).mockImplementation(() => new Promise<Response>(resolve => {
    releases.push(() => resolve(new Response('<rss/>')));
  }));
  root = document.createElement('div');
  document.body.append(root);
});

afterEach(async () => {
  await act(async () => { releases.splice(0).forEach(release => release()); });
  await settle();
  render(null, root);
  root.remove();
  vi.useRealTimers();
});

describe('automatic refresh integration', () => {
  it('animates each due source and lets all-refresh join automatic jobs without duplicate requests', async () => {
    await mount();
    expect(fetchFeed).toHaveBeenCalledTimes(1);
    expect(root.querySelector('button[title="刷新 A"] .spin')).not.toBeNull();
    expect(root.querySelector('button[title="刷新 B"] .spin')).toBeNull();
    expect(root.querySelector('button[title="刷新所有订阅"] .spin')).toBeNull();
    await click('.feed-row:first-child > button');
    expect(root.querySelector('button[title="更新 A"] .spin')).not.toBeNull();
    expect(root.querySelector<HTMLButtonElement>('button[title="刷新所有订阅"]')!.disabled).toBe(false);
    await click('button[title="刷新所有订阅"]');
    expect(fetchFeed).toHaveBeenCalledTimes(2);
    expect(root.querySelector('button[title="刷新 B"] .spin')).not.toBeNull();
    expect(root.querySelector('button[title="刷新所有订阅"] .spin')).not.toBeNull();
    expect(root.querySelector<HTMLButtonElement>('button[title="刷新所有订阅"]')!.disabled).toBe(true);
    await act(async () => { releases.splice(0).forEach(release => release()); });
    await settle();
    expect(root.querySelector('button[title="刷新 A"] .spin')).toBeNull();
    expect(root.querySelector('button[title="刷新 B"] .spin')).toBeNull();
    expect(root.querySelector('button[title="刷新所有订阅"] .spin')).toBeNull();
    expect(root.textContent).toContain('全部刷新完成：成功 2 个');
    expect(fetchFeed).toHaveBeenCalledTimes(2);
  });

  it('animates only the single feed being refreshed, not the global button', async () => {
    feeds.forEach(feed => { feed.lastFetchedAt = Date.now(); });
    await mount();
    expect(fetchFeed).not.toHaveBeenCalled();

    await click('button[title="刷新 A"]');
    expect(root.querySelector('button[title="刷新 A"] .spin')).not.toBeNull();
    expect(root.querySelector('button[title="刷新所有订阅"] .spin')).toBeNull();

    await act(async () => { releases.splice(0).forEach(release => release()); });
    await settle();
    expect(root.querySelector('button[title="刷新 A"] .spin')).toBeNull();
  });

  it('greys out sync and mark-all-read while refreshing', async () => {
    vi.mocked(getItemCounts).mockResolvedValue({ total: 2, unread: 2, starred: 0 });
    feeds.forEach(feed => { feed.lastFetchedAt = Date.now(); });
    await mount({ ...DEFAULT_SETTINGS, webdavUrl: 'https://dav.example/' });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    const sync = () => root.querySelector<HTMLButtonElement>('button[title="同步"]')!;
    const markAll = () => root.querySelector<HTMLButtonElement>('button[title="全部标为已读"]')!;
    expect(sync().disabled).toBe(false);
    expect(markAll().disabled).toBe(false);
    await click('button[title="刷新所有订阅"]');
    expect(sync().disabled).toBe(true);
    expect(markAll().disabled).toBe(true);
    await act(async () => { releases.splice(0).forEach(release => release()); });
    await settle();
    expect(sync().disabled).toBe(false);
    expect(markAll().disabled).toBe(false);
  });

  it('checks while the page stays open and stops scheduling when disabled in settings', async () => {
    await mount({ ...DEFAULT_SETTINGS, autoRefreshHours: 48 });
    expect(fetchFeed).not.toHaveBeenCalled();
    await click('button[title="设置"]');
    const interval = root.querySelector<HTMLInputElement>('[aria-label="自动刷新间隔（小时）"]')!;
    await act(async () => {
      interval.value = '1';
      interval.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('.dialog-actions .primary-button');
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ autoRefreshHours: 1 }));
    expect(fetchFeed).toHaveBeenCalledTimes(2);
    await act(async () => { releases.splice(0).forEach(release => release()); });
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(hour); });
    await settle();
    expect(fetchFeed).toHaveBeenCalledTimes(4);
    await act(async () => { releases.splice(0).forEach(release => release()); });
    await settle();
    await click('button[title="设置"]');
    await act(async () => {
      const input = root.querySelector<HTMLInputElement>('[aria-label="自动刷新间隔（小时）"]')!;
      input.value = '0';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('.dialog-actions .primary-button');
    expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ autoRefreshHours: 0 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(48 * hour); });
    expect(fetchFeed).toHaveBeenCalledTimes(4);
  });

  it('checks overdue feeds when returning to the page', async () => {
    feeds.forEach(feed => { feed.lastFetchedAt = Date.now(); });
    await mount();
    expect(fetchFeed).not.toHaveBeenCalled();
    vi.setSystemTime(Date.now() + 25 * hour);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await settle();
    expect(fetchFeed).toHaveBeenCalledTimes(2);
  });
});
