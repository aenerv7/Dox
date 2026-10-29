import { fetchArticle } from "./runtime-fetch";

export interface ExtractedArticle {
  content: string;
  textLength: number;
}

const MIN_FEED_TEXT_LENGTH = 800;
const MAX_ARTICLE_BYTES = 8 * 1024 * 1024;

function httpUrl(value: string | null | undefined, base?: string): string | undefined {
  if (!value?.trim()) return undefined;
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

// 常见懒加载站点会把真实地址放在这些属性里，src 只留占位图。
const LAZY_IMAGE_ATTRIBUTES = [
  "data-src",
  "data-original",
  "data-lazy-src",
  "data-lazy",
  "data-echo",
  "data-url",
  "data-actualsrc",
  "data-hi-res-src",
  "data-full-src",
  "data-original-src",
];

interface ImageCandidate {
  url: string;
  rank: number;
}

function srcsetCandidates(value: string | null, base: string): ImageCandidate[] {
  const candidates: ImageCandidate[] = [];
  for (const part of value?.split(",") ?? []) {
    const [raw = "", descriptor = ""] = part.trim().split(/\s+/, 2);
    const url = httpUrl(raw, base);
    if (!url) continue;
    // 宽度（w）与像素密度（x）无法直接比较，按 100 折算让大图优先。
    const match = /^(\d+(?:\.\d+)?)([wx])$/i.exec(descriptor);
    const rank = match ? Number(match[1]) * (match[2].toLowerCase() === "w" ? 1 : 100) : 1;
    candidates.push({ url, rank });
  }
  return candidates;
}

function bestCandidate(candidates: ImageCandidate[]): string | undefined {
  let best: ImageCandidate | undefined;
  for (const candidate of candidates) {
    if (!best || candidate.rank >= best.rank) best = candidate;
  }
  return best?.url;
}

function pictureCandidates(image: Element, base: string): ImageCandidate[] {
  const picture = image.closest("picture");
  if (!picture) return [];
  return Array.from(picture.querySelectorAll("source[srcset], source[data-srcset]"))
    .flatMap((source) => [
      ...srcsetCandidates(source.getAttribute("srcset"), base),
      ...srcsetCandidates(source.getAttribute("data-srcset"), base),
    ]);
}

function imageSource(image: Element, base: string): string | undefined {
  for (const attribute of LAZY_IMAGE_ATTRIBUTES) {
    const url = httpUrl(image.getAttribute(attribute) || "", base);
    if (url) return url;
  }
  const candidate = bestCandidate([
    ...srcsetCandidates(image.getAttribute("srcset"), base),
    ...srcsetCandidates(image.getAttribute("data-srcset"), base),
    ...pictureCandidates(image, base),
  ]);
  return candidate ?? httpUrl(image.getAttribute("src") || "", base);
}

// 懒加载站点常把真实图片放进 noscript；其内容可能已被解析成节点，也可能仍是一段文本。
function liftNoscriptImages(doc: Document): void {
  for (const noscript of doc.querySelectorAll("noscript")) {
    if (noscript.children.length) {
      noscript.replaceWith(...Array.from(noscript.childNodes));
      continue;
    }
    const parsed = new DOMParser().parseFromString(noscript.textContent || "", "text/html");
    if (parsed.body.children.length) noscript.replaceWith(...Array.from(parsed.body.childNodes));
  }
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
  const base = httpUrl(response.headers.get("X-Dox-Upstream-URL") || response.url || "") || url;
  const image = metadataImage(doc, base);
  // Ignore untrusted <base> elements. Resolve links against the validated final URL.
  doc.querySelectorAll("base").forEach(node => node.remove());
  liftNoscriptImages(doc);
  for (const node of doc.querySelectorAll("a[href],img,source[srcset],source[data-srcset]")) {
    const tag = node.tagName.toLowerCase();
    if (tag === "a") {
      const raw = node.getAttribute("data-src") || node.getAttribute("data-original") || node.getAttribute("href");
      const absolute = raw && httpUrl(raw, base);
      if (absolute) node.setAttribute("href", absolute);
      else node.removeAttribute("href");
      continue;
    }
    if (tag === "source") {
      const absolute = bestCandidate([
        ...srcsetCandidates(node.getAttribute("srcset"), base),
        ...srcsetCandidates(node.getAttribute("data-srcset"), base),
      ]);
      if (absolute) node.setAttribute("srcset", absolute);
      else node.removeAttribute("srcset");
      node.removeAttribute("data-srcset");
      continue;
    }
    const absolute = imageSource(node, base);
    if (absolute) node.setAttribute("src", absolute);
    else node.removeAttribute("src");
    node.removeAttribute("srcset");
    node.removeAttribute("data-srcset");
    for (const attribute of LAZY_IMAGE_ATTRIBUTES) node.removeAttribute(attribute);
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
