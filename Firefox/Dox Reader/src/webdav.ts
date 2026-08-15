import { applySyncDocument, exportSyncDocument } from "./database";
import type { AppSettings, SyncDocument } from "./model";
import { mergeSyncDocuments, parseSyncDocument } from "./sync-model";

interface RemoteFile {
  exists: boolean;
  etag: string | null;
  document?: SyncDocument;
}

interface WebDavLocations {
  directory: URL;
  file: URL;
}

export interface SyncResult {
  subscriptions: number;
  itemStates: number;
  etag: string | null;
}

const SYNC_DIRECTORY = "Dox Reader";
const SYNC_FILE = "state.json";

function authorization(settings: AppSettings): string | undefined {
  if (!settings.webdavUsername && !settings.webdavPassword) return undefined;
  const bytes = new TextEncoder().encode(`${settings.webdavUsername}:${settings.webdavPassword}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

function headers(settings: AppSettings): Headers {
  const result = new Headers({ Accept: "application/json" });
  const auth = authorization(settings);
  if (auth) result.set("Authorization", auth);
  return result;
}

export function resolveWebDavLocations(settings: AppSettings): WebDavLocations {
  if (!settings.webdavUrl.trim()) throw new Error("请先填写 WebDAV URL 前缀");
  const base = new URL(settings.webdavUrl.trim());
  if (base.protocol !== "https:") throw new Error("WebDAV URL 必须使用 HTTPS");

  base.hash = "";
  const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  const directory = new URL(base.toString());
  directory.pathname = `${basePath}${encodeURIComponent(SYNC_DIRECTORY)}/`;
  const file = new URL(directory.toString());
  file.pathname = `${directory.pathname}${SYNC_FILE}`;
  return { directory, file };
}

async function ensureDirectory(settings: AppSettings): Promise<{ locations: WebDavLocations; created: boolean }> {
  const locations = resolveWebDavLocations(settings);
  const requestHeaders = headers(settings);
  requestHeaders.set("Depth", "0");
  const probe = await fetch(locations.directory, {
    method: "PROPFIND",
    headers: requestHeaders,
    cache: "no-store",
  });
  if (probe.ok) return { locations, created: false };
  if (probe.status !== 404) throw new Error(`WebDAV 目录检查失败（HTTP ${probe.status}）`);

  const create = await fetch(locations.directory, {
    method: "MKCOL",
    headers: headers(settings),
  });
  if (create.ok) return { locations, created: true };
  if (create.status === 405) {
    const retry = await fetch(locations.directory, {
      method: "PROPFIND",
      headers: requestHeaders,
      cache: "no-store",
    });
    if (retry.ok) return { locations, created: false };
  }
  throw new Error(`WebDAV 目录创建失败（HTTP ${create.status}）`);
}

async function getRemote(settings: AppSettings, url: URL): Promise<RemoteFile> {
  const response = await fetch(url, {
    method: "GET",
    headers: headers(settings),
    cache: "no-store",
  });
  if (response.status === 404) return { exists: false, etag: null };
  if (!response.ok) throw new Error(`WebDAV 读取失败（HTTP ${response.status}）`);

  let value: unknown;
  try {
    value = JSON.parse(await response.text());
  } catch {
    throw new Error("WebDAV 地址已有文件，但内容不是有效 JSON；请换用新的文件名");
  }
  return {
    exists: true,
    etag: response.headers.get("etag"),
    document: parseSyncDocument(value),
  };
}

async function putRemote(
  settings: AppSettings,
  url: URL,
  document: SyncDocument,
  remote: RemoteFile,
): Promise<Response> {
  const requestHeaders = headers(settings);
  requestHeaders.set("Content-Type", "application/json; charset=utf-8");
  if (remote.exists && remote.etag) requestHeaders.set("If-Match", remote.etag);
  if (!remote.exists) requestHeaders.set("If-None-Match", "*");
  return fetch(url, {
    method: "PUT",
    headers: requestHeaders,
    body: JSON.stringify(document),
  });
}

export async function testWebDav(settings: AppSettings): Promise<string> {
  const { locations, created } = await ensureDirectory(settings);
  const response = await fetch(locations.file, {
    method: "GET",
    headers: headers(settings),
    cache: "no-store",
  });
  if (response.status === 404) {
    return created
      ? "连接成功；已创建 Dox Reader 文件夹"
      : "连接成功；首次同步时将创建 state.json";
  }
  if (response.ok) return "连接成功；已找到 Dox Reader/state.json";
  throw new Error(`WebDAV 连接失败（HTTP ${response.status}）`);
}

export async function syncWithWebDav(settings: AppSettings): Promise<SyncResult> {
  const { locations } = await ensureDirectory(settings);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const remote = await getRemote(settings, locations.file);
    const local = await exportSyncDocument();
    const merged = remote.document ? mergeSyncDocuments(local, remote.document) : local;
    await applySyncDocument(merged);
    const response = await putRemote(settings, locations.file, merged, remote);
    if (response.status === 412) continue;
    if (!response.ok) throw new Error(`WebDAV 写入失败（HTTP ${response.status}）`);
    return {
      subscriptions: Object.keys(merged.subscriptions).length,
      itemStates: Object.keys(merged.itemStates).length,
      etag: response.headers.get("etag"),
    };
  }
  throw new Error("WebDAV 文件持续被其他设备修改，请稍后重试");
}
