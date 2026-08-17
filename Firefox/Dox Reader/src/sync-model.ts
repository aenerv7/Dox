import type { ItemStateRecord, Register, SubscriptionSync, SyncDocument, Version } from "./model";

export function compareVersion(left: Version, right: Version): number {
  if (left[0] !== right[0]) {
    return left[0] - right[0];
  }
  return left[1].localeCompare(right[1]);
}

function latest<T>(left: Register<T>, right: Register<T>): Register<T> {
  return compareVersion(left.version, right.version) >= 0 ? left : right;
}

function latestSubscription(
  left: SubscriptionSync,
  right: SubscriptionSync,
): SubscriptionSync {
  if (compareVersion(left.version, right.version) >= 0) {
    return { ...left, customName: left.customName ?? "" };
  }
  return { ...right, customName: right.customName ?? left.customName ?? "" };
}

function mergeItemState(left: ItemStateRecord, right: ItemStateRecord): ItemStateRecord {
  const read = latest(left.read, right.read);
  const starred = latest(left.starred, right.starred);
  const leftLatest = compareVersion(left.read.version, left.starred.version) >= 0
    ? left.read.version
    : left.starred.version;
  const rightLatest = compareVersion(right.read.version, right.starred.version) >= 0
    ? right.read.version
    : right.starred.version;
  const metadata = compareVersion(leftLatest, rightLatest) >= 0 ? left : right;

  return {
    id: metadata.id,
    feedId: metadata.feedId,
    publishedAt: Math.max(left.publishedAt, right.publishedAt),
    read,
    starred,
  };
}

export function mergeSyncDocuments(local: SyncDocument, remote: SyncDocument): SyncDocument {
  const subscriptions: Record<string, SubscriptionSync> = { ...local.subscriptions };
  const itemStates: Record<string, ItemStateRecord> = { ...local.itemStates };

  for (const [id, subscription] of Object.entries(remote.subscriptions)) {
    subscriptions[id] = subscriptions[id]
      ? latestSubscription(subscriptions[id], subscription)
      : subscription;
  }

  for (const [id, state] of Object.entries(remote.itemStates)) {
    itemStates[id] = itemStates[id] ? mergeItemState(itemStates[id], state) : state;
  }

  return {
    schemaVersion: 1,
    actor: local.actor,
    clock: Math.max(local.clock, remote.clock),
    generatedAt: new Date().toISOString(),
    subscriptions,
    itemStates,
    lastRefreshAllAt: Math.max(local.lastRefreshAllAt ?? 0, remote.lastRefreshAllAt ?? 0),
  };
}

function isVersion(value: unknown): value is Version {
  return Array.isArray(value)
    && value.length === 2
    && Number.isSafeInteger(value[0])
    && value[0] >= 0
    && typeof value[1] === "string";
}

export function parseSyncDocument(value: unknown): SyncDocument {
  if (!value || typeof value !== "object") {
    throw new Error("WebDAV 同步文件不是有效的 JSON 对象");
  }

  const candidate = value as Partial<SyncDocument>;
  if (candidate.schemaVersion !== 1) {
    throw new Error(`不支持的同步文件版本：${String(candidate.schemaVersion)}`);
  }
  if (typeof candidate.actor !== "string" || !Number.isSafeInteger(candidate.clock)) {
    throw new Error("WebDAV 同步文件缺少设备版本信息");
  }
  if (!candidate.subscriptions || !candidate.itemStates) {
    throw new Error("WebDAV 同步文件结构不完整");
  }

  for (const subscription of Object.values(candidate.subscriptions)) {
    if (!subscription || typeof subscription.id !== "string" || !isVersion(subscription.version)) {
      throw new Error("WebDAV 同步文件包含无效订阅");
    }
    if (subscription.customName !== undefined && typeof subscription.customName !== "string") {
      throw new Error("WebDAV 同步文件包含无效订阅名称");
    }
  }
  for (const state of Object.values(candidate.itemStates)) {
    if (!state || typeof state.id !== "string"
      || !isVersion(state.read?.version) || !isVersion(state.starred?.version)) {
      throw new Error("WebDAV 同步文件包含无效阅读状态");
    }
  }
  if (candidate.lastRefreshAllAt !== undefined
    && (typeof candidate.lastRefreshAllAt !== "number"
      || !Number.isFinite(candidate.lastRefreshAllAt)
      || candidate.lastRefreshAllAt < 0)) {
    throw new Error("WebDAV 同步文件包含无效刷新时间");
  }

  return candidate as SyncDocument;
}
