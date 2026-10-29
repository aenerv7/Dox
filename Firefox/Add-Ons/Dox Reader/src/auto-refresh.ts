import type { FeedRecord } from "./model";

export const AUTO_REFRESH_CHECK_MS = 60_000;
export const AUTO_REFRESH_RETRY_MS = 5 * 60_000;

/** Failed fetches never move lastFetchedAt; throttle retries independently. */
export function dueFeedIds(
  feeds: readonly FeedRecord[],
  hours: number,
  now: number,
  lastAttempts: ReadonlyMap<string, number> = new Map(),
): string[] {
  if (!Number.isSafeInteger(hours) || hours <= 0) return [];
  return feeds.filter(feed => {
    if (feed.deleted) return false;
    const lastSuccess = feed.lastFetchedAt ?? 0;
    const lastAttempt = lastAttempts.get(feed.id);
    return (lastSuccess <= 0 || now - lastSuccess >= hours * 3_600_000)
      && (lastAttempt === undefined || now - lastAttempt >= AUTO_REFRESH_RETRY_MS);
  }).map(feed => feed.id);
}
