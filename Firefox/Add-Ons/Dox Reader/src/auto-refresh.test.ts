import { describe, expect, it } from "vitest";
import type { FeedRecord } from "./model";
import { AUTO_REFRESH_RETRY_MS, dueFeedIds } from "./auto-refresh";

const now = 100 * 3_600_000;
const feed = (id: string, lastFetchedAt?: number, error?: string) => ({
  id, lastFetchedAt, error, updatedAt: now,
} as FeedRecord);

describe("per-feed automatic refresh", () => {
  it("uses successful fetch times, including empty feeds, instead of general updates or global refresh times", () => {
    const feeds = [feed('fresh', now - 3_600_000), feed('due', now - 24 * 3_600_000),
      feed('failed', now - 30 * 3_600_000, 'HTTP 500'), feed('new'),
      { ...feed('deleted'), deleted: true }];
    expect(dueFeedIds(feeds, 24, now)).toEqual(['due', 'failed', 'new']);
    expect(dueFeedIds(feeds, 48, now)).toEqual(['new']);
    expect(dueFeedIds(feeds, 1, now)).toEqual(['fresh', 'due', 'failed', 'new']);
  });

  it("disables refresh at zero and rejects invalid intervals", () => {
    for (const hours of [0, -1, NaN, Infinity, 0.5]) {
      expect(dueFeedIds([feed('new')], hours, now)).toEqual([]);
    }
  });

  it("retries failures after a cooldown without marking them as successful", () => {
    const feeds = [feed('failed', now - 30 * 3_600_000)];
    const attempts = new Map([['failed', now]]);
    expect(dueFeedIds(feeds, 24, now + AUTO_REFRESH_RETRY_MS - 1, attempts)).toEqual([]);
    expect(dueFeedIds(feeds, 24, now + AUTO_REFRESH_RETRY_MS, attempts)).toEqual(['failed']);
  });
});
