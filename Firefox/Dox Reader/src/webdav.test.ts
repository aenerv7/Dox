import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "./model";
import { resolveWebDavLocations, testWebDav } from "./webdav";

const settings = {
  ...DEFAULT_SETTINGS,
  webdavUrl: "https://dav.example.com/remote.php/dav/files/user",
  webdavUsername: "reader",
  webdavPassword: "secret",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WebDAV locations", () => {
  it("places the sync file in a Dox Reader directory below the URL prefix", () => {
    const locations = resolveWebDavLocations(settings);

    expect(locations.directory.href).toBe("https://dav.example.com/remote.php/dav/files/user/Dox%20Reader/");
    expect(locations.file.href).toBe("https://dav.example.com/remote.php/dav/files/user/Dox%20Reader/state.json");
  });

  it("rejects unencrypted WebDAV URLs", () => {
    expect(() => resolveWebDavLocations({
      ...settings,
      webdavUrl: "http://dav.example.com/user/",
    })).toThrow("WebDAV URL 必须使用 HTTPS");
  });

  it("creates a missing directory while testing the connection", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(testWebDav(settings)).resolves.toBe("连接成功；已创建 Dox Reader 文件夹");
    expect(fetchMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      href: "https://dav.example.com/remote.php/dav/files/user/Dox%20Reader/",
    }), expect.objectContaining({ method: "PROPFIND" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.any(URL), expect.objectContaining({ method: "MKCOL" }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, expect.objectContaining({
      href: "https://dav.example.com/remote.php/dav/files/user/Dox%20Reader/state.json",
    }), expect.objectContaining({ method: "GET" }));
  });
});
