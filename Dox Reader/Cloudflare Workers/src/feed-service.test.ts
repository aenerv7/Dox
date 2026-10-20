import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedRefreshProgress } from "./feed-service";

const database = vi.hoisted(() => ({
  getFeed: vi.fn(),
  saveParsedFeed: vi.fn(),
  setFeedError: vi.fn(),
}));
const feedParser = vi.hoisted(() => ({
  parseFeedXml: vi.fn(),
}));
const runtimeFetch = vi.hoisted(() => ({
  fetchFeed: vi.fn(),
}));

vi.mock("./database", () => database);
vi.mock("./feed-parser", () => feedParser);
vi.mock("./runtime-fetch", () => runtimeFetch);

import { refreshFeed, refreshFeeds, subscribeFeedRefreshes } from "./feed-service";

beforeEach(() => {
  vi.clearAllMocks();
  database.getFeed.mockImplementation(async (feedId: string) => ({
    id: feedId,
    url: `https://feeds.example/${feedId}.xml`,
    title: `订阅 ${feedId}`,
    deleted: false,
  }));
  database.saveParsedFeed.mockResolvedValue(undefined);
  database.setFeedError.mockResolvedValue(undefined);
  feedParser.parseFeedXml.mockResolvedValue({ title: "订阅", siteUrl: "", items: [] });
  runtimeFetch.fetchFeed.mockImplementation(async () => new Response("<rss/>", { status: 200 }));
});

describe("feed refresh progress", () => {
  it("reports completed and active feeds while preserving the four-feed concurrency limit", async () => {
    const feedIds = ["a", "b", "c", "d", "e"];
    const events: FeedRefreshProgress[] = [];

    const result = await refreshFeeds(feedIds, (progress) => events.push({
      ...progress,
      activeFeedIds: [...progress.activeFeedIds],
    }));

    expect(result).toEqual({ succeeded: 5, updated: 0, errors: [] });
    expect(events[0]).toEqual({ completed: 0, total: 5, activeFeedIds: feedIds });
    expect(events.at(-1)).toEqual({ completed: 5, total: 5, activeFeedIds: [] });
    expect(Math.max(...events.map((progress) => progress.activeFeedIds.length))).toBe(5);
    expect(new Set(events.flatMap((progress) => progress.activeFeedIds))).toEqual(new Set(feedIds));
  });

  it("joins single, automatic and all-feed requests with a global concurrency limit", async () => {
    const releases: Array<() => void> = [];
    let active = 0;
    let maximum = 0;
    runtimeFetch.fetchFeed.mockImplementation(() => {
      active += 1;
      maximum = Math.max(maximum, active);
      return new Promise<Response>(resolve => releases.push(() => {
        active -= 1;
        resolve(new Response('<rss/>'));
      }));
    });
    feedParser.parseFeedXml.mockResolvedValue({ title: 'Feed', siteUrl: '', items: [{}, {}] });
    const events: string[][] = [];
    const unsubscribe = subscribeFeedRefreshes(ids => events.push([...ids]));
    const automatic = refreshFeeds(['a', 'b']);
    const single = refreshFeed('a');
    const all = refreshFeeds(['a', 'b', 'c', 'd', 'e', 'f', 'a']);
    for (let tick = 0; tick < 20; tick++) await Promise.resolve();
    expect(runtimeFetch.fetchFeed).toHaveBeenCalledTimes(4);
    expect(events.at(-1)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    for (let tick = 0; tick < 100; tick++) {
      releases.splice(0).forEach(release => release());
      await Promise.resolve();
    }
    expect(await automatic).toMatchObject({ succeeded: 2, updated: 4 });
    expect(await all).toMatchObject({ succeeded: 6, updated: 12 });
    await single;
    expect(maximum).toBe(4);
    expect(runtimeFetch.fetchFeed).toHaveBeenCalledTimes(6);
    expect(events.at(-1)).toEqual([]);
    unsubscribe();
    // A finished job is released so an explicit retry can start a new request.
    runtimeFetch.fetchFeed.mockResolvedValue(new Response('<rss/>'));
    await refreshFeed('a');
    expect(runtimeFetch.fetchFeed).toHaveBeenCalledTimes(7);
  });

  it("releases failed shared jobs so later refreshes can retry", async () => {
    runtimeFetch.fetchFeed.mockResolvedValueOnce(new Response('down', { status: 503 }));
    const [first, joined] = await Promise.all([refreshFeeds(['a']), refreshFeeds(['a'])]);
    expect(first.errors).toHaveLength(1);
    expect(joined.errors).toHaveLength(1);
    expect(runtimeFetch.fetchFeed).toHaveBeenCalledTimes(1);
    expect(database.saveParsedFeed).not.toHaveBeenCalled();
    await refreshFeed('a');
    expect(runtimeFetch.fetchFeed).toHaveBeenCalledTimes(2);
    expect(database.saveParsedFeed).toHaveBeenCalledTimes(1);
  });

  it("advances progress when a feed fails", async () => {
    database.getFeed.mockImplementation(async (feedId: string) => ({
      id: feedId,
      url: `https://feeds.example/${feedId}.xml`,
      title: `订阅 ${feedId}`,
      deleted: feedId === "b",
    }));
    const events: FeedRefreshProgress[] = [];

    const result = await refreshFeeds(["a", "b"], (progress) => events.push({
      ...progress,
      activeFeedIds: [...progress.activeFeedIds],
    }));

    expect(result.succeeded).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(events.at(-1)).toEqual({ completed: 2, total: 2, activeFeedIds: [] });
  });
});
