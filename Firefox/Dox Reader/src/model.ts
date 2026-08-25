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
  /** Optional for backward compatibility with sync documents created before preference sync. */
  preferences?: SyncedPreferences;
}

export interface ParsedFeed {
  title: string;
  siteUrl: string;
  items: Array<Omit<ItemRecord, "read" | "starred" | "fetchedAt">>;
}

export type Theme = "system" | "light" | "dark";

/** Selectable color schemes; each has a light and a dark palette. */
export type ColorScheme =
  | "ink"
  | "ocean"
  | "violet"
  | "amber"
  | "graphite"
  | "cinnabar"
  | "celadon"
  | "bamboo"
  | "lotus"
  | "material";

export interface PreferenceValues {
  theme: Theme;
  colorScheme: ColorScheme;
  /** Empty string means using the selected scheme's default accent. */
  customAccent: string;
  showItemSnippet: boolean;
}

export interface SyncedPreferences {
  theme: Register<Theme>;
  colorScheme: Register<ColorScheme>;
  /** Optional for sync documents created before custom accent support. */
  customAccent?: Register<string>;
  showItemSnippet: Register<boolean>;
}

export interface AppSettings extends PreferenceValues {
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
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
  customAccent: "",
  showItemSnippet: true,
  feedPaneRatio: 0.17,
  itemPaneRatio: 0.27,
  layoutLocked: false,
};
