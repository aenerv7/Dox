const CLIENT_MARKER_HEADER = "X-Dox-Reader-Request";
const TARGET_HEADER = "X-Dox-Target";
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const MAX_WEBDAV_BYTES = 4 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 20_000;
const MAX_FEED_REDIRECTS = 5;

type UpstreamFetch = typeof fetch;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function jsonError(status: number, message: string): Response {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function assertSameOriginClient(request: Request): void {
  if (request.headers.get(CLIENT_MARKER_HEADER) !== "1") {
    throw new HttpError(403, "请求来源无效");
  }

  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("Origin");
  if (origin && origin !== requestOrigin) throw new HttpError(403, "不允许跨站请求");

  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && fetchSite !== "same-origin") throw new HttpError(403, "不允许跨站请求");
}

function isBlockedIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part > 255)) return true;

  const [a, b, c] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 0 && c === 2)
    || (a === 192 && b === 88 && c === 99)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

function parseTarget(raw: string | null, protocols: ReadonlySet<string>): URL {
  if (!raw) throw new HttpError(400, "缺少目标 URL");

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    throw new HttpError(400, "目标 URL 无效");
  }

  if (!protocols.has(target.protocol)) throw new HttpError(400, "目标 URL 协议不受支持");
  if (target.username || target.password) throw new HttpError(400, "目标 URL 不得包含凭据");
  if (target.hash) target.hash = "";

  const hostname = target.hostname.toLowerCase().replace(/\.$/, "");
  const blockedName = hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
    || hostname.endsWith(".home.arpa")
    || hostname === "metadata.google.internal"
    || hostname === "instance-data";
  if (!hostname || blockedName || hostname.startsWith("[") || isBlockedIpv4(hostname)) {
    throw new HttpError(403, "不允许访问本机、内网或保留地址");
  }

  const standardPort = target.protocol === "https:" ? "443" : "80";
  if (target.port && target.port !== standardPort) {
    throw new HttpError(403, "只允许使用标准 HTTP/HTTPS 端口");
  }
  return target;
}

function copyRequestHeaders(request: Request, names: readonly string[]): Headers {
  const headers = new Headers();
  for (const name of names) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
}

function assertWebDavPath(target: URL, method: string): void {
  let pathname: string;
  try {
    pathname = decodeURIComponent(target.pathname);
  } catch {
    throw new HttpError(400, "WebDAV URL 路径无效");
  }

  const expectedSuffix = method === "PROPFIND" || method === "MKCOL"
    ? "/Dox Reader/"
    : "/Dox Reader/state.json";
  if (!pathname.endsWith(expectedSuffix)) {
    throw new HttpError(403, "WebDAV 代理只允许访问 Dox Reader/state.json");
  }
}

async function readLimitedBody(request: Request, limit: number): Promise<ArrayBuffer | undefined> {
  if (!request.body) return undefined;
  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new HttpError(413, "请求内容过大");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel("request body too large");
        throw new HttpError(413, "请求内容过大");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

function limitedResponseBody(response: Response, limit: number): ReadableStream<Uint8Array> | null {
  if (!response.body) return null;
  const declaredLength = Number(response.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    void response.body.cancel("upstream response too large");
    throw new HttpError(502, "上游响应过大");
  }

  let received = 0;
  return response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > limit) {
        controller.error(new Error("upstream response too large"));
        return;
      }
      controller.enqueue(chunk);
    },
  }));
}

function relayResponse(response: Response, limit: number, upstreamUrl: URL): Response {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Dox-Upstream-URL": upstreamUrl.toString(),
  });
  for (const name of ["Content-Type", "ETag", "Last-Modified"] as const) {
    const value = response.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return new Response(limitedResponseBody(response, limit), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function fetchWithTimeout(upstreamFetch: UpstreamFetch, target: URL, init: RequestInit): Promise<Response> {
  return upstreamFetch(target, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
}

async function handleFeed(request: Request, upstreamFetch: UpstreamFetch): Promise<Response> {
  if (request.method !== "GET") throw new HttpError(405, "RSS 接口只接受 GET 请求");
  let target = parseTarget(request.headers.get(TARGET_HEADER), new Set(["http:", "https:"]));
  const headers = copyRequestHeaders(request, ["Accept", "If-Modified-Since", "If-None-Match"]);

  for (let redirects = 0; redirects <= MAX_FEED_REDIRECTS; redirects += 1) {
    const response = await fetchWithTimeout(upstreamFetch, target, { method: "GET", headers });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return relayResponse(response, MAX_FEED_BYTES, target);
    }
    if (redirects === MAX_FEED_REDIRECTS) throw new HttpError(502, "订阅源重定向次数过多");

    const location = response.headers.get("Location");
    if (!location) throw new HttpError(502, "订阅源返回了无效重定向");
    void response.body?.cancel("following validated redirect");
    target = parseTarget(new URL(location, target).toString(), new Set(["http:", "https:"]));
  }
  throw new HttpError(502, "无法读取订阅源");
}

async function handleWebDav(request: Request, upstreamFetch: UpstreamFetch): Promise<Response> {
  const allowedMethods = new Set(["GET", "PROPFIND", "MKCOL", "PUT"]);
  if (!allowedMethods.has(request.method)) throw new HttpError(405, "WebDAV 请求方法不受支持");

  const target = parseTarget(request.headers.get(TARGET_HEADER), new Set(["https:"]));
  assertWebDavPath(target, request.method);
  const headers = copyRequestHeaders(request, [
    "Accept",
    "Authorization",
    "Content-Type",
    "Depth",
    "If-Match",
    "If-None-Match",
  ]);
  const body = request.method === "PUT" ? await readLimitedBody(request, MAX_WEBDAV_BYTES) : undefined;
  const response = await fetchWithTimeout(upstreamFetch, target, {
    method: request.method,
    headers,
    body,
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    void response.body?.cancel("WebDAV redirects are not followed");
    throw new HttpError(502, "WebDAV 地址发生重定向，请填写重定向后的 HTTPS 地址");
  }
  return relayResponse(response, MAX_WEBDAV_BYTES, target);
}

export async function handleRequest(request: Request, upstreamFetch: UpstreamFetch = fetch): Promise<Response> {
  try {
    assertSameOriginClient(request);
    const pathname = new URL(request.url).pathname;
    if (pathname === "/api/feed") return await handleFeed(request, upstreamFetch);
    if (pathname === "/api/webdav") return await handleWebDav(request, upstreamFetch);
    return jsonError(404, "接口不存在");
  } catch (error) {
    if (error instanceof HttpError) return jsonError(error.status, error.message);
    const errorType = error instanceof Error ? error.name : "UnknownError";
    console.error(JSON.stringify({ message: "proxy request failed", errorType }));
    return jsonError(502, "上游服务暂时不可用");
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/api/")) return handleRequest(request);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
