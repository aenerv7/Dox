import type { ItemRecord } from "./model";

type ListItem = Pick<ItemRecord, "id" | "feedId" | "read" | "starred" | "title" | "author" | "snippet">;

export function matchesItemView(
  item: ListItem,
  filter: string,
  query: string,
  retainedUnreadIds: ReadonlySet<string>,
): boolean {
  if (filter === "unread" && item.read && !retainedUnreadIds.has(item.id)) return false;
  if (filter === "starred" && !item.starred) return false;
  if (!["all", "unread", "starred"].includes(filter) && item.feedId !== filter) return false;
  const needle = query.trim().toLocaleLowerCase();
  return !needle || `${item.title} ${item.author} ${item.snippet}`.toLocaleLowerCase().includes(needle);
}

export function formatItemSource(filter: string, feedLabel: string, host: string): string {
  if (!["all", "unread"].includes(filter) || !feedLabel.trim()) return host;
  return host ? `${feedLabel} - ${host}` : feedLabel;
}
