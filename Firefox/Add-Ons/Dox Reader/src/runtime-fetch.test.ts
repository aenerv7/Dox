import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchArticle, fetchFeed, fetchWebDav } from "./runtime-fetch";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Firefox runtime requests", () => {
  it("fetches feeds directly", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("<rss/>"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchFeed("https://feeds.example/posts.xml", { headers: { Accept: "application/rss+xml" } });

    const [url, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(url).toBe("https://feeds.example/posts.xml");
    expect(headers.get("Accept")).toBe("application/rss+xml");
  });

  it("fetches original article pages directly", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("<html/>"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchArticle("https://example.com/posts/1", { cache: "no-store" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.com/posts/1");
    expect(init?.cache).toBe("no-store");
  });

  it("sends WebDAV credentials directly to the configured server", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWebDav("https://dav.example.com/Dox%20Reader/state.json", {
      method: "PUT",
      headers: { Authorization: "Basic abc" },
      body: "{}",
    });

    const [url, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(String(url)).toBe("https://dav.example.com/Dox%20Reader/state.json");
    expect(headers.get("Authorization")).toBe("Basic abc");
  });
});
