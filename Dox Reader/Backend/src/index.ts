import { DurableObject } from "cloudflare:workers";
import { timingSafeEqual } from "node:crypto";
import { parseFeedXml } from "./shared/feed-parser";
import type { FeedRecord, ItemRecord } from "./shared/model";
import {
  type Limits,
  RETENTION_FULL_MESSAGE,
  boundedContent,
  clampConfig,
  feedUrl,
  limitedText,
  planName,
  resolveLimits,
  validateConfig,
} from "./policy";

type Bindings = Env & { BACKEND_TOKEN?: string; PLAN?: string };
const FEED_FETCH_TIMEOUT_MS = 90_000;
const FETCH_LEASE_MS = FEED_FETCH_TIMEOUT_MS + 30_000;
const FEED_USER_AGENT = "Dox-Reader/1.1 (+https://github.com/aenerv7/Dox)";
// 变更日志每次最多下发多少条；保留条数决定客户端还能不能增量同步。
const CHANGE_PAGE = 200;
const MAX_CHANGES = 50_000;
// SQLite 单条语句最多 100 个绑定参数，按块查询时留余量。
const SQL_PARAM_LIMIT = 90;
type Row = {
  id: string;
  url: string;
  data: string;
  due: number;
  etag: string;
  modified: string;
  failures: number;
};
type Job = {
  running: boolean;
  completed: number;
  total: number;
  errors: string[];
  updated: number;
  startedAt: number;
};
const emptyJob = (): Job => ({
  running: false,
  completed: 0,
  total: 0,
  errors: [],
  updated: 0,
  startedAt: 0,
});
// 淘汰范围：抓取与字节预算只删未收藏文章，收藏是用户资产；
// 只有用户确认调低上限（或档位降级收紧上限）时才连收藏一起删，否则总数会永久高于上限。
enum Evict {
  ExceptStarred,
  All,
}

export class ReaderLibrary extends DurableObject<Bindings> {
  // 档位在部署时由 wrangler.jsonc 的 PLAN 变量声明；后端不会自动升级套餐。
  private readonly limits: Limits;
  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env);
    this.limits = resolveLimits(env.PLAN);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS feeds (id TEXT PRIMARY KEY, url TEXT UNIQUE NOT NULL, data TEXT NOT NULL,
        due INTEGER NOT NULL, etag TEXT NOT NULL DEFAULT '', modified TEXT NOT NULL DEFAULT '', failures INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS feeds_due ON feeds(due);
      CREATE TABLE IF NOT EXISTS articles (id TEXT PRIMARY KEY, feedId TEXT NOT NULL, publishedAt INTEGER NOT NULL,
        data TEXT NOT NULL, content TEXT NOT NULL, bytes INTEGER NOT NULL, read INTEGER NOT NULL DEFAULT 0, starred INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS articles_date ON articles(publishedAt DESC, id DESC);
      CREATE INDEX IF NOT EXISTS articles_feed ON articles(feedId);
      CREATE TABLE IF NOT EXISTS totals (id INTEGER PRIMARY KEY, count INTEGER NOT NULL, bytes INTEGER NOT NULL);
      INSERT OR IGNORE INTO totals VALUES(1,0,0);
      CREATE TRIGGER IF NOT EXISTS article_insert AFTER INSERT ON articles BEGIN UPDATE totals SET count=count+1,bytes=bytes+NEW.bytes WHERE id=1; END;
      CREATE TRIGGER IF NOT EXISTS article_delete AFTER DELETE ON articles BEGIN UPDATE totals SET count=count-1,bytes=bytes-OLD.bytes WHERE id=1; END;
      CREATE TABLE IF NOT EXISTS changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, id TEXT NOT NULL);
    `);
  }
  private get<T>(key: string, fallback: T): T {
    const rows = this.ctx.storage.sql
      .exec<{ value: string }>("SELECT value FROM meta WHERE key=?", key)
      .toArray();
    return rows.length ? JSON.parse(rows[0].value) : fallback;
  }
  private put(key: string, value: unknown) {
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO meta VALUES (?,?)",
      key,
      JSON.stringify(value),
    );
  }
  private changed() {
    this.put("revision", this.get("revision", 0) + 1);
  }
  // 变更日志是客户端的增量同步来源：seq 单调递增，客户端只记水位。
  private recordChange(kind: string, id: string) {
    this.ctx.storage.sql.exec(
      "INSERT INTO changes(kind,id) VALUES (?,?)",
      kind,
      id,
    );
  }
  private seqRange() {
    const row = this.ctx.storage.sql
      .exec<{ min: number | null; max: number | null }>(
        "SELECT MIN(seq) AS min, MAX(seq) AS max FROM changes",
      )
      .one();
    // 日志为空时 minSeq 取 0，客户端不会因为“落后于已裁剪的日志”而白白全量同步。
    return { minSeq: row.min ?? row.max ?? 0, maxSeq: row.max ?? 0 };
  }
  private trimChanges() {
    const total = this.ctx.storage.sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM changes")
      .one().n;
    const excess = total - MAX_CHANGES;
    if (excess > 0)
      this.ctx.storage.sql.exec(
        "DELETE FROM changes WHERE seq IN (SELECT seq FROM changes ORDER BY seq LIMIT ?)",
        excess,
      );
  }
  private statesByIds(ids: string[]) {
    const states: { id: string; read: boolean; starred: boolean }[] = [];
    for (let start = 0; start < ids.length; start += SQL_PARAM_LIMIT) {
      const slice = ids.slice(start, start + SQL_PARAM_LIMIT);
      const rows = this.ctx.storage.sql
        .exec<{ id: string; read: number; starred: number }>(
          `SELECT id,read,starred FROM articles WHERE id IN (${slice.map(() => "?").join(",")})`,
          ...slice,
        )
        .toArray();
      for (const row of rows)
        states.push({ id: row.id, read: !!row.read, starred: !!row.starred });
    }
    return states;
  }
  private itemsByIds(ids: string[]) {
    const items: ItemRecord[] = [];
    for (let start = 0; start < ids.length; start += SQL_PARAM_LIMIT) {
      const slice = ids.slice(start, start + SQL_PARAM_LIMIT);
      const rows = this.ctx.storage.sql
        .exec<{ data: string; read: number; starred: number }>(
          `SELECT data,read,starred FROM articles WHERE id IN (${slice.map(() => "?").join(",")})`,
          ...slice,
        )
        .toArray();
      for (const row of rows)
        items.push({
          ...JSON.parse(row.data),
          content: "",
          read: !!row.read,
          starred: !!row.starred,
        });
    }
    return items;
  }
  private config() {
    return clampConfig(this.get("config", this.limits.defaultConfig), this.limits);
  }
  private totals() {
    return this.ctx.storage.sql
      .exec<{ count: number; bytes: number }>("SELECT count,bytes FROM totals WHERE id=1")
      .one();
  }
  // 保留空间按“收藏 / 未收藏”分开统计：只有未收藏的文章可以被淘汰。
  private tallies() {
    const totals = this.totals();
    const starred = this.ctx.storage.sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM articles WHERE starred=1")
      .one().n;
    return { ...totals, starred, evictable: totals.count - starred };
  }
  private oldestEvictable() {
    return this.ctx.storage.sql
      .exec<{
        publishedAt: number;
        id: string;
      }>("SELECT publishedAt,id FROM articles WHERE starred=0 ORDER BY publishedAt,id LIMIT 1")
      .toArray()[0];
  }
  // 保留窗口已满（篇数或字节）：新文章必须先淘汰一篇未收藏的旧文章。
  private full() {
    const totals = this.totals();
    return (
      totals.count >= this.config().maxArticles ||
      totals.bytes > this.limits.maxLibraryBytes
    );
  }
  // 收藏占满全部保留空间后无法再淘汰，只能停止收录；客户端据此提示用户。
  private retention() {
    const { count, starred, evictable } = this.tallies();
    return {
      articles: count,
      starred,
      limit: this.config().maxArticles,
      blocked: evictable === 0 && this.full(),
    };
  }
  // 收敛到保留上限：按由旧到新删除，evict 决定收藏是否参与。
  private prune(evict: Evict) {
    const excess = this.totals().count - this.config().maxArticles;
    if (excess > 0) this.removeOldest(excess, evict);
    // Content + metadata is bounded per article; retain an additional aggregate guard.
    // 字节超预算时只删未收藏文章：删无可删就停手，避免空转。
    while (this.totals().bytes > this.limits.maxLibraryBytes) {
      const before = this.totals().count;
      this.removeOldest(100, Evict.ExceptStarred);
      if (this.totals().count === before) break;
    }
  }
  // 上限低于收藏数时缺口无法只靠未收藏文章填平，收藏必须让位；
  // 该降幅已由 configure 征得用户确认，或由档位 clamp 强制收紧。
  private evictScope(limit: number): Evict {
    return limit < this.tallies().starred ? Evict.All : Evict.ExceptStarred;
  }
  // 档位 clamp（如付费降回免费）会绕过 configure 调低上限，这里补一次收敛，保证总数始终不超上限。
  private reconcileLimit() {
    const limit = this.config().maxArticles;
    if (this.totals().count > limit) this.prune(this.evictScope(limit));
  }
  // 删除最旧的 N 篇并在日志里留删除记录，客户端增量同步才删得掉本地副本。
  private removeOldest(limit: number, evict: Evict) {
    const scope = evict === Evict.ExceptStarred ? " WHERE starred=0" : "";
    this.ctx.storage.sql.exec(
      `INSERT INTO changes(kind,id) SELECT 'remove',id FROM articles${scope} ORDER BY publishedAt,id LIMIT ?`,
      limit,
    );
    this.ctx.storage.sql.exec(
      `DELETE FROM articles WHERE id IN (SELECT id FROM articles${scope} ORDER BY publishedAt,id LIMIT ?)`,
      limit,
    );
  }
  private usage() {
    const day = new Date().toISOString().slice(0, 10);
    const value = this.get("usage", { day, attempts: 0, writes: 0 });
    return value.day === day ? value : { day, attempts: 0, writes: 0 };
  }
  private status() {
    return {
      product: "Dox Reader Backend",
      apiVersion: 1,
      plan: this.limits.plan,
      config: this.config(),
      limits: {
        intervalMinutes: this.limits.intervalMinutes,
        maxArticles: this.limits.maxArticles,
        maxFeeds: this.limits.maxFeeds,
        maxFeedBytes: this.limits.maxFeedBytes,
        maxContentBytes: this.limits.maxContentBytes,
        maxLibraryBytes: this.limits.maxLibraryBytes,
        dailyFetchAttempts: this.limits.dailyFetchAttempts,
        dailyWriteUnits: this.limits.dailyWriteUnits,
      },
      revision: this.get("revision", 0),
      ...this.seqRange(),
      job: this.get("job", emptyJob()),
      retention: this.retention(),
      nextFetchAt: this.ctx.storage.sql
        .exec<{ due: number | null }>("SELECT MIN(due) AS due FROM feeds")
        .one().due,
      usage: this.usage(),
      storageBytes: this.ctx.storage.sql.databaseSize,
    };
  }
  async wake() {
    const alarm = await this.ctx.storage.getAlarm();
    if (!alarm) await this.arm();
  }
  private async arm() {
    const next = this.ctx.storage.sql
      .exec<{ due: number | null }>("SELECT MIN(due) AS due FROM feeds")
      .one().due;
    if (next !== null)
      await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, next));
    else await this.ctx.storage.deleteAlarm();
  }
  async command(action: string, p: Record<string, unknown>): Promise<unknown> {
    if (action === "status") return this.status();
    if (action === "configure") {
      const config = validateConfig(p.config, this.limits);
      const starred = this.tallies().starred;
      // 上限降到收藏数以下必然要删收藏文章：先让用户确认，避免误删。
      if (config.maxArticles < starred && p.confirmStarred !== true)
        throw new Error(
          `新上限 ${config.maxArticles} 小于收藏 ${starred} 篇，保存会按由旧到新裁剪，至少删除 ${starred - config.maxArticles} 篇收藏文章，确认后再保存`,
        );
      this.ctx.storage.transactionSync(() => {
        this.put("config", config);
        this.prune(this.evictScope(config.maxArticles));
        this.trimChanges();
        this.changed();
        this.ctx.storage.sql.exec(
          "UPDATE feeds SET due=MIN(due,?)",
          Date.now() + config.intervalMinutes * 60000,
        );
      });
      await this.arm();
      return this.status();
    }
    if (action === "snapshot") {
      const revision = this.get("revision", 0);
      if (p.revision !== undefined && p.revision !== revision)
        throw new Error("SNAPSHOT_CHANGED");
      const cursor = p.cursor as { time: number; id: string } | undefined;
      if (
        cursor &&
        (!Number.isFinite(cursor.time) || typeof cursor.id !== "string")
      )
        throw new Error("分页参数无效");
      const rows = this.ctx.storage.sql
        .exec<{
          data: string;
          read: number;
          starred: number;
        }>("SELECT data,read,starred FROM articles " + (cursor ? "WHERE (publishedAt,id)<(?,?) " : "") + "ORDER BY publishedAt DESC,id DESC LIMIT 200", ...(cursor ? [cursor.time, cursor.id] : []))
        .toArray();
      const items = rows.map((r) => ({
        ...JSON.parse(r.data),
        content: "",
        read: !!r.read,
        starred: !!r.starred,
      }));
      const feeds = !cursor
        ? this.ctx.storage.sql
            .exec<Row>("SELECT * FROM feeds")
            .toArray()
            .map((r) => JSON.parse(r.data))
        : [];
      const last = items.at(-1);
      return {
        revision,
        items,
        feeds,
        next:
          rows.length === 200 ? { time: last.publishedAt, id: last.id } : null,
      };
    }
    if (action === "delta") {
      const since = Number(p.since);
      const cursor = p.cursor === undefined ? since : Number(p.cursor);
      if (!Number.isFinite(since) || !Number.isFinite(cursor))
        throw new Error("增量同步参数无效");
      const { minSeq, maxSeq } = this.seqRange();
      const changes = this.ctx.storage.sql
        .exec<{ seq: number; kind: string; id: string }>(
          "SELECT seq,kind,id FROM changes WHERE seq>? ORDER BY seq LIMIT ?",
          cursor,
          CHANGE_PAGE,
        )
        .toArray();
      const ids = (kind: string) =>
        changes.filter((row) => row.kind === kind).map((row) => row.id);
      return {
        revision: this.get("revision", 0),
        // 订阅列表很小，首页整体下发；客户端据此丢弃已删除订阅的文章。
        ...(p.cursor === undefined
          ? {
              feeds: this.ctx.storage.sql
                .exec<Row>("SELECT * FROM feeds")
                .toArray()
                .map((row) => JSON.parse(row.data)),
            }
          : {}),
        items: this.itemsByIds(ids("item")),
        states: this.statesByIds(ids("state")),
        removed: ids("remove"),
        next: changes.length === CHANGE_PAGE ? changes.at(-1)!.seq : null,
        minSeq,
        maxSeq,
      };
    }
    if (action === "article") {
      const row = this.ctx.storage.sql
        .exec<{
          data: string;
          content: string;
          read: number;
          starred: number;
        }>("SELECT data,content,read,starred FROM articles WHERE id=?", String(p.id))
        .toArray()[0];
      if (!row) throw new Error("文章已按保留上限清理，请刷新列表");
      return {
        ...JSON.parse(row.data),
        content: row.content,
        read: !!row.read,
        starred: !!row.starred,
      };
    }
    if (action === "addFeed") {
      const url = feedUrl(p.url).href;
      const old = this.ctx.storage.sql
        .exec<Row>("SELECT * FROM feeds WHERE url=?", url)
        .toArray()[0];
      if (old) return JSON.parse(old.data);
      if (
        this.ctx.storage.sql
          .exec<{ n: number }>("SELECT COUNT(*) AS n FROM feeds")
          .one().n >= this.limits.maxFeeds
      )
        throw new Error(
          `当前 ${planName(this.limits)}档最多支持 ${this.limits.maxFeeds} 个订阅源`,
        );
      const now = Date.now();
      const id = crypto.randomUUID();
      const feed: FeedRecord = {
        id,
        url,
        title: new URL(url).hostname,
        customName: "",
        siteUrl: "",
        folder: "",
        deleted: false,
        addedAt: now,
        updatedAt: now,
        version: [now, "backend"],
      };
      this.ctx.storage.sql.exec(
        "INSERT INTO feeds(id,url,data,due) VALUES (?,?,?,?)",
        id,
        url,
        JSON.stringify(feed),
        now,
      );
      this.changed();
      this.recordChange("feed", id);
      await this.arm();
      return feed;
    }
    if (action === "renameFeed" || action === "updateFeed" || action === "removeFeed") {
      const id = String(p.id);
      const row = this.ctx.storage.sql
        .exec<Row>("SELECT * FROM feeds WHERE id=?", id)
        .toArray()[0];
      if (!row) throw new Error("订阅源不存在");
      const feed: FeedRecord = JSON.parse(row.data);
      if (action === "renameFeed" || action === "updateFeed") {
        if (typeof p.name !== "string" || p.name.length > 200)
          throw new Error("订阅名称最多 200 字符");
        feed.customName = p.name.trim();
        const nextUrl = action === "updateFeed" ? feedUrl(p.url).href : feed.url;
        const duplicate = this.ctx.storage.sql.exec("SELECT id FROM feeds WHERE url=? AND id!=?", nextUrl, id).toArray()[0];
        if (duplicate) throw new Error("该订阅地址已经存在");
        const addressChanged = nextUrl !== feed.url;
        feed.url = nextUrl;
        feed.updatedAt = Date.now();
        if (addressChanged) {
          feed.error = undefined;
          feed.lastFetchedAt = undefined;
        }
        this.ctx.storage.sql.exec(
          "UPDATE feeds SET url=?,data=?,etag=?,modified=?,due=?,failures=? WHERE id=?",
          nextUrl,
          JSON.stringify(feed),
          addressChanged ? "" : row.etag,
          addressChanged ? "" : row.modified,
          addressChanged ? Date.now() : row.due,
          addressChanged ? 0 : row.failures,
          id,
        );
      } else {
        this.ctx.storage.transactionSync(() => {
          this.ctx.storage.sql.exec("DELETE FROM articles WHERE feedId=?", id);
          this.ctx.storage.sql.exec("DELETE FROM feeds WHERE id=?", id);
          const pending = this.get<string[]>("pending", []);
          if (pending.includes(id)) {
            const rest = pending.filter((value) => value !== id);
            const job = this.get("job", emptyJob());
            this.put("pending", rest);
            this.put("job", {
              ...job,
              completed: job.completed + 1,
              running: rest.length > 0,
            });
          }
        });
      }
      this.changed();
      this.recordChange("feed", id);
      await this.arm();
      return feed;
    }
    if (action === "state" || action === "markRead") {
      const usage = this.usage();
      if (usage.writes >= this.limits.dailyWriteUnits)
        throw new Error("今日写入预算已用完，明日自动恢复");
      let changed = 0;
      if (action === "state") {
        const id = String(p.id);
        for (const field of ["read", "starred"] as const)
          if (p[field] !== undefined && typeof p[field] !== "boolean")
            throw new Error("文章状态无效");
        this.ctx.storage.transactionSync(() => {
          for (const field of ["read", "starred"] as const)
            if (p[field] !== undefined) {
              const r = this.ctx.storage.sql.exec(
                `UPDATE articles SET ${field}=? WHERE id=? AND ${field}!=?`,
                p[field] ? 1 : 0,
                id,
                p[field] ? 1 : 0,
              );
              changed += r.rowsWritten;
            }
          // 状态只进变更日志：全量快照的 revision 保持不变，客户端不必重下整个库。
          if (changed > 0) this.recordChange("state", id);
        });
      } else {
        const where = p.feedId ? " AND feedId=?" : "";
        const args = p.feedId ? [String(p.feedId)] : [];
        const n = this.ctx.storage.sql
          .exec<{
            n: number;
          }>(`SELECT COUNT(*) AS n FROM articles WHERE read=0${where}`, ...args)
          .one().n;
        if (usage.writes + n > this.limits.dailyWriteUnits)
          throw new Error("操作超过今日写入预算，请分批或明日重试");
        this.ctx.storage.transactionSync(() => {
          this.ctx.storage.sql.exec(
            `INSERT INTO changes(kind,id) SELECT 'state',id FROM articles WHERE read=0${where}`,
            ...args,
          );
          changed = this.ctx.storage.sql.exec(
            `UPDATE articles SET read=1 WHERE read=0${where}`,
            ...args,
          ).rowsWritten;
        });
      }
      usage.writes += changed;
      this.put("usage", usage);
      return changed;
    }
    if (action === "refresh") {
      if (this.get("job", emptyJob()).running) return this.status();
      // 收藏占满保留空间：抓取不可能收录任何新文章，直接提示用户，不空跑一轮。
      if (this.retention().blocked) throw new Error(RETENTION_FULL_MESSAGE);
      if (Date.now() - this.get("lastManual", 0) < 60000)
        throw new Error("手动抓取间隔至少 1 分钟");
      const usage = this.usage();
      if (
        usage.attempts >= this.limits.dailyFetchAttempts ||
        usage.writes >= this.limits.dailyWriteUnits
      )
        throw new Error("今日抓取预算已用完，明日自动恢复");
      const ids = Array.isArray(p.ids)
        ? p.ids.filter((x): x is string => typeof x === "string").slice(0, 100)
        : [];
      const rows = this.ctx.storage.sql
        .exec<Row>("SELECT * FROM feeds")
        .toArray()
        .filter((r) => !ids.length || ids.includes(r.id));
      this.ctx.storage.transactionSync(() => {
        this.put("lastManual", Date.now());
        this.put("job", {
          ...emptyJob(),
          running: rows.length > 0,
          total: rows.length,
          startedAt: Date.now(),
        });
        this.put(
          "pending",
          rows.map((r) => r.id),
        );
        for (const row of rows) {
          // full：清掉条件请求验证头，强制订阅源返回完整体而不是 304，
          // 用于保留策略误删后重新归档（受每日写入预算限制，分数天补齐）。
          if (p.full === true)
            this.ctx.storage.sql.exec(
              "UPDATE feeds SET etag='',modified='' WHERE id=?",
              row.id,
            );
          this.ctx.storage.sql.exec(
            "UPDATE feeds SET due=? WHERE id=?",
            Date.now(),
            row.id,
          );
        }
      });
      await this.arm();
      return this.status();
    }
    throw new Error("不支持的 API 操作");
  }
  async alarm() {
    const now = Date.now();
    const lease = this.get("lease", 0);
    if (lease > now) {
      await this.ctx.storage.setAlarm(lease + 1000);
      return;
    }
    const row = this.ctx.storage.sql
      .exec<Row>("SELECT * FROM feeds WHERE due<=? ORDER BY due LIMIT 1", now)
      .toArray()[0];
    if (!row) {
      await this.arm();
      return;
    }
    this.put("lease", now + FETCH_LEASE_MS);
    // Recovery wakeup is persisted before external I/O. Cron also repairs missing alarms.
    await this.ctx.storage.setAlarm(now + FETCH_LEASE_MS + 1000);
    this.reconcileLimit();
    const usage = this.usage();
    if (
      usage.attempts >= this.limits.dailyFetchAttempts ||
      usage.writes >= this.limits.dailyWriteUnits
    ) {
      const tomorrow =
        Date.parse(new Date(now).toISOString().slice(0, 10)) + 86400000 + 1000;
      this.ctx.storage.sql.exec("UPDATE feeds SET due=MAX(due,?)", tomorrow);
      this.put("lease", 0);
      this.put("job", {
        ...this.get("job", emptyJob()),
        running: false,
        errors: ["今日抓取预算已用完，明日自动恢复"],
      });
      await this.arm();
      return;
    }
    // 收藏占满保留空间：收录不了任何新文章，把该源顺延，不白耗一次抓取预算。
    if (this.retention().blocked) {
      this.ctx.storage.sql.exec(
        "UPDATE feeds SET due=? WHERE id=?",
        now + this.config().intervalMinutes * 60000,
        row.id,
      );
      this.put("lease", 0);
      const pending = this.get<string[]>("pending", []);
      if (pending.includes(row.id)) {
        const rest = pending.filter((id) => id !== row.id);
        const job = this.get("job", emptyJob());
        this.put("pending", rest);
        this.put("job", {
          ...job,
          running: rest.length > 0,
          completed: job.completed + 1,
          errors: [...job.errors, RETENTION_FULL_MESSAGE].slice(-100),
        });
      }
      await this.arm();
      return;
    }
    usage.attempts++;
    this.put("usage", usage);
    let error = "";
    let updated = 0;
    try {
      const feed: FeedRecord = JSON.parse(row.data);
      let url = feedUrl(feed.url);
      let response: Response | undefined;
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), FEED_FETCH_TIMEOUT_MS);
      try {
        for (let hop = 0; hop < 6; hop++) {
          response = await fetch(url, {
            redirect: "manual",
            signal: abort.signal,
            headers: {
              "User-Agent": FEED_USER_AGENT,
              Accept:
                "application/atom+xml, application/rss+xml, application/rdf+xml, application/xml, text/xml, */*;q=0.5",
              ...(row.etag ? { "If-None-Match": row.etag } : {}),
              ...(row.modified ? { "If-Modified-Since": row.modified } : {}),
            },
          });
          if (
            response.status >= 300 &&
            response.status < 400 &&
            response.status !== 304
          ) {
            const location = response.headers.get("location");
            await response.body?.cancel();
            if (!location) throw new Error("订阅重定向缺少地址");
            url = feedUrl(new URL(location, url).href);
            continue;
          }
          break;
        }
        if (!response) throw new Error("订阅请求失败");
        if (response.status !== 304) {
          if (!response.ok) {
            await response.body?.cancel();
            throw new Error(`订阅 HTTP ${response.status}`);
          }
          const xml = await limitedText(response, this.limits.maxFeedBytes);
          if (/<!DOCTYPE|<!ENTITY/i.test(xml))
            throw new Error("订阅包含不支持的 XML 实体声明");
          const parsed = await parseFeedXml(xml, feed.id, url.href);
          // A feed may be removed or renamed while fetch is in progress.
          const current = this.ctx.storage.sql
            .exec<Row>("SELECT * FROM feeds WHERE id=?", row.id)
            .toArray()[0];
          if (!current || current.url !== row.url) return;
          const record: FeedRecord = JSON.parse(current.data);
          const candidates = parsed.items.sort(
            (a, b) => b.publishedAt - a.publishedAt || b.id.localeCompare(a.id),
          );
          let incomplete = false;
          this.ctx.storage.transactionSync(() => {
            const budget = this.usage();
            for (const item of candidates) {
              if (budget.writes + 4 > this.limits.dailyWriteUnits) {
                incomplete = true;
                break;
              }
              // Immutable archived content avoids rewriting every article on every poll.
              if (
                this.ctx.storage.sql
                  .exec("SELECT id FROM articles WHERE id=?", item.id)
                  .toArray().length
              )
                continue;
              // 保留窗口满时靠淘汰最旧的未收藏文章腾位置：没有可淘汰的文章就停止收录。
              if (this.full()) {
                const victim = this.oldestEvictable();
                if (!victim) {
                  incomplete = true;
                  break;
                }
                if (
                  item.publishedAt < victim.publishedAt ||
                  (item.publishedAt === victim.publishedAt &&
                    item.id <= victim.id)
                )
                  continue;
              }
              const content = boundedContent(
                item.content,
                this.limits.maxContentBytes,
              );
              const metadata: ItemRecord = {
                ...item,
                title: item.title.slice(0, 500),
                author: item.author.slice(0, 200),
                url: item.url.slice(0, 2048),
                guid: item.guid.slice(0, 2048),
                content: "",
                read: false,
                starred: false,
                fetchedAt: now,
                publishedAt: Math.min(item.publishedAt, now),
              };
              const data = JSON.stringify(metadata);
              const bytes = new TextEncoder().encode(data + content).length;
              this.ctx.storage.sql.exec(
                "INSERT OR IGNORE INTO articles(id,feedId,publishedAt,data,content,bytes) VALUES(?,?,?,?,?,?)",
                item.id,
                feed.id,
                metadata.publishedAt,
                data,
                content,
                bytes,
              );
              budget.writes += 4;
              updated++;
              this.recordChange("item", item.id);
              this.prune(Evict.ExceptStarred);
            }
            record.title = parsed.title.slice(0, 500);
            record.siteUrl = parsed.siteUrl.slice(0, 2048);
            record.lastFetchedAt = now;
            record.error = undefined;
            this.ctx.storage.sql.exec(
              "UPDATE feeds SET data=?,etag=?,modified=? WHERE id=?",
              JSON.stringify(record),
              incomplete
                ? ""
                : (response!.headers.get("etag")?.slice(0, 1024) ?? ""),
              incomplete
                ? ""
                : (response!.headers.get("last-modified")?.slice(0, 100) ?? ""),
              row.id,
            );
            this.put("usage", budget);
            this.prune(Evict.ExceptStarred);
            this.trimChanges();
            if (
              updated > 0 ||
              record.title !== feed.title ||
              record.siteUrl !== feed.siteUrl
            ) {
              this.changed();
              this.recordChange("feed", row.id);
            }
          });
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "抓取失败";
    } finally {
      const current = this.ctx.storage.sql
        .exec<Row>("SELECT * FROM feeds WHERE id=?", row.id)
        .toArray()[0];
      if (current && current.url === row.url) {
        const feed: FeedRecord = JSON.parse(current.data);
        if ((feed.error ?? "") !== error) {
          this.changed();
          this.recordChange("feed", row.id);
        }
        feed.error = error || undefined;
        feed.lastFetchedAt = now;
        const failures = error ? Math.min(row.failures + 1, 6) : 0;
        const delay =
          this.config().intervalMinutes * 60000 * Math.max(1, 2 ** failures);
        this.ctx.storage.sql.exec(
          "UPDATE feeds SET data=?,due=?,failures=? WHERE id=?",
          JSON.stringify(feed),
          Date.now() + delay,
          failures,
          row.id,
        );
      }
      this.put("lease", 0);
      const pending = this.get<string[]>("pending", []);
      const job = this.get("job", emptyJob());
      if (pending.includes(row.id) && (!current || current.url === row.url)) {
        const rest = pending.filter((id) => id !== row.id);
        this.put("pending", rest);
        this.put("job", {
          ...job,
          running: rest.length > 0,
          completed: job.completed + 1,
          updated: job.updated + updated,
          errors: error ? [...job.errors, error].slice(-100) : job.errors,
        });
      }
      await this.arm();
    }
  }
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    if (
      new URL(request.url).pathname !== "/api/v1" ||
      request.method !== "POST"
    )
      return Response.json(
        { error: "Not found" },
        { status: 404, headers: cors },
      );
    const expected = env.BACKEND_TOKEN;
    const actual = request.headers
      .get("Authorization")
      ?.replace(/^Bearer /, "");
    if (!expected || expected.length < 32)
      return Response.json(
        { error: "后端尚未配置有效访问令牌" },
        { status: 503, headers: cors },
      );
    const a = new TextEncoder().encode(actual ?? "");
    const b = new TextEncoder().encode(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      return Response.json(
        { error: "访问令牌无效" },
        { status: 401, headers: cors },
      );
    try {
      const p = JSON.parse(await limitedText(request, 16384));
      if (!p || typeof p !== "object" || typeof p.action !== "string")
        throw new Error("请求无效");
      const result = await env.LIBRARY.getByName("personal-library").command(
        p.action,
        p,
      );
      return Response.json(result, { headers: cors });
    } catch (e) {
      const message = e instanceof Error ? e.message : "后端错误";
      return Response.json(
        { error: message },
        {
          status: message.includes("SNAPSHOT_CHANGED") ? 409 : 400,
          headers: cors,
        },
      );
    }
  },
  async scheduled(_event: ScheduledController, env: Bindings) {
    await env.LIBRARY.getByName("personal-library").wake();
  },
} satisfies ExportedHandler<Bindings>;
