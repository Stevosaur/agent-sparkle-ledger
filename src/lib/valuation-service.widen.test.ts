import { describe, expect, it, vi } from "vitest";
import type { PrivateProject, PrivateTransaction } from "@/lib/data/types";

/**
 * Condo widening needs neighbouring projects, which the fixture snapshot does not have, so this file
 * swaps in a small synthetic district around a subject project.
 */

const AS_OF = 439; // 2026-08

function project(slug: string, lat: number, lng: number, extra: Partial<PrivateProject> = {}): PrivateProject {
  return {
    slug,
    name: slug.toUpperCase().replace(/-/g, " "),
    street: "TEST ROAD",
    district: 20,
    segment: "RCR",
    propertyTypes: ["Condominium"],
    isLanded: false,
    tenure: null,
    tx: { count: 0, first: null, last: null, lastPrice: null, medianPsf12m: null, count12m: 0 },
    rentals: null,
    launchSlug: null,
    nearestMrt: null,
    hasUnitLevel: false,
    lat,
    lng,
    ...extra,
  };
}

function tx(projectSlug: string, monthIndex: number, price: number, extra: Partial<PrivateTransaction> = {}): PrivateTransaction {
  return {
    month: "",
    monthIndex,
    projectSlug,
    district: 20,
    propertyType: "Condominium",
    floorRange: "06-10",
    floorMid: 8,
    areaSqm: 100,
    areaSqft: 1076,
    price,
    psf: Math.round(price / 1076.39),
    typeOfSale: "Resale",
    typeOfArea: "Strata",
    units: 1,
    unit: null,
    address: null,
    ...extra,
  };
}

const PROJECTS: PrivateProject[] = [
  project("subject-towers", 1.35, 103.85),
  project("near-residences", 1.354, 103.85), // ~445 m, same segment
  project("near-ec", 1.351, 103.85, { propertyTypes: ["Executive Condominium"] }), // EC: excluded for a condo subject
  project("far-condo", 1.37, 103.85), // ~2.2 km: excluded
  project("ocr-condo", 1.352, 103.85, { segment: "OCR" }), // other segment: excluded
  project("landed-near", 1.3505, 103.85, { isLanded: true, propertyTypes: ["Terrace"] }),
];

const TX: PrivateTransaction[] = [
  tx("subject-towers", 436, 1_800_000),
  tx("subject-towers", 430, 1_750_000),
  tx("near-residences", 438, 1_700_000),
  tx("near-residences", 425, 1_650_000),
  tx("near-residences", 420, 1_600_000, { units: 3 }), // bulk deal: excluded
  tx("near-residences", 380, 1_400_000), // outside 36 months
  tx("near-ec", 437, 1_200_000, { propertyType: "Executive Condominium" }),
  tx("far-condo", 437, 2_500_000),
  tx("ocr-condo", 437, 1_300_000),
  tx("landed-near", 437, 4_000_000, { propertyType: "Terrace", typeOfArea: "Land" }),
];

vi.mock("@/lib/data/private", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/private")>();
  return {
    ...actual,
    getProjects: () => PROJECTS,
    getProject: (slug: string) => PROJECTS.find((p) => p.slug === slug) ?? null,
    getDistrictTransactions: (d: number) => (d === 20 ? TX : []),
    getProjectTransactions: (slug: string) => TX.filter((t) => t.projectSlug === slug),
  };
});

describe("condo comparable widening", () => {
  it("adds same-segment, same-class projects within 1 km when the project has few sales", async () => {
    const { selectCondoComparables, NEARBY_RADIUS_M } = await import("./valuation-service");
    const sel = selectCondoComparables(PROJECTS[0], AS_OF);
    expect(sel.sameSiteCount).toBe(2);
    expect(sel.widened).toBe(true);
    const nearby = sel.comps.filter((c) => !c.sameSite);
    expect(nearby.map((c) => c.href)).toEqual(["/condo/near-residences/", "/condo/near-residences/"]);
    expect(nearby.map((c) => c.monthIndex).sort()).toEqual([425, 438]);
    for (const c of nearby) {
      expect(c.distanceM).toBeGreaterThan(0);
      expect(c.distanceM!).toBeLessThanOrEqual(NEARBY_RADIUS_M);
    }
  });

  it("produces an estimate from the widened set", async () => {
    const { estimateValuation } = await import("./valuation-service");
    const out = estimateValuation({ ref: { kind: "condo", slug: "subject-towers" }, floor: 8, areaSqm: 100 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.valuation.comparablesUsed).toBe(4);
    expect(out.valuation.method[0]).toContain("2 in other projects within 1 km");
    // psf between the cheapest and dearest comparable before time adjustment
    expect(out.valuation.psf).toBeGreaterThan(1400);
    expect(out.valuation.psf).toBeLessThan(1800);
  });
});
