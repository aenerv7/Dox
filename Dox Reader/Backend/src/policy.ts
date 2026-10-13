export type Plan = "free" | "paid";

export interface Limits {
  plan: Plan;
  intervalMinutes: { min: number; max: number };
  maxArticles: { min: number; max: number };
  defaultConfig: { intervalMinutes: number; maxArticles: number };
  maxContentBytes: number;
  maxLibraryBytes: number;
  maxFeeds: number;
  maxFeedBytes: number;
  dailyWriteUnits: number;
  dailyFetchAttempts: number;
}

// Cloudflare Workers Free：单 Durable Object 存储 1 GB、每个调用 10 ms CPU、每日 100k 行写入。
export const FREE_LIMITS: Limits = {
  plan: "free",
  intervalMinutes: { min: 30, max: 10080 },
  maxArticles: { min: 100, max: 10000 },
  defaultConfig: { intervalMinutes: 60, maxArticles: 10000 },
  maxContentBytes: 48 * 1024,
  maxLibraryBytes: 600 * 1024 * 1024,
  maxFeeds: 100,
  // 与前端 Worker 代理保持一致，保证同一订阅在两种数据模式下表现相同。
  maxFeedBytes: 5 * 1024 * 1024,
  dailyWriteUnits: 10000,
  dailyFetchAttempts: 4800,
};

// Workers Paid（$5/月最低消费）：单 DO 10 GB、每个调用 30 s CPU、每月 5000 万行写入，
// 含 5 GB-month SQLite 存储。以下数值留在平台上限以内，便于继续调大而不改代码。
export const PAID_LIMITS: Limits = {
  plan: "paid",
  intervalMinutes: { min: 5, max: 10080 },
  maxArticles: { min: 100, max: 100000 },
  defaultConfig: { intervalMinutes: 60, maxArticles: 50000 },
  maxContentBytes: 256 * 1024,
  maxLibraryBytes: 4 * 1024 * 1024 * 1024,
  maxFeeds: 300,
  // 代理只服务本地模式，后端抓取由 Durable Object 直接发起，因此可以高于免费档。
  maxFeedBytes: 10 * 1024 * 1024,
  dailyWriteUnits: 100000,
  dailyFetchAttempts: 48000,
};

export function resolveLimits(plan: unknown): Limits {
  return typeof plan === "string" && plan.trim().toLowerCase() === PAID_LIMITS.plan
    ? PAID_LIMITS
    : FREE_LIMITS;
}

export function planName(limits: Limits): string {
  return limits.plan === PAID_LIMITS.plan ? "付费" : "免费";
}

export function validateConfig(value: unknown, limits: Limits) {
  const v = value as Partial<{
    intervalMinutes: number;
    maxArticles: number;
  }> | null;
  const interval = limits.intervalMinutes;
  const articles = limits.maxArticles;
  if (
    !v ||
    !Number.isInteger(v.intervalMinutes) ||
    v.intervalMinutes! < interval.min ||
    v.intervalMinutes! > interval.max ||
    !Number.isInteger(v.maxArticles) ||
    v.maxArticles! < articles.min ||
    v.maxArticles! > articles.max
  ) {
    throw new Error(
      `抓取间隔须为 ${interval.min}–${interval.max} 分钟，文章上限须为 ${articles.min}–${articles.max} 篇`,
    );
  }
  return { intervalMinutes: v.intervalMinutes!, maxArticles: v.maxArticles! };
}

// 收敛已存配置到当前档位。付费档降级到免费档后，超出的保留上限由 prune() 立即裁剪。
export function clampConfig(value: unknown, limits: Limits) {
  const v = value as Partial<{
    intervalMinutes: number;
    maxArticles: number;
  }> | null;
  const clamp = (
    value: unknown,
    range: { min: number; max: number },
    fallback: number,
  ) =>
    Number.isInteger(value)
      ? Math.min(Math.max(value as number, range.min), range.max)
      : fallback;
  return {
    intervalMinutes: clamp(
      v?.intervalMinutes,
      limits.intervalMinutes,
      limits.defaultConfig.intervalMinutes,
    ),
    maxArticles: clamp(
      v?.maxArticles,
      limits.maxArticles,
      limits.defaultConfig.maxArticles,
    ),
  };
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

export function boundedContent(text: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) return text;
  return (
    new TextDecoder().decode(bytes.slice(0, Math.max(0, maxBytes - 200))) +
    "<p>内容过长，完整文章请打开原文阅读。</p>"
  );
}
