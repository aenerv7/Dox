import { fetchArticle } from "./runtime-fetch";

export interface ExtractedArticle {
  content: string;
  textLength: number;
}

const MIN_FEED_TEXT_LENGTH = 800;
const MAX_ARTICLE_BYTES = 8 * 1024 * 1024;

function httpUrl(value: string, base?: string): string | undefined {
  try {
    const url = new URL(value, base);
    if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch { /* Ignore malformed links. */ }
  return undefined;
}

export function needsFullArticle(content: string, url: string): boolean {
  if (!httpUrl(url)) return false;
  const doc = new DOMParser().parseFromString(content, "text/html");
  doc.querySelectorAll("script,style").forEach(node => node.remove());
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim().length < MIN_FEED_TEXT_LENGTH;
}

function metadataImage(doc: Document, base: string): string | undefined {
  for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
    const value = doc.querySelector(selector)?.getAttribute("content");
    if (value) {
      const image = httpUrl(value, base);
      if (image) return image;
    }
  }
  return undefined;
}

export async function extractFullArticle(url: string): Promise<ExtractedArticle> {
  if (!httpUrl(url)) throw new Error("原文地址必须是 HTTP(S) URL");
  const response = await fetchArticle(url, {
    headers: { Accept: "text/html, application/xhtml+xml" },
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`原文返回 HTTP ${response.status}`);
  const type = response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (type && !["text/html", "application/xhtml+xml"].includes(type)) throw new Error("原文不是 HTML 网页");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_ARTICLE_BYTES) throw new Error("原网页过大，无法提取");
  const charset = response.headers.get("Content-Type")?.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1] || "utf-8";
  let html: string;
  try { html = new TextDecoder(charset).decode(bytes); }
  catch { html = new TextDecoder().decode(bytes); }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const base = httpUrl(response.headers.get("X-Dox-Upstream-URL") || "") || url;
  const image = metadataImage(doc, base);
  // Ignore untrusted <base> elements. Resolve links against the validated final URL.
  doc.querySelectorAll("base").forEach(node => node.remove());
  for (const node of doc.querySelectorAll("a[href],img")) {
    const attribute = node.tagName.toLowerCase() === "img" ? "src" : "href";
    const raw = node.getAttribute("data-src") || node.getAttribute("data-original") || node.getAttribute(attribute);
    const absolute = raw && httpUrl(raw, base);
    if (absolute) node.setAttribute(attribute, absolute);
    else node.removeAttribute(attribute);
    node.removeAttribute("srcset");
    node.removeAttribute("data-srcset");
  }
  const { Readability } = await import("@mozilla/readability");
  const article = new Readability(doc, { maxElemsToParse: 50_000 }).parse();
  const content = article?.content?.trim();
  const textLength = article?.textContent?.replace(/\s+/g, " ").trim().length || 0;
  if (!content || textLength < 120) throw new Error("未找到可阅读的正文");
  const result = new DOMParser().parseFromString(content, "text/html");
  if (image && !result.querySelector("img[src]")) {
    const figure = result.createElement("figure");
    const img = result.createElement("img");
    img.setAttribute("src", image);
    img.setAttribute("alt", "");
    figure.append(img);
    result.body.prepend(figure);
  }
  // Treat this HTML as untrusted: the UI must still use renderArticleContent.
  return { content: result.body.innerHTML, textLength };
}
