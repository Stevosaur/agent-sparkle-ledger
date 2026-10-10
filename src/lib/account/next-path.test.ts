import { describe, expect, it } from "vitest";
import { DEFAULT_NEXT_PATH, firstParam, safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it("keeps same-origin relative paths with query and hash", () => {
    expect(safeNextPath("/hdb/blk-872a-tampines-st-86/")).toBe("/hdb/blk-872a-tampines-st-86/");
    expect(safeNextPath("/compare/?ids=hdb:blk-1-x,condo:foo")).toBe("/compare/?ids=hdb:blk-1-x,condo:foo");
    expect(safeNextPath("/plus/#faq")).toBe("/plus/#faq");
  });

  it("adds the trailing slash to page paths but not to files", () => {
    expect(safeNextPath("/my-property")).toBe("/my-property/");
    expect(safeNextPath("/valuation?type=condo")).toBe("/valuation/?type=condo");
    expect(safeNextPath("/sitemap.xml")).toBe("/sitemap.xml");
  });

  it("falls back for missing or empty values", () => {
    expect(safeNextPath(undefined)).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath(null)).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath("")).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath("   ")).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath(undefined, "/")).toBe("/");
  });

  it("rejects absolute and protocol-relative URLs (open redirect)", () => {
    for (const bad of [
      "https://evil.example/",
      "http://evil.example",
      "//evil.example/path",
      "///evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "data:text/html,hi",
      "evil.example/path",
      "relative/path",
    ]) {
      expect(safeNextPath(bad), bad).toBe(DEFAULT_NEXT_PATH);
    }
  });

  it("rejects backslashes and control characters anywhere", () => {
    expect(safeNextPath("/foo\\bar")).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath("/\t/evil.example")).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath("/foo\nbar")).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath("/foo\u0000")).toBe(DEFAULT_NEXT_PATH);
  });

  it("never redirects back into the auth flow or to APIs", () => {
    expect(safeNextPath("/auth/callback/?code=x")).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath("/auth/signout/")).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath("/login/?next=/profile/")).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath("/LOGIN")).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath("/api/me/")).toBe(DEFAULT_NEXT_PATH);
  });

  it("normalises dot segments without escaping the origin", () => {
    expect(safeNextPath("/a/../profile/")).toBe("/profile/");
    expect(safeNextPath("/../../etc/passwd")).toBe("/etc/passwd/");
  });

  it("rejects over-long input", () => {
    expect(safeNextPath(`/${"a".repeat(2000)}`)).toBe(DEFAULT_NEXT_PATH);
  });
});

describe("firstParam", () => {
  it("takes the first of repeated params", () => {
    expect(firstParam(["/a/", "/b/"])).toBe("/a/");
    expect(firstParam("/a/")).toBe("/a/");
    expect(firstParam(undefined)).toBeUndefined();
  });
});

describe("safeNextPath dot-segment bypasses", () => {
  it.each(["/.//evil.com", "/..//evil.com", "/%2e//evil.com", "/a/..//evil.com", "/.//evil.com/"])("rejects %s", (value) => {
    expect(safeNextPath(value)).toBe(DEFAULT_NEXT_PATH);
  });
});

