import { describe, expect, it } from "vitest";
import { allocate, suggestSubstitutes } from "@/lib/domain/allocation";

const lots = [{ lotId: "L1", availableKg: 73, receivedAt: "2026-09-29T18:00:00Z" }];
const demand = [
  { lineId: "A", customerId: "cA", customerName: "Buyer A", requestedKg: 40, priorityTier: 2, confirmedAt: "2026-09-29T15:00:00Z", pricePerKg: 14 },
  { lineId: "B", customerId: "cB", customerName: "Buyer B", requestedKg: 30, priorityTier: 1, confirmedAt: "2026-09-29T16:00:00Z", pricePerKg: 15 },
  { lineId: "C", customerId: "cC", customerName: "Buyer C", requestedKg: 30, priorityTier: 3, confirmedAt: "2026-09-29T14:00:00Z", pricePerKg: 16 },
];
const byLine = (r: ReturnType<typeof allocate>) => Object.fromEntries(r.lines.map((l) => [l.lineId, l.allocatedKg]));

describe("allocation engine", () => {
  it("never allocates more than supply and totals reconcile (spec example: 73 kg vs 100 kg)", () => {
    for (const p of ["PRO_RATA", "PRIORITY", "FIRST_CONFIRMED", "MINIMUM_GUARANTEED", "MARGIN_MAX", "MANUAL_RANK"] as const) {
      const r = allocate(p, lots, demand);
      expect(r.totalAllocatedKg).toBeLessThanOrEqual(73);
      expect(r.totalAllocatedKg + r.unallocatedSupplyKg).toBeCloseTo(73, 5);
      expect(r.totalShortfallKg).toBeCloseTo(100 - r.totalAllocatedKg, 5);
      for (const l of r.lines) expect(l.allocatedKg).toBeLessThanOrEqual(l.requestedKg);
    }
  });

  it("pro-rata gives each buyer ~73% of their request in 0.1 kg steps", () => {
    const r = allocate("PRO_RATA", lots, demand);
    expect(byLine(r)).toEqual({ A: 29.2, B: 21.9, C: 21.9 });
    expect(r.totalAllocatedKg).toBe(73);
  });

  it("priority fills tier 1 first, then tier 2, then tier 3", () => {
    expect(byLine(allocate("PRIORITY", lots, demand))).toEqual({ A: 40, B: 30, C: 3 });
  });

  it("first confirmed fills in confirmation order", () => {
    expect(byLine(allocate("FIRST_CONFIRMED", lots, demand))).toEqual({ C: 30, A: 40, B: 3 });
  });

  it("margin maximisation fills highest selling price first", () => {
    expect(byLine(allocate("MARGIN_MAX", lots, demand))).toEqual({ C: 30, B: 30, A: 13 });
  });

  it("minimum guaranteed gives everyone at least half before splitting the rest", () => {
    const r = byLine(allocate("MINIMUM_GUARANTEED", lots, demand));
    expect(r.A).toBeGreaterThanOrEqual(20);
    expect(r.B).toBeGreaterThanOrEqual(15);
    expect(r.C).toBeGreaterThanOrEqual(15);
  });

  it("splits across lots oldest first (FEFO)", () => {
    const r = allocate("FIRST_CONFIRMED", [
      { lotId: "new", availableKg: 50, receivedAt: "2026-09-29T19:00:00Z" },
      { lotId: "old", availableKg: 10, receivedAt: "2026-09-29T17:00:00Z" },
    ], [{ lineId: "X", customerId: "c", requestedKg: 25 }]);
    expect(r.lines[0].fromLots).toEqual([{ lotId: "old", kg: 10, lotNumber: undefined }, { lotId: "new", kg: 15, lotNumber: undefined }]);
  });

  it("handles surplus: fills everyone and reports leftover", () => {
    const r = allocate("PRO_RATA", [{ lotId: "L", availableKg: 120 }], demand);
    expect(r.totalShortfallKg).toBe(0);
    expect(r.unallocatedSupplyKg).toBe(20);
  });

  it("suggests substitutes for material shortfalls as a range", () => {
    const r = allocate("PRIORITY", lots, demand);
    const s = suggestSubstitutes(r, [{ speciesId: "GSN", speciesName: "Golden snapper", availableKg: 40 }]);
    expect(s[0]).toMatchObject({ lineId: "C", speciesId: "GSN" });
    expect(s[0].suggestMinKg).toBeLessThanOrEqual(27);
    expect(s[0].suggestMaxKg).toBeGreaterThanOrEqual(27);
  });
});
