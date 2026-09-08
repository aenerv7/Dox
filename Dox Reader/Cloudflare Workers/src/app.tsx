import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCheck,
  Cloud,
  CloudOff,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FileUp,
  Inbox,
  List,
  ListChecks,
  LoaderCircle,
  Lock,
  LockOpen,
  Mail,
  MailOpen,
  Pencil,
  Plus,
  RefreshCw,
  Rss,
  Search,
  Settings,
  Star,
  Trash2,
  Upload,
  Wifi,
  X,
} from "lucide-preact";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { renderArticleContent } from "./article-content";
import {
  addFeed,
  clearAllData,
  getFeedUnreadCounts,
  getItemCounts,
  getLastRefreshAllAt,
  hasLocalReaderData,
  listFeeds,
  listItems,
  markAllRead,
  markFeedRead,
  migrateLegacyEntities,
  removeFeed,
  renameFeed,
  setItemState,
  setLastRefreshAllAt,
  updateSyncedPreferences,
  getItem,
} from "./repository";
import { backendEnabled, backendOffline, backendCall, connectBackend, pullBackend, requestBackendRefresh, testBackend, type BackendConfig, type BackendStatus } from "./backend";
import { refreshFeed, refreshFeeds } from "./feed-service";
import type { FeedRefreshProgress } from "./feed-service";
import { needsInitialArticleRefresh } from "./initial-sync";
import { formatItemSource, matchesItemView } from "./item-list";
import type { AppSettings, ColorScheme, FeedRecord, ItemRecord, PreferenceValues } from "./model";
import { DEFAULT_SETTINGS } from "./model";
import { createOpml, parseOpml } from "./opml";
import { applyAppearance, loadSettings, saveSettings } from "./settings";
import { syncWithWebDav, testWebDav } from "./webdav";

type Filter = "all" | "unread" | "starred" | string;
type MobilePane = "feeds" | "items" | "reader";
type SyncStatus = "idle" | "syncing" | "ok" | "error";
type ResizeTarget = "feeds" | "items";

interface RefreshDisplayProgress {
  completed: number;
  total: number;
  activeFeedNames: string[];
}

interface ColorSchemeOption {
  id: ColorScheme;
  label: string;
  light: string;
  dark: string;
  accent: string;
  darkAccent: string;
}

const COLOR_SCHEME_GROUPS: ReadonlyArray<{
  label: string;
  schemes: ReadonlyArray<ColorSchemeOption>;
}> = [
  {
    label: "经典设计",
    schemes: [
      { id: "ink", label: "墨韵", light: "#edf1ee", dark: "#1c231f", accent: "#b64038", darkAccent: "#e8786f" },
      { id: "ocean", label: "海潮", light: "#eaf0f6", dark: "#19232d", accent: "#2d62bd", darkAccent: "#82adee" },
      { id: "violet", label: "藤紫", light: "#efecf5", dark: "#211c29", accent: "#7350a4", darkAccent: "#b796dc" },
      { id: "amber", label: "琥珀", light: "#f3ede2", dark: "#252019", accent: "#ad5c25", darkAccent: "#e9a064" },
      { id: "graphite", label: "石墨", light: "#eceff1", dark: "#1c1e20", accent: "#53687d", darkAccent: "#9fb4c7" },
      { id: "material", label: "Material 3", light: "#f1f1f1", dark: "#1b1c1e", accent: "#3f4143", darkAccent: "#c5c6c9" },
    ],
  },
  {
    label: "东方传统色",
    schemes: [
      { id: "cinnabar", label: "宣纸朱砂", light: "#ece8dd", dark: "#211e19", accent: "#b23a32", darkAccent: "#df766a" },
      { id: "celadon", label: "雨过天青", light: "#e3ece9", dark: "#1a2321", accent: "#3d7470", darkAccent: "#7fb4aa" },
      { id: "bamboo", label: "竹青", light: "#e8eee1", dark: "#1d241a", accent: "#4d7450", darkAccent: "#91b28a" },
      { id: "lotus", label: "藕荷", light: "#f0e6ea", dark: "#241c20", accent: "#8b5b70", darkAccent: "#c38ba3" },
    ],
  },
];

const FEED_PANE_MIN = 0.13;
const FEED_PANE_MAX = 0.32;
const ITEM_PANE_MIN = 0.22;
const ITEM_PANE_MAX = 0.5;
const READER_PANE_MIN = 0.3;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MIN_ASYNC_FEEDBACK_MS = 400;

async function keepFeedbackVisible(startedAt: number): Promise<void> {
  const remaining = MIN_ASYNC_FEEDBACK_MS - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => window.setTimeout(resolve, remaining));
}

function preferenceValues(settings: AppSettings): PreferenceValues {
  return {
    theme: settings.theme,
    colorScheme: settings.colorScheme,
    customAccent: settings.customAccent,
    showItemSnippet: settings.showItemSnippet,
  };
}

function resizedPanes(
  target: ResizeTarget,
  delta: number,
  feedPaneRatio: number,
  itemPaneRatio: number,
  viewportWidth: number,
): Pick<AppSettings, "feedPaneRatio" | "itemPaneRatio"> {
  const ratioDelta = delta / viewportWidth;
  if (target === "feeds") {
    const maximum = Math.max(
      FEED_PANE_MIN,
      Math.min(FEED_PANE_MAX, 1 - itemPaneRatio - READER_PANE_MIN),
    );
    return {
      feedPaneRatio: Math.min(maximum, Math.max(FEED_PANE_MIN, feedPaneRatio + ratioDelta)),
      itemPaneRatio,
    };
  }
  const maximum = Math.max(
    ITEM_PANE_MIN,
    Math.min(ITEM_PANE_MAX, 1 - feedPaneRatio - READER_PANE_MIN),
  );
  return {
    feedPaneRatio,
    itemPaneRatio: Math.min(maximum, Math.max(ITEM_PANE_MIN, itemPaneRatio + ratioDelta)),
  };
}

function formatDate(value: number): string {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(date);
}

function sourceHost(item: ItemRecord): string {
  try {
    return new URL(item.url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function feedName(feed: FeedRecord): string {
  return feed.customName.trim() || feed.title;
}

function displayRefreshProgress(
  progress: FeedRefreshProgress,
  sourceFeeds: readonly FeedRecord[],
): RefreshDisplayProgress {
  const feedNames = new Map(sourceFeeds.map((feed) => [feed.id, feedName(feed)]));
  return {
    completed: progress.completed,
    total: progress.total,
    activeFeedNames: progress.activeFeedIds.map((feedId) => feedNames.get(feedId) || "未知订阅源"),
  };
}

export function App() {
  const [feeds, setFeeds] = useState<FeedRecord[]>([]);
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [counts, setCounts] = useState({ total: 0, unread: 0, starred: 0 });
  const [feedUnread, setFeedUnread] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<Filter>("unread");
  const [query, setQuery] = useState("");
  const [visibleLimit,setVisibleLimit]=useState(200);
  const [retainedUnreadIds, setRetainedUnreadIds] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<MobilePane>("items");
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [renamingFeed, setRenamingFeed] = useState<FeedRecord | null>(null);
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshScope, setRefreshScope] = useState<"all" | string | null>(null);
  const [refreshProgress, setRefreshProgress] = useState<RefreshDisplayProgress | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [toast, setToast] = useState("");
  const [ready, setReady] = useState(false);
  const [backendNotice, setBackendNotice] = useState('');
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);
  const syncTimer = useRef<number | null>(null);
  const itemListRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    if (backendEnabled()) {
      try {setBackendStatus(await pullBackend());setBackendNotice('');}
      catch(error) {setBackendNotice('后端连接失败，仅显示已缓存内容：'+(error instanceof Error?error.message:String(error)));}
    }
    const [nextFeeds, nextItems, nextCounts, nextFeedUnread] = await Promise.all([
      listFeeds(),
      listItems("all"),
      getItemCounts(),
      getFeedUnreadCounts(),
    ]);
    setFeeds(nextFeeds);
    setItems(current => {
      const bodies=new Map(current.map(item=>[item.id,item.content]));
      return nextItems.map(item=>({...item,content:item.content||bodies.get(item.id)||''}));
    });
    setCounts(nextCounts);
    setFeedUnread(nextFeedUnread);
  }, []);

  const performSync = useCallback(async (currentSettings = settings, quiet = false) => {
    if(currentSettings.storageMode==='backend') {await loadData();return currentSettings;}
    if (!currentSettings.webdavUrl) return currentSettings;
    setSyncStatus("syncing");
    try {
      const localHadReaderData = await hasLocalReaderData();
      const result = await syncWithWebDav(currentSettings);
      const syncedSettings = result.preferences
        ? { ...currentSettings, ...result.preferences }
        : currentSettings;
      await saveSettings(syncedSettings);
      setSettingsState(syncedSettings);
      applyAppearance(syncedSettings);
      await loadData();

      const syncedFeeds = localHadReaderData ? [] : await listFeeds();
      let initialRefresh: Awaited<ReturnType<typeof refreshFeeds>> | null = null;
      let initialRefreshError = "";
      if (needsInitialArticleRefresh(localHadReaderData, syncedFeeds.length)) {
        setRefreshing(true);
        setRefreshScope("all");
        try {
          initialRefresh = await refreshFeeds(
            syncedFeeds.map((feed) => feed.id),
            (progress) => setRefreshProgress(displayRefreshProgress(progress, syncedFeeds)),
          );
          await setLastRefreshAllAt(Date.now());
          try {
            await syncWithWebDav(syncedSettings);
          } catch {
            // The initial sync and article refresh succeeded; a later sync can retry this metadata update.
          }
        } catch (error) {
          initialRefreshError = error instanceof Error ? error.message : String(error);
        } finally {
          setRefreshing(false);
          setRefreshScope(null);
          setRefreshProgress(null);
          await loadData();
        }
      }

      setSyncStatus("ok");
      if (!quiet) {
        if (initialRefresh) {
          setToast(`首次同步完成：刷新 ${initialRefresh.succeeded} 个订阅，读取 ${initialRefresh.updated} 篇文章，失败 ${initialRefresh.errors.length} 个`);
        } else if (initialRefreshError) {
          setToast(`同步完成，但首次刷新失败：${initialRefreshError}`);
        } else {
          setToast(`已同步 ${result.subscriptions} 个订阅和 ${result.itemStates} 条状态`);
        }
      }
      return syncedSettings;
    } catch (error) {
      setSyncStatus("error");
      if (!quiet) setToast(error instanceof Error ? error.message : String(error));
      return currentSettings;
    }
  }, [loadData, settings]);

  const queueSync = useCallback(() => {
    if(backendEnabled()) return;
    if (!settings.webdavUrl) return;
    if (syncTimer.current !== null) window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => void performSync(settings, true), 1400);
  }, [performSync, settings]);

  useEffect(() => {
    void (async () => {
      const saved = await loadSettings();
      setSettingsState(saved);
      applyAppearance(saved);
      try {await connectBackend(saved);} catch(error) {setToast(error instanceof Error?error.message:String(error));setReady(true);return;}
      await migrateLegacyEntities();
      await loadData();
      setReady(true);
      if (saved.storageMode === "local" && saved.webdavUrl) await performSync(saved, true);
      await maybeAutoRefresh();
    })();
    return () => {
      if (syncTimer.current !== null) window.clearTimeout(syncTimer.current);
    };
  }, [loadData]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if(!ready || settings.storageMode!=='backend') return;
    const timer=window.setInterval(()=>{if(!document.hidden&&!refreshing) void loadData();},60000);
    return ()=>window.clearInterval(timer);
  }, [ready,settings.storageMode,refreshing,loadData]);

  function runAction(action:Promise<unknown>) {void action.catch(error=>setToast(error instanceof Error?error.message:String(error)));}

  // 切换订阅源/视图后，文章列表滚动位置回到顶部。
  useLayoutEffect(() => {
    setRetainedUnreadIds(new Set());
    if (itemListRef.current) itemListRef.current.scrollTop = 0;
  }, [filter]);

  useEffect(()=>setVisibleLimit(200),[filter,query]);

  const visibleItems = useMemo(() => {
    return items.filter((item) => matchesItemView(item, filter, query, retainedUnreadIds));
  }, [filter, items, query, retainedUnreadIds]);

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;
  const feedsById = useMemo(() => new Map(feeds.map((feed) => [feed.id, feed])), [feeds]);
  const selectedFeed = feeds.find((feed) => feed.id === filter);
  const selectedFeedUnread = selectedFeed ? (feedUnread[selectedFeed.id] ?? 0) : 0;
  const unreadCount = counts.unread;
  const starredCount = counts.starred;
  const refreshSourceLabel = !refreshProgress
    ? ""
    : refreshProgress.activeFeedNames.length
      ? refreshProgress.activeFeedNames.join("、")
      : refreshProgress.completed === refreshProgress.total
        ? "正在整理刷新结果"
        : "正在连接订阅源";

  async function chooseItem(item: ItemRecord) {
    if(backendEnabled()) {
      const full=await getItem(item.id);
      if(full) setItems(current=>current.map(entry=>entry.id===item.id?full:entry));
    }
    setSelectedItemId(item.id);
    setMobilePane("reader");
    if (!item.read && !(backendEnabled() && backendOffline())) {
      if (filter === "unread") {
        setRetainedUnreadIds((current) => new Set(current).add(item.id));
      }
      await setItemState(item.id, { read: true });
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry));
      setCounts((current) => ({ ...current, unread: Math.max(0, current.unread - 1) }));
      setFeedUnread((current) => ({
        ...current,
        [item.feedId]: Math.max(0, (current[item.feedId] ?? 0) - 1),
      }));
      queueSync();
    }
  }

  async function toggleStar(item: ItemRecord) {
    const nextStarred = !item.starred;
    await setItemState(item.id, { starred: nextStarred });
    setItems((current) => current.map((entry) =>
      entry.id === item.id ? { ...entry, starred: nextStarred } : entry
    ));
    setCounts((current) => ({ ...current, starred: current.starred + (nextStarred ? 1 : -1) }));
    queueSync();
  }

  async function toggleRead(item: ItemRecord) {
    const nextRead = !item.read;
    await setItemState(item.id, { read: nextRead });
    setItems((current) => current.map((entry) =>
      entry.id === item.id ? { ...entry, read: nextRead } : entry
    ));
    const delta = nextRead ? -1 : 1;
    setCounts((current) => ({ ...current, unread: Math.max(0, current.unread + delta) }));
    setFeedUnread((current) => ({
      ...current,
      [item.feedId]: Math.max(0, (current[item.feedId] ?? 0) + delta),
    }));
    queueSync();
  }

  async function handleRefresh(feedId?: string, auto = false) {
    const currentFeeds = auto ? await listFeeds() : feeds;
    if (!currentFeeds.length) {
      if (!auto) setShowAdd(true);
      return;
    }
    setRefreshing(true);
    setRefreshScope(feedId ?? "all");
    const targets = feedId ? [feedId] : currentFeeds.map((feed) => feed.id);
    try {
      if(backendEnabled()) {
        const status=await requestBackendRefresh(targets,feedId?undefined:progress=>setRefreshProgress(displayRefreshProgress(progress,currentFeeds)));
        setBackendStatus(status);await loadData();
        setToast(status.job.running?'后端仍在抓取，关闭页面也会继续':'后端抓取完成：新增 '+status.job.updated+' 篇，失败 '+status.job.errors.length+' 个');
        return;
      }
      const result = await refreshFeeds(
        targets,
        feedId
          ? undefined
          : (progress) => setRefreshProgress(displayRefreshProgress(progress, currentFeeds)),
      );
      await loadData();
      if (feedId) {
        setToast(result.errors.length
          ? `刷新失败：${result.errors[0]}`
          : `刷新完成：读取 ${result.updated} 篇文章`);
      } else {
        setToast(`全部刷新完成：成功 ${result.succeeded} 个，失败 ${result.errors.length} 个，读取 ${result.updated} 篇文章`);
        await setLastRefreshAllAt(Date.now());
        queueSync();
      }
    } catch (error) {
      setToast(`刷新失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRefreshing(false);
      setRefreshScope(null);
      if (!feedId) setRefreshProgress(null);
    }
  }

  async function maybeAutoRefresh() {
    if(backendEnabled()) return;
    const [feedCount, lastRefreshAllAt] = await Promise.all([
      listFeeds().then((list) => list.length),
      getLastRefreshAllAt(),
    ]);
    if (!feedCount) return;
    if (lastRefreshAllAt > 0 && Date.now() - lastRefreshAllAt < ONE_DAY_MS) return;
    await handleRefresh(undefined, true);
  }

  async function handleAddFeed(url: string) {
    const feed = await addFeed(url);
    setShowAdd(false);
    setFilter(feed.id);
    setMobilePane("items");
    setRefreshing(true);
    setRefreshScope(feed.id);
    try {
      if(backendEnabled()) {setToast('订阅已添加，后端正在抓取');}
      else {const count=await refreshFeed(feed.id);setToast('已添加订阅，获取 '+count+' 篇文章');}
    } catch (error) {
      setToast(error instanceof Error ? error.message : String(error));
    }
    await loadData();
    setRefreshing(false);
    setRefreshScope(null);
    queueSync();
  }

  async function handleMarkAllRead() {
    const count = await markAllRead();
    if (!count) return;
    await loadData();
    queueSync();
    setToast(`已将 ${count} 篇文章全部标为已读`);
  }

  async function handleMarkFeedRead(feed: FeedRecord) {
    const count = await markFeedRead(feed.id);
    if (!count) return;
    await loadData();
    queueSync();
    setToast(`已将 ${feedName(feed)} 的 ${count} 篇文章标为已读`);
  }

  async function handleRemoveFeed(feed: FeedRecord) {
    if (!confirm(`删除订阅“${feedName(feed)}”？`)) return;
    await removeFeed(feed.id);
    if (filter === feed.id) setFilter("all");
    await loadData();
    queueSync();
  }

  async function handleRenameFeed(customName: string) {
    if (!renamingFeed) return;
    const updated = await renameFeed(renamingFeed.id, customName);
    if (updated) {
      setFeeds((current) => current.map((feed) => feed.id === updated.id ? updated : feed));
    }
    setRenamingFeed(null);
    setToast("订阅名称已更新");
    queueSync();
  }

  async function handleSaveSettings(next: AppSettings, config?:BackendConfig) {
    const changedMode=next.storageMode!==settings.storageMode || next.backendUrl!==settings.backendUrl || next.backendToken!==settings.backendToken;
    if(next.storageMode==='backend') {
      await testBackend(next);
      if(config) await backendCall('configure',{config},next);
    } else await updateSyncedPreferences(preferenceValues(next));
    await saveSettings(next);
    if(changedMode) {window.location.reload();return;}
    setSettingsState(next);
    applyAppearance(next);
    setShowSettings(false);
    setToast("设置已保存");
    if(next.storageMode==='backend') await loadData();
    else if (next.webdavUrl) void performSync(next, true);
  }

  async function handleSettingsSync(next: AppSettings): Promise<AppSettings> {
    await updateSyncedPreferences(preferenceValues(next));
    await saveSettings(next);
    setSettingsState(next);
    applyAppearance(next);
    return performSync(next);
  }

  async function toggleLayoutLock() {
    const next = { ...settings, layoutLocked: !settings.layoutLocked };
    setSettingsState(next);
    await saveSettings(next);
    setToast(next.layoutLocked ? "布局已锁定" : "布局已解锁");
  }

  function startResize(target: ResizeTarget, event: PointerEvent) {
    if (settings.layoutLocked || event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const initialFeedRatio = settings.feedPaneRatio;
    const initialItemRatio = settings.itemPaneRatio;
    let pending = { feedPaneRatio: initialFeedRatio, itemPaneRatio: initialItemRatio };
    document.body.classList.add("layout-resizing");

    const handleMove = (moveEvent: PointerEvent) => {
      pending = resizedPanes(
        target,
        moveEvent.clientX - startX,
        initialFeedRatio,
        initialItemRatio,
        window.innerWidth,
      );
      setSettingsState((current) => ({ ...current, ...pending }));
    };
    const handleEnd = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
      document.body.classList.remove("layout-resizing");
      void saveSettings({ ...settings, ...pending });
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd, { once: true });
    window.addEventListener("pointercancel", handleEnd, { once: true });
  }

  function resizeWithKeyboard(target: ResizeTarget, event: KeyboardEvent) {
    if (settings.layoutLocked || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -16 : 16;
    const panes = resizedPanes(
      target,
      delta,
      settings.feedPaneRatio,
      settings.itemPaneRatio,
      window.innerWidth,
    );
    const next = { ...settings, ...panes };
    setSettingsState(next);
    void saveSettings(next);
  }

  async function handleImport(file: File) {
    try {
      const imported = parseOpml(await file.text());
      for (const feed of imported) await addFeed(feed.url);
      await loadData();
      setToast(`已导入 ${imported.length} 个订阅`);
      queueSync();
    } catch (error) {
      setToast(error instanceof Error ? error.message : String(error));
    }
  }

  function handleExport() {
    const xml = createOpml(feeds.map((feed) => ({
      title: feedName(feed),
      url: feed.url,
      siteUrl: feed.siteUrl,
    })));
    const url = URL.createObjectURL(new Blob([xml], { type: "text/x-opml;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `dox-reader-${new Date().toISOString().slice(0, 10)}.opml`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleClearData() {
    if (!confirm(backendEnabled()?'清除当前后端在本机的缓存？后端文章不会被删除。':"清除本机的订阅、文章和阅读状态？WebDAV 文件不会被删除。")) return;
    await clearAllData();
    setFilter("all");
    setSelectedItemId(null);
    if(backendEnabled()) {setFeeds([]);setItems([]);setCounts({total:0,unread:0,starred:0});setFeedUnread({});}
    else await loadData();
    setShowSettings(false);
    setToast("本机数据已清除");
  }

  const syncIcon = syncStatus === "syncing"
    ? <LoaderCircle size={17} class="spin" />
    : syncStatus === "error"
      ? <CloudOff size={17} />
      : <Cloud size={17} />;

  const appStyle = {
    "--feeds-pane-width": `${settings.feedPaneRatio * 100}%`,
    "--items-pane-width": `${settings.itemPaneRatio * 100}%`,
  };

  return (
    <div class={`app mobile-pane-${mobilePane} ${settings.layoutLocked ? "layout-locked" : ""}`} style={appStyle}>
      <header class="topbar">
        <button class="brand" onClick={() => { setFilter("all"); setMobilePane("items"); }}>
          <img src="/icons/icon.svg" alt="" />
          <span>Dox Reader</span>
        </button>
        <div class="topbar-actions">
          <button class="icon-button" title="同步" disabled={(settings.storageMode!=="backend" && !settings.webdavUrl) || syncStatus === "syncing"} onClick={() => void performSync()}>
            {syncIcon}
          </button>
          <button class="icon-button" title="全部标为已读" disabled={refreshing || unreadCount === 0} onClick={() => runAction(handleMarkAllRead())}>
            <CheckCheck size={18} />
          </button>
          <button class="icon-button" title="刷新所有订阅" disabled={refreshing || !feeds.length} onClick={() => void handleRefresh()}>
            <RefreshCw size={18} class={refreshScope === "all" ? "spin" : ""} />
          </button>
          <button class="icon-button" title="添加订阅" onClick={() => setShowAdd(true)}>
            <Plus size={19} />
          </button>
          <button class={`icon-button layout-lock-button ${settings.layoutLocked ? "accent" : ""}`} title={settings.layoutLocked ? "解锁布局" : "锁定布局"} onClick={() => void toggleLayoutLock()}>
            {settings.layoutLocked ? <Lock size={18} /> : <LockOpen size={18} />}
          </button>
          <button class="icon-button" title="设置" onClick={() => setShowSettings(true)}>
            <Settings size={18} />
          </button>
        </div>
      </header>

      <aside class="feeds-pane">
        <div class="pane-heading">
          <span>资料库</span>
        </div>
        <nav class="feed-nav">
          <NavItem icon={<Check size={17} />} label="未读" count={unreadCount} active={filter === "unread"} onClick={() => { setFilter("unread"); setMobilePane("items"); }} />
          <NavItem icon={<Inbox size={17} />} label="全部文章" count={counts.total} active={filter === "all"} onClick={() => { setFilter("all"); setMobilePane("items"); }} />
          <NavItem icon={<Star size={17} />} label="收藏" count={starredCount} active={filter === "starred"} onClick={() => { setFilter("starred"); setMobilePane("items"); }} />
        </nav>
        <div class="pane-heading subscriptions-heading">
          <span>订阅</span>
          <button class="icon-button small" title="添加订阅" onClick={() => setShowAdd(true)}><Plus size={16} /></button>
        </div>
        <nav class="feed-nav feed-list">
          {feeds.map((feed) => {
            const count = feedUnread[feed.id] ?? 0;
            return (
              <div class={`feed-row ${filter === feed.id ? "active" : ""}`} key={feed.id}>
                <button onClick={() => { setFilter(feed.id); setMobilePane("items"); }}>
                  {count > 0 ? <strong class="feed-unread">{count > 99 ? "99+" : count}</strong> : <Rss size={16} />}
                  <span>{feedName(feed)}</span>
                </button>
                <div class="feed-row-actions">
                  <button class="feed-action" title="全部标为已读" disabled={refreshing || count === 0} onClick={() => runAction(handleMarkFeedRead(feed))}>
                    <ListChecks size={14} />
                  </button>
                  <button class="feed-action" title={`刷新 ${feedName(feed)}`} disabled={refreshing} onClick={() => void handleRefresh(feed.id)}>
                    <RefreshCw size={14} class={refreshScope === feed.id ? "spin" : ""} />
                  </button>
                  <button class="feed-action" title="重命名订阅" disabled={refreshing} onClick={() => setRenamingFeed(feed)}>
                    <Pencil size={14} />
                  </button>
                  <button class="feed-action feed-delete" title="删除订阅" disabled={refreshing} onClick={() => runAction(handleRemoveFeed(feed))}><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
          {!feeds.length && ready && <div class="sidebar-empty">暂无订阅</div>}
        </nav>
      </aside>

      <section class="items-pane">
        <div class="items-header">
          <button class="mobile-back icon-button" title="订阅列表" onClick={() => setMobilePane("feeds")}><ArrowLeft size={19} /></button>
          <div class="items-header-title">
            <h1>{selectedFeed ? feedName(selectedFeed) : (filter === "unread" ? "未读" : filter === "starred" ? "收藏" : "全部文章")}</h1>
            <span>{visibleItems.length} 篇</span>
          </div>
          {selectedFeed && (
            <div class="items-header-actions">
              <button class="icon-button" title="全部标为已读" disabled={refreshing || selectedFeedUnread === 0} onClick={() => runAction(handleMarkFeedRead(selectedFeed))}>
                <ListChecks size={16} />
              </button>
              <button class="icon-button" title={`更新 ${feedName(selectedFeed)}`} disabled={refreshing} onClick={() => void handleRefresh(selectedFeed.id)}>
                <RefreshCw size={16} class={refreshScope === selectedFeed.id ? "spin" : ""} />
              </button>
              <button class="icon-button" title="重命名订阅" disabled={refreshing} onClick={() => setRenamingFeed(selectedFeed)}>
                <Pencil size={16} />
              </button>
              <button class="icon-button feed-delete" title="删除订阅" disabled={refreshing} onClick={() => runAction(handleRemoveFeed(selectedFeed))}>
                <Trash2 size={16} />
              </button>
            </div>
          )}
        </div>
        <label class="search-box">
          <Search size={16} />
          <input value={query} onInput={(event) => setQuery(event.currentTarget.value)} placeholder="搜索文章" />
          {query && <button title="清除搜索" onClick={() => setQuery("")}><X size={15} /></button>}
        </label>
        <div class={`item-list ${settings.showItemSnippet ? "" : "compact"}`} ref={itemListRef}>
          {(settings.storageMode==='backend'?visibleItems.slice(0,visibleLimit):visibleItems).map((item) => {
            const itemFeed = feedsById.get(item.feedId);
            const source = formatItemSource(filter, itemFeed ? feedName(itemFeed) : "", sourceHost(item));
            return <button class={`item-row ${selectedItemId === item.id ? "selected" : ""} ${item.read ? "read" : ""}`} key={item.id} onClick={() => runAction(chooseItem(item))}>
              <div class="item-meta">
                <span title={source}>{source}</span>
                <time>{formatDate(item.publishedAt)}</time>
              </div>
              <h2>
                {!item.read && <span class="unread-dot" title="未读" />}
                <span class="item-title-text">{item.title}</span>
              </h2>
              {settings.showItemSnippet && <p>{item.snippet}</p>}
              <div class="item-flags">
                {item.starred && <Star size={14} fill="currentColor" />}
              </div>
            </button>;
          })}
          {settings.storageMode==='backend' && visibleItems.length>visibleLimit && <button class="secondary-button" onClick={()=>setVisibleLimit(limit=>limit+200)}>加载更多（已显示 {visibleLimit} / {visibleItems.length}）</button>}
          {!visibleItems.length && ready && (
            <div class="empty-state">
              <Inbox size={30} />
              <strong>{feeds.length ? "这里暂时没有文章" : "添加第一个订阅源"}</strong>
              {!feeds.length && <button class="primary-button" onClick={() => setShowAdd(true)}><Plus size={17} />添加订阅</button>}
            </div>
          )}
        </div>
      </section>

      <main class="reader-pane">
        {selectedItem ? (
          <Article
            item={selectedItem}
            feed={feeds.find((entry) => entry.id === selectedItem.feedId)}
            onBack={() => setMobilePane("items")}
            onToggleStar={() => runAction(toggleStar(selectedItem))}
            onToggleRead={() => runAction(toggleRead(selectedItem))}
          />
        ) : (
          <div class="reader-empty">
            <img src="/icons/icon.svg" alt="" />
            <span>选择一篇文章</span>
          </div>
        )}
      </main>

      <div
        class="resize-handle resize-handle-feeds"
        role="separator"
        aria-label="调整订阅栏宽度"
        aria-orientation="vertical"
        aria-valuemin={Math.round(FEED_PANE_MIN * 100)}
        aria-valuemax={Math.round(FEED_PANE_MAX * 100)}
        aria-valuenow={Math.round(settings.feedPaneRatio * 100)}
        aria-valuetext={`${Math.round(settings.feedPaneRatio * 100)}%`}
        aria-disabled={settings.layoutLocked}
        tabIndex={settings.layoutLocked ? -1 : 0}
        onPointerDown={(event) => startResize("feeds", event)}
        onKeyDown={(event) => resizeWithKeyboard("feeds", event)}
      />
      <div
        class="resize-handle resize-handle-items"
        role="separator"
        aria-label="调整文章列表栏宽度"
        aria-orientation="vertical"
        aria-valuemin={Math.round(ITEM_PANE_MIN * 100)}
        aria-valuemax={Math.round(ITEM_PANE_MAX * 100)}
        aria-valuenow={Math.round(settings.itemPaneRatio * 100)}
        aria-valuetext={`${Math.round(settings.itemPaneRatio * 100)}%`}
        aria-disabled={settings.layoutLocked}
        tabIndex={settings.layoutLocked ? -1 : 0}
        onPointerDown={(event) => startResize("items", event)}
        onKeyDown={(event) => resizeWithKeyboard("items", event)}
      />

      <nav class="mobile-nav">
        <button class={mobilePane === "feeds" ? "active" : ""} onClick={() => setMobilePane("feeds")}><Rss size={19} /><span>订阅</span></button>
        <button class={mobilePane === "items" ? "active" : ""} onClick={() => setMobilePane("items")}><List size={19} /><span>文章</span></button>
        <button onClick={() => { setFilter("starred"); setMobilePane("items"); }}><Star size={19} /><span>收藏</span></button>
        <button onClick={() => setShowSettings(true)}><Settings size={19} /><span>设置</span></button>
      </nav>

      {refreshScope === "all" && refreshProgress && (
        <div class="global-refresh-overlay" role="status" aria-live="polite" aria-busy="true">
          <div class="global-refresh-status">
            <div class="global-refresh-heading">
              <LoaderCircle size={28} class="spin" />
              <div>
                <strong>正在刷新全部订阅</strong>
                <span>已完成 {refreshProgress.completed} / {refreshProgress.total} 个订阅源</span>
              </div>
            </div>
            <div class="global-refresh-source">
              <span>{refreshProgress.activeFeedNames.length ? "正在检查" : "状态"}</span>
              <strong title={refreshSourceLabel}>{refreshSourceLabel}</strong>
            </div>
            <progress
              class="global-refresh-progress"
              aria-label="刷新订阅进度"
              max={refreshProgress.total}
              value={refreshProgress.completed}
            />
          </div>
        </div>
      )}

      {showAdd && <AddFeedDialog onClose={() => setShowAdd(false)} onAdd={handleAddFeed} />}
      {renamingFeed && (
        <RenameFeedDialog
          feed={renamingFeed}
          onClose={() => setRenamingFeed(null)}
          onSave={handleRenameFeed}
        />
      )}
      {showSettings && (
        <SettingsDialog
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
          onSync={handleSettingsSync}
          onTest={testWebDav}
          onImport={handleImport}
          onExport={handleExport}
          onClear={handleClearData}
        />
      )}
      {settings.storageMode==='backend' && <div class="backend-status" role="status">{backendNotice || ('后端模式 · '+(backendStatus?.job.running?'后台正在抓取':backendStatus?.nextFetchAt?'下次抓取 '+new Date(backendStatus.nextFetchAt).toLocaleString():'暂无抓取计划'))}</div>}
      {toast && <div class="toast" role="status">{toast}</div>}
    </div>
  );
}

function NavItem(props: { icon: ComponentChildren; label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button class={props.active ? "active" : ""} onClick={props.onClick}>
      {props.icon}<span>{props.label}</span><strong>{props.count || ""}</strong>
    </button>
  );
}

function Article(props: {
  item: ItemRecord;
  feed?: FeedRecord;
  onBack: () => void;
  onToggleStar: () => void;
  onToggleRead: () => void;
}) {
  const content = useMemo(
    () => renderArticleContent(props.item.content, props.item.url),
    [props.item.content, props.item.url],
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  // 切换文章后，正文滚动位置回到顶部。
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [props.item.id]);

  return (
    <article class="article">
      <div class="article-toolbar">
        <button class="mobile-back icon-button" title="返回文章列表" onClick={props.onBack}><ArrowLeft size={19} /></button>
        <span>{props.feed ? feedName(props.feed) : sourceHost(props.item)}</span>
        <div>
          <button class="icon-button" title={props.item.read ? "标为未读" : "标为已读"} onClick={props.onToggleRead}>
            {props.item.read ? <Mail size={18} /> : <MailOpen size={18} />}
          </button>
          <button class={`icon-button ${props.item.starred ? "accent" : ""}`} title={props.item.starred ? "取消收藏" : "收藏"} onClick={props.onToggleStar}>
            <Star size={18} fill={props.item.starred ? "currentColor" : "none"} />
          </button>
          {props.item.url && <a class="icon-button" title="打开原文" href={props.item.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} /></a>}
        </div>
      </div>
      <div class="article-scroll" ref={scrollRef}>
        <header class="article-header">
          <div class="article-source">{props.item.author || (props.feed ? feedName(props.feed) : sourceHost(props.item))}</div>
          <h1>{props.item.title}</h1>
          <time>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "long", timeStyle: "short" }).format(props.item.publishedAt)}</time>
        </header>
        <div class="article-body">{content.length ? content : <p>{props.item.snippet}</p>}</div>
        {props.item.url && <a class="original-link" href={props.item.url} target="_blank" rel="noopener noreferrer">阅读原文 <ExternalLink size={15} /></a>}
      </div>
    </article>
  );
}

function AddFeedDialog(props: { onClose: () => void; onAdd: (url: string) => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div class="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <form class="dialog add-dialog" onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        void props.onAdd(url).catch((reason) => {
          setBusy(false);
          setError(reason instanceof Error ? reason.message : String(reason));
        });
      }}>
        <div class="dialog-title"><div><Rss size={20} /><h2>添加订阅</h2></div><button type="button" class="icon-button" title="关闭" onClick={props.onClose}><X size={18} /></button></div>
        <label class="field"><span>RSS 或 Atom URL</span><input type="url" required autoFocus value={url} onInput={(event) => setUrl(event.currentTarget.value)} placeholder="https://example.com/feed.xml" /></label>
        {error && <div class="form-error">{error}</div>}
        <div class="dialog-actions"><button type="button" class="secondary-button" onClick={props.onClose}>取消</button><button class="primary-button" disabled={busy}>{busy ? <LoaderCircle size={17} class="spin" /> : <Plus size={17} />}添加</button></div>
      </form>
    </div>
  );
}

function RenameFeedDialog(props: {
  feed: FeedRecord;
  onClose: () => void;
  onSave: (customName: string) => Promise<void>;
}) {
  const [customName, setCustomName] = useState(props.feed.customName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div class="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <form class="dialog add-dialog" onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        void props.onSave(customName).catch((reason) => {
          setBusy(false);
          setError(reason instanceof Error ? reason.message : String(reason));
        });
      }}>
        <div class="dialog-title"><div><Pencil size={20} /><h2>重命名订阅</h2></div><button type="button" class="icon-button" title="关闭" onClick={props.onClose}><X size={18} /></button></div>
        <label class="field">
          <span>自定义名称（留空显示源标题）</span>
          <input
            autoFocus
            value={customName}
            onInput={(event) => setCustomName(event.currentTarget.value)}
            placeholder={props.feed.title}
          />
        </label>
        {error && <div class="form-error">{error}</div>}
        <div class="dialog-actions">
          <button type="button" class="secondary-button" onClick={props.onClose}>取消</button>
          <button class="primary-button" disabled={busy}>{busy ? <LoaderCircle size={17} class="spin" /> : <Check size={17} />}保存</button>
        </div>
      </form>
    </div>
  );
}

function SettingsDialog(props: {
  settings: AppSettings;
  onClose: () => void;
  onSave: (settings: AppSettings, config?:BackendConfig) => Promise<void>;
  onSync: (settings: AppSettings) => Promise<AppSettings>;
  onTest: (settings: AppSettings) => Promise<string>;
  onImport: (file: File) => Promise<void>;
  onExport: () => void;
  onClear: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(props.settings);
  const [showPassword, setShowPassword] = useState(false);
  const [showBackendToken, setShowBackendToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [webdavRetry, setWebdavRetry] = useState(0);
  const [backendConfig,setBackendConfig]=useState<BackendConfig|null>(null);
  const [saving,setSaving]=useState(false);
  const [backendInfo,setBackendInfo]=useState('');
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendRetry, setBackendRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setBackendConfig(null);
    setBackendInfo('');
    if (draft.storageMode !== 'backend' || !draft.backendUrl.trim() || !draft.backendToken.trim()) {
      setBackendLoading(false);
      return;
    }
    setBackendLoading(true);
    setBackendInfo('正在读取后端设置…');
    const timer = window.setTimeout(() => {
      void testBackend(draft).then(status => {
        if (cancelled) return;
        setBackendConfig(status.config);
        setBackendInfo('连接成功 · 已用 ' + (status.storageBytes / 1024 / 1024).toFixed(1) + ' MB');
      }).catch(error => {
        if (!cancelled) setBackendInfo(error instanceof Error ? error.message : String(error));
      }).finally(() => {
        if (!cancelled) setBackendLoading(false);
      });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [draft.storageMode, draft.backendUrl, draft.backendToken, backendRetry]);
  const save=async()=>{
    setSaving(true);setTestResult('');
    try {
      if (draft.storageMode === 'backend' && (!backendConfig || backendLoading)) throw new Error('请先等待后端设置读取成功');
      await props.onSave(draft,draft.storageMode==='backend'?backendConfig??undefined:undefined);
    }
    catch(error){setTestResult(error instanceof Error?error.message:String(error));}
    finally{setSaving(false);}
  };
  const fileInput = useRef<HTMLInputElement>(null);
  const update = (patch: Partial<AppSettings>) => setDraft((current) => ({ ...current, ...patch }));
  const closeWithoutSaving = () => {
    applyAppearance(props.settings);
    props.onClose();
  };
  useEffect(() => {
    applyAppearance(draft);
  }, [draft.theme, draft.colorScheme, draft.customAccent]);
  useEffect(() => {
    let cancelled = false;
    setTestResult('');
    if (draft.storageMode !== 'local' || !draft.webdavUrl.trim()) {
      setTesting(false);
      return;
    }
    setTesting(true);
    setTestResult('正在测试连接…');
    const timer = window.setTimeout(() => {
      const startedAt = Date.now();
      void (async () => {
        try {
          const result = await props.onTest(draft);
          if (!cancelled) setTestResult(result);
        } catch (error) {
          if (!cancelled) setTestResult(error instanceof Error ? error.message : String(error));
        } finally {
          await keepFeedbackVisible(startedAt);
          if (!cancelled) setTesting(false);
        }
      })();
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [draft.storageMode, draft.webdavUrl, draft.webdavUsername, draft.webdavPassword, webdavRetry]);
  const handleSync = async () => {
    const startedAt = Date.now();
    setSyncing(true);
    setTestResult("");
    try {
      setDraft(await props.onSync(draft));
    } catch (error) {
      setTestResult(error instanceof Error ? error.message : String(error));
    } finally {
      await keepFeedbackVisible(startedAt);
      setSyncing(false);
    }
  };
  return (
    <div class="dialog-backdrop settings-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeWithoutSaving()}>
      <div class="dialog settings-dialog">
        <div class="dialog-title"><div><Settings size={20} /><h2>设置</h2></div><button class="icon-button" title="关闭" onClick={closeWithoutSaving}><X size={18} /></button></div>
        <div class="settings-scroll">
          <section class="settings-section">
            <div class="section-heading"><Cloud size={18}/><div><h3>数据模式</h3><p>本地数据和后端缓存独立保存，切换不会合并或删除原有数据。</p></div></div>
            <div class="segmented data-mode-switch" aria-label="数据模式">
              <button class={draft.storageMode==='local'?'active':''} onClick={()=>{update({storageMode:'local'});setShowBackendToken(false);}}>本地</button>
              <button class={draft.storageMode==='backend'?'active':''} onClick={()=>update({storageMode:'backend'})}>Dox Reader Backend</button>
            </div>
            {draft.storageMode==='backend' && <>
              <label class="field"><span>地址</span><input type="url" value={draft.backendUrl} placeholder="https://dox-reader-backend.example.workers.dev" onInput={event=>{update({backendUrl:event.currentTarget.value});setBackendConfig(null);setBackendInfo('');}}/></label>
              <div class="field">
                <label for="backend-token">访问令牌</label>
                <div class="password-field">
                  <input id="backend-token" type={showBackendToken ? "text" : "password"} autoComplete="off" value={draft.backendToken} onInput={event=>{update({backendToken:event.currentTarget.value});setBackendConfig(null);setBackendInfo('');}}/>
                  <button type="button" class="password-toggle" title={showBackendToken ? "隐藏访问令牌" : "查看访问令牌"} aria-label={showBackendToken ? "隐藏访问令牌" : "查看访问令牌"} aria-pressed={showBackendToken} onClick={()=>setShowBackendToken(visible=>!visible)}>{showBackendToken ? <EyeOff size={17}/> : <Eye size={17}/>}</button>
                </div>
              </div>
              <button class="secondary-button" disabled={backendLoading||saving||!draft.backendUrl||!draft.backendToken} onClick={()=>setBackendRetry(value=>value+1)}>{backendLoading?'正在连接':'重新连接'}</button>
              {backendInfo && <div class="connection-result">{backendInfo}</div>}
                <div class="field-row">
                  <label class="field"><span>抓取间隔（分钟）</span><input type="number" min="30" max="10080" step="1" placeholder="—" disabled={!backendConfig || backendLoading} value={backendConfig?.intervalMinutes ?? ''} onInput={event=>{if(backendConfig) setBackendConfig({...backendConfig,intervalMinutes:Number(event.currentTarget.value)});}}/></label>
                  <label class="field"><span>全库最新文章上限</span><input type="number" min="100" max="10000" step="100" placeholder="—" disabled={!backendConfig || backendLoading} value={backendConfig?.maxArticles ?? ''} onInput={event=>{if(backendConfig) setBackendConfig({...backendConfig,maxArticles:Number(event.currentTarget.value)});}}/></label>
                </div>
            </>}
          </section>
          {draft.storageMode==='local' && <section class="settings-section">
            <div class="section-heading"><Cloud size={18} /><div><h3>WebDAV 同步</h3><p>订阅、文章状态与偏好设置</p></div></div>
            <label class="field"><span>WebDAV URL 前缀</span><input type="url" value={draft.webdavUrl} onInput={(event) => update({ webdavUrl: event.currentTarget.value })} placeholder="https://dav.example.com/remote.php/dav/files/user/" /></label>
            <div class="field-row">
              <label class="field"><span>用户名</span><input value={draft.webdavUsername} onInput={(event) => update({ webdavUsername: event.currentTarget.value })} autoComplete="username" /></label>
              <div class="field"><label for="webdav-password">应用密码</label><div class="password-field"><input id="webdav-password" type={showPassword ? "text" : "password"} value={draft.webdavPassword} onInput={(event) => update({ webdavPassword: event.currentTarget.value })} autoComplete="current-password" /><button type="button" class="password-toggle" title={showPassword ? "隐藏应用密码" : "查看应用密码"} aria-label={showPassword ? "隐藏应用密码" : "查看应用密码"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>
            </div>
            {testResult && <div class="connection-result">{testResult}</div>}
            <div class="inline-actions">
              <button class="secondary-button" aria-busy={testing} disabled={testing || syncing || !draft.webdavUrl} onClick={() => setWebdavRetry(value => value + 1)}>{testing ? <LoaderCircle size={16} class="spin" /> : <Wifi size={16} />}{testing ? "正在测试" : "测试连接"}</button>
              <button class="secondary-button" aria-busy={syncing} disabled={testing || syncing || !draft.webdavUrl} onClick={() => void handleSync()}>{syncing ? <LoaderCircle size={16} class="spin" /> : <Upload size={16} />}{syncing ? "正在同步" : "立即同步"}</button>
            </div>
          </section>}
          <section class="settings-section">
            <div class="section-heading"><Settings size={18} /><div><h3>外观</h3><p>明暗模式与配色 · {draft.storageMode==='local'?'可通过 WebDAV 同步':'保存在当前设备'}</p></div></div>
            <div class="segmented" aria-label="主题">
              {(["system", "light", "dark"] as const).map((theme) => <button key={theme} class={draft.theme === theme ? "active" : ""} onClick={() => update({ theme })}>{theme === "system" ? "跟随系统" : theme === "light" ? "浅色" : "深色"}</button>)}
            </div>
            <div class="scheme-groups">
              {COLOR_SCHEME_GROUPS.map((group) => (
                <div class="scheme-group" key={group.label}>
                  <span class="scheme-group-label">{group.label}</span>
                  <div class="scheme-grid" aria-label={`${group.label}配色`}>
                    {group.schemes.map((scheme) => (
                      <button key={scheme.id} type="button" class={`scheme-option ${draft.colorScheme === scheme.id ? "active" : ""}`} onClick={() => update({ colorScheme: scheme.id })} title={scheme.label} aria-pressed={draft.colorScheme === scheme.id}>
                        <span class="scheme-swatch" aria-hidden="true">
                          <span style={{ background: scheme.light }} />
                          <span style={{ background: scheme.dark }} />
                          <i style={{ background: scheme.accent }} />
                        </span>
                        <span class="scheme-label">{scheme.label}</span>
                        {draft.colorScheme === scheme.id && <Check class="scheme-check" size={14} />}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div class="accent-control">
              <label class="toggle-row">
                <span>自定义强调色</span>
                <input type="checkbox" checked={Boolean(draft.customAccent)} onChange={(event) => {
                  const scheme = COLOR_SCHEME_GROUPS
                    .flatMap((group) => group.schemes)
                    .find((option) => option.id === draft.colorScheme);
                  const useDarkAccent = draft.theme === "dark"
                    || (draft.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
                  const schemeAccent = useDarkAccent
                    ? scheme?.darkAccent ?? "#c5c6c9"
                    : scheme?.accent ?? "#3f4143";
                  update({ customAccent: event.currentTarget.checked ? schemeAccent : "" });
                }} />
              </label>
              {draft.customAccent && (
                <label class="accent-picker">
                  <input type="color" value={draft.customAccent} aria-label="强调色" onInput={(event) => update({ customAccent: event.currentTarget.value })} />
                  <span><strong>选择颜色</strong><small>{draft.customAccent.toUpperCase()}</small></span>
                </label>
              )}
            </div>
          </section>
          <section class="settings-section">
            <div class="section-heading"><BookOpen size={18} /><div><h3>阅读</h3><p>文章列表与正文显示 · 跨设备同步</p></div></div>
            <label class="toggle-row">
              <span>文章列表显示简介</span>
              <input type="checkbox" checked={draft.showItemSnippet} onChange={(event) => update({ showItemSnippet: event.currentTarget.checked })} />
            </label>
          </section>
          <section class="settings-section">
            <div class="section-heading"><FileUp size={18} /><div><h3>订阅迁移</h3><p>标准 OPML 文件</p></div></div>
            <div class="inline-actions">
              <button class="secondary-button" onClick={() => fileInput.current?.click()}><Download size={16} />导入 OPML</button>
              <button class="secondary-button" onClick={props.onExport}><Upload size={16} />导出 OPML</button>
              <input ref={fileInput} type="file" accept=".opml,.xml,text/x-opml,text/xml" hidden onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void props.onImport(file); }} />
            </div>
          </section>
          <section class="settings-section danger-section">
            <button class="danger-button" onClick={() => void props.onClear()}><Trash2 size={16} />清除本机数据</button>
          </section>
        </div>
        {testResult && draft.storageMode==='backend' && <div class="connection-result">{testResult}</div>}
        <div class="dialog-actions"><button class="secondary-button" disabled={saving} onClick={closeWithoutSaving}>取消</button><button class="primary-button" disabled={saving||testing||(draft.storageMode==='backend'&&(!backendConfig||backendLoading))} onClick={()=>void save()}><Check size={17} />{saving?'正在保存':'保存'}</button></div>
      </div>
    </div>
  );
}
