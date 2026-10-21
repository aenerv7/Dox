import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./model";
import { isWebdavUrlValid, resolveWebDavLocations } from "./webdav";

const settings = {
  ...DEFAULT_SETTINGS,
  webdavUrl: "https://dav.example.com/remote.php/dav/files/user",
  webdavUsername: "reader",
  webdavPassword: "secret",
};

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

  it("accepts only absolute HTTPS URLs", () => {
    expect(isWebdavUrlValid("https://dav.example.com/user/")).toBe(true);
    expect(isWebdavUrlValid("  https://dav.example.com/user/  ")).toBe(true);
    for (const value of ["", "   ", "https", "https://", "http://dav.example.com/", "ftp://dav.example.com/"]) {
      expect(isWebdavUrlValid(value)).toBe(false);
    }
  });
});
