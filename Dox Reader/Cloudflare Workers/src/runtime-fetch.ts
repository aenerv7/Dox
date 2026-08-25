const WEB_REQUEST_HEADER = "X-Dox-Reader-Request";
const WEB_TARGET_HEADER = "X-Dox-Target";

function proxyUrl(path: "/api/feed" | "/api/webdav"): string {
  return new URL(path, window.location.origin).toString();
}

export function fetchFeed(target: string, init?: RequestInit): Promise<Response> {
  if (typeof window === "undefined") return fetch(target, init);

  const headers = new Headers(init?.headers);
  headers.set(WEB_REQUEST_HEADER, "1");
  headers.set(WEB_TARGET_HEADER, target);
  return fetch(proxyUrl("/api/feed"), { ...init, headers });
}

export function fetchWebDav(target: string, init?: RequestInit): Promise<Response> {
  if (typeof window === "undefined") return fetch(new URL(target), init);

  const headers = new Headers(init?.headers);
  headers.set(WEB_REQUEST_HEADER, "1");
  headers.set(WEB_TARGET_HEADER, target);
  return fetch(proxyUrl("/api/webdav"), { ...init, headers });
}
