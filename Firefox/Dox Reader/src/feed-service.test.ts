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

import { refreshFeeds } from "./feed-service";

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
    expect(events[0]).toEqual({ completed: 0, total: 5, activeFeedIds: [] });
    expect(events.at(-1)).toEqual({ completed: 5, total: 5, activeFeedIds: [] });
    expect(Math.max(...events.map((progress) => progress.activeFeedIds.length))).toBe(4);
    expect(new Set(events.flatMap((progress) => progress.activeFeedIds))).toEqual(new Set(feedIds));
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
