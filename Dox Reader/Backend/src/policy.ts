export const DEFAULT_CONFIG = { intervalMinutes: 60, maxArticles: 10000 };
export const MAX_CONTENT_BYTES = 48 * 1024;
export const MAX_LIBRARY_BYTES = 600 * 1024 * 1024;
export const MAX_FEEDS = 100;
export const MAX_FEED_BYTES = 1024 * 1024;

export function validateConfig(value: unknown): typeof DEFAULT_CONFIG {
  const v = value as Partial<typeof DEFAULT_CONFIG> | null;
  if (
    !v ||
    !Number.isInteger(v.intervalMinutes) ||
    v.intervalMinutes! < 30 ||
    v.intervalMinutes! > 10080 ||
    !Number.isInteger(v.maxArticles) ||
    v.maxArticles! < 100 ||
    v.maxArticles! > 10000
  ) {
    throw new Error("抓取间隔须为 30–10080 分钟，文章上限须为 100–10000 篇");
  }
  return { intervalMinutes: v.intervalMinutes!, maxArticles: v.maxArticles! };
}

export function feedUrl(raw: unknown): URL {
  if (typeof raw !== "string" || raw.length > 2048)
    throw new Error("订阅地址无效");
  const url = new URL(raw);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const parts = host.split(".").map(Number);
  const [a, b, c] = parts;
  const blockedIp =
    parts.length === 4 &&
    parts.every(Number.isInteger) &&
    (a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 &&
        (b === 168 ||
          (b === 0 && (c === 0 || c === 2)) ||
          (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    !host.includes(".") ||
    host.startsWith("[") ||
    blockedIp ||
    /(^|\.)(localhost|local|internal|home\.arpa)$/.test(host)
  )
    throw new Error("只允许公开 HTTP(S) 订阅地址和标准端口");
  url.hash = "";
  return url;
}

export async function limitedText(
  response: Response | Request,
  limit: number,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  let length = 0;
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        throw new Error("内容超过大小限制");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export function boundedContent(text: string): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= MAX_CONTENT_BYTES) return text;
  return (
    new TextDecoder().decode(bytes.slice(0, MAX_CONTENT_BYTES - 200)) +
    "<p>内容过长，完整文章请打开原文阅读。</p>"
  );
}
