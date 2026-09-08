import Dexie, { type EntityTable } from "dexie";
import type { AppSettings, FeedRecord, ItemRecord } from "./model";

export interface BackendConfig {
  intervalMinutes: number;
  maxArticles: number;
}
export interface BackendStatus {
  product: "Dox Reader Backend";
  apiVersion: 1;
  config: BackendConfig;
  revision: number;
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
async function pull(): Promise<BackendStatus> {
  const db = backendCache();
  try {
    const status = await testBackend(connection!);
    if ((await db.meta.get("revision"))?.value === status.revision) {
      offline = false;
      return status;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const items: ItemRecord[] = [];
      let feeds: FeedRecord[] = [];
      let revision: number | undefined;
      let cursor: SnapshotPage["next"] = null;
      try {
        do {
          const page: SnapshotPage = await backendCall<SnapshotPage>(
            "snapshot",
            {
              ...(cursor ? { cursor } : {}),
              ...(revision === undefined ? {} : { revision }),
            },
          );
          if (revision === undefined) {
            revision = page.revision;
            feeds = page.feeds;
          }
          items.push(...page.items);
          cursor = page.next;
          if (items.length > 10000) throw new Error("后端分页响应无效");
        } while (cursor !== null);
        const old = await db.items.bulkGet(items.map((item) => item.id));
        await db.transaction("rw", db.feeds, db.items, db.meta, async () => {
          await db.feeds.clear();
          await db.feeds.bulkPut(feeds);
          await db.items.clear();
          await db.items.bulkPut(
            items.map((item, i) => ({
              ...item,
              content: old[i]?.content ?? "",
            })),
          );
          await db.meta.put({ key: "revision", value: revision });
        });
        offline = false;
        return status;
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
