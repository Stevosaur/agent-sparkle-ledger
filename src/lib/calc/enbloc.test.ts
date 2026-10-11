import { describe, expect, it } from "vitest";
import { enblocTier, type EnblocInput } from "./enbloc";

const base: EnblocInput = { tenureKind: "freehold", leaseYears: null, startYear: 1990, currentYear: 2026, propertyTypes: ["Condominium"] };

describe("en-bloc heuristic tiers", () => {
  it("freehold / 999-year: ≥ 30 years → A, ≥ 20 → B, else unlikely", () => {
    expect(enblocTier({ ...base, startYear: 1996 }).tier).toBe("A"); // 30 years
    expect(enblocTier({ ...base, startYear: 1997 }).tier).toBe("B"); // 29
    expect(enblocTier({ ...base, startYear: 2006 }).tier).toBe("B"); // 20
    expect(enblocTier({ ...base, startYear: 2007 }).tier).toBe("Unlikely");
    expect(enblocTier({ ...base, tenureKind: "leasehold", leaseYears: 999, startYear: 1990 }).tier).toBe("A");
  });

  it("99-year leasehold: ≥ 40 years → B, ≥ 25 → C, else unlikely", () => {
    const lh = { ...base, tenureKind: "leasehold" as const, leaseYears: 99 };
    expect(enblocTier({ ...lh, startYear: 1986 }).tier).toBe("B");
    expect(enblocTier({ ...lh, startYear: 2001 }).tier).toBe("C");
    expect(enblocTier({ ...lh, startYear: 2002 }).tier).toBe("Unlikely");
    expect(enblocTier({ ...lh, startYear: 1986 }).reasons[0]).toContain("99-year lease");
  });

  it("ECs are unlikely; missing data is unknown; a future start year counts as age 0", () => {
    expect(enblocTier({ ...base, propertyTypes: ["Executive Condominium"] }).tier).toBe("Unlikely");
    expect(enblocTier({ ...base, startYear: null }).tier).toBe("Unknown");
    expect(enblocTier({ ...base, tenureKind: null }).tier).toBe("Unknown");
    const future = enblocTier({ ...base, startYear: 2030 });
    expect(future.tier).toBe("Unlikely");
    expect(future.reasons[1]).toContain("About 0 years");
  });
});
