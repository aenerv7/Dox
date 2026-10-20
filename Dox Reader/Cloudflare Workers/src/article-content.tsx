import { h, type ComponentChildren } from "preact";

const ALLOWED_TAGS = new Set([
  "a", "b", "blockquote", "br", "code", "del", "details", "div", "em", "figcaption",
  "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "ins", "li",
  "mark", "ol", "p", "pre", "s", "small", "span", "strong", "sub", "summary", "sup",
  "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
]);
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "form"]);

function safeUrl(value: string | null, baseUrl: string, image = false): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
    if (!image && (url.protocol === "mailto:" || url.protocol === "tel:")) return url.href;
  } catch {
    return undefined;
  }
  return undefined;
}

function renderNode(node: Node, baseUrl: string, key: string): ComponentChildren {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (!(node instanceof Element)) return null;

  const tag = node.tagName.toLocaleLowerCase();
  if (DROP_WITH_CONTENT.has(tag)) return null;
  const children = Array.from(node.childNodes).map((child, index) =>
    renderNode(child, baseUrl, `${key}-${index}`)
  );
  if (!ALLOWED_TAGS.has(tag)) return children;

  const props: Record<string, unknown> = { key };
  const title = node.getAttribute("title");
  if (title) props.title = title;

  if (tag === "a") {
    const href = safeUrl(node.getAttribute("href"), baseUrl);
    if (!href) return children;
    props.href = href;
    props.target = "_blank";
    props.rel = "noopener noreferrer";
  }
  if (tag === "img") {
    const src = safeUrl(node.getAttribute("src"), baseUrl, true);
    if (!src) return null;
    props.src = src;
    props.alt = node.getAttribute("alt") || "";
    props.loading = "lazy";
    props.referrerPolicy = "no-referrer";
    const width = Number(node.getAttribute("width"));
    const height = Number(node.getAttribute("height"));
    if (Number.isFinite(width) && width > 0) props.width = width;
    if (Number.isFinite(height) && height > 0) props.height = height;
  }
  if (tag === "td" || tag === "th") {
    const colSpan = Number(node.getAttribute("colspan"));
    const rowSpan = Number(node.getAttribute("rowspan"));
    if (Number.isInteger(colSpan) && colSpan > 0 && colSpan <= 100) props.colSpan = colSpan;
    if (Number.isInteger(rowSpan) && rowSpan > 0 && rowSpan <= 100) props.rowSpan = rowSpan;
  }

  return h(tag, props, children);
}

export function renderArticleContent(value: string, baseUrl: string): ComponentChildren[] {
  const document = new DOMParser().parseFromString(value, "text/html");
  return Array.from(document.body.childNodes).map((node, index) =>
    renderNode(node, baseUrl, `article-${index}`)
  );
}
