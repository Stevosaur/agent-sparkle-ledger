import { describe, expect, it } from "vitest";
import { alertKindFor, normaliseRef, refFromHref } from "./refs";
import { parseAlertCreate, parseAlertUpdate, parseId, parseRefBody, parseTrackedHomeInput, currentMonthSg, cleanLabel } from "./validation";

describe("normaliseRef", () => {
  it("accepts every property kind in canonical form", () => {
    expect(normaliseRef("hdb:blk-872a-tampines-st-86")?.id).toBe("hdb:blk-872a-tampines-st-86");
    expect(normaliseRef("condo:aurora-fixture-residences")?.ref).toEqual({ kind: "condo", slug: "aurora-fixture-residences" });
    expect(normaliseRef("landed:13-sample-ln")?.id).toBe("landed:13-sample-ln");
    expect(normaliseRef("landed-street:sample-ln")?.id).toBe("landed-street:sample-ln");
    expect(normaliseRef("launch:condo/aurora-fixture-residences")?.ref).toEqual({ kind: "launch", slug: "aurora-fixture-residences", launchType: "condo" });
    expect(normaliseRef("  hdb:blk-1-x  ")?.id).toBe("hdb:blk-1-x");
  });

  it("rejects malformed refs", () => {
    for (const bad of [
      "",
      "hdb",
      "hdb:",
      "town:tampines",
      "HDB:blk-1-x",
      "hdb:Blk-1-X",
      "hdb:blk 1",
      "hdb:a/b",
      "hdb:-blk",
      "hdb:blk--1",
      "condo:foo-",
      "launch:foo",
      "launch:/foo",
      "launch:villa/foo",
      "launch:condo/",
      `hdb:${"a".repeat(250)}`,
      "hdb:<script>",
    ]) {
      expect(normaliseRef(bad), bad).toBeNull();
    }
    expect(normaliseRef(42)).toBeNull();
    expect(normaliseRef(null)).toBeNull();
    expect(normaliseRef({ ref: "hdb:x" })).toBeNull();
  });

  it("canonicalises launch refs with extra path segments", () => {
    expect(normaliseRef("launch:ec/the-fixture-ec/extra")?.id).toBe("launch:ec/the-fixture-ec");
  });
});

describe("refFromHref", () => {
  it("maps property page paths from the search index", () => {
    expect(refFromHref("/hdb/blk-872a-tampines-st-86/")).toEqual({ kind: "hdb", slug: "blk-872a-tampines-st-86" });
    expect(refFromHref("/condo/sample-park-condo/")).toEqual({ kind: "condo", slug: "sample-park-condo" });
    expect(refFromHref("/landed/15-sample-ln/")).toEqual({ kind: "landed", slug: "15-sample-ln" });
    expect(refFromHref("/landed-street/fixture-cres/")).toEqual({ kind: "landed-street", slug: "fixture-cres" });
    expect(refFromHref("/new-launch/condo/upcoming-fixture-towers/")).toEqual({ kind: "launch", slug: "upcoming-fixture-towers", launchType: "condo" });
    expect(refFromHref("/hdb/blk-1-x/?tab=sales")).toEqual({ kind: "hdb", slug: "blk-1-x" });
  });

  it("returns null for non-property pages", () => {
    expect(refFromHref("/insights/town/tampines/")).toBeNull();
    expect(refFromHref("/mrt/tampines/")).toBeNull();
    expect(refFromHref("/hdb/")).toBeNull();
    expect(refFromHref("https://evil.example/hdb/blk-1-x/")).toBeNull();
  });
});

describe("alert kinds", () => {
  it("derives the kind from the property", () => {
    expect(alertKindFor({ kind: "launch", slug: "x", launchType: "condo" })).toBe("new-launch");
    expect(alertKindFor({ kind: "hdb", slug: "x" })).toBe("new-sale");
    expect(alertKindFor({ kind: "landed-street", slug: "x" })).toBe("new-sale");
  });

  it("validates alert bodies", () => {
    const ok = parseAlertCreate({ ref: "hdb:blk-872a-tampines-st-86" });
    expect(ok).toEqual({ ok: true, value: { ref: { kind: "hdb", slug: "blk-872a-tampines-st-86" }, refId: "hdb:blk-872a-tampines-st-86", kind: "new-sale", channel: "telegram" } });
    expect(parseAlertCreate({ ref: "launch:condo/upcoming-fixture-towers", kind: "new-launch" }).ok).toBe(true);
    expect(parseAlertCreate({ ref: "launch:condo/upcoming-fixture-towers", kind: "new-sale" })).toMatchObject({ ok: false, error: "invalid_kind" });
    expect(parseAlertCreate({ ref: "hdb:blk-1-x", channel: "email" })).toMatchObject({ ok: false, error: "channel_unavailable" });
    expect(parseAlertCreate({ ref: "hdb:blk-1-x", channel: "sms" })).toMatchObject({ ok: false, error: "invalid_channel" });
    expect(parseAlertCreate({ ref: "nope" })).toMatchObject({ ok: false, error: "invalid_ref" });
    expect(parseAlertCreate("hdb:blk-1-x")).toMatchObject({ ok: false, error: "invalid_body" });
  });

  it("validates alert updates", () => {
    expect(parseAlertUpdate({ id: 3, active: false })).toEqual({ ok: true, value: { id: 3, active: false } });
    expect(parseAlertUpdate({ id: "7", channel: "telegram" })).toEqual({ ok: true, value: { id: 7, channel: "telegram" } });
    expect(parseAlertUpdate({ id: 3 })).toMatchObject({ ok: false, error: "nothing_to_update" });
    expect(parseAlertUpdate({ id: 3, active: "no" })).toMatchObject({ ok: false, error: "invalid_active" });
    expect(parseAlertUpdate({ id: -1, active: true })).toMatchObject({ ok: false, error: "invalid_id" });
  });
});

describe("watchlist body", () => {
  it("parses { ref }", () => {
    expect(parseRefBody({ ref: "condo:sample-park-condo", label: "x" })).toEqual({ ok: true, value: { ref: { kind: "condo", slug: "sample-park-condo" }, id: "condo:sample-park-condo" } });
    expect(parseRefBody({})).toMatchObject({ ok: false, error: "invalid_ref" });
    expect(parseRefBody(undefined)).toMatchObject({ ok: false, error: "invalid_body" });
    expect(parseRefBody([{ ref: "hdb:x" }])).toMatchObject({ ok: false, error: "invalid_body" });
  });
});

describe("tracked home body", () => {
  const now = "2026-10";

  it("requires a flat type for HDB and accepts optional details", () => {
    expect(parseTrackedHomeInput({ ref: "hdb:blk-872a-tampines-st-86" }, now)).toMatchObject({ ok: false, error: "flat_type_required" });
    expect(parseTrackedHomeInput({ ref: "hdb:blk-872a-tampines-st-86", flatType: "4 ROOM" }, now)).toEqual({
      ok: true,
      value: { ref: { kind: "hdb", slug: "blk-872a-tampines-st-86" }, refId: "hdb:blk-872a-tampines-st-86", flatType: "4 ROOM", areaSqm: null, floor: null, purchasePrice: null, purchaseMonth: null },
    });
    const full = parseTrackedHomeInput({ ref: "hdb:blk-872a-tampines-st-86", flatType: "5 ROOM", areaSqm: "112.55", floor: "12", purchasePrice: "S$520,000", purchaseMonth: "2019-03" }, now);
    expect(full).toMatchObject({ ok: true, value: { areaSqm: 112.6, floor: 12, purchasePrice: 520000, purchaseMonth: "2019-03" } });
  });

  it("requires a floor area for condos, not for landed", () => {
    expect(parseTrackedHomeInput({ ref: "condo:sample-park-condo" }, now)).toMatchObject({ ok: false, error: "area_required" });
    expect(parseTrackedHomeInput({ ref: "condo:sample-park-condo", areaSqm: 95 }, now)).toMatchObject({ ok: true, value: { areaSqm: 95, flatType: null } });
    expect(parseTrackedHomeInput({ ref: "landed:15-sample-ln" }, now)).toMatchObject({ ok: true, value: { areaSqm: null } });
  });

  it("ignores flat type for non-HDB homes", () => {
    expect(parseTrackedHomeInput({ ref: "condo:sample-park-condo", areaSqm: 95, flatType: "4 ROOM" }, now)).toMatchObject({ ok: true, value: { flatType: null } });
  });

  it("rejects out-of-range or malformed values", () => {
    const base = { ref: "condo:sample-park-condo", areaSqm: 95 };
    expect(parseTrackedHomeInput({ ...base, areaSqm: 5 }, now)).toMatchObject({ ok: false, error: "invalid_area" });
    expect(parseTrackedHomeInput({ ...base, areaSqm: "big" }, now)).toMatchObject({ ok: false, error: "invalid_area" });
    expect(parseTrackedHomeInput({ ...base, floor: 2.5 }, now)).toMatchObject({ ok: false, error: "invalid_floor" });
    expect(parseTrackedHomeInput({ ...base, floor: 0 }, now)).toMatchObject({ ok: false, error: "invalid_floor" });
    expect(parseTrackedHomeInput({ ...base, purchasePrice: 999 }, now)).toMatchObject({ ok: false, error: "invalid_price" });
    expect(parseTrackedHomeInput({ ...base, purchasePrice: Number.NaN }, now)).toMatchObject({ ok: false, error: "invalid_price" });
    expect(parseTrackedHomeInput({ ...base, purchaseMonth: "2027-01" }, now)).toMatchObject({ ok: false, error: "invalid_month" });
    expect(parseTrackedHomeInput({ ...base, purchaseMonth: "2019-13" }, now)).toMatchObject({ ok: false, error: "invalid_month" });
    expect(parseTrackedHomeInput({ ...base, purchaseMonth: "1959-12" }, now)).toMatchObject({ ok: false, error: "invalid_month" });
    expect(parseTrackedHomeInput({ ...base, purchaseMonth: 201903 }, now)).toMatchObject({ ok: false, error: "invalid_month" });
    expect(parseTrackedHomeInput({ ref: "hdb:blk-1-x", flatType: "PENTHOUSE" }, now)).toMatchObject({ ok: false, error: "flat_type_required" });
  });

  it("only allows trackable property kinds", () => {
    expect(parseTrackedHomeInput({ ref: "landed-street:sample-ln" }, now)).toMatchObject({ ok: false, error: "unsupported_property" });
    expect(parseTrackedHomeInput({ ref: "launch:condo/aurora-fixture-residences" }, now)).toMatchObject({ ok: false, error: "unsupported_property" });
  });
});

describe("small validators", () => {
  it("parses ids", () => {
    expect(parseId(5)).toBe(5);
    expect(parseId("12")).toBe(12);
    expect(parseId(0)).toBeNull();
    expect(parseId(1.5)).toBeNull();
    expect(parseId("1e3")).toBeNull();
    expect(parseId(null)).toBeNull();
  });

  it("formats the current month in Singapore time", () => {
    // 2026-09-30 17:00 UTC is already 1 October in Singapore (UTC+8).
    expect(currentMonthSg(new Date("2026-09-30T17:00:00Z"))).toBe("2026-10");
    expect(currentMonthSg(new Date("2026-09-30T15:00:00Z"))).toBe("2026-09");
  });

  it("cleans labels", () => {
    expect(cleanLabel("  Blk 1\n  Tampines  ")).toBe("Blk 1 Tampines");
    expect(cleanLabel("")).toBeNull();
    expect(cleanLabel(5)).toBeNull();
    expect(cleanLabel("x".repeat(300))?.length).toBe(200);
  });
});
