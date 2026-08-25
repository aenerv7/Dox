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
      customName: "我的订阅",
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
    remote.subscriptions.feed = {
      ...local.subscriptions.feed,
      customName: "同步后的名称",
      deleted: true,
      version: [4, "android"],
    };
    remote.itemStates.item = {
      id: "item",
      feedId: "feed",
      publishedAt: 1,
      read: { value: false, version: [1, "android"] },
      starred: { value: true, version: [3, "android"] },
    };

    const merged = mergeSyncDocuments(local, remote);
    expect(merged.subscriptions.feed.deleted).toBe(true);
    expect(merged.subscriptions.feed.customName).toBe("同步后的名称");
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

  it("merges appearance and reading preferences independently", () => {
    const local = document("desktop");
    local.preferences = {
      theme: { value: "dark", version: [5, "desktop"] },
      colorScheme: { value: "cinnabar", version: [1, "desktop"] },
      customAccent: { value: "#b64038", version: [7, "desktop"] },
      showItemSnippet: { value: false, version: [2, "desktop"] },
    };
    const remote = document("mobile");
    remote.preferences = {
      theme: { value: "light", version: [4, "mobile"] },
      colorScheme: { value: "celadon", version: [6, "mobile"] },
      customAccent: { value: "#0066cc", version: [3, "mobile"] },
      showItemSnippet: { value: true, version: [1, "mobile"] },
    };

    expect(mergeSyncDocuments(local, remote).preferences).toEqual({
      theme: local.preferences.theme,
      colorScheme: remote.preferences.colorScheme,
      customAccent: local.preferences.customAccent,
      showItemSnippet: local.preferences.showItemSnippet,
    });
  });

  it("accepts legacy documents and validates synced preferences", () => {
    expect(parseSyncDocument(document("desktop")).preferences).toBeUndefined();
    const withPreferences = document("desktop");
    withPreferences.preferences = {
      theme: { value: "system", version: [3, "desktop"] },
      colorScheme: { value: "material", version: [3, "desktop"] },
      customAccent: { value: "#334455", version: [3, "desktop"] },
      showItemSnippet: { value: true, version: [3, "desktop"] },
    };
    expect(parseSyncDocument(withPreferences).preferences).toEqual(withPreferences.preferences);

    expect(() => parseSyncDocument({
      ...withPreferences,
      preferences: {
        ...withPreferences.preferences,
        colorScheme: { value: "neon", version: [4, "desktop"] },
      },
    })).toThrow("无效外观或阅读设置");

    expect(() => parseSyncDocument({
      ...withPreferences,
      preferences: {
        ...withPreferences.preferences,
        customAccent: { value: "red", version: [4, "desktop"] },
      },
    })).toThrow("无效外观或阅读设置");
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

  it("keeps a local custom name when an older remote subscription omits it", () => {
    const local = document("desktop");
    local.subscriptions.feed = {
      id: "feed",
      url: "https://example.com/feed.xml",
      title: "Example",
      customName: "本地名称",
      siteUrl: "https://example.com",
      folder: "",
      deleted: false,
      version: [5, "desktop"],
    };
    const remote = document("android");
    remote.subscriptions.feed = {
      id: "feed",
      url: "https://example.com/feed.xml",
      title: "Example",
      siteUrl: "https://example.com",
      folder: "",
      deleted: false,
      version: [4, "android"],
    };

    const merged = mergeSyncDocuments(local, remote);
    expect(merged.subscriptions.feed.customName).toBe("本地名称");
  });
});
