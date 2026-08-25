export function fetchFeed(target: string, init?: RequestInit): Promise<Response> {
  return fetch(target, init);
}

export function fetchWebDav(target: string, init?: RequestInit): Promise<Response> {
  return fetch(new URL(target), init);
}
