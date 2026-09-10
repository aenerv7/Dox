import type { FeedRecord } from "./model";

export function compareFeedNames(left: FeedRecord, right: FeedRecord): number {
  return (left.customName || left.title).localeCompare(
    right.customName || right.title,
    "zh-CN",
  );
}
