import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCheck,
  Cloud,
  CloudOff,
  Download,
  ExternalLink,
  FileUp,
  Inbox,
  List,
  LoaderCircle,
  Lock,
  LockOpen,
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
  getLastRefreshAllAt,
  listFeeds,
  listItems,
  markAllRead,
  markFeedRead,
  removeFeed,
  renameFeed,
  setItemState,
  setLastRefreshAllAt,
} from "./database";
import { refreshFeed, refreshFeeds } from "./feed-service";
import type { AppSettings, ColorScheme, FeedRecord, ItemRecord } from "./model";
import { DEFAULT_SETTINGS } from "./model";
import { createOpml, parseOpml } from "./opml";
import { applyAppearance, loadSettings, saveSettings } from "./settings";
import { syncWithWebDav, testWebDav } from "./webdav";

type Filter = "all" | "unread" | "starred" | string;
type MobilePane = "feeds" | "items" | "reader";
type SyncStatus = "idle" | "syncing" | "ok" | "error";
type ResizeTarget = "feeds" | "items";

const COLOR_SCHEMES: ReadonlyArray<{ id: ColorScheme; label: string; swatch: string; dot: string }> = [
  { id: "ink", label: "墨绿", swatch: "#e9ece8", dot: "#c8423d" },
  { id: "ocean", label: "海洋蓝", swatch: "#e4eaf2", dot: "#2563eb" },
  { id: "violet", label: "紫罗兰", swatch: "#eae5f1", dot: "#7c3aed" },
  { id: "amber", label: "暖橙", swatch: "#efe7d8", dot: "#c05621" },
  { id: "graphite", label: "石墨灰", swatch: "#e6e6e6", dot: "#4f6176" },
];

const FEED_PANE_MIN = 0.13;
const FEED_PANE_MAX = 0.32;
const ITEM_PANE_MIN = 0.22;
const ITEM_PANE_MAX = 0.5;
const READER_PANE_MIN = 0.3;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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

export function App() {
  const [feeds, setFeeds] = useState<FeedRecord[]>([]);
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<MobilePane>("items");
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [renamingFeed, setRenamingFeed] = useState<FeedRecord | null>(null);
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshScope, setRefreshScope] = useState<"all" | string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [toast, setToast] = useState("");
  const [ready, setReady] = useState(false);
  const syncTimer = useRef<number | null>(null);
  const itemListRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    const [nextFeeds, nextItems] = await Promise.all([listFeeds(), listItems("all")]);
    setFeeds(nextFeeds);
    setItems(nextItems);
  }, []);

  const performSync = useCallback(async (currentSettings = settings, quiet = false) => {
    if (!currentSettings.webdavUrl) return;
    setSyncStatus("syncing");
    try {
      const result = await syncWithWebDav(currentSettings);
      await loadData();
      setSyncStatus("ok");
      if (!quiet) setToast(`已同步 ${result.subscriptions} 个订阅和 ${result.itemStates} 条状态`);
    } catch (error) {
      setSyncStatus("error");
      if (!quiet) setToast(error instanceof Error ? error.message : String(error));
    }
  }, [loadData, settings]);

  const queueSync = useCallback(() => {
    if (!settings.webdavUrl) return;
    if (syncTimer.current !== null) window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => void performSync(settings, true), 1400);
  }, [performSync, settings]);

  useEffect(() => {
    void (async () => {
      const saved = await loadSettings();
      setSettingsState(saved);
      applyAppearance(saved);
      await loadData();
      setReady(true);
      if (saved.webdavUrl) await performSync(saved, true);
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

  // 切换订阅源/视图后，文章列表滚动位置回到顶部。
  useLayoutEffect(() => {
    if (itemListRef.current) itemListRef.current.scrollTop = 0;
  }, [filter]);

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (filter === "unread" && item.read) return false;
      if (filter === "starred" && !item.starred) return false;
      if (!["all", "unread", "starred"].includes(filter) && item.feedId !== filter) return false;
      return !needle || `${item.title} ${item.author} ${item.snippet}`.toLocaleLowerCase().includes(needle);
    });
  }, [filter, items, query]);

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;
  const selectedFeed = feeds.find((feed) => feed.id === filter);
  const selectedFeedUnread = selectedFeed
    ? items.filter((item) => item.feedId === selectedFeed.id && !item.read).length
    : 0;
  const unreadCount = items.filter((item) => !item.read).length;
  const starredCount = items.filter((item) => item.starred).length;

  async function chooseItem(item: ItemRecord) {
    setSelectedItemId(item.id);
    setMobilePane("reader");
    if (!item.read) {
      await setItemState(item.id, { read: true });
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry));
      queueSync();
    }
  }

  async function toggleStar(item: ItemRecord) {
    await setItemState(item.id, { starred: !item.starred });
    setItems((current) => current.map((entry) =>
      entry.id === item.id ? { ...entry, starred: !entry.starred } : entry
    ));
    queueSync();
  }

  async function toggleRead(item: ItemRecord) {
    await setItemState(item.id, { read: !item.read });
    setItems((current) => current.map((entry) =>
      entry.id === item.id ? { ...entry, read: !entry.read } : entry
    ));
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
      const result = await refreshFeeds(targets);
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
    }
  }

  async function maybeAutoRefresh() {
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
      const count = await refreshFeed(feed.id);
      setToast(`已添加订阅，获取 ${count} 篇文章`);
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

  async function handleSaveSettings(next: AppSettings) {
    await saveSettings(next);
    setSettingsState(next);
    applyAppearance(next);
    setShowSettings(false);
    setToast("设置已保存");
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
    if (!confirm("清除本机的订阅、文章和阅读状态？WebDAV 文件不会被删除。")) return;
    await clearAllData();
    setFilter("all");
    setSelectedItemId(null);
    await loadData();
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
          <button class="icon-button" title="同步" disabled={!settings.webdavUrl || syncStatus === "syncing"} onClick={() => void performSync()}>
            {syncIcon}
          </button>
          <button class="icon-button" title="全部标为已读" disabled={refreshing || unreadCount === 0} onClick={() => void handleMarkAllRead()}>
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
          <NavItem icon={<Inbox size={17} />} label="全部文章" count={items.length} active={filter === "all"} onClick={() => { setFilter("all"); setMobilePane("items"); }} />
          <NavItem icon={<Check size={17} />} label="未读" count={unreadCount} active={filter === "unread"} onClick={() => { setFilter("unread"); setMobilePane("items"); }} />
          <NavItem icon={<Star size={17} />} label="收藏" count={starredCount} active={filter === "starred"} onClick={() => { setFilter("starred"); setMobilePane("items"); }} />
        </nav>
        <div class="pane-heading subscriptions-heading">
          <span>订阅</span>
          <button class="icon-button small" title="添加订阅" onClick={() => setShowAdd(true)}><Plus size={16} /></button>
        </div>
        <nav class="feed-nav feed-list">
          {feeds.map((feed) => {
            const count = items.filter((item) => item.feedId === feed.id && !item.read).length;
            return (
              <div class={`feed-row ${filter === feed.id ? "active" : ""}`} key={feed.id}>
                <button onClick={() => { setFilter(feed.id); setMobilePane("items"); }}>
                  {count > 0 ? <strong class="feed-unread">{count > 99 ? "99+" : count}</strong> : <Rss size={16} />}
                  <span>{feedName(feed)}</span>
                </button>
                <div class="feed-row-actions">
                  <button class="feed-action" title="全部标为已读" disabled={refreshing || count === 0} onClick={() => void handleMarkFeedRead(feed)}>
                    <CheckCheck size={14} />
                  </button>
                  <button class="feed-action" title={`刷新 ${feedName(feed)}`} disabled={refreshing} onClick={() => void handleRefresh(feed.id)}>
                    <RefreshCw size={14} class={refreshScope === feed.id ? "spin" : ""} />
                  </button>
                  <button class="feed-action" title="重命名订阅" disabled={refreshing} onClick={() => setRenamingFeed(feed)}>
                    <Pencil size={14} />
                  </button>
                  <button class="feed-action feed-delete" title="删除订阅" disabled={refreshing} onClick={() => void handleRemoveFeed(feed)}><Trash2 size={14} /></button>
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
              <button class="icon-button" title="全部标为已读" disabled={refreshing || selectedFeedUnread === 0} onClick={() => void handleMarkFeedRead(selectedFeed)}>
                <CheckCheck size={18} />
              </button>
              <button class="icon-button" title={`更新 ${feedName(selectedFeed)}`} disabled={refreshing} onClick={() => void handleRefresh(selectedFeed.id)}>
                <RefreshCw size={18} class={refreshScope === selectedFeed.id ? "spin" : ""} />
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
          {visibleItems.map((item) => (
            <button class={`item-row ${selectedItemId === item.id ? "selected" : ""} ${item.read ? "read" : ""}`} key={item.id} onClick={() => void chooseItem(item)}>
              <div class="item-meta">
                <span>{sourceHost(item)}</span>
                <time>{formatDate(item.publishedAt)}</time>
              </div>
              <h2>{item.title}</h2>
              {settings.showItemSnippet && <p>{item.snippet}</p>}
              <div class="item-flags">
                {!item.read && <span class="unread-dot" title="未读" />}
                {item.starred && <Star size={14} fill="currentColor" />}
              </div>
            </button>
          ))}
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
            onToggleStar={() => void toggleStar(selectedItem)}
            onToggleRead={() => void toggleRead(selectedItem)}
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

      {refreshScope === "all" && (
        <div class="global-refresh-overlay" role="status" aria-live="assertive" aria-busy="true">
          <LoaderCircle size={28} class="spin" />
          <strong>正在刷新全部订阅</strong>
          <span>{feeds.length} 个订阅源</span>
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
          onSync={async (draft) => { await saveSettings(draft); setSettingsState(draft); await performSync(draft); }}
          onTest={testWebDav}
          onImport={handleImport}
          onExport={handleExport}
          onClear={handleClearData}
        />
      )}
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
            {props.item.read ? <CheckCheck size={18} /> : <Check size={18} />}
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
  onSave: (settings: AppSettings) => Promise<void>;
  onSync: (settings: AppSettings) => Promise<void>;
  onTest: (settings: AppSettings) => Promise<string>;
  onImport: (file: File) => Promise<void>;
  onExport: () => void;
  onClear: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(props.settings);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const update = (patch: Partial<AppSettings>) => setDraft((current) => ({ ...current, ...patch }));
  return (
    <div class="dialog-backdrop settings-backdrop" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <div class="dialog settings-dialog">
        <div class="dialog-title"><div><Settings size={20} /><h2>设置</h2></div><button class="icon-button" title="关闭" onClick={props.onClose}><X size={18} /></button></div>
        <div class="settings-scroll">
          <section class="settings-section">
            <div class="section-heading"><Cloud size={18} /><div><h3>WebDAV 同步</h3><p>订阅、已读和收藏状态</p></div></div>
            <label class="field"><span>WebDAV URL 前缀</span><input type="url" value={draft.webdavUrl} onInput={(event) => update({ webdavUrl: event.currentTarget.value })} placeholder="https://dav.example.com/remote.php/dav/files/user/" /></label>
            <div class="field-row">
              <label class="field"><span>用户名</span><input value={draft.webdavUsername} onInput={(event) => update({ webdavUsername: event.currentTarget.value })} autoComplete="username" /></label>
              <label class="field"><span>应用密码</span><input type="password" value={draft.webdavPassword} onInput={(event) => update({ webdavPassword: event.currentTarget.value })} autoComplete="current-password" /></label>
            </div>
            {testResult && <div class="connection-result">{testResult}</div>}
            <div class="inline-actions">
              <button class="secondary-button" disabled={testing || !draft.webdavUrl} onClick={() => {
                setTesting(true); setTestResult("");
                void props.onTest(draft).then(setTestResult).catch((error) => setTestResult(error instanceof Error ? error.message : String(error))).finally(() => setTesting(false));
              }}>{testing ? <LoaderCircle size={16} class="spin" /> : <Wifi size={16} />}测试连接</button>
              <button class="secondary-button" disabled={!draft.webdavUrl} onClick={() => void props.onSync(draft)}><Upload size={16} />立即同步</button>
            </div>
          </section>
          <section class="settings-section">
            <div class="section-heading"><Settings size={18} /><div><h3>外观</h3><p>明暗模式与配色，深色/浅色自动适配</p></div></div>
            <div class="segmented" aria-label="主题">
              {(["system", "light", "dark"] as const).map((theme) => <button key={theme} class={draft.theme === theme ? "active" : ""} onClick={() => update({ theme })}>{theme === "system" ? "跟随系统" : theme === "light" ? "浅色" : "深色"}</button>)}
            </div>
            <div class="scheme-grid" aria-label="配色">
              {COLOR_SCHEMES.map((scheme) => (
                <button key={scheme.id} type="button" class={`scheme-option ${draft.colorScheme === scheme.id ? "active" : ""}`} onClick={() => update({ colorScheme: scheme.id })} title={scheme.label}>
                  <span class="scheme-swatch" style={{ background: scheme.swatch }}><i style={{ background: scheme.dot }} /></span>
                  <span class="scheme-label">{scheme.label}</span>
                </button>
              ))}
            </div>
          </section>
          <section class="settings-section">
            <div class="section-heading"><BookOpen size={18} /><div><h3>阅读</h3><p>文章列表与正文显示</p></div></div>
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
        <div class="dialog-actions"><button class="secondary-button" onClick={props.onClose}>取消</button><button class="primary-button" onClick={() => void props.onSave(draft)}><Check size={17} />保存</button></div>
      </div>
    </div>
  );
}
