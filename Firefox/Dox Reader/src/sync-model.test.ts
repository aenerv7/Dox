import { describe, expect, it } from "vitest";
import type { SyncDocument } from "./model";
import { compareVersion, mergeSyncDocuments, parseSyncDocument } from "./sync-model";

function document(actor: string): SyncDocument {
  return {
    schemaVersion: 1,
    actor,
    clock: 2,
    generatedAt: "2026-08-15T00:00:00.000Z",
    subscriptions: {},
    itemStates: {},
  };
}

describe("sync model", () => {
  it("orders equal Lamport counters by actor", () => {
    expect(compareVersion([3, "desktop"], [3, "android"])).toBeGreaterThan(0);
  });

  it("merges subscription tombstones and item fields independently", () => {
    const local = document("desktop");
    local.subscriptions.feed = {
      id: "feed",
      url: "https://example.com/feed.xml",
      title: "Example",
      siteUrl: "https://example.com",
      folder: "",
      deleted: false,
      version: [1, "desktop"],
    };
    local.itemStates.item = {
      id: "item",
      feedId: "feed",
      publishedAt: 1,
      read: { value: true, version: [2, "desktop"] },
      starred: { value: false, version: [1, "desktop"] },
    };

    const remote = document("android");
    remote.clock = 4;
    remote.subscriptions.feed = { ...local.subscriptions.feed, deleted: true, version: [4, "android"] };
    remote.itemStates.item = {
      id: "item",
      feedId: "feed",
      publishedAt: 1,
      read: { value: false, version: [1, "android"] },
      starred: { value: true, version: [3, "android"] },
    };

    const merged = mergeSyncDocuments(local, remote);
    expect(merged.subscriptions.feed.deleted).toBe(true);
    expect(merged.itemStates.item.read.value).toBe(true);
    expect(merged.itemStates.item.starred.value).toBe(true);
    expect(merged.clock).toBe(4);
    expect(merged.actor).toBe("desktop");
  });

  it("merges lastRefreshAllAt as the latest timestamp", () => {
    const local = document("desktop");
    local.lastRefreshAllAt = 1000;
    const remote = document("android");
    remote.lastRefreshAllAt = 2000;
    expect(mergeSyncDocuments(local, remote).lastRefreshAllAt).toBe(2000);
    expect(mergeSyncDocuments(remote, local).lastRefreshAllAt).toBe(2000);
    expect(mergeSyncDocuments(local, document("android")).lastRefreshAllAt).toBe(1000);
  });

  it("accepts a missing or valid lastRefreshAllAt and rejects invalid values", () => {
    expect(parseSyncDocument(document("desktop")).lastRefreshAllAt).toBeUndefined();
    const withValue = document("desktop");
    withValue.lastRefreshAllAt = 123456;
    expect(parseSyncDocument(withValue).lastRefreshAllAt).toBe(123456);
    expect(() => parseSyncDocument({ ...document("desktop"), lastRefreshAllAt: -1 }))
      .toThrow("无效刷新时间");
    expect(() => parseSyncDocument({ ...document("desktop"), lastRefreshAllAt: "yesterday" }))
      .toThrow("无效刷新时间");
  });

  it("rejects unsupported schema versions", () => {
    expect(() => parseSyncDocument({ schemaVersion: 2 })).toThrow("不支持");
  });
});
