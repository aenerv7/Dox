import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFeed, fetchWebDav } from "./runtime-fetch";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web runtime requests", () => {
  it("routes feeds through the same-origin Worker without putting the target in the URL", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("<rss/>"));
    vi.stubGlobal("window", { location: { origin: "https://reader.example" } });
    vi.stubGlobal("fetch", fetchMock);

    await fetchFeed("https://feeds.example/posts.xml", { headers: { Accept: "application/rss+xml" } });

    const [url, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(url).toBe("https://reader.example/api/feed");
    expect(headers.get("X-Dox-Reader-Request")).toBe("1");
    expect(headers.get("X-Dox-Target")).toBe("https://feeds.example/posts.xml");
    expect(headers.get("Accept")).toBe("application/rss+xml");
  });

  it("keeps WebDAV credentials in headers while routing to the same-origin Worker", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("window", { location: { origin: "https://reader.example" } });
    vi.stubGlobal("fetch", fetchMock);

    await fetchWebDav("https://dav.example.com/Dox%20Reader/state.json", {
      method: "PUT",
      headers: { Authorization: "Basic abc" },
      body: "{}",
    });

    const [url, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(url).toBe("https://reader.example/api/webdav");
    expect(headers.get("X-Dox-Target")).toBe("https://dav.example.com/Dox%20Reader/state.json");
    expect(headers.get("Authorization")).toBe("Basic abc");
  });
});
