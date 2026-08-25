import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "./index";

const clientHeaders = {
  "Sec-Fetch-Site": "same-origin",
  "X-Dox-Reader-Request": "1",
};

function apiRequest(path: string, target?: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  for (const [name, value] of Object.entries(clientHeaders)) headers.set(name, value);
  if (target) headers.set("X-Dox-Target", target);
  return new Request(`https://reader.example${path}`, { ...init, headers });
}

describe("Worker proxy", () => {
  it("rejects requests without the browser client marker", async () => {
    const response = await handleRequest(new Request("https://reader.example/api/feed"));
    expect(response.status).toBe(403);
  });

  it.each([
    "http://127.0.0.1/feed",
    "http://192.168.1.2/feed",
    "https://metadata.google.internal/computeMetadata/v1/",
    "https://example.com:444/feed",
  ])("blocks unsafe targets: %s", async (target) => {
    const upstream = vi.fn<typeof fetch>();
    const response = await handleRequest(
      apiRequest("/api/feed", target),
      upstream,
    );
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("fetches a feed and reports the final upstream URL", async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(new Response("<rss/>", {
      headers: { "Content-Type": "application/rss+xml" },
    }));
    const response = await handleRequest(
      apiRequest("/api/feed", "https://example.com/feed.xml"),
      upstream,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Dox-Upstream-URL")).toBe("https://example.com/feed.xml");
    expect(await response.text()).toBe("<rss/>");
  });

  it("validates every feed redirect target", async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { Location: "http://127.0.0.1/admin" },
    }));
    const response = await handleRequest(
      apiRequest("/api/feed", "https://example.com/feed.xml"),
      upstream,
    );
    expect(response.status).toBe(403);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("forwards only the required WebDAV method, headers, and body", async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, {
      status: 204,
      headers: { ETag: "\"v2\"" },
    }));
    const response = await handleRequest(apiRequest(
      "/api/webdav",
      "https://dav.example.com/Dox%20Reader/state.json",
      {
        method: "PUT",
        headers: {
          Authorization: "Basic abc",
          "Content-Type": "application/json",
          "If-Match": "\"v1\"",
          "X-Not-Forwarded": "secret",
        },
        body: "{}",
      },
    ), upstream);

    expect(response.status).toBe(204);
    expect(response.headers.get("ETag")).toBe("\"v2\"");
    expect(upstream).toHaveBeenCalledTimes(1);
    const [target, init] = upstream.mock.calls[0];
    expect(String(target)).toBe("https://dav.example.com/Dox%20Reader/state.json");
    expect(init?.method).toBe("PUT");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Basic abc");
    expect(new Headers(init?.headers).has("X-Not-Forwarded")).toBe(false);
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe("{}");
  });

  it("requires HTTPS for WebDAV", async () => {
    const upstream = vi.fn<typeof fetch>();
    const response = await handleRequest(
      apiRequest("/api/webdav", "http://dav.example.com/state.json"),
      upstream,
    );
    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("does not act as a general-purpose WebDAV proxy", async () => {
    const upstream = vi.fn<typeof fetch>();
    const response = await handleRequest(
      apiRequest("/api/webdav", "https://dav.example.com/private/other.json"),
      upstream,
    );
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

});
