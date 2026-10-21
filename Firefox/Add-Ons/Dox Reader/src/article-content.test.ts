// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { h, render } from "preact";
import { renderArticleContent } from "./article-content";

describe("article content rendering", () => {
  it("keeps an origin referrer so hotlink-protected image hosts respond", () => {
    const root = document.createElement("div");
    render(h("div", {}, renderArticleContent('<p>正文</p><img src="/cover.jpg">', "https://sspai.com/post/116820")), root);

    const img = root.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://sspai.com/cover.jpg");
    expect(img.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
  });
});
