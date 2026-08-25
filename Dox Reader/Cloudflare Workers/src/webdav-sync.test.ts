import { afterEach, describe, expect, it, vi } from "vitest";
import type { SyncDocument } from "./model";
import { DEFAULT_SETTINGS } from "./model";

const database = vi.hoisted(() => ({
  applySyncDocument: vi.fn(),
  exportSyncDocument: vi.fn(),
  updateSyncedPreferences: vi.fn(),
}));

vi.mock("./database", () => database);

import { syncWithWebDav } from "./webdav";

const settings = {
  ...DEFAULT_SETTINGS,
  webdavUrl: "https://dav.example.com/user/",
  webdavUsername: "reader",
  webdavPassword: "secret",
};

function document(actor: string, preferences?: SyncDocument["preferences"]): SyncDocument {
  return {
    schemaVersion: 1,
    actor,
    clock: 3,
    generatedAt: "2026-08-25T00:00:00.000Z",
    subscriptions: {},
    itemStates: {},
    preferences,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("WebDAV preference sync", () => {
  it("adopts existing remote preferences on a new device", async () => {
    const remote = document("mobile", {
      theme: { value: "dark", version: [3, "mobile"] },
      colorScheme: { value: "celadon", version: [3, "mobile"] },
      customAccent: { value: "#1677ff", version: [3, "mobile"] },
      showItemSnippet: { value: false, version: [3, "mobile"] },
    });
    database.exportSyncDocument.mockResolvedValue(document("desktop"));
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 207 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(remote), {
        status: 200,
        headers: { etag: '"remote-1"' },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 })));

    const result = await syncWithWebDav(settings);

    expect(database.updateSyncedPreferences).not.toHaveBeenCalled();
    expect(database.applySyncDocument).toHaveBeenCalledWith(expect.objectContaining({
      preferences: remote.preferences,
    }));
    expect(result.preferences).toEqual({
      theme: "dark",
      colorScheme: "celadon",
      customAccent: "#1677ff",
      showItemSnippet: false,
    });
  });

  it("seeds local preferences when neither side has synced them", async () => {
    const initial = document("desktop");
    const seeded = document("desktop", {
      theme: { value: settings.theme, version: [4, "desktop"] },
      colorScheme: { value: settings.colorScheme, version: [4, "desktop"] },
      customAccent: { value: settings.customAccent, version: [4, "desktop"] },
      showItemSnippet: { value: settings.showItemSnippet, version: [4, "desktop"] },
    });
    database.exportSyncDocument
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(seeded);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 207 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 })));

    const result = await syncWithWebDav(settings);

    expect(database.updateSyncedPreferences).toHaveBeenCalledWith({
      theme: settings.theme,
      colorScheme: settings.colorScheme,
      customAccent: settings.customAccent,
      showItemSnippet: settings.showItemSnippet,
    });
    expect(database.applySyncDocument).toHaveBeenCalledWith(seeded);
    expect(result.preferences).toEqual({
      theme: settings.theme,
      colorScheme: settings.colorScheme,
      customAccent: settings.customAccent,
      showItemSnippet: settings.showItemSnippet,
    });
  });
});
