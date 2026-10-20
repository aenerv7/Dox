import { describe, expect, it } from "vitest";
import { decodeHtmlEntities } from "./html-entities";

describe("decodeHtmlEntities", () => {
  it("decodes decimal and hex numeric character references", () => {
    expect(decodeHtmlEntities("A &#038; B")).toBe("A & B");
    expect(decodeHtmlEntities("A &#38; B")).toBe("A & B");
    expect(decodeHtmlEntities("A &#x26; B")).toBe("A & B");
    expect(decodeHtmlEntities("A &#X26; B")).toBe("A & B");
    expect(decodeHtmlEntities("A &#0038; B")).toBe("A & B");
    expect(decodeHtmlEntities("It&#8217;s &#8212; here")).toBe("It’s — here");
    expect(decodeHtmlEntities("&#x1F600; emoji")).toBe("😀 emoji");
  });

  it("decodes common HTML named entities", () => {
    expect(decodeHtmlEntities("Fish &amp; Chips")).toBe("Fish & Chips");
    expect(decodeHtmlEntities("&lt;tag&gt;")).toBe("<tag>");
    expect(decodeHtmlEntities("&quot;quote&quot;")).toBe("\"quote\"");
    expect(decodeHtmlEntities("it&rsquo;s &mdash; &hellip;")).toBe("it’s — …");
    expect(decodeHtmlEntities("&nbsp;")).toBe("\u00a0");
    expect(decodeHtmlEntities("&euro;10")).toBe("€10");
  });

  it("leaves unknown, unclosed, and invalid references untouched", () => {
    expect(decodeHtmlEntities("&notreal; x")).toBe("&notreal; x");
    expect(decodeHtmlEntities("unclosed &amp")).toBe("unclosed &amp");
    expect(decodeHtmlEntities("stray & here")).toBe("stray & here");
    expect(decodeHtmlEntities("&#0; &#x110000; &#xD800;")).toBe("&#0; &#x110000; &#xD800;");
    expect(decodeHtmlEntities("&#; &#x;")).toBe("&#; &#x;");
  });

  it("is idempotent", () => {
    const samples = [
      "Improving File Explorer &#038; Context Menu",
      "R&amp;D &#8217; &#x2014;",
      "plain text, no entities",
      "&notreal; stays",
    ];
    for (const sample of samples) {
      const once = decodeHtmlEntities(sample);
      expect(decodeHtmlEntities(once)).toBe(once);
    }
  });
});
