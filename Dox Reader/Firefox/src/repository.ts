// Keep the local/WebDAV database untouched; each backend has its own cache.
export * from "./database";
import * as local from "./database";
import {
  backendEnabled,
  backendCache,
  backendCall,
  backendArticle,
} from "./backend";
import type { FeedRecord, ItemRecord } from "./model";
export async function listFeeds() {
  return backendEnabled() ? backendCache().feeds.toArray() : local.listFeeds();
}
export async function listItems(filter: local.ItemFilter, query = "") {
  if (!backendEnabled()) return local.listItems(filter, query);
  const items = await backendCache()
    .items.orderBy("publishedAt")
    .reverse()
    .toArray();
  return items.filter(
    (item) =>
      (filter === "all" ||
        (filter === "unread" && !item.read) ||
        (filter === "starred" && item.starred) ||
        item.feedId === filter) &&
      (!query ||
        `${item.title} ${item.author} ${item.snippet}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
}
export async function getItemCounts() {
  if (!backendEnabled()) return local.getItemCounts();
  const items = await backendCache().items.toArray();
  return {
    total: items.length,
    unread: items.filter((i) => !i.read).length,
    starred: items.filter((i) => i.starred).length,
  };
}
export async function getFeedUnreadCounts() {
  if (!backendEnabled()) return local.getFeedUnreadCounts();
  const result: Record<string, number> = {};
  for (const item of await backendCache().items.toArray())
    if (!item.read) result[item.feedId] = (result[item.feedId] ?? 0) + 1;
  return result;
}
export async function getItem(id: string) {
  return backendEnabled() ? backendArticle(id) : local.getItem(id);
}
export async function addFeed(url: string) {
  return backendEnabled()
    ? backendCall<FeedRecord>("addFeed", { url })
    : local.addFeed(url);
}
export async function renameFeed(id: string, name: string) {
  return backendEnabled()
    ? backendCall<FeedRecord>("renameFeed", { id, name })
    : local.renameFeed(id, name);
}
export async function removeFeed(id: string) {
  if (backendEnabled()) {
    await backendCall("removeFeed", { id });
    return;
  }
  return local.removeFeed(id);
}
export async function setItemState(
  id: string,
  patch: Partial<Pick<ItemRecord, "read" | "starred">>,
) {
  if (!backendEnabled()) return local.setItemState(id, patch);
  await backendCall("state", { id, ...patch });
  await backendCache().items.update(id, patch);
}
export async function markAllRead() {
  return backendEnabled()
    ? backendCall<number>("markRead")
    : local.markAllRead();
}
export async function markFeedRead(feedId: string) {
  return backendEnabled()
    ? backendCall<number>("markRead", { feedId })
    : local.markFeedRead(feedId);
}
export async function clearAllData() {
  if (!backendEnabled()) return local.clearAllData();
  const db = backendCache();
  await db.delete();
  await db.open();
}
