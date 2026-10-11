import { describe, expect, it } from "vitest";
import { getHdbBlock } from "@/lib/data/hdb";
import { getProject, getProjects } from "@/lib/data/private";
import { monthIndex } from "@/lib/data/months";
import { haversineM } from "@/lib/geo-math";
import { balaPct } from "@/lib/calc/lease";
import {
  COMPARABLES_SHOWN,
  HDB_LOOKBACK_MONTHS,
  MIN_SAME_SITE,
  NEARBY_RADIUS_M,
  PRIVATE_LOOKBACK_MONTHS,
  estimateValuation,
  landedAreaBasis,
  landedSubjectFor,
  selectCondoComparables,
  selectHdbComparables,
  selectLandedComparables,
  storeyRangeMid,
} from "./valuation-service";

// Fixture snapshot: latest month for both families is 2026-08.
const AS_OF = monthIndex("2026-08");

describe("HDB comparable selection", () => {
  const block = getHdbBlock("blk-872a-tampines-st-86")!;

  it("uses same-block, same-flat-type sales within the lookback window", () => {
    const sel = selectHdbComparables(block, "4 ROOM", AS_OF);
    const same = sel.comps.filter((c) => c.sameSite);
    expect(same.length).toBe(sel.sameSiteCount);
    for (const c of same) {
      expect(c.distanceM).toBe(0);
      expect(c.href).toBe("/hdb/blk-872a-tampines-st-86/");
      expect(c.detail.startsWith("4 ROOM")).toBe(true);
    }
    for (const c of sel.comps) {
      expect(c.monthIndex).toBeLessThanOrEqual(AS_OF);
      expect(c.monthIndex).toBeGreaterThan(AS_OF - sel.lookbackMonths);
    }
    expect(sel.lookbackMonths).toBe(HDB_LOOKBACK_MONTHS);
  });

  it("widens to blocks within 1 km (same flat type) when the block has too few sales", () => {
    const sel = selectHdbComparables(block, "4 ROOM", AS_OF);
    expect(sel.sameSiteCount).toBeLessThan(MIN_SAME_SITE);
    expect(sel.widened).toBe(true);
    const nearby = sel.comps.filter((c) => !c.sameSite);
    expect(nearby.length).toBeGreaterThan(0);
    for (const c of nearby) {
      expect(c.distanceM).toBeGreaterThan(0);
      expect(c.distanceM!).toBeLessThanOrEqual(NEARBY_RADIUS_M);
      expect(c.detail.startsWith("4 ROOM")).toBe(true);
    }
    // Blk 455 Tampines St 42 is ~1.8 km away and must not be used
    expect(sel.comps.some((c) => c.href === "/hdb/blk-455-tampines-st-42/")).toBe(false);
  });

  it("values a block with no resales of its own from nearby blocks", () => {
    const empty = getHdbBlock("blk-999-tampines-st-99")!;
    const sel = selectHdbComparables(empty, "4 ROOM", AS_OF);
    expect(sel.sameSiteCount).toBe(0);
    expect(sel.comps.length).toBeGreaterThan(0);
    expect(sel.comps.every((c) => !c.sameSite && c.href !== "/hdb/blk-999-tampines-st-99/")).toBe(true);
  });

  it("does not widen when the block has enough of its own sales", () => {
    // 3 ROOM in Blk 201 Tampines St 21 has plenty of sales once the lookback is long enough
    const b = getHdbBlock("blk-201-tampines-st-21")!;
    const sel = selectHdbComparables(b, "3 ROOM", AS_OF);
    if (sel.sameSiteCount >= MIN_SAME_SITE) expect(sel.widened).toBe(false);
    else expect(sel.widened).toBe(true);
  });
});

describe("condo comparable selection", () => {
  it("uses the project's own non-landed single-unit sales within 36 months", () => {
    const p = getProject("aurora-fixture-residences")!;
    const sel = selectCondoComparables(p, AS_OF);
    expect(sel.lookbackMonths).toBe(PRIVATE_LOOKBACK_MONTHS);
    expect(sel.sameSiteCount).toBeGreaterThanOrEqual(MIN_SAME_SITE);
    expect(sel.widened).toBe(false);
    for (const c of sel.comps) {
      expect(c.href).toBe("/condo/aurora-fixture-residences/");
      expect(c.monthIndex).toBeGreaterThan(AS_OF - PRIVATE_LOOKBACK_MONTHS);
    }
  });

  it("only widens to projects in the same segment and of the same EC / non-EC class", () => {
    const ec = getProject("the-fixture-ec")!;
    const sel = selectCondoComparables(ec, AS_OF);
    const hrefs = new Set(sel.comps.map((c) => c.href));
    for (const href of hrefs) {
      const slug = href!.split("/")[2];
      const p = getProjects().find((x) => x.slug === slug)!;
      expect(p.propertyTypes).toContain("Executive Condominium");
      expect(p.segment).toBe(ec.segment);
      if (slug !== ec.slug) expect(haversineM({ lat: ec.lat!, lng: ec.lng! }, { lat: p.lat!, lng: p.lng! })).toBeLessThanOrEqual(NEARBY_RADIUS_M);
    }
  });
});

describe("landed comparable selection", () => {
  it("starts from the same street and links unit-level sales to their address pages", () => {
    const subject = landedSubjectFor({ kind: "landed", slug: "2-fixture-cres" })!;
    const sel = selectLandedComparables(subject, AS_OF);
    expect(sel.comps.length).toBeGreaterThan(0);
    const street = sel.comps.filter((c) => c.sameSite);
    expect(street.length).toBe(sel.sameSiteCount);
    expect(street.every((c) => c.distanceM === 0 && c.floor === null)).toBe(true);
    expect(street.some((c) => c.href === "/landed/4-fixture-cres/")).toBe(true);
    expect(sel.comps.every((c) => c.detail.startsWith("Semi-detached"))).toBe(true);
  });

  it("compares like with like: land-area sales for land-titled homes, strata-area sales for strata landed", () => {
    expect(landedAreaBasis(["Terrace", "Semi-detached"])).toBe("land");
    expect(landedAreaBasis(["Strata Terrace"])).toBe("strata");
    expect(landedAreaBasis(["Terrace", "Strata Terrace"])).toBeNull();
    expect(landedAreaBasis([])).toBeNull();
    const subject = landedSubjectFor({ kind: "landed", slug: "15-sample-ln" })!;
    const strata = selectLandedComparables({ ...subject, propertyTypes: ["Strata Terrace"] }, AS_OF);
    // every fixture landed sale reports land area, so none can be used for a strata subject
    expect(strata.comps.length).toBe(0);
  });

  it("accepts a landed street as the subject", () => {
    const subject = landedSubjectFor({ kind: "landed-street", slug: "sample-ln" })!;
    expect(subject.streetSlug).toBe("sample-ln");
    const sel = selectLandedComparables(subject, AS_OF);
    expect(sel.sameSiteCount).toBeGreaterThan(0);
  });
});

describe("estimateValuation", () => {
  it("returns an estimate inside its range with at most 10 comparables, nearest first", () => {
    const out = estimateValuation({ ref: { kind: "hdb", slug: "blk-872a-tampines-st-86" }, flatType: "4 ROOM", storeyRange: "07 TO 09", areaSqm: 93 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const v = out.valuation;
    expect(v.asOf).toBe("2026-08");
    expect(v.low).toBeLessThanOrEqual(v.estimate);
    expect(v.estimate).toBeLessThanOrEqual(v.high);
    expect(v.estimate % 1000).toBe(0);
    expect(v.comparables.length).toBeLessThanOrEqual(COMPARABLES_SHOWN);
    expect(v.comparables.length).toBeLessThanOrEqual(v.comparablesUsed);
    const d = v.comparables.map((c) => c.distanceM ?? Infinity);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
    expect(v.index?.key).toBe("hdb:TAMPINES:4 ROOM");
    expect(v.method.length).toBeGreaterThan(3);
    expect(v.input.floor).toBe(8);
    // lease adjustment switches on whenever the calculators ship a Bala's Table
    if (balaPct(60) != null) {
      expect(v.leaseAdjusted).toBe(true);
      expect(v.method.some((m) => m.includes("Bala's Table"))).toBe(true);
    } else expect(v.leaseAdjusted).toBe(false);
  });

  it("values condos and landed homes", () => {
    const condo = estimateValuation({ ref: { kind: "condo", slug: "sample-park-condo" }, floor: 8, areaSqm: 100 });
    expect(condo.ok && condo.valuation.index?.key).toBe("private-d:20:NonLanded");
    const landed = estimateValuation({ ref: { kind: "landed", slug: "15-sample-ln" }, areaSqm: 160 });
    expect(landed.ok).toBe(true);
    if (landed.ok) expect(landed.valuation.comparables.every((c) => c.areaSqm === 160)).toBe(true);
  });

  it("says so when the index cannot time-adjust prices", () => {
    // the fixture landed index (private:OCR:Landed) has no sales within 6 months of 2026-08
    const landed = estimateValuation({ ref: { kind: "landed", slug: "15-sample-ln" }, areaSqm: 160 });
    if (!landed.ok) throw new Error("expected an estimate");
    expect(landed.valuation.comparables.every((c) => c.adjustedPsf === c.psf)).toBe(true);
    expect(landed.valuation.method.some((m) => m.includes("not time-adjusted"))).toBe(true);
    expect(landed.valuation.method.some((m) => m.startsWith("Each sale's price per square foot is moved"))).toBe(false);
    // the HDB index does cover the latest month
    const hdb = estimateValuation({ ref: { kind: "hdb", slug: "blk-872a-tampines-st-86" }, flatType: "4 ROOM", storeyRange: "07 TO 09", areaSqm: 93 });
    if (!hdb.ok) throw new Error("expected an estimate");
    expect(hdb.valuation.method.some((m) => m.startsWith("Each sale's price per square foot is moved"))).toBe(true);
  });

  it("rejects unknown properties, missing inputs and thin data", () => {
    expect(estimateValuation({ ref: { kind: "hdb", slug: "blk-0-nowhere" }, flatType: "4 ROOM", storeyRange: "01 TO 03", areaSqm: 90 })).toMatchObject({ ok: false, status: 404 });
    expect(estimateValuation({ ref: { kind: "hdb", slug: "blk-872a-tampines-st-86" }, storeyRange: "01 TO 03", areaSqm: 90 })).toMatchObject({ ok: false, status: 400 });
    expect(estimateValuation({ ref: { kind: "hdb", slug: "blk-872a-tampines-st-86" }, flatType: "4 ROOM", storeyRange: "01 TO 03", areaSqm: 0 })).toMatchObject({ ok: false, status: 400 });
    expect(estimateValuation({ ref: { kind: "hdb", slug: "blk-872a-tampines-st-86" }, flatType: "EXECUTIVE", storeyRange: "01 TO 03", areaSqm: 140 })).toMatchObject({
      ok: false,
      status: 422,
      error: "not_enough_comparables",
    });
    expect(estimateValuation({ ref: { kind: "condo", slug: "landed-sample-ln" }, areaSqm: 100 })).toMatchObject({ ok: false, status: 404 });
  });

  it("parses storey ranges", () => {
    expect(storeyRangeMid("07 TO 09")).toBe(8);
    expect(storeyRangeMid("01 TO 05")).toBe(3);
    expect(storeyRangeMid("ground")).toBeNull();
    expect(storeyRangeMid(null)).toBeNull();
  });
});
