import { describe, expect, it } from "vitest";
import { getHdbBlock } from "@/lib/data/hdb";
import { currentYearSg, mopHeadline, parseRadius, supplyDemand } from "./supply-demand";
import { getValuationSubject, resolveValuationDeepLink, storeyBands } from "./valuation-subject";
import { compareColumn, salesForUnits } from "./compare";

const NOW = new Date("2026-10-10T04:00:00Z");
const TAMPINES_872A = { lat: 1.3555, lng: 103.939 };

describe("supply & demand", () => {
  it("uses the Singapore calendar year", () => {
    expect(currentYearSg(new Date("2026-12-31T17:00:00Z"))).toBe(2027);
    expect(currentYearSg(NOW)).toBe(2026);
  });

  it("counts flats reaching MOP in the next three years within 2 km", () => {
    // Blk 999 Tampines St 99 (150 flats, completed 2024) reaches MOP in 2029
    const h = mopHeadline(TAMPINES_872A, NOW);
    expect(h).toMatchObject({ fromYear: 2027, toYear: 2029, units: 150, blocks: 1, radiusM: 2000 });
  });

  it("puts MOP cohorts and private completions on the same years", () => {
    const r = supplyDemand(TAMPINES_872A, 3000, NOW);
    expect(r.fromYear).toBe(2024);
    expect(r.toYear).toBe(2031);
    expect(r.rows.map((x) => x.year)).toEqual([2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031]);
    expect(r.rows.find((x) => x.year === 2028)).toMatchObject({ supplyUnits: 400, supplyProjects: ["Aurora Fixture Residences"] });
    expect(r.rows.find((x) => x.year === 2029)?.mopUnits).toBe(150);
    expect(r.totals).toEqual({ mopUnits: 150, supplyUnits: 400, ratio: 150 / 400 });
  });

  it("returns a null ratio when there is no supply", () => {
    const far = supplyDemand({ lat: 1.3, lng: 103.7 }, 1000, NOW);
    expect(far.totals.supplyUnits).toBe(0);
    expect(far.totals.ratio).toBeNull();
    // launch data is loaded, so this really is "no supply nearby" rather than "unknown"
    expect(far.launchData).toBe(true);
  });

  it("accepts only the published radii", () => {
    expect(parseRadius("2000")).toBe(2000);
    expect(parseRadius("2500")).toBeNull();
    expect(parseRadius(null)).toBeNull();
  });
});

describe("valuation subject and deep links", () => {
  it("prefills HDB flat types from the block, falling back to the town", () => {
    const s = getValuationSubject({ kind: "hdb", slug: "blk-999-tampines-st-99" })!;
    expect(s.hdb!.flatTypes.map((f) => f.flatType)).toEqual(["4 ROOM", "5 ROOM"]);
    expect(s.hdb!.flatTypes.every((f) => f.typicalAreaFrom === "town" && f.sales === 0)).toBe(true);
    const own = getValuationSubject({ kind: "hdb", slug: "blk-872a-tampines-st-86" })!;
    expect(own.hdb!.flatTypes.find((f) => f.flatType === "4 ROOM")?.typicalAreaFrom).toBe("block");
    expect(own.hdb!.storeyRanges.at(-1)).toBe("13 TO 15");
  });

  it("maps a launch to its condo project", () => {
    expect(getValuationSubject({ kind: "launch", slug: "aurora-fixture-residences", launchType: "condo" })?.ref).toBe("condo:aurora-fixture-residences");
    expect(getValuationSubject({ kind: "launch", slug: "upcoming-fixture-towers", launchType: "condo" })).toBeNull();
  });

  it("resolves the documented deep links", () => {
    expect(resolveValuationDeepLink({ type: "hdb", block: "872A", street: "TAMPINES ST 86" }).subject?.ref).toBe("hdb:blk-872a-tampines-st-86");
    expect(resolveValuationDeepLink({ type: "hdb", postal: "521872" }).subject?.ref).toBe("hdb:blk-872a-tampines-st-86");
    expect(resolveValuationDeepLink({ type: "condo", project: "AURORA+FIXTURE+RESIDENCES" }).subject?.ref).toBe("condo:aurora-fixture-residences");
    expect(resolveValuationDeepLink({ type: "landed", address: "15 SAMPLE LANE" }).subject?.ref).toBe("landed:15-sample-ln");
    expect(resolveValuationDeepLink({ type: "landed", street: "FIXTURE CRESCENT" }).subject?.ref).toBe("landed-street:fixture-cres");
    expect(resolveValuationDeepLink({ ref: "hdb:blk-872a-tampines-st-86" }).subject?.kind).toBe("hdb");
    const miss = resolveValuationDeepLink({ type: "condo", project: "THE HILLFORD" });
    expect(miss).toMatchObject({ type: "condo", subject: null, unresolved: "THE HILLFORD" });
    expect(resolveValuationDeepLink({})).toEqual({ type: "hdb", subject: null, unresolved: null, approximate: null });
  });

  it("never swaps in a different block or house number from a fuzzy search", () => {
    // search matches word prefixes, so "872" alone would find Blk 872A and "1" would find No. 15
    expect(resolveValuationDeepLink({ type: "hdb", block: "872", street: "TAMPINES ST 86" })).toMatchObject({ subject: null, unresolved: "Blk 872 TAMPINES ST 86" });
    expect(resolveValuationDeepLink({ type: "landed", address: "1 SAMPLE LANE" })).toMatchObject({ subject: null, unresolved: "1 SAMPLE LANE" });
    // a differently spelt street still finds the right block, flagged as the closest match
    const street = resolveValuationDeepLink({ type: "hdb", block: "872A", street: "TAMPINES STREET 86" });
    expect(street.subject?.ref).toBe("hdb:blk-872a-tampines-st-86");
  });

  it("flags a project found only by a partial name as the closest match", () => {
    const partial = resolveValuationDeepLink({ type: "condo", project: "SAMPLE PARK" });
    expect(partial.subject?.ref).toBe("condo:sample-park-condo");
    expect(partial.approximate).toBe("SAMPLE PARK");
    expect(resolveValuationDeepLink({ type: "condo", project: "SAMPLE PARK CONDO" }).approximate).toBeNull();
  });

  it("builds HDB storey bands", () => {
    expect(storeyBands(9)).toEqual(["01 TO 03", "04 TO 06", "07 TO 09"]);
    expect(storeyBands(null).length).toBe(17);
  });
});

describe("compare metrics", () => {
  it("summarises an HDB block from the data layer", () => {
    const c = compareColumn({ kind: "hdb", slug: "blk-872a-tampines-st-86" })!;
    const b = getHdbBlock("blk-872a-tampines-st-86")!;
    expect(c.medianPsf12m).toBe(b.tx.medianPsf12m);
    expect(c.sales12m).toBe(b.tx.count12m);
    expect(c.medianRent12m).toBe(b.rentals!.medianRent12m);
    expect(c.grossYield).toBeCloseTo((b.rentals!.medianRent12m! * 12) / c.medianPrice12m!, 10);
    expect(c.nearestMrt?.name).toBe("Tampines");
    expect(c.growth5y?.seriesLabel).toBeTruthy();
  });

  it("returns null for unknown refs and handles launches without sales", () => {
    expect(compareColumn({ kind: "condo", slug: "nope" })).toBeNull();
    const l = compareColumn({ kind: "launch", slug: "upcoming-fixture-towers", launchType: "condo" })!;
    expect(l.lastSale).toBeNull();
    expect(l.medianPsf12m).toBeNull();
  });

  it("caps sales and chart points", () => {
    const s = salesForUnits({ kind: "condo", slug: "sample-park-condo" }, 5);
    expect(s.recent.length).toBe(5);
    expect(s.points.length).toBeLessThanOrEqual(400);
    const xs = s.points.map((p) => p.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });
});
