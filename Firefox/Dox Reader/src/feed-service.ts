import { getFeed, saveParsedFeed, setFeedError } from "./database";
import { parseFeedXml } from "./feed-parser";

export async function refreshFeed(feedId: string): Promise<number> {
  const feed = await getFeed(feedId);
  if (!feed || feed.deleted) throw new Error("订阅源不存在");

  try {
    const response = await fetch(feed.url, {
      method: "GET",
      headers: {
        Accept: "application/atom+xml, application/rss+xml, application/rdf+xml, application/xml, text/xml, */*;q=0.5",
      },
      cache: "no-store",
      redirect: "follow",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = await parseFeedXml(await response.text(), feed.id, response.url || feed.url);
    await saveParsedFeed(feed.id, parsed);
    return parsed.items.length;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setFeedError(feed.id, message);
    throw new Error(`${feed.title}：${message}`);
  }
}

export async function refreshFeeds(feedIds: string[]): Promise<{ succeeded: number; updated: number; errors: string[] }> {
  let cursor = 0;
  let succeeded = 0;
  let updated = 0;
  const errors: string[] = [];
  const workers = Array.from({ length: Math.min(4, feedIds.length) }, async () => {
    while (cursor < feedIds.length) {
      const index = cursor;
      cursor += 1;
      try {
        updated += await refreshFeed(feedIds[index]);
        succeeded += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  });
  await Promise.all(workers);
  return { succeeded, updated, errors };
}
