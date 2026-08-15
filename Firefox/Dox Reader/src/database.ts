import Dexie, { type EntityTable } from "dexie";
import type {
  FeedRecord,
  ItemRecord,
  ItemStateRecord,
  MetaRecord,
  ParsedFeed,
  SyncDocument,
  Version,
} from "./model";

class ReaderDatabase extends Dexie {
  feeds!: EntityTable<FeedRecord, "id">;
  items!: EntityTable<ItemRecord, "id">;
  itemStates!: EntityTable<ItemStateRecord, "id">;
  meta!: EntityTable<MetaRecord, "key">;

  constructor() {
    super("dox-rss-reader");
    this.version(1).stores({
      feeds: "&id, &url, deleted, title",
      items: "&id, feedId, publishedAt, [feedId+publishedAt]",
      itemStates: "&id, feedId, publishedAt",
      meta: "&key",
    });
  }
}

export const db = new ReaderDatabase();
const ZERO_VERSION: Version = [0, ""];

export async function getActor(): Promise<string> {
  const existing = await db.meta.get("actor");
  if (typeof existing?.value === "string") return existing.value;
  const actor = crypto.randomUUID();
  await db.meta.put({ key: "actor", value: actor });
  return actor;
}

async function nextVersion(): Promise<Version> {
  const actor = await getActor();
  return db.transaction("rw", db.meta, async () => {
    const record = await db.meta.get("clock");
    const counter = (typeof record?.value === "number" ? record.value : 0) + 1;
    await db.meta.put({ key: "clock", value: counter });
    return [counter, actor] as const;
  });
}

export async function addFeed(url: string): Promise<FeedRecord> {
  const normalizedUrl = new URL(url).href;
  const existing = await db.feeds.where("url").equals(normalizedUrl).first();
  if (existing && !existing.deleted) return existing;

  const now = Date.now();
  const feed: FeedRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    url: normalizedUrl,
    title: existing?.title || new URL(normalizedUrl).hostname,
    siteUrl: existing?.siteUrl || "",
    folder: existing?.folder || "",
    addedAt: existing?.addedAt ?? now,
    updatedAt: now,
    deleted: false,
    version: await nextVersion(),
  };
  await db.feeds.put(feed);
  return feed;
}

export async function removeFeed(id: string): Promise<void> {
  const feed = await db.feeds.get(id);
  if (!feed) return;
  const version = await nextVersion();
  await db.transaction("rw", db.feeds, db.items, async () => {
    await db.feeds.update(id, {
      deleted: true,
      updatedAt: Date.now(),
      version,
    });
    await db.items.where("feedId").equals(id).delete();
  });
}

export async function listFeeds(): Promise<FeedRecord[]> {
  const feeds = await db.feeds.filter((feed) => !feed.deleted).toArray();
  return feeds.sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
}

export async function getFeed(id: string): Promise<FeedRecord | undefined> {
  return db.feeds.get(id);
}

export async function saveParsedFeed(feedId: string, parsed: ParsedFeed): Promise<void> {
  const now = Date.now();
  const ids = parsed.items.map((item) => item.id);
  const [existingItems, states] = await Promise.all([
    db.items.bulkGet(ids),
    db.itemStates.bulkGet(ids),
  ]);
  const records = parsed.items.map((item, index): ItemRecord => ({
    ...item,
    read: states[index]?.read.value ?? existingItems[index]?.read ?? false,
    starred: states[index]?.starred.value ?? existingItems[index]?.starred ?? false,
    fetchedAt: now,
  }));

  await db.transaction("rw", db.feeds, db.items, async () => {
    await db.items.bulkPut(records);
    await db.feeds.update(feedId, {
      title: parsed.title,
      siteUrl: parsed.siteUrl,
      lastFetchedAt: now,
      error: undefined,
      updatedAt: now,
    });
  });
}

export async function setFeedError(feedId: string, message: string): Promise<void> {
  await db.feeds.update(feedId, { error: message, updatedAt: Date.now() });
}

export type ItemFilter = "all" | "unread" | "starred" | string;

export async function listItems(filter: ItemFilter, query = ""): Promise<ItemRecord[]> {
  const items = await db.items.orderBy("publishedAt").reverse().limit(2000).toArray();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (filter === "unread" && item.read) return false;
    if (filter === "starred" && !item.starred) return false;
    if (!["all", "unread", "starred"].includes(filter) && item.feedId !== filter) return false;
    if (!normalizedQuery) return true;
    return `${item.title} ${item.author} ${item.snippet}`.toLocaleLowerCase().includes(normalizedQuery);
  });
}

export async function getItem(id: string): Promise<ItemRecord | undefined> {
  return db.items.get(id);
}

export async function setItemState(
  id: string,
  patch: Partial<Pick<ItemRecord, "read" | "starred">>,
): Promise<void> {
  const item = await db.items.get(id);
  if (!item) return;
  const version = await nextVersion();
  const current = await db.itemStates.get(id) ?? {
    id,
    feedId: item.feedId,
    publishedAt: item.publishedAt,
    read: { value: item.read, version: ZERO_VERSION },
    starred: { value: item.starred, version: ZERO_VERSION },
  };
  const state: ItemStateRecord = {
    ...current,
    read: patch.read === undefined ? current.read : { value: patch.read, version },
    starred: patch.starred === undefined ? current.starred : { value: patch.starred, version },
  };
  await db.transaction("rw", db.items, db.itemStates, async () => {
    await db.itemStates.put(state);
    await db.items.update(id, patch);
  });
}

export async function markFeedRead(feedId: string): Promise<number> {
  const items = await db.items
    .where("feedId")
    .equals(feedId)
    .filter((item) => !item.read)
    .toArray();
  if (!items.length) return 0;
  const version = await nextVersion();
  await db.transaction("rw", db.items, db.itemStates, async () => {
    for (const item of items) {
      const current = await db.itemStates.get(item.id) ?? {
        id: item.id,
        feedId: item.feedId,
        publishedAt: item.publishedAt,
        read: { value: item.read, version: ZERO_VERSION },
        starred: { value: item.starred, version: ZERO_VERSION },
      };
      await db.itemStates.put({
        ...current,
        read: { value: true, version },
      });
      await db.items.update(item.id, { read: true });
    }
  });
  return items.length;
}

export async function getLastRefreshAllAt(): Promise<number> {
  const record = await db.meta.get("lastRefreshAllAt");
  return typeof record?.value === "number" ? record.value : 0;
}

export async function setLastRefreshAllAt(value: number): Promise<void> {
  await db.meta.put({ key: "lastRefreshAllAt", value });
}

export async function exportSyncDocument(): Promise<SyncDocument> {
  const [actor, clockRecord, refreshRecord, feeds, states] = await Promise.all([
    getActor(),
    db.meta.get("clock"),
    db.meta.get("lastRefreshAllAt"),
    db.feeds.toArray(),
    db.itemStates.toArray(),
  ]);
  const subscriptions = Object.fromEntries(feeds.map((feed) => [feed.id, {
    id: feed.id,
    url: feed.url,
    title: feed.title,
    siteUrl: feed.siteUrl,
    folder: feed.folder,
    deleted: feed.deleted,
    version: feed.version,
  }]));

  return {
    schemaVersion: 1,
    actor,
    clock: typeof clockRecord?.value === "number" ? clockRecord.value : 0,
    generatedAt: new Date().toISOString(),
    subscriptions,
    itemStates: Object.fromEntries(states.map((state) => [state.id, state])),
    lastRefreshAllAt: typeof refreshRecord?.value === "number" ? refreshRecord.value : 0,
  };
}

export async function applySyncDocument(document: SyncDocument): Promise<void> {
  const subscriptions = Object.values(document.subscriptions);
  const states = Object.values(document.itemStates);
  const now = Date.now();

  await db.transaction("rw", db.feeds, db.items, db.itemStates, db.meta, async () => {
    for (const subscription of subscriptions) {
      const existing = await db.feeds.get(subscription.id);
      await db.feeds.put({
        id: subscription.id,
        url: subscription.url,
        title: subscription.title,
        siteUrl: subscription.siteUrl,
        folder: subscription.folder,
        deleted: subscription.deleted,
        version: subscription.version,
        addedAt: existing?.addedAt ?? now,
        updatedAt: now,
        lastFetchedAt: existing?.lastFetchedAt,
        error: existing?.error,
      });
      if (subscription.deleted) await db.items.where("feedId").equals(subscription.id).delete();
    }

    if (states.length) await db.itemStates.bulkPut(states);
    for (const state of states) {
      await db.items.update(state.id, {
        read: state.read.value,
        starred: state.starred.value,
      });
    }
    const currentClock = await db.meta.get("clock");
    const localClock = typeof currentClock?.value === "number" ? currentClock.value : 0;
    await db.meta.put({ key: "clock", value: Math.max(localClock, document.clock) });
    if (typeof document.lastRefreshAllAt === "number") {
      const currentRefresh = await db.meta.get("lastRefreshAllAt");
      const localRefresh = typeof currentRefresh?.value === "number" ? currentRefresh.value : 0;
      await db.meta.put({
        key: "lastRefreshAllAt",
        value: Math.max(localRefresh, document.lastRefreshAllAt),
      });
    }
  });
}

export async function clearAllData(): Promise<void> {
  await db.delete();
  await db.open();
}
