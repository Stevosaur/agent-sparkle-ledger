import { describe, expect, it } from "vitest";
import { firstParam, formatRefList, MAX_COMPARE, parseRefList, refFromHref } from "./refs";

describe("refFromHref", () => {
  it("maps search result hrefs to property refs", () => {
    expect(refFromHref("/hdb/blk-872a-tampines-st-86/")).toEqual({ kind: "hdb", slug: "blk-872a-tampines-st-86" });
    expect(refFromHref("/condo/the-hillford/")).toEqual({ kind: "condo", slug: "the-hillford" });
    expect(refFromHref("/landed/13-haig-ln/")).toEqual({ kind: "landed", slug: "13-haig-ln" });
    expect(refFromHref("/landed-street/haig-ln/")).toEqual({ kind: "landed-street", slug: "haig-ln" });
    expect(refFromHref("/new-launch/ec/foo/?x=1")).toEqual({ kind: "launch", slug: "foo", launchType: "ec" });
  });

  it("ignores towns, stations and anything else", () => {
    expect(refFromHref("/insights/town/tampines/")).toBeNull();
    expect(refFromHref("/mrt/tampines/")).toBeNull();
    expect(refFromHref("https://example.com/hdb/x/")).toBeNull();
  });
});

describe("parseRefList", () => {
  it("dedupes, caps and reports invalid ids", () => {
    const { refs, invalid } = parseRefList("hdb:blk-1-a, condo:x,hdb:blk-1-a,bad,landed:2-y,launch:condo/z,condo:w", MAX_COMPARE);
    expect(refs.map((r) => r.slug)).toEqual(["blk-1-a", "x", "2-y", "z"]);
    expect(refs[3]).toEqual({ kind: "launch", slug: "z", launchType: "condo" });
    expect(invalid).toEqual(["bad"]);
    expect(formatRefList(refs)).toBe("hdb:blk-1-a,condo:x,landed:2-y,launch:condo/z");
  });

  it("handles empty and repeated params", () => {
    expect(parseRefList(undefined)).toEqual({ refs: [], invalid: [] });
    expect(parseRefList(["hdb:a", "condo:b"]).refs.length).toBe(2);
    expect(firstParam(["x", "y"])).toBe("x");
    expect(firstParam(undefined)).toBeUndefined();
  });
});
