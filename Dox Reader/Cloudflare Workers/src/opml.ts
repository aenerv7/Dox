export interface OpmlFeed {
  title: string;
  url: string;
  siteUrl: string;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function parseOpml(xml: string): OpmlFeed[] {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("OPML 文件格式无效");
  return Array.from(document.querySelectorAll("outline[xmlUrl]"))
    .map((outline) => ({
      title: outline.getAttribute("title") || outline.getAttribute("text") || "",
      url: outline.getAttribute("xmlUrl") || "",
      siteUrl: outline.getAttribute("htmlUrl") || "",
    }))
    .filter((feed) => /^https?:\/\//i.test(feed.url));
}

export function createOpml(feeds: OpmlFeed[]): string {
  const outlines = feeds.map((feed) =>
    `    <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}" htmlUrl="${escapeXml(feed.siteUrl)}"/>`
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Dox Reader subscriptions</title></head>
  <body>
${outlines}
  </body>
</opml>`;
}
