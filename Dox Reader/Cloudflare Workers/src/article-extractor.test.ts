// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

const runtimeFetch = vi.hoisted(() => ({ fetchArticle: vi.fn() }));
vi.mock("./runtime-fetch", () => runtimeFetch);

import { extractFullArticle, needsFullArticle } from "./article-extractor";

afterEach(() => vi.clearAllMocks());

function articlePage(body: string): string {
  return `<!doctype html><html><head><title>标题</title></head><body><article><h1>标题</h1>
    <p>${"这是完整正文内容。".repeat(40)}</p>${body}</article></body></html>`;
}

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

  it("falls back to the response URL when no proxy header is present", async () => {
    const response = new Response(articlePage('<img src="cover.jpg">'), {
      headers: { "Content-Type": "text/html" },
    });
    Object.defineProperty(response, "url", { value: "https://example.com/posts/final/" });
    runtimeFetch.fetchArticle.mockResolvedValue(response);

    const article = await extractFullArticle("https://example.com/redirect");

    expect(article.content).toContain('src="https://example.com/posts/final/cover.jpg"');
  });

  it("keeps images that only expose srcset or data-srcset candidates", async () => {
    runtimeFetch.fetchArticle.mockResolvedValue(new Response(articlePage(`
      <img srcset="https://cdn.example/a-400.jpg 400w, https://cdn.example/a-1600.jpg 1600w">
      <img src="data:image/gif;base64,R0lG" data-srcset="https://cdn.example/b-800.jpg 800w, https://cdn.example/b-2000.jpg 2000w">`), {
      headers: { "Content-Type": "text/html" },
    }));

    const article = await extractFullArticle("https://example.com/posts/1");

    expect(article.content).toContain('src="https://cdn.example/a-1600.jpg"');
    expect(article.content).toContain('src="https://cdn.example/b-2000.jpg"');
  });

  it("keeps common lazy-load attributes and noscript fallbacks", async () => {
    runtimeFetch.fetchArticle.mockResolvedValue(new Response(articlePage(`
      <img data-lazy-src="/lazy.jpg">
      <img data-actualsrc="../actual.jpg">
      <figure><img src="data:image/gif;base64,R0lG"><noscript><img src="https://cdn.example/ns.jpg"></noscript></figure>`), {
      headers: { "Content-Type": "text/html" },
    }));

    const article = await extractFullArticle("https://example.com/posts/1");

    expect(article.content).toContain('src="https://example.com/lazy.jpg"');
    expect(article.content).toContain('src="https://example.com/actual.jpg"');
    expect(article.content).toContain('src="https://cdn.example/ns.jpg"');
  });

  it("falls back to the picture source when the img has no usable src", async () => {
    runtimeFetch.fetchArticle.mockResolvedValue(new Response(articlePage(`
      <picture><source srcset="https://cdn.example/p-800.webp 800w, https://cdn.example/p-1600.webp 1600w"><img alt=""></picture>`), {
      headers: { "Content-Type": "text/html" },
    }));

    const article = await extractFullArticle("https://example.com/posts/1");

    expect(article.content).toContain('src="https://cdn.example/p-1600.webp"');
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
