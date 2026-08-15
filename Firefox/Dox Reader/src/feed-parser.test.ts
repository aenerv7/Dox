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
});
