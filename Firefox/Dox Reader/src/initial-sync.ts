export function needsInitialArticleRefresh(
  localHadReaderData: boolean,
  syncedFeedCount: number,
): boolean {
  return !localHadReaderData && syncedFeedCount > 0;
}
