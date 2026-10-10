import { describe, expect, it } from "vitest";
import { getTowns } from "@/lib/data/hdb";
import { getProjects } from "@/lib/data/private";
import type { PrivateProject, TownSummary } from "@/lib/data/types";
import { FIT_LIMIT, fitCondo, fitHdb, isEcProject } from "./fit";

describe("fitHdb", () => {
  it("keeps town × flat type medians within the budget, priciest first", () => {
    const rows = fitHdb(getTowns(), 650_000);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.medianPrice12m).toBeLessThanOrEqual(650_000);
    const prices = rows.map((r) => r.medianPrice12m);
    expect([...prices].sort((a, b) => b - a)).toEqual(prices);
    // Fixture: Bishan 3/4 ROOM medians are above S$750k, so Bishan is excluded at this budget
    expect(rows.some((r) => r.townSlug === "bishan")).toBe(false);
    expect(rows.find((r) => r.townSlug === "tampines" && r.flatType === "4 ROOM")?.medianPrice12m).toBe(602_500);
  });

  it("includes a row exactly at the budget and nothing for a zero budget", () => {
    expect(fitHdb(getTowns(), 602_500).some((r) => r.townSlug === "tampines" && r.flatType === "4 ROOM")).toBe(true);
    expect(fitHdb(getTowns(), 0)).toEqual([]);
    expect(fitHdb(getTowns(), Number.NaN)).toEqual([]);
  });

  it("caps the list", () => {
    const towns: TownSummary[] = Array.from({ length: 30 }, (_, i) => ({
      town: `TOWN ${i}`,
      slug: `town-${i}`,
      region: "East",
      blocks: 1,
      tx: { count: 1, first: null, last: null, lastPrice: null, medianPsf12m: null, count12m: 1 },
      medianPrice12m: { "3 ROOM": 400_000 + i, "4 ROOM": 500_000 + i },
      medianRent12m: {},
    }));
    expect(fitHdb(towns, 10_000_000).length).toBe(FIT_LIMIT);
    expect(fitHdb(towns, 10_000_000, 5).length).toBe(5);
  });
});

describe("fitCondo", () => {
  it("prices projects as median psf × size and skips landed projects", () => {
    const rows = fitCondo(getProjects(), 1_500_000, 1000);
    expect(rows.map((r) => r.slug)).toEqual(["aurora-fixture-residences", "the-fixture-ec"]);
    for (const r of rows) {
      expect(r.estPrice).toBe(Math.round(r.medianPsf12m * 1000));
      expect(r.estPrice).toBeLessThanOrEqual(1_500_000);
    }
    expect(rows.find((r) => r.slug === "the-fixture-ec")?.isEc).toBe(true);
    // landed-sample-ln has a 12-month psf but is landed
    expect(fitCondo(getProjects(), 100_000_000, 1000).some((r) => r.slug.startsWith("landed-"))).toBe(false);
  });

  it("depends on the chosen size", () => {
    expect(fitCondo(getProjects(), 1_500_000, 500).map((r) => r.slug)).toContain("sample-park-condo");
    expect(fitCondo(getProjects(), 1_500_000, 2000)).toEqual([]);
    expect(fitCondo(getProjects(), 1_500_000, 0)).toEqual([]);
  });

  it("ignores projects without recent sales", () => {
    const p = { ...getProjects()[0], slug: "quiet", isLanded: false, tx: { ...getProjects()[0].tx, medianPsf12m: null } } as PrivateProject;
    expect(fitCondo([p], 10_000_000, 1000)).toEqual([]);
  });

  it("detects executive condominiums", () => {
    expect(isEcProject({ propertyTypes: ["Executive Condominium"] })).toBe(true);
    expect(isEcProject({ propertyTypes: ["Condominium", "Apartment"] })).toBe(false);
  });
});
