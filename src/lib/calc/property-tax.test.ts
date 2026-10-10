import { describe, expect, it } from "vitest";
import { residentialPropertyTax } from "./property-tax";

describe("residential property tax (loan-rules.md §5, all UNVERIFIED)", () => {
  it("worked example: owner-occupied, AV 30,000, 2025 bands → 0% × 12,000 + 4% × 18,000 = 720", () => {
    const r = residentialPropertyTax(30_000, { ownerOccupied: true })!;
    expect(r.tax).toBe(720);
    expect(r.tiers.map((t) => t.amount)).toEqual([0, 720]);
    expect(r.status).toBe("unverified");
    expect(r.extrapolated).toBe(false);
  });

  it("owner-occupied 2025 top band: AV 120,000 → 1,120 + 600 + 1,500 + 2,100 + 3,000 + 3,900 + 32% × 10,000 = 15,420", () => {
    // 4% × 28,000 = 1,120; 6% × 10,000 = 600; 10% × 15,000 = 1,500; 14% × 15,000 = 2,100; 20% × 15,000 = 3,000; 26% × 15,000 = 3,900
    expect(residentialPropertyTax(120_000, { ownerOccupied: true })!.tax).toBe(15_420);
  });

  it("owner-occupied 2024 bands: AV 30,000 → 4% × 22,000 = 880", () => {
    expect(residentialPropertyTax(30_000, { ownerOccupied: true, year: 2024 })!.tax).toBe(880);
  });

  it("non-owner-occupied from 2024: AV 50,000 → 12% × 30,000 + 20% × 15,000 + 28% × 5,000 = 8,000", () => {
    expect(residentialPropertyTax(50_000, { ownerOccupied: false, year: 2026 })!.tax).toBe(3_600 + 3_000 + 1_400);
  });

  it("flags years beyond the researched tables and rejects years before 2024", () => {
    expect(residentialPropertyTax(30_000, { ownerOccupied: true, year: 2026 })!.extrapolated).toBe(true);
    expect(residentialPropertyTax(30_000, { ownerOccupied: true, year: 2023 })).toBeNull();
    expect(residentialPropertyTax(-1, { ownerOccupied: true })).toBeNull();
  });
});
