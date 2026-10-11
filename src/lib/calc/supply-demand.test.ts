import { describe, expect, it } from "vitest";
import { mopCohorts, mopYear, supplyByYear } from "./supply-demand";
import { HDB_MOP_YEARS, HDB_MOP_YEARS_PLUS_PRIME } from "./rules";

const center = { lat: 1.353, lng: 103.945 };
/** ~3.3 km north of the centre (0.03° of latitude ≈ 3,336 m) */
const far = { lat: 1.383, lng: 103.945 };

describe("MOP cohorts (hdb-rules.md §1.1–1.2)", () => {
  it("MOP year = completion year + 5 for Standard / pre-Oct-2024 / resale flats", () => {
    expect(HDB_MOP_YEARS).toBe(5);
    expect(mopYear({ yearCompleted: 2021 })).toBe(2026);
    expect(mopYear({ yearCompleted: 2021, mopYears: HDB_MOP_YEARS_PLUS_PRIME })).toBe(2031);
    expect(mopYear({ yearCompleted: null })).toBeNull();
  });

  it("counts units and blocks within the radius, by MOP year; skips blocks without coordinates, year or units", () => {
    const rows = mopCohorts(
      [
        { ...center, yearCompleted: 2021, dwellingUnits: 100 },
        { ...center, yearCompleted: 2021, dwellingUnits: 50 },
        { ...center, yearCompleted: 2022, dwellingUnits: 80 },
        { ...center, yearCompleted: 2017, dwellingUnits: 70, mopYears: 10 }, // PLH-style 10-year MOP → 2027
        { ...far, yearCompleted: 2021, dwellingUnits: 999 }, // outside 2 km
        { lat: null, lng: null, yearCompleted: 2021, dwellingUnits: 999 },
        { ...center, yearCompleted: null, dwellingUnits: 999 },
        { ...center, yearCompleted: 2021, dwellingUnits: 0 },
        { ...center, yearCompleted: 2010, dwellingUnits: 999 }, // MOP 2015, outside the window
      ],
      center,
      2_000,
      2026,
      2028,
    );
    expect(rows).toEqual([
      { year: 2026, units: 150, blocks: 2 },
      { year: 2027, units: 150, blocks: 2 },
      { year: 2028, units: 0, blocks: 0 },
    ]);
  });

  it("supply by expected completion year within the radius", () => {
    const rows = supplyByYear(
      [
        { ...center, expectedCompletionYear: 2027, totalUnits: 500, name: "A" },
        { ...center, expectedCompletionYear: 2027, totalUnits: 300, name: "B" },
        { ...far, expectedCompletionYear: 2027, totalUnits: 900, name: "Far" },
        { ...center, expectedCompletionYear: null, totalUnits: 900, name: "Unknown" },
      ],
      center,
      2_000,
      2026,
      2027,
    );
    expect(rows).toEqual([
      { year: 2026, units: 0, projects: [] },
      { year: 2027, units: 800, projects: ["A", "B"] },
    ]);
  });
});
