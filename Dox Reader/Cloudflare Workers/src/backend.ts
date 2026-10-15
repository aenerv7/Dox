import Dexie, { type EntityTable } from "dexie";
import type { AppSettings, FeedRecord, ItemRecord } from "./model";

export interface BackendConfig {
  intervalMinutes: number;
  maxArticles: number;
}
export interface BackendLimits {
  intervalMinutes: { min: number; max: number };
  maxArticles: { min: number; max: number };
  maxFeeds: number;
  maxFeedBytes: number;
  maxContentBytes: number;
  maxLibraryBytes: number;
  dailyFetchAttempts: number;
  dailyWriteUnits: number;
}
/** 保留空间占用；旧版本后端不上报，缺省视为未满。 */
export interface BackendRetention {
  articles: number;
  starred: number;
  limit: number;
  /** 收藏占满保留空间：后端已停止收录新文章。 */
  blocked: boolean;
}
export interface BackendStatus {
  product: "Dox Reader Backend";
  apiVersion: 1;
  plan?: "free" | "paid";
  config: BackendConfig;
  limits?: BackendLimits;
  retention?: BackendRetention;
  revision: number;
  /** 变更日志保留窗口；旧版本后端不上报，缺省视为只能全量同步。 */
  minSeq?: number;
  maxSeq?: number;
  nextFetchAt: number | null;
  storageBytes: number;
  job: {
    running: boolean;
    completed: number;
    total: number;
    errors: string[];
    updated: number;
    startedAt: number;
  };
}
export interface SnapshotPage {
  revision: number;
  feeds: FeedRecord[];
  items: ItemRecord[];
  next: { time: number; id: string } | null;
}
export interface DeltaPage {
  /** 只在增量首页下发；订阅被删除时客户端据此清理该源的文章。 */
  feeds?: FeedRecord[];
  items: ItemRecord[];
  states: { id: string; read: boolean; starred: boolean }[];
  removed: string[];
  next: number | null;
  minSeq: number;
  maxSeq: number;
}
// 旧版本后端不上报 limits；回退到免费档范围，客户端不会接受后端必然拒绝的取值。
export const FALLBACK_LIMITS: BackendLimits = {
  intervalMinutes: { min: 30, max: 10080 },
  maxArticles: { min: 100, max: 10000 },
  maxFeeds: 100,
  maxFeedBytes: 5 * 1024 * 1024,
  maxContentBytes: 48 * 1024,
  maxLibraryBytes: 600 * 1024 * 1024,
  dailyFetchAttempts: 4800,
  dailyWriteUnits: 10000,
};
export function backendLimits(status?: BackendStatus | null): BackendLimits {
  return status?.limits ?? FALLBACK_LIMITS;
}
class BackendCache extends Dexie {
  feeds!: EntityTable<FeedRecord, "id">;
  items!: EntityTable<ItemRecord, "id">;
  meta!: EntityTable<{ key: string; value: unknown }, "key">;
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      feeds: "&id",
      items: "&id,feedId,publishedAt",
      meta: "&key",
    });
  }
}
let connection: AppSettings | undefined;
let cache: BackendCache | undefined;
let offline = false;
let syncing: Promise<BackendStatus> | undefined;
export function backendEnabled() {
  return connection?.storageMode === "backend";
}
export function backendOffline() {
  return offline;
}
export function backendCache() {
  if (!cache) throw new Error("后端缓存尚未初始化");
  return cache;
}
export function backendUrl(raw: string) {
  const url = new URL(raw.trim());
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error("后端地址必须为 HTTPS 根地址，不含路径、查询参数或凭据");
  }
  return url.origin;
}
export async function backendCall<T>(
  action: string,
  data: Record<string, unknown> = {},
  settings = connection,
): Promise<T> {
  if (!settings) throw new Error("请先配置后端");
  const base = backendUrl(settings.backendUrl);
  if (!settings.backendToken.trim()) throw new Error("请填写后端访问令牌");
  const response = await fetch(base + "/api/v1", {
    method: "POST",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.backendToken.trim()}`,
    },
    body: JSON.stringify({ ...data, action }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || `后端 HTTP ${response.status}`);
  return result as T;
}
export async function testBackend(
  settings: AppSettings,
): Promise<BackendStatus> {
  const status = await backendCall<BackendStatus>("status", {}, settings);
  if (status.product !== "Dox Reader Backend" || status.apiVersion !== 1)
    throw new Error("后端协议版本不兼容");
  return status;
}
export async function connectBackend(settings: AppSettings) {
  connection = settings;
  if (!backendEnabled()) {
    cache?.close();
    cache = undefined;
    offline = false;
    return;
  }
  const url = backendUrl(settings.backendUrl);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(url),
  );
  const name =
    "dox-reader-backend-" +
    Array.from(new Uint8Array(digest), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
  if (cache?.name !== name) {
    cache?.close();
    cache = new BackendCache(name);
  }
}
async function localSeq(db: BackendCache) {
  const record = await db.meta.get("seq");
  return typeof record?.value === "number" ? record.value : -1;
}
// 全量快照：分页读整个库，收齐后原子替换本机缓存。
async function fullSnapshot(
  db: BackendCache,
  status: BackendStatus,
  watermark: number,
) {
  const itemLimit = backendLimits(status).maxArticles.max;
  for (let attempt = 0; attempt < 3; attempt++) {
    const items: ItemRecord[] = [];
    let feeds: FeedRecord[] = [];
    let revision: number | undefined;
    let cursor: SnapshotPage["next"] = null;
    try {
      do {
        const page: SnapshotPage = await backendCall<SnapshotPage>("snapshot", {
          ...(cursor ? { cursor } : {}),
          ...(revision === undefined ? {} : { revision }),
        });
        if (revision === undefined) {
          revision = page.revision;
          feeds = page.feeds;
        }
        items.push(...page.items);
        cursor = page.next;
        if (items.length > itemLimit) throw new Error("后端分页响应无效");
      } while (cursor !== null);
      const old = await db.items.bulkGet(items.map((item) => item.id));
      await db.transaction("rw", db.feeds, db.items, db.meta, async () => {
        await db.feeds.clear();
        await db.feeds.bulkPut(feeds);
        await db.items.clear();
        await db.items.bulkPut(
          items.map((item, index) => ({
            ...item,
            content: old[index]?.content ?? "",
          })),
        );
        await db.meta.put({ key: "seq", value: watermark });
      });
      return;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("SNAPSHOT_CHANGED") ||
        attempt === 2
      )
        throw error;
    }
  }
  throw new Error("后端持续变化，请稍后重试");
}
// 增量：只按变更日志补插入、删除和阅读状态，返回 false 表示日志已裁剪。
async function applyDelta(db: BackendCache, since: number) {
  let cursor: number | undefined;
  for (;;) {
    const page = await backendCall<DeltaPage>("delta", {
      since,
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (page.minSeq > since) return false;
    await applyDeltaPage(db, page, page.next ?? page.maxSeq);
    if (page.next === null) return true;
    cursor = page.next;
  }
}
async function applyDeltaPage(
  db: BackendCache,
  page: DeltaPage,
  watermark: number,
) {
  await db.transaction("rw", db.feeds, db.items, db.meta, async () => {
    if (page.feeds) {
      const known = new Set(page.feeds.map((feed) => feed.id));
      const dropped = (await db.feeds.toArray())
        .map((feed) => feed.id)
        .filter((id) => !known.has(id));
      for (const id of dropped)
        await db.items.where("feedId").equals(id).delete();
      await db.feeds.clear();
      await db.feeds.bulkPut(page.feeds);
    }
    if (page.removed.length) await db.items.bulkDelete(page.removed);
    if (page.states.length) {
      const patch = new Map(page.states.map((state) => [state.id, state]));
      const rows = await db.items.bulkGet(page.states.map((state) => state.id));
      await db.items.bulkPut(
        rows.flatMap((row) => {
          const state = row ? patch.get(row.id) : undefined;
          return row && state
            ? [{ ...row, read: state.read, starred: state.starred }]
            : [];
        }),
      );
    }
    if (page.items.length) {
      const old = await db.items.bulkGet(page.items.map((item) => item.id));
      await db.items.bulkPut(
        page.items.map((item, index) => ({
          ...item,
          content: old[index]?.content ?? "",
        })),
      );
    }
    await db.meta.put({ key: "seq", value: watermark });
  });
}
async function pull(): Promise<BackendStatus> {
  const db = backendCache();
  try {
    const status = await testBackend(connection!);
    const since = await localSeq(db);
    const minSeq = status.minSeq ?? 0;
    const maxSeq = status.maxSeq ?? 0;
    // 水位落在日志保留窗口内才走增量；首次同步或落后太多时退回全量快照。
    if (since >= minSeq && since <= maxSeq) {
      if (since < maxSeq && !(await applyDelta(db, since)))
        await fullSnapshot(db, status, maxSeq);
    } else {
      await fullSnapshot(db, status, maxSeq);
    }
    offline = false;
    return status;
  } catch (error) {
    offline = true;
    throw error;
  }
}
export async function pullBackend() {
  if (!syncing)
    syncing = pull().finally(() => {
      syncing = undefined;
    });
  return syncing;
}
export async function backendArticle(id: string) {
  try {
    const item = await backendCall<ItemRecord>("article", { id });
    await backendCache().items.put(item);
    offline = false;
    return item;
  } catch (error) {
    const old = await backendCache().items.get(id);
    if (old?.content) {
      offline = true;
      return old;
    }
    throw error;
  }
}
export async function requestBackendRefresh(
  ids: string[],
  progress?: (value: {
    completed: number;
    total: number;
    activeFeedIds: string[];
  }) => void,
) {
  let status = await backendCall<BackendStatus>("refresh", { ids });
  const deadline = Date.now() + 120000;
  while (status.job.running && Date.now() < deadline) {
    progress?.({
      completed: status.job.completed,
      total: status.job.total,
      activeFeedIds: [],
    });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    status = await backendCall<BackendStatus>("status");
  }
  progress?.({
    completed: status.job.completed,
    total: status.job.total,
    activeFeedIds: [],
  });
  await pullBackend();
  return status;
}
