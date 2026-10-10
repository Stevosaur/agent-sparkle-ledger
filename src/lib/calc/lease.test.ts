import { describe, expect, it } from "vitest";
import { BALA_TABLE, BALA_TABLE_STATUS, balaLookup, balaPct, balaRatio, balaRowStatus, cpfLimits, cpfUsage, remainingLeaseYears } from "./lease";

describe("Bala's Table (docs/research/bala-table.md)", () => {
  it("has all 99 whole-year rows, strictly increasing", () => {
    const keys = Object.keys(BALA_TABLE).map(Number).sort((a, b) => a - b);
    expect(keys).toEqual(Array.from({ length: 99 }, (_, i) => i + 1));
    for (let y = 2; y <= 99; y++) expect(BALA_TABLE[y]).toBeGreaterThan(BALA_TABLE[y - 1]);
  });

  it("matches the 8 corroborated anchors exactly (1, 3, 10, 30, 49, 50, 60, 99)", () => {
    expect(BALA_TABLE_STATUS.corroboratedYears).toEqual([1, 3, 10, 30, 49, 50, 60, 99]);
    const anchors: Record<number, number> = { 1: 3.8, 3: 10.9, 10: 30.0, 30: 60.0, 49: 74.1, 50: 74.7, 60: 80.0, 99: 96.0 };
    for (const [y, v] of Object.entries(anchors)) expect(BALA_TABLE[Number(y)]).toBe(v);
  });

  it("quick-reference decade points (§2.1)", () => {
    const decade: [number, number][] = [
      [99, 96.0],
      [90, 93.0],
      [80, 89.0],
      [70, 85.0],
      [60, 80.0],
      [50, 74.7],
      [40, 68.5],
      [30, 60.0],
      [20, 48.0],
      [10, 30.0],
      [5, 17.1],
      [1, 3.8],
    ];
    for (const [y, v] of decade) expect(balaPct(y)).toBe(v);
  });

  it("suggested unit tests (§4): 99→96, 60→80, 30→60, 10→30, 1→3.8, 0→0, 120 capped at 96", () => {
    expect(balaPct(99)).toBe(96);
    expect(balaPct(60)).toBe(80);
    expect(balaPct(30)).toBe(60);
    expect(balaPct(10)).toBe(30);
    expect(balaPct(1)).toBe(3.8);
    expect(balaPct(0)).toBe(0);
    expect(balaPct(-3)).toBe(0);
    expect(balaLookup(120)).toMatchObject({ pct: 96, capped: true });
    expect(balaLookup(99)).toMatchObject({ pct: 96, capped: false });
    expect(balaPct(Number.NaN)).toBeNull();
  });

  it("interpolates linearly between whole years: '61 years 04 months' = 80.5 + 0.5 × 4/12 = 80.667 (§5)", () => {
    expect(balaPct(61 + 4 / 12)).toBeCloseTo(80.5 + 0.5 * (4 / 12), 10);
    expect(balaPct(0.5)).toBeCloseTo(1.9, 10); // B(0) = 0 convention: halfway to 3.8
    expect(balaPct(98.5)).toBeCloseTo(95.9, 10);
  });

  it("worked ratios (§5): 60 vs 99 = 0.8333; 30 vs 60 = 0.75; 49 vs 60 = 0.92625; 10 vs 30 = 0.5", () => {
    expect(balaRatio(60, 99)).toBeCloseTo(80 / 96, 12);
    expect(balaRatio(60, 99)).toBeCloseTo(0.8333, 4);
    expect(balaRatio(30, 60)).toBe(0.75);
    expect(balaRatio(49, 60)).toBeCloseTo(0.92625, 12);
    expect(balaRatio(10, 30)).toBe(0.5);
    expect(balaRatio(10, 0)).toBeNull();
    // holding-period decay: buy with 60 left, hold 11 years → 74.1 / 80 = 0.926
    expect(balaRatio(60 - 11, 60)).toBeCloseTo(0.926, 3);
    // illustrative top-up for 60 years left: (96 − 80) / 100 = 16% of freehold land value
    expect((balaPct(99)! - balaPct(60)!) / 100).toBeCloseTo(0.16, 12);
  });

  it("row statuses: anchors corroborated, 5 approx, 20 conflict, 57–59 / 61–98 disputed, the rest unverified", () => {
    expect(balaRowStatus(60)).toBe("corroborated");
    expect(balaRowStatus(5)).toBe("approx");
    expect(balaRowStatus(20)).toBe("conflict");
    expect(balaRowStatus(80)).toBe("disputed");
    expect(BALA_TABLE_STATUS.disputedByR1[80]).toBe(91.0);
    expect(balaRowStatus(56)).toBe("unverified");
    const disputed = Array.from({ length: 99 }, (_, i) => i + 1).filter((y) => balaRowStatus(y) === "disputed");
    expect(disputed).toEqual([57, 58, 59, ...Array.from({ length: 38 }, (_, i) => 61 + i)]);
    expect(balaLookup(61.5)).toMatchObject({ rowStatus: "disputed", status: "unverified-reproduction" });
    expect(balaLookup(30)).toMatchObject({ rowStatus: "corroborated" });
    expect(balaLookup(29.5)).toMatchObject({ rowStatus: "unverified" });
    expect(BALA_TABLE_STATUS.verified).toBe(false);
  });
});

describe("remaining lease", () => {
  it("99-year lease counts down from the commencement year", () => {
    expect(remainingLeaseYears(1979, 2026)).toBe(52);
    expect(remainingLeaseYears(1979.5, 2026.25)).toBe(52.25);
    expect(remainingLeaseYears(1900, 2026)).toBe(0);
    expect(remainingLeaseYears(2008, 2026, 999)).toBe(981);
  });
});

describe("CPF usage with remaining lease (loan-rules.md §4, UNVERIFIED rules)", () => {
  it("below 20 years: no CPF; exactly 20 years: allowed", () => {
    expect(cpfUsage(19.9, 30)).toEqual({ allowed: false, full: false, shareOfValuationLimit: 0 });
    expect(cpfUsage(20, 80).allowed).toBe(true);
  });

  it("full use when the lease covers the youngest buyer to age 95", () => {
    expect(cpfUsage(60, 35)).toEqual({ allowed: true, full: true, shareOfValuationLimit: 1 }); // 35 + 60 = 95
    expect(cpfUsage(70, 30)).toEqual({ allowed: true, full: true, shareOfValuationLimit: 1 });
  });

  it("pro-rated otherwise: youngest 50, lease 40 → 40/45 = 88.89%; VL 400,000 → 355,555.56", () => {
    const u = cpfUsage(40, 50);
    expect(u.full).toBe(false);
    expect(u.shareOfValuationLimit).toBeCloseTo(40 / 45, 12);
    expect(Math.round(u.shareOfValuationLimit * 10_000) / 100).toBe(88.89);
    const l = cpfLimits(400_000, 40, 50);
    expect(l.valuationLimit).toBe(400_000);
    expect(Math.round(l.usableUpToValuationLimit * 100) / 100).toBe(355_555.56);
    expect(l.withdrawalLimit).toBeCloseTo(400_000 * 1.2 * (40 / 45), 6);
    expect(l.status).toBe("unverified");
  });

  it("Valuation Limit is the lower of price and valuation", () => {
    expect(cpfLimits(500_000, 70, 30, 480_000).valuationLimit).toBe(480_000);
    expect(cpfLimits(500_000, 70, 30, 520_000).valuationLimit).toBe(500_000);
  });
});
