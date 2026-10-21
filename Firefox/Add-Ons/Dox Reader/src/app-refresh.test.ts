// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { App } from "./app";
import { DEFAULT_SETTINGS, type AppSettings, type FeedRecord } from "./model";
import { loadSettings } from "./settings";
import { fetchFeed } from "./runtime-fetch";
import { getFeed, saveParsedFeed } from "./database";
import * as repository from "./repository";

vi.mock("./repository", () => ({
  listFeeds: vi.fn(), listItems: vi.fn(async () => []),
  getItemCounts: vi.fn(async () => ({ total: 0, unread: 0, starred: 0 })),
  getFeedUnreadCounts: vi.fn(async () => ({})),
  getLastRefreshAllAt: vi.fn(async () => 0),
  hasLocalReaderData: vi.fn(async () => true),
  migrateLegacyEntities: vi.fn(), setLastRefreshAllAt: vi.fn(),
  updateSyncedPreferences: vi.fn(), getItem: vi.fn(),
}));
vi.mock("./settings", () => ({ loadSettings: vi.fn(), saveSettings: vi.fn(), applyAppearance: vi.fn() }));
vi.mock("./backend", () => ({
  backendEnabled: () => false, backendOffline: () => false, backendCall: vi.fn(),
  connectBackend: vi.fn(), pullBackend: vi.fn(), requestBackendRefresh: vi.fn(), testBackend: vi.fn(),
}));
vi.mock("./database", () => ({ getFeed: vi.fn(), saveParsedFeed: vi.fn(), setFeedError: vi.fn() }));
vi.mock("./runtime-fetch", () => ({ fetchFeed: vi.fn() }));
vi.mock("./feed-parser", () => ({ parseFeedXml: vi.fn(async () => ({ title: "Feed", siteUrl: "", items: [] })) }));
vi.mock("./webdav", () => ({
  syncWithWebDav: vi.fn(),
  isWebdavUrlValid: (value: string) => value.startsWith("https://"),
}));

let root: HTMLDivElement;
let feeds: FeedRecord[];
let releases: Array<() => void>;

async function settle() {
  await act(async () => { for (let tick = 0; tick < 80; tick++) await Promise.resolve(); });
}

async function mount(settings: AppSettings = DEFAULT_SETTINGS) {
  vi.mocked(loadSettings).mockResolvedValue({ ...settings });
  await act(async () => { render(h(App, {}), root); });
  await settle();
}

async function click(selector: string) {
  await act(async () => { root.querySelector<HTMLButtonElement>(selector)!.click(); });
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  releases = [];
  feeds = ["A", "B"].map(id => ({
    id, title: id, customName: "", url: `https://example.com/${id}`, siteUrl: "", folder: "",
    addedAt: 0, updatedAt: Date.now(), lastFetchedAt: 0, deleted: false, version: [0, "test"],
  }));
  vi.mocked(repository.listFeeds).mockImplementation(async () => feeds.map(feed => ({ ...feed })));
  vi.mocked(repository.getItemCounts).mockResolvedValue({ total: 2, unread: 2, starred: 0 });
  vi.mocked(repository.getFeedUnreadCounts).mockResolvedValue({});
  vi.mocked(repository.getLastRefreshAllAt).mockResolvedValue(0);
  vi.mocked(getFeed).mockImplementation(async id => feeds.find(feed => feed.id === id));
  vi.mocked(saveParsedFeed).mockImplementation(async id => {
    feeds.find(feed => feed.id === id)!.lastFetchedAt = Date.now();
  });
  vi.mocked(fetchFeed).mockImplementation(() => new Promise<Response>(resolve => {
    releases.push(() => resolve(new Response("<rss/>")));
  }));
  root = document.createElement("div");
  document.body.append(root);
});

afterEach(async () => {
  await act(async () => { releases.splice(0).forEach(release => release()); });
  await settle();
  render(null, root);
  root.remove();
  vi.useRealTimers();
});

describe("refresh controls", () => {
  it("animates each feed and greys out sync and mark-all during automatic refresh", async () => {
    await mount({ ...DEFAULT_SETTINGS, webdavUrl: "https://dav.example/" });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await settle();

    const sync = () => root.querySelector<HTMLButtonElement>('button[title="同步"]')!;
    const markAll = () => root.querySelector<HTMLButtonElement>('button[title="全部标为已读"]')!;
    expect(root.querySelector('button[title="刷新 A"] .spin')).not.toBeNull();
    expect(root.querySelector('button[title="刷新 B"] .spin')).not.toBeNull();
    expect(sync().disabled).toBe(true);
    expect(markAll().disabled).toBe(true);

    await act(async () => { releases.splice(0).forEach(release => release()); });
    await settle();
    expect(root.querySelector('button[title="刷新 A"] .spin')).toBeNull();
    expect(root.querySelector('button[title="刷新 B"] .spin')).toBeNull();
    expect(sync().disabled).toBe(false);
    expect(markAll().disabled).toBe(false);
  });

  it("animates only the refreshed feed, not the global refresh button", async () => {
    vi.mocked(repository.getLastRefreshAllAt).mockResolvedValue(Date.now());
    await mount();
    expect(fetchFeed).not.toHaveBeenCalled();

    await click('button[title="刷新 A"]');
    expect(root.querySelector('button[title="刷新 A"] .spin')).not.toBeNull();
    expect(root.querySelector('button[title="刷新所有订阅"] .spin')).toBeNull();

    await act(async () => { releases.splice(0).forEach(release => release()); });
    await settle();
    expect(root.querySelector('button[title="刷新 A"] .spin')).toBeNull();
  });
});
