import { describe, expect, it } from "vitest";
import { formatItemSource, matchesItemView } from "./item-list";

const item = {
  id: "article-1",
  feedId: "feed-1",
  read: true,
  starred: false,
  title: "Example article",
  author: "Author",
  snippet: "Summary",
};

describe("item list views", () => {
  it("retains an article read during the current unread session", () => {
    expect(matchesItemView(item, "unread", "", new Set([item.id]))).toBe(true);
  });

  it("hides the read article in a new unread session", () => {
    expect(matchesItemView(item, "unread", "", new Set())).toBe(false);
  });

  it("shows feed name and host in all and unread views", () => {
    expect(formatItemSource("all", "BBC News", "bbc.com")).toBe("BBC News - bbc.com");
    expect(formatItemSource("unread", "BBC News", "bbc.com")).toBe("BBC News - bbc.com");
  });

  it("shows only the host inside an individual feed", () => {
    expect(formatItemSource("feed-1", "BBC News", "bbc.com")).toBe("bbc.com");
  });
});
