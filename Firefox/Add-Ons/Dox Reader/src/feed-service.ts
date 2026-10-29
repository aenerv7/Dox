import { getFeed, saveParsedFeed, setFeedError } from "./database";
import { parseFeedXml } from "./feed-parser";
import { fetchFeed } from "./runtime-fetch";

export interface FeedRefreshProgress {
  completed: number;
  total: number;
  activeFeedIds: readonly string[];
}

export async function refreshFeed(feedId: string): Promise<number> {
  const existing = refreshJobs.get(feedId);
  if (existing) return existing;
  const job = new Promise<number>((resolve, reject) => {
    refreshQueue.push({ feedId, resolve, reject });
  });
  refreshJobs.set(feedId, job);
  notifyRefreshListeners();
  queueMicrotask(drainRefreshQueue);
  return job;
}

type RefreshListener = (feedIds: readonly string[]) => void;
const refreshJobs = new Map<string, Promise<number>>();
const refreshListeners = new Set<RefreshListener>();
const refreshQueue: Array<{
  feedId: string;
  resolve: (count: number) => void;
  reject: (error: unknown) => void;
}> = [];
let runningRefreshes = 0;

/** Queued and running jobs share one identity across every refresh entry point. */
export function subscribeFeedRefreshes(listener: RefreshListener): () => void {
  refreshListeners.add(listener);
  listener([...refreshJobs.keys()]);
  return () => { refreshListeners.delete(listener); };
}

function notifyRefreshListeners(): void {
  for (const listener of refreshListeners) listener([...refreshJobs.keys()]);
}

function drainRefreshQueue(): void {
  while (runningRefreshes < 4 && refreshQueue.length > 0) {
    const job = refreshQueue.shift()!;
    runningRefreshes += 1;
    void fetchAndSaveFeed(job.feedId).then(
      count => finish(count),
      error => finish(undefined, error),
    );
    function finish(count?: number, error?: unknown): void {
      runningRefreshes -= 1;
      refreshJobs.delete(job.feedId);
      notifyRefreshListeners();
      if (count !== undefined) job.resolve(count);
      else job.reject(error);
      drainRefreshQueue();
    }
  }
}

async function fetchAndSaveFeed(feedId: string): Promise<number> {
  const feed = await getFeed(feedId);
  if (!feed || feed.deleted) throw new Error("订阅源不存在");

  try {
    const response = await fetchFeed(feed.url, {
      method: "GET",
      headers: {
        Accept: "application/atom+xml, application/rss+xml, application/rdf+xml, application/xml, text/xml, */*;q=0.5",
      },
      cache: "no-store",
      redirect: "follow",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = await parseFeedXml(
      await response.text(),
      feed.id,
      response.headers.get("X-Dox-Upstream-URL") || response.url || feed.url,
    );
    await saveParsedFeed(feed.id, parsed, feed.url);
    return parsed.items.length;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setFeedError(feed.id, message, feed.url);
    throw new Error(`${feed.title}：${message}`);
  }
}

export async function refreshFeeds(
  feedIds: string[],
  onProgress?: (progress: FeedRefreshProgress) => void,
): Promise<{ succeeded: number; updated: number; errors: string[] }> {
  const uniqueIds = [...new Set(feedIds)];
  let completed = 0;
  let succeeded = 0;
  let updated = 0;
  const errors: string[] = [];
  const activeFeedIds = new Set(uniqueIds);
  const reportProgress = () => onProgress?.({
    completed,
    total: uniqueIds.length,
    activeFeedIds: [...activeFeedIds],
  });

  reportProgress();
  await Promise.all(uniqueIds.map(async feedId => {
    try {
      const count = await refreshFeed(feedId);
      updated += count;
      succeeded += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    } finally {
      activeFeedIds.delete(feedId);
      completed += 1;
      reportProgress();
    }
  }));
  return { succeeded, updated, errors };
}
