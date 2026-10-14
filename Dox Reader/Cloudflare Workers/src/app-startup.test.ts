// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { App } from "./app";
import { DEFAULT_SETTINGS } from "./model";
import type { FeedRecord, ItemRecord } from "./model";
import type { BackendStatus } from "./backend";
import * as backend from "./backend";
import * as repository from "./repository";

vi.mock("./repository", () => ({
  listFeeds: vi.fn(), listItems: vi.fn(), getItemCounts: vi.fn(),
  getFeedUnreadCounts: vi.fn(), getLastRefreshAllAt: vi.fn(() => 0),
  migrateLegacyEntities: vi.fn(), hasLocalReaderData: vi.fn(() => true),
  setItemState: vi.fn(), getItem: vi.fn(),
}));
vi.mock("./settings", () => ({
  loadSettings: vi.fn(() => ({
    ...DEFAULT_SETTINGS,
    storageMode: "backend",
    backendUrl: "https://dox-reader-backend.example",
    backendToken: "token",
  })),
  saveSettings: vi.fn(), applyAppearance: vi.fn(),
}));
vi.mock("./backend", async () => {
  const actual = await vi.importActual<typeof import("./backend")>("./backend");
  return {
    ...actual,
    backendEnabled: () => true,
    backendOffline: () => false,
    connectBackend: vi.fn(),
    pullBackend: vi.fn(),
  };
});
vi.mock("./webdav", () => ({ syncWithWebDav: vi.fn(), testWebDav: vi.fn() }));

const feeds = ["A", "B"].map(id => ({
  id, title: id, customName: "", url: `https://${id}.example/feed`,
  siteUrl: "", folder: "", addedAt: 0, updatedAt: 0, deleted: false, version: [0, "test"],
})) as FeedRecord[];
const items = feeds.map(feed => ({
  id: feed.id, feedId: feed.id, title: `文章 ${feed.id}`, read: false,
  starred: false, content: "", snippet: "", url: "", author: "", publishedAt: 0,
  fetchedAt: 0, guid: feed.id,
})) as ItemRecord[];
const status = {
  product: "Dox Reader Backend", apiVersion: 1,
  config: { intervalMinutes: 60, maxArticles: 10000 },
  revision: 1, nextFetchAt: null, storageBytes: 0,
  job: { running: false, completed: 0, total: 0, errors: [], updated: 0, startedAt: 0 },
} as BackendStatus;
let root: HTMLDivElement;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

async function settle() {
  await act(async () => {
    for (let tick = 0; tick < 30; tick++) { await Promise.resolve(); }
  });
}

beforeEach(async () => {
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

describe("backend startup", () => {
  it("shows cached articles before the backend pull resolves", async () => {
    const pull = deferred<BackendStatus>();
    vi.mocked(backend.pullBackend).mockReturnValue(pull.promise);
    await act(async () => { render(h(App, {}), root); });
    await settle();

    expect(backend.pullBackend).toHaveBeenCalled();
    expect(root.querySelectorAll(".item-row").length).toBe(2);
    expect(root.textContent).toContain("文章 A");

    await act(async () => { pull.resolve(status); });
    await settle();
    expect(repository.listFeeds).toHaveBeenCalledTimes(2);
  });
});
