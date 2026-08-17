export type Version = readonly [counter: number, actor: string];

export interface FeedRecord {
  id: string;
  url: string;
  title: string;
  customName: string;
  siteUrl: string;
  folder: string;
  addedAt: number;
  updatedAt: number;
  lastFetchedAt?: number;
  error?: string;
  deleted: boolean;
  version: Version;
}

export interface ItemRecord {
  id: string;
  feedId: string;
  guid: string;
  title: string;
  url: string;
  author: string;
  publishedAt: number;
  content: string;
  snippet: string;
  read: boolean;
  starred: boolean;
  fetchedAt: number;
}

export interface Register<T> {
  value: T;
  version: Version;
}

export interface ItemStateRecord {
  id: string;
  feedId: string;
  publishedAt: number;
  read: Register<boolean>;
  starred: Register<boolean>;
}

export interface MetaRecord<T = unknown> {
  key: string;
  value: T;
}

export interface SubscriptionSync {
  id: string;
  url: string;
  title: string;
  customName?: string;
  siteUrl: string;
  folder: string;
  deleted: boolean;
  version: Version;
}

export interface SyncDocument {
  schemaVersion: 1;
  actor: string;
  clock: number;
  generatedAt: string;
  subscriptions: Record<string, SubscriptionSync>;
  itemStates: Record<string, ItemStateRecord>;
  /** Timestamp of the last refresh of all subscriptions, shared across devices. */
  lastRefreshAllAt?: number;
}

export interface ParsedFeed {
  title: string;
  siteUrl: string;
  items: Array<Omit<ItemRecord, "read" | "starred" | "fetchedAt">>;
}

export type Theme = "system" | "light" | "dark";

/** Selectable color schemes; each has a light and a dark palette. */
export type ColorScheme = "ink" | "ocean" | "violet" | "amber" | "graphite";

export interface AppSettings {
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  theme: Theme;
  colorScheme: ColorScheme;
  showItemSnippet: boolean;
  feedPaneRatio: number;
  itemPaneRatio: number;
  layoutLocked: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  webdavUrl: "",
  webdavUsername: "",
  webdavPassword: "",
  theme: "system",
  colorScheme: "ink",
  showItemSnippet: true,
  feedPaneRatio: 0.17,
  itemPaneRatio: 0.27,
  layoutLocked: false,
};
