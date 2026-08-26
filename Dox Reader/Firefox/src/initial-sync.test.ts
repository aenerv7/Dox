import { describe, expect, it } from "vitest";
import { needsInitialArticleRefresh } from "./initial-sync";

describe("initial sync article refresh", () => {
  it("refreshes feeds restored onto an empty device", () => {
    expect(needsInitialArticleRefresh(false, 3)).toBe(true);
  });

  it("does not refresh when local reader data already exists", () => {
    expect(needsInitialArticleRefresh(true, 3)).toBe(false);
  });

  it("does not refresh an empty remote library", () => {
    expect(needsInitialArticleRefresh(false, 0)).toBe(false);
  });
});
