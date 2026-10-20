import { describe, expect, it } from "vitest";
import { parseFeedXml } from "./feed-parser";

describe("parseFeedXml", () => {
  it("parses RSS 2.0 and resolves relative links", async () => {
    const result = await parseFeedXml(`<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Example RSS</title>
          <link>https://example.com/</link>
          <item>
            <guid>post-1</guid>
            <title>First post</title>
            <link>/posts/1</link>
            <description><![CDATA[<p>Hello <strong>RSS</strong></p>]]></description>
            <pubDate>Fri, 14 Aug 2026 12:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`, "feed-a", "https://example.com/feed.xml");

    expect(result.title).toBe("Example RSS");
    expect(result.siteUrl).toBe("https://example.com/");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      feedId: "feed-a",
      guid: "post-1",
      title: "First post",
      url: "https://example.com/posts/1",
      snippet: "Hello RSS",
    });
  });

  it("parses Atom links, author, and HTML content", async () => {
    const result = await parseFeedXml(`<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Example Atom</title>
        <link rel="alternate" href="https://example.net/"/>
        <entry>
          <id>tag:example.net,2026:2</id>
          <title>Second post</title>
          <link rel="alternate" href="https://example.net/posts/2"/>
          <author><name>Ada</name></author>
          <updated>2026-08-15T08:00:00Z</updated>
          <content type="html">&lt;p&gt;Hello Atom&lt;/p&gt;</content>
        </entry>
      </feed>`, "feed-b", "https://example.net/atom.xml");

    expect(result.items[0]).toMatchObject({
      feedId: "feed-b",
      guid: "tag:example.net,2026:2",
      author: "Ada",
      url: "https://example.net/posts/2",
      snippet: "Hello Atom",
    });
  });

  it("rejects non-feed XML", async () => {
    await expect(parseFeedXml("<html><body>no feed</body></html>", "feed-c", "https://example.org"))
      .rejects.toThrow("不是可识别");
  });

  it("decodes numeric and named entities in titles, authors, and snippets", async () => {
    const result = await parseFeedXml(`<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Windows Blog &#038; Friends</title>
          <link>https://example.com/</link>
          <item>
            <guid>post-1</guid>
            <title>Improving File Explorer &#038; Context Menu: faster, simpler, and more customizable</title>
            <link>/posts/1</link>
            <description>Up &#038; running &amp; ready &mdash; now &#x26; then</description>
            <dc:creator>R&amp;D Team</dc:creator>
            <pubDate>Fri, 14 Aug 2026 12:00:00 GMT</pubDate>
          </item>
          <item>
            <guid>post-2</guid>
            <title><![CDATA[CDATA title with literal & ampersand]]></title>
            <link>/posts/2</link>
            <description>second</description>
            <pubDate>Fri, 14 Aug 2026 13:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`, "feed-d", "https://example.com/feed.xml");

    expect(result.title).toBe("Windows Blog & Friends");
    expect(result.items[0]).toMatchObject({
      title: "Improving File Explorer & Context Menu: faster, simpler, and more customizable",
      author: "R&D Team",
      snippet: "Up & running & ready — now & then",
    });
    // CDATA 内容按 XML 规范原样保留，不进行实体解码。
    expect(result.items[1].title).toBe("CDATA title with literal & ampersand");
  });

  it("keeps guid raw so item ids stay stable across parser changes", async () => {
    const result = await parseFeedXml(`<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Feed</title>
          <link>https://example.com/</link>
          <item>
            <guid>https://example.com/posts?a=1&#038;b=2</guid>
            <title>Title &#038; more</title>
            <link>/posts/1</link>
            <description>desc</description>
            <pubDate>Fri, 14 Aug 2026 12:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`, "feed-e", "https://example.com/feed.xml");

    expect(result.items[0].guid).toBe("https://example.com/posts?a=1&#038;b=2");
    expect(result.items[0].title).toBe("Title & more");
  });
});
