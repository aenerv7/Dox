import { XMLParser } from "fast-xml-parser";
import { decodeHtmlEntities } from "./html-entities";
import type { ParsedFeed } from "./model";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function asText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return asText(record["#text"] ?? record.value ?? "");
}

/**
 * 提取文本并补齐实体解码。fast-xml-parser 默认不解码数字字符引用（如 &#038;）
 * 和常见 HTML 命名实体（如 &rsquo;），需要在这里解码后用于展示。
 * 注意：guid/identity 走 asText 保持原始字节，避免变更文章 id 造成重复。
 */
function decodeText(value: unknown): string {
  return decodeHtmlEntities(asText(value));
}

function absoluteUrl(value: string, baseUrl: string): string {
  if (!value) return "";
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
}

function atomLink(value: unknown, baseUrl: string): string {
  for (const link of asArray(value)) {
    if (typeof link === "string") return absoluteUrl(link, baseUrl);
    if (link && typeof link === "object") {
      const record = link as Record<string, unknown>;
      const rel = asText(record["@rel"]);
      const href = asText(record["@href"] ?? record["#text"]);
      if (href && (!rel || rel === "alternate")) return absoluteUrl(href, baseUrl);
    }
  }
  return "";
}

function stripMarkup(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

function timestamp(value: unknown): number {
  const parsed = Date.parse(asText(value));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export async function parseFeedXml(xml: string, feedId: string, sourceUrl: string): Promise<ParsedFeed> {
  let document: Record<string, any>;
  try {
    document = parser.parse(xml) as Record<string, any>;
  } catch (error) {
    throw new Error(`无法解析订阅源：${error instanceof Error ? error.message : String(error)}`);
  }

  const rssChannel = document.rss?.channel ?? document.rdf ?? document.RDF;
  const atomFeed = document.feed;
  if (!rssChannel && !atomFeed) {
    throw new Error("响应内容不是可识别的 RSS、Atom 或 RDF 订阅源");
  }

  const root = rssChannel ?? atomFeed;
  const rawItems = asArray(rssChannel ? (root.item ?? document.rdf?.item) : root.entry);
  const title = decodeText(root.title) || new URL(sourceUrl).hostname;
  const siteUrl = rssChannel
    ? absoluteUrl(asText(root.link), sourceUrl)
    : atomLink(root.link, sourceUrl);

  const items = await Promise.all(rawItems.map(async (raw: any) => {
    const link = rssChannel
      ? absoluteUrl(asText(raw.link), sourceUrl)
      : atomLink(raw.link, sourceUrl);
    const guid = asText(raw.guid ?? raw.id) || link;
    const content = asText(raw.encoded ?? raw.content ?? raw.description ?? raw.summary);
    const identity = guid || `${asText(raw.title)}\u0000${asText(raw.pubDate ?? raw.published ?? raw.updated)}`;
    const id = await digest(`${feedId}\u0000${identity}`);
    const author = decodeText(raw.creator ?? raw.author?.name ?? raw.author);

    return {
      id,
      feedId,
      guid: identity,
      title: decodeText(raw.title) || "无标题",
      url: link,
      author,
      publishedAt: timestamp(raw.pubDate ?? raw.date ?? raw.published ?? raw.updated),
      content,
      snippet: stripMarkup(content).slice(0, 280),
    };
  }));

  return { title, siteUrl, items };
}
