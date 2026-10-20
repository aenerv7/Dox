// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

const runtimeFetch = vi.hoisted(() => ({ fetchArticle: vi.fn() }));
vi.mock("./runtime-fetch", () => runtimeFetch);

import { extractFullArticle, needsFullArticle } from "./article-extractor";

afterEach(() => vi.clearAllMocks());

describe("article extraction", () => {
  it("only offers extraction for short feed content", () => {
    expect(needsFullArticle("<p>摘要</p>", "https://example.com/post")).toBe(true);
    expect(needsFullArticle(`<p>${"正文 ".repeat(400)}</p>`, "https://example.com/post")).toBe(false);
    expect(needsFullArticle("<p>摘要</p>", "")).toBe(false);
  });

  it("extracts the readable body and falls back to the page image", async () => {
    runtimeFetch.fetchArticle.mockResolvedValue(new Response(`<!doctype html>
      <html><head><meta property="og:image" content="/cover.jpg"></head>
      <body><nav>导航</nav><main><h1>文章标题</h1><p>${"这是正文。".repeat(200)}</p></main><footer>页脚</footer></body></html>`, {
      status: 200,
      headers: { "Content-Type": "text/html", "X-Dox-Upstream-URL": "https://example.com/posts/1" },
    }));

    const article = await extractFullArticle("https://example.com/posts/1");

    expect(article.textLength).toBeGreaterThan(800);
    expect(article.content).toContain("这是正文");
    expect(article.content).toContain('src="https://example.com/cover.jpg"');
    expect(article.content).not.toContain("导航");
    expect(runtimeFetch.fetchArticle).toHaveBeenCalledWith("https://example.com/posts/1", expect.any(Object));
  });

  it("uses the final page URL for lazy images and ignores untrusted base elements", async () => {
    runtimeFetch.fetchArticle.mockResolvedValue(new Response(`<html><head><base href="https://wrong.example/"></head>
      <body><article><p>${"这是完整正文。".repeat(100)}</p>
      <img src="data:image/gif;base64,R0lG" data-src="../cover.jpg" srcset="https://wrong.example/image.jpg 2x">
      <p><a href="./details">文章链接</a></p></article></body></html>`, {
      headers: { "Content-Type": "text/html", "X-Dox-Upstream-URL": "https://example.com/posts/final/" },
    }));
    const article = await extractFullArticle("https://example.com/redirect");
    expect(article.content).toContain('src="https://example.com/posts/cover.jpg"');
    expect(article.content).toContain('href="https://example.com/posts/final/details"');
    expect(article.content).not.toContain('wrong.example');
    expect(article.content).not.toContain('srcset');
  });

  it("rejects non-HTML responses and failed upstream requests", async () => {
    runtimeFetch.fetchArticle.mockResolvedValueOnce(new Response('{}', { headers: { "Content-Type": "application/json" } }));
    await expect(extractFullArticle("https://example.com/data")).rejects.toThrow("原文不是 HTML 网页");
    runtimeFetch.fetchArticle.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(extractFullArticle("https://example.com/blocked")).rejects.toThrow("原文返回 HTTP 403");
  });

  it("rejects pages without readable text", async () => {
    runtimeFetch.fetchArticle.mockResolvedValue(new Response("<html><body><nav>只有导航</nav></body></html>", { status: 200, headers: { "Content-Type": "text/html" } }));
    await expect(extractFullArticle("https://example.com/empty")).rejects.toThrow("未找到可阅读的正文");
  });
});
