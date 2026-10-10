import { describe, expect, it } from "vitest";
import { audienceWindow, computeExitAudience, type AudienceBlock } from "./exit-audience";

const center = { lat: 1.35, lng: 103.94 };
// ~111 m per 0.001 degree of latitude
const block = (slug: string, dLat: number, yearCompleted: number | null, units: number | null): AudienceBlock => ({
  slug,
  label: slug,
  town: "Tampines",
  lat: center.lat + dLat,
  lng: center.lng,
  yearCompleted,
  dwellingUnits: units,
});

const blocks: AudienceBlock[] = [
  block("mop-2026-near", 0.001, 2021, 100), // MOP 2026, ~111 m
  block("mop-2028", 0.005, 2023, 200), // MOP 2028, ~556 m
  block("mop-2029", 0.006, 2024, 300), // MOP 2029: outside the HDB window
  block("mop-2022", 0.01, 2017, 150), // MOP 2022, ~1.1 km
  block("mop-2020", 0.011, 2015, 120), // MOP 2020: outside the private window
  block("far-mop-2026", 0.03, 2021, 999), // ~3.3 km: outside the radius
  block("unknown-year", 0.002, null, 80),
  block("unknown-units", 0.003, 2021, null),
  { ...block("no-coords", 0, 2021, 50), lat: null, lng: null },
];

describe("exit audience heuristic", () => {
  it("uses this year + 2 for HDB listings and the previous five years for private listings", () => {
    expect(audienceWindow("hdb", 2026)).toEqual({ fromYear: 2026, toYear: 2028 });
    expect(audienceWindow("private", 2026)).toEqual({ fromYear: 2021, toYear: 2025 });
  });

  it("HDB listing: counts flats within 2 km reaching MOP in the window", () => {
    const r = computeExitAudience(blocks, center, "hdb", 2026, { radiusM: 2000 });
    expect(r.totalUnits).toBe(300);
    expect(r.totalBlocks).toBe(2);
    expect(r.cohorts).toEqual([
      { year: 2026, units: 100, blocks: 1 },
      { year: 2027, units: 0, blocks: 0 },
      { year: 2028, units: 200, blocks: 1 },
    ]);
    expect(r.topBlocks.map((b) => b.slug)).toEqual(["mop-2028", "mop-2026-near"]);
    expect(r.topBlocks[1]).toMatchObject({ mopYear: 2026, units: 100 });
    expect(r.topBlocks[1].distanceM).toBeGreaterThan(100);
    expect(r.topBlocks[1].distanceM).toBeLessThan(125);
    expect(r.excludedBlocks).toBe(2);
  });

  it("private listing: counts flats within 2 km that passed MOP in the previous five years", () => {
    const r = computeExitAudience(blocks, center, "private", 2026, { radiusM: 2000 });
    expect(r.audience).toBe("private");
    expect(r.totalUnits).toBe(150);
    expect(r.topBlocks.map((b) => b.slug)).toEqual(["mop-2022"]);
  });

  it("respects the radius, exclusion and topN", () => {
    const wide = computeExitAudience(blocks, center, "hdb", 2026, { radiusM: 5000 });
    expect(wide.totalUnits).toBe(1299);
    const excluded = computeExitAudience(blocks, center, "hdb", 2026, { radiusM: 5000, excludeSlug: "far-mop-2026", topN: 1 });
    expect(excluded.totalUnits).toBe(300);
    expect(excluded.topBlocks).toHaveLength(1);
  });

  it("returns an empty audience when nothing qualifies", () => {
    const r = computeExitAudience([], center, "hdb", 2026, { radiusM: 2000 });
    expect(r.totalUnits).toBe(0);
    expect(r.topBlocks).toEqual([]);
    expect(r.cohorts).toHaveLength(3);
  });
});
