import { describe, expect, it } from "vitest";
import { quantile } from "@/lib/stats-math";
import { getBlockRentals, getBlockTransactions, getHdbBlock, getTownTransactions } from "@/lib/data/hdb";
import { getProjectRentals, getProjectTransactions } from "@/lib/data/private";
import { monthIndex } from "@/lib/data/months";
import { getMeta } from "@/lib/data/meta";
import { sqmToSqft } from "@/lib/format";
import { percentAlong, positionInRange, quartiles, rangeFromPrices, rangeFromPsf, roundTo } from "./fair-value";
import { fairValueForListing } from "./fair-value-data";

describe("fair-value maths", () => {
  it("computes quartiles, ignoring non-positive and non-finite values", () => {
    expect(quartiles([400, 100, 300, 200, 0, Number.NaN])).toEqual({ q1: 175, median: 250, q3: 325, n: 4 });
    expect(quartiles([])).toBeNull();
  });
  it("builds a rounded price range only with enough records", () => {
    expect(rangeFromPrices([500_000, 520_000, 540_000], "sale", 3)).toEqual({ low: 510_000, mid: 520_000, high: 530_000, n: 3 });
    expect(rangeFromPrices([500_000, 520_000], "sale", 3)).toBeNull();
    expect(rangeFromPrices([2_345, 2_500, 2_655], "rent", 3)).toEqual({ low: 2_420, mid: 2_500, high: 2_580, n: 3 });
  });
  it("applies psf quartiles to a floor area", () => {
    const r = rangeFromPsf([1000, 1100, 1200, 1300], 1000, 3);
    expect(r).toEqual({ low: 1_075_000, mid: 1_150_000, high: 1_225_000, psf: { low: 1075, mid: 1150, high: 1225 }, n: 4 });
    expect(rangeFromPsf([1000, 1100, 1200], 0, 3)).toBeNull();
  });
  it("places the asking price against the range", () => {
    expect(positionInRange(99, { low: 100, high: 200 })).toBe("below");
    expect(positionInRange(100, { low: 100, high: 200 })).toBe("within");
    expect(positionInRange(201, { low: 100, high: 200 })).toBe("above");
    expect(percentAlong(150, 100, 200)).toBe(50);
    expect(percentAlong(500, 100, 200)).toBe(100);
    expect(percentAlong(5, 5, 5)).toBe(50);
    expect(roundTo(1234, 10)).toBe(1230);
  });
});

describe("fairValueForListing (fixture snapshot)", () => {
  const latestHdb = monthIndex(getMeta().latestMonth.hdb!);
  const latestPrivate = monthIndex(getMeta().latestMonth.private!);

  it("uses the block's 12-month IQR for the flat type when there are 3+ sales", () => {
    const slug = "blk-301-punggol-ctrl";
    const prices = getBlockTransactions(slug)
      .filter((t) => t.flatType === "3 ROOM" && t.monthIndex > latestHdb - 12)
      .map((t) => t.price);
    expect(prices.length).toBeGreaterThanOrEqual(3);
    const out = fairValueForListing({ ref: `hdb:${slug}`, listingType: "sale", flatType: "3 ROOM", areaSqm: 68, bedrooms: 2, askingPrice: 459_000 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.range.method).toBe("block-iqr");
    expect(out.range.sampleSize).toBe(prices.length);
    expect(out.range.low).toBe(roundTo(quantile(prices, 0.25), 1000));
    expect(out.range.mid).toBe(roundTo(quantile(prices, 0.5), 1000));
    expect(out.range.high).toBe(roundTo(quantile(prices, 0.75), 1000));
    expect(out.range.to).toBe(getMeta().latestMonth.hdb);
    expect(out.range.source).toMatch(/HDB resale/);
    expect(out.position).toBe(positionInRange(459_000, out.range));
  });

  it("falls back to the town when the block has too few sales of the flat type", () => {
    const block = getHdbBlock("blk-999-tampines-st-99")!;
    expect(block.tx.count).toBe(0);
    const townPrices = getTownTransactions(block.townSlug)
      .filter((t) => t.flatType === "4 ROOM" && t.monthIndex > latestHdb - 12)
      .map((t) => t.price);
    const out = fairValueForListing({ ref: "hdb:blk-999-tampines-st-99", listingType: "sale", flatType: "4 ROOM", areaSqm: 93, bedrooms: 3, askingPrice: 600_000 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.range.method).toBe(townPrices.length >= 5 ? "town-iqr" : "town-median");
    expect(out.range.sampleSize).toBe(townPrices.length);
    expect(out.range.mid).toBe(roundTo(quantile(townPrices, 0.5), 1000));
    expect(out.range.scope).toBe("Tampines · 4 ROOM");
  });

  it("uses rental approvals for rent listings", () => {
    const slug = "blk-872a-tampines-st-86";
    expect(getBlockRentals(slug).length).toBeGreaterThan(0);
    const out = fairValueForListing({ ref: `hdb:${slug}`, listingType: "rent", flatType: "4 ROOM", areaSqm: null, bedrooms: 3, askingPrice: 2_500 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.range.basis).toBe("rent");
    expect(out.range.source).toMatch(/renting out of flats/);
    expect(out.range.low % 10).toBe(0);
  });

  it("ends rent windows at the dataset's latest rental month, not the area's newest record", () => {
    const hdbRentLatest = getMeta().latestMonth.hdbRentals!;
    const hdb = fairValueForListing({ ref: "hdb:blk-872a-tampines-st-86", listingType: "rent", flatType: "4 ROOM", areaSqm: null, bedrooms: 3, askingPrice: 2_500 });
    expect(hdb.ok).toBe(true);
    if (hdb.ok) expect(hdb.range.to).toBe(hdbRentLatest);

    const latest = monthIndex(getMeta().latestMonth.privateRentals!);
    const slug = "aurora-fixture-residences";
    const all = getProjectRentals(slug);
    const inWindow = all.filter((r) => r.monthIndex > latest - 12 && r.monthIndex <= latest && r.monthlyRent > 0);
    // older contracts exist but must not count as "latest 12 months"
    expect(all.length).toBeGreaterThan(inWindow.length);
    const condo = fairValueForListing({ ref: `condo:${slug}`, listingType: "rent", flatType: null, areaSqm: null, bedrooms: null, askingPrice: 3_000 });
    if (inWindow.length >= 3) {
      expect(condo.ok).toBe(true);
      if (condo.ok) {
        expect(condo.range.to).toBe(getMeta().latestMonth.privateRentals);
        expect(condo.range.sampleSize).toBe(inWindow.length);
      }
    } else {
      expect(condo).toMatchObject({ ok: false, reason: "no-recent-records" });
    }
  });

  it("uses the project's 12-month psf IQR x floor area for condos", () => {
    const slug = "aurora-fixture-residences";
    const psfs = getProjectTransactions(slug)
      .filter((t) => t.units === 1 && t.typeOfArea !== "Land" && t.monthIndex > latestPrivate - 12)
      .map((t) => t.psf);
    expect(psfs.length).toBeGreaterThanOrEqual(3);
    const area = 95;
    const out = fairValueForListing({ ref: `condo:${slug}`, listingType: "sale", flatType: null, areaSqm: area, bedrooms: null, askingPrice: 1_300_000 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.range.method).toBe("project-psf-iqr");
    expect(out.range.psf?.mid).toBe(Math.round(quantile(psfs, 0.5)));
    expect(out.range.mid).toBe(roundTo(quantile(psfs, 0.5) * sqmToSqft(area), 1000));
    expect(out.range.source).toMatch(/URA/);
  });

  it("explains why there is no range", () => {
    expect(fairValueForListing({ ref: "hdb:blk-301-punggol-ctrl", listingType: "sale", flatType: null, areaSqm: 68, bedrooms: null, askingPrice: 1 })).toMatchObject({ ok: false, reason: "no-flat-type" });
    expect(fairValueForListing({ ref: "condo:aurora-fixture-residences", listingType: "sale", flatType: null, areaSqm: null, bedrooms: null, askingPrice: 1 })).toMatchObject({ ok: false, reason: "no-area" });
    expect(fairValueForListing({ ref: "landed:15-sample-ln", listingType: "sale", flatType: null, areaSqm: 160, bedrooms: null, askingPrice: 1 })).toMatchObject({ ok: false, reason: "landed" });
    expect(fairValueForListing({ ref: "hdb:blk-0-nowhere", listingType: "sale", flatType: "4 ROOM", areaSqm: 90, bedrooms: null, askingPrice: 1 })).toMatchObject({ ok: false, reason: "unresolved" });
    expect(fairValueForListing({ ref: "garbage", listingType: "sale", flatType: null, areaSqm: null, bedrooms: null, askingPrice: 1 })).toMatchObject({ ok: false, reason: "unresolved" });
  });
});
