import { describe, expect, it } from "vitest";
import {
  absdForPurchase,
  absdRate,
  absdRateAt,
  additionalBuyerStampDuty,
  bsdTableAt,
  buyerStampDuty,
  flatDuty,
  ftaScEquivalent,
  jointAbsdRate,
  MARRIED_COUPLE_ABSD_RELIEFS,
  sellerStampDuty,
  ssdSchedule,
} from "./stamp-duty";

/** Deterministic PRNG (mulberry32) so the randomised checks are reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Closed form of the current residential BSD table (stamp-duty.md §1.2), evaluated in exact integers:
 * duty = floor(rate × P − offset), min $1. With P in cents and rate in basis points:
 * rate × P − offset (dollars) = (bp × Pcents − offset × 1e6) / 1e6.
 */
function bsdClosedForm(pCents: number, kind: "residential" | "non-residential" = "residential"): number {
  const p = pCents / 100;
  const bands: [number, number, number][] =
    kind === "residential"
      ? [
          [180_000, 100, 0],
          [360_000, 200, 1_800],
          [1_000_000, 300, 5_400],
          [1_500_000, 400, 15_400],
          [3_000_000, 500, 30_400],
          [Infinity, 600, 60_400],
        ]
      : [
          [180_000, 100, 0],
          [360_000, 200, 1_800],
          [1_000_000, 300, 5_400],
          [1_500_000, 400, 15_400],
          [Infinity, 500, 30_400],
        ];
  const [, bp, offset] = bands.find(([upTo]) => p <= upTo)!;
  const duty = Math.floor((bp * pCents - offset * 1_000_000) / 1_000_000);
  return pCents > 0 ? Math.max(1, duty) : 0;
}

describe("Buyer's Stamp Duty — residential, from 15 Feb 2023 (stamp-duty.md §1.5)", () => {
  // Unit-test vectors table, §1.5
  const vectors: [number, number][] = [
    [99, 1], // raw 0.99 floors to 0; the $1 minimum applies
    [180_000, 1_800],
    [360_000, 5_400],
    [500_000, 9_600], // 0.03 × 500,000 − 5,400 = 15,000 − 5,400
    [800_000, 18_600], // 24,000 − 5,400
    [1_000_000, 24_600],
    [1_234_567, 33_982],
    [1_500_000, 44_600],
    [2_500_000, 94_600],
    [3_000_000, 119_600],
    [3_500_000, 149_600], // 0.06 × 3.5m − 60,400 = 210,000 − 60,400
    [4_000_000, 179_600],
  ];
  it.each(vectors)("BSD(%i) = %i", (price, duty) => {
    expect(buyerStampDuty(price).total).toBe(duty);
  });

  it("Example 1: $1,000,000 = 1,800 + 3,600 + 19,200 = 24,600 (tier breakdown)", () => {
    const r = buyerStampDuty(1_000_000);
    expect(r.tiers.map((t) => t.amount)).toEqual([1_800, 3_600, 19_200]);
    expect(r.tiers.map((t) => t.taxable)).toEqual([180_000, 180_000, 640_000]);
    expect(r.tiers.map((t) => t.from)).toEqual([0, 180_000, 360_000]);
    expect(r.total).toBe(24_600);
  });

  it("Example 2: $2,500,000 = 1,800 + 3,600 + 19,200 + 20,000 + 50,000 = 94,600", () => {
    const r = buyerStampDuty(2_500_000);
    expect(r.tiers.map((t) => t.amount)).toEqual([1_800, 3_600, 19_200, 20_000, 50_000]);
    expect(r.tiers[4].taxable).toBe(1_000_000);
    expect(r.total).toBe(94_600);
  });

  it("Example 4: $4,000,000 = 119,600 + 6% × 1,000,000 = 179,600; non-residential 0.05 × 4m − 30,400 = 169,600", () => {
    expect(buyerStampDuty(4_000_000).total).toBe(179_600);
    expect(buyerStampDuty(4_000_000, "non-residential").total).toBe(169_600);
  });

  it("Example 5 (rounding): $1,234,567 → 24,600 + 4% × 234,567 = 33,982.68 → 33,982", () => {
    const r = buyerStampDuty(1_234_567);
    expect(r.tiers[3].amount).toBeCloseTo(9_382.68, 6);
    expect(r.total).toBe(33_982);
  });

  it("zero / negative / NaN value → no duty", () => {
    expect(buyerStampDuty(0).total).toBe(0);
    expect(buyerStampDuty(-5).total).toBe(0);
    expect(buyerStampDuty(Number.NaN).total).toBe(0);
  });

  it("non-residential equals residential up to $1.5m and has no 6% tier", () => {
    for (const p of [99, 180_000, 777_777, 1_500_000]) expect(buyerStampDuty(p, "non-residential").total).toBe(buyerStampDuty(p).total);
    expect(buyerStampDuty(3_500_000, "non-residential").total).toBe(0.05 * 3_500_000 - 30_400);
  });

  it("matches the closed forms on 20,000 random prices (integer and cents), residential and non-residential", () => {
    const rand = rng(20261010);
    for (let i = 0; i < 20_000; i++) {
      // $0–$8m: whole dollars on even draws, arbitrary cents on odd draws
      const cents = i % 2 === 0 ? Math.round(rand() * 8_000_000) * 100 : Math.round(rand() * 800_000_000);
      expect(buyerStampDuty(cents / 100).total).toBe(bsdClosedForm(cents));
      expect(buyerStampDuty(cents / 100, "non-residential").total).toBe(bsdClosedForm(cents, "non-residential"));
    }
  });

  it("is continuous and exact at every band edge (no float drift)", () => {
    for (const [edge, duty] of [
      [180_000, 1_800],
      [360_000, 5_400],
      [1_000_000, 24_600],
      [1_500_000, 44_600],
      [3_000_000, 119_600],
    ] as const) {
      expect(buyerStampDuty(edge).total).toBe(duty);
      expect(buyerStampDuty(edge + 0.01).total).toBe(duty); // one cent above: < $1 more
      expect(buyerStampDuty(edge + 100).total).toBeGreaterThan(duty);
    }
  });
});

describe("BSD by date of acquisition (stamp-duty.md §1.4)", () => {
  it("2018–2023 table: $1m → 24,600; $2.5m → 24,600 + 4% × 1,500,000 = 84,600", () => {
    expect(buyerStampDuty(1_000_000, "residential", { date: "2020-06-01" }).total).toBe(24_600);
    expect(buyerStampDuty(2_500_000, "residential", { date: "2020-06-01" }).total).toBe(84_600);
    expect(buyerStampDuty(2_500_000, "residential", { date: "2020-06-01" }).tableSince).toBe("2018-02-20");
  });

  it("2018–2023 non-residential top rate 3%: $2m → 5,400 + 3% × 1,640,000 = 54,600", () => {
    expect(buyerStampDuty(2_000_000, "non-residential", { date: "2019-01-01" }).total).toBe(54_600);
  });

  it("before 20 Feb 2018: 1/2/3% — $2.5m → 5,400 + 3% × 2,140,000 = 69,600", () => {
    expect(buyerStampDuty(2_500_000, "residential", { date: "2018-02-19" }).total).toBe(69_600);
  });

  it("switches tables on 15 Feb 2023 (Singapore calendar day)", () => {
    expect(bsdTableAt("2023-02-14").since).toBe("2018-02-20");
    expect(bsdTableAt("2023-02-15").since).toBe("2023-02-15");
    // 00:00 SGT on 15 Feb 2023 is 16:00 UTC on 14 Feb
    expect(bsdTableAt(new Date("2023-02-14T16:00:00Z")).since).toBe("2023-02-15");
    expect(bsdTableAt(new Date("2023-02-14T15:59:59Z")).since).toBe("2018-02-20");
    expect(bsdTableAt().since).toBe("2023-02-15");
    expect(buyerStampDuty(1_000_000).tableSince).toBe("2023-02-15");
  });
});

describe("Additional Buyer's Stamp Duty (stamp-duty.md §2)", () => {
  it("rates from 27 Apr 2023 by profile and count, clamped to 1st..3rd+", () => {
    expect([1, 2, 3, 4, 9].map((n) => absdRate("SC", n))).toEqual([0, 0.2, 0.3, 0.3, 0.3]);
    expect([1, 2, 3].map((n) => absdRate("SPR", n))).toEqual([0.05, 0.3, 0.35]);
    expect(absdRate("FOREIGNER", 1)).toBe(0.6);
    expect(absdRate("ENTITY", 1)).toBe(0.65);
    expect(absdRate("TRUSTEE", 2)).toBe(0.65);
    expect(absdRate("HOUSING_DEVELOPER", 1)).toBe(0.4);
    expect(absdRate("SC", 0)).toBe(0); // counts below 1 are treated as a first property
    expect(absdRate("SC", Number.NaN)).toBeNaN();
  });

  // §2.6 worked examples: [scenario, ABSD, BSD, total]
  it("Example A: SPR first property $1.5m → ABSD 75,000 + BSD 44,600 = 119,600", () => {
    const absd = additionalBuyerStampDuty(1_500_000, "SPR", 1);
    expect(absd).toEqual({ rate: 0.05, total: 75_000 });
    expect(absd.total + buyerStampDuty(1_500_000).total).toBe(119_600);
  });
  it("Examples B–D, F", () => {
    expect(additionalBuyerStampDuty(1_500_000, "SC", 2).total + buyerStampDuty(1_500_000).total).toBe(344_600); // 300,000 + 44,600
    expect(additionalBuyerStampDuty(1_500_000, "SC", 3).total + buyerStampDuty(1_500_000).total).toBe(494_600); // 450,000 + 44,600
    expect(additionalBuyerStampDuty(2_500_000, "FOREIGNER", 1).total + buyerStampDuty(2_500_000).total).toBe(1_594_600); // 1,500,000 + 94,600
    expect(additionalBuyerStampDuty(3_500_000, "ENTITY", 1).total + buyerStampDuty(3_500_000).total).toBe(2_424_600); // 2,275,000 + 149,600
  });
  it("Example E: US national (FTA), first property, $2.5m → ABSD 0 (SC-equivalent), total 94,600", () => {
    const r = absdForPurchase(2_500_000, [{ profile: "FOREIGNER", propertyCount: 1, fta: { country: "US", basis: "national" } }]);
    expect(r.rate).toBe(0);
    expect(r.total).toBe(0);
    expect(r.ftaApplied).toEqual([true]);
    expect(r.total + buyerStampDuty(2_500_000).total).toBe(94_600);
  });
  it("Example G: joint purchase, SC owning 1 + SPR owning none (not married) → max(20%, 5%) = 20% → 300,000", () => {
    const buyers = [
      { profile: "SC" as const, propertyCount: 2 },
      { profile: "SPR" as const, propertyCount: 1 },
    ];
    expect(jointAbsdRate(buyers)).toBe(0.2);
    const r = absdForPurchase(1_500_000, buyers);
    expect(r).toMatchObject({ rate: 0.2, total: 300_000, decidingBuyer: 0, buyerRates: [0.2, 0.05], potentialReliefs: [] });
    expect(r.total + buyerStampDuty(1_500_000).total).toBe(344_600);
  });
  it("Example H: SC + SPR married couple, neither owns property, $1.5m → 5% (75,000) payable; remission reported, not applied", () => {
    const r = absdForPurchase(
      1_500_000,
      [
        { profile: "SC", propertyCount: 1 },
        { profile: "SPR", propertyCount: 1 },
      ],
      { married: true },
    );
    expect(r.total).toBe(75_000);
    expect(r.potentialReliefs).toHaveLength(1);
    expect(r.potentialReliefs[0]).toMatchObject({ kind: "married-sc-spr-first-home", mechanism: "remission", amount: 75_000, applied: false, status: "unverified" });
    // after the (unverified) remission the couple would pay BSD only: 44,600
    expect(r.total - r.potentialReliefs[0].amount + buyerStampDuty(1_500_000).total).toBe(44_600);
  });

  it("married-couple reliefs: SC + foreigner first home (remission), second-home refund, and the cases with none", () => {
    const scForeigner = absdForPurchase(1_000_000, [{ profile: "SC", propertyCount: 1 }, { profile: "FOREIGNER", propertyCount: 1 }], { married: true });
    expect(scForeigner.total).toBe(600_000);
    expect(scForeigner.potentialReliefs[0]).toMatchObject({ kind: "married-sc-foreigner-first-home", amount: 600_000 });

    const secondHome = absdForPurchase(1_500_000, [{ profile: "SC", propertyCount: 2 }, { profile: "SC", propertyCount: 2 }], { married: true });
    expect(secondHome.total).toBe(300_000);
    expect(secondHome.potentialReliefs[0]).toMatchObject({ kind: "married-sc-second-home-refund", mechanism: "refund", amount: 300_000, applied: false });
    expect(secondHome.potentialReliefs[0].conditions.some((c) => c.includes("6 months"))).toBe(true);

    // SC + SC first home: nothing to relieve; SPR + SPR: no relief; third property: no relief; not married: no relief
    expect(absdForPurchase(1_000_000, [{ profile: "SC", propertyCount: 1 }, { profile: "SC", propertyCount: 1 }], { married: true }).potentialReliefs).toEqual([]);
    expect(absdForPurchase(1_000_000, [{ profile: "SPR", propertyCount: 1 }, { profile: "SPR", propertyCount: 1 }], { married: true }).potentialReliefs).toEqual([]);
    expect(absdForPurchase(1_000_000, [{ profile: "SC", propertyCount: 3 }, { profile: "SC", propertyCount: 3 }], { married: true }).potentialReliefs).toEqual([]);
    expect(absdForPurchase(1_000_000, [{ profile: "SC", propertyCount: 1 }, { profile: "SPR", propertyCount: 1 }]).potentialReliefs).toEqual([]);
    expect(Object.values(MARRIED_COUPLE_ABSD_RELIEFS).every((r) => r.status === "unverified")).toBe(true);
  });

  it("FTA: US permanent residents do not qualify; EFTA permanent residents do; entities never", () => {
    expect(ftaScEquivalent({ profile: "FOREIGNER", propertyCount: 1, fta: { country: "US", basis: "permanent-resident" } })).toBe(false);
    expect(ftaScEquivalent({ profile: "FOREIGNER", propertyCount: 1, fta: { country: "CH", basis: "permanent-resident" } })).toBe(true);
    expect(ftaScEquivalent({ profile: "SPR", propertyCount: 1, fta: { country: "NO", basis: "national" } })).toBe(true);
    expect(ftaScEquivalent({ profile: "ENTITY", propertyCount: 1, fta: { country: "US", basis: "national" } })).toBe(false);
    // an FTA national buying a 2nd property pays the SC 2nd-property rate (20%), not 60%
    expect(absdForPurchase(1_000_000, [{ profile: "FOREIGNER", propertyCount: 2, fta: { country: "IS", basis: "national" } }]).total).toBe(200_000);
  });

  it("rounds down to the dollar: 5% × 1,234,567 = 61,728.35 → 61,728", () => {
    expect(additionalBuyerStampDuty(1_234_567, "SPR", 1).total).toBe(61_728);
    expect(flatDuty(0, 0.2)).toBe(0);
  });

  it("historical ABSD tables by acquisition date (§2.3)", () => {
    expect(absdRateAt("SC", 2, "2023-04-27")).toBe(0.2);
    expect(absdRateAt("SC", 2, "2023-04-26")).toBe(0.17);
    expect(absdRateAt("SPR", 3, "2022-01-01")).toBe(0.3);
    expect(absdRateAt("FOREIGNER", 1, "2021-12-15")).toBe(0.2);
    expect(absdRateAt("SC", 3, "2018-07-06")).toBe(0.15);
    expect(absdRateAt("SC", 2, "2018-07-05")).toBeNull(); // earlier tables are not in the research
    expect(absdRateAt("TRUSTEE", 1, "2022-05-08")).toBeNull();
    expect(absdRateAt("TRUSTEE", 1, "2022-05-09")).toBe(0.35);
    expect(absdRateAt("HOUSING_DEVELOPER", 1, "2019-01-01")).toBe(0.3);
  });
});

describe("Seller's Stamp Duty (stamp-duty.md §3)", () => {
  // §3.4 worked examples
  it.each([
    ["1", "2025-08-01", "2027-06-01", 1_400_000, 2, 0.12, 168_000, "2025-07-04"],
    ["2", "2025-07-10", "2026-06-01", 1_300_000, 1, 0.16, 208_000, "2025-07-04"],
    ["3", "2025-09-01", "2028-10-01", 2_000_000, 4, 0.04, 80_000, "2025-07-04"],
    ["4", "2024-03-01", "2026-06-01", 2_000_000, 3, 0.04, 80_000, "2017-03-11"],
    ["6", "2026-03-01", "2029-06-01", 2_000_000, 4, 0.04, 80_000, "2025-07-04"],
  ] as const)("Example %s: acquired %s, sold %s, $%i → band %i, %f, SSD %i", (_n, acq, sold, value, band, rate, total, regime) => {
    const r = sellerStampDuty(value, acq, sold);
    expect(r).toMatchObject({ holdingYearBand: band, rate, total, regime, supported: true, nearAnniversary: false, alternative: null });
  });

  it("Example 5: acquired 1 Mar 2023 (3-year regime), sold 1 Jun 2026 → outside the window, $0", () => {
    expect(sellerStampDuty(2_000_000, "2023-03-01", "2026-06-01")).toMatchObject({ total: 0, rate: 0, holdingYearBand: null, regime: "2017-03-11" });
  });

  it("Example 6 under the old regime would have been $0 (acquisition date decides the regime)", () => {
    expect(sellerStampDuty(2_000_000, "2025-03-01", "2028-06-01").total).toBe(0);
  });

  it("regime boundary: acquired 3 Jul 2025 → 12/8/4; 4 Jul 2025 (12:00 am SGT) → 16/12/8/4", () => {
    expect(sellerStampDuty(1_000_000, "2025-07-03", "2026-01-01")).toMatchObject({ regime: "2017-03-11", rate: 0.12 });
    expect(sellerStampDuty(1_000_000, "2025-07-04", "2026-01-01")).toMatchObject({ regime: "2025-07-04", rate: 0.16 });
    expect(sellerStampDuty(1_000_000, new Date("2025-07-03T16:00:00Z"), "2026-01-01").regime).toBe("2025-07-04");
    expect(sellerStampDuty(1_000_000, new Date("2025-07-03T15:59:59Z"), "2026-01-01").regime).toBe("2017-03-11");
    expect(sellerStampDuty(1_000_000, new Date(Date.UTC(2025, 6, 4)), new Date(Date.UTC(2026, 0, 1))).regime).toBe("2025-07-04");
  });

  it("anniversary convention: a sale ON the anniversary is in the earlier band, flagged with the other reading", () => {
    // acquired 1 Sep 2025; first anniversary 1 Sep 2026
    const on = sellerStampDuty(1_000_000, "2025-09-01", "2026-09-01");
    expect(on).toMatchObject({ holdingYearBand: 1, rate: 0.16, total: 160_000, nearAnniversary: true, anniversaryDate: "2026-09-01" });
    expect(on.alternative).toEqual({ holdingYearBand: 2, rate: 0.12, total: 120_000 });
    // the day before / after: both readings agree, still flagged (±1 day)
    expect(sellerStampDuty(1_000_000, "2025-09-01", "2026-08-31")).toMatchObject({ holdingYearBand: 1, nearAnniversary: true, alternative: null });
    expect(sellerStampDuty(1_000_000, "2025-09-01", "2026-09-02")).toMatchObject({ holdingYearBand: 2, nearAnniversary: true, alternative: null });
    expect(sellerStampDuty(1_000_000, "2025-09-01", "2026-09-03")).toMatchObject({ holdingYearBand: 2, nearAnniversary: false });
    // the last anniversary: 4% under this convention, no SSD under the other
    const fourth = sellerStampDuty(1_000_000, "2025-09-01", "2029-09-01");
    expect(fourth).toMatchObject({ holdingYearBand: 4, rate: 0.04, total: 40_000, nearAnniversary: true });
    expect(fourth.alternative).toEqual({ holdingYearBand: null, rate: 0, total: 0 });
    expect(sellerStampDuty(1_000_000, "2025-09-01", "2029-09-02")).toMatchObject({ holdingYearBand: null, total: 0 });
  });

  it("29 Feb + 1 year = 28 Feb (calendar addYears)", () => {
    expect(sellerStampDuty(1_000_000, "2028-02-29", "2029-02-28")).toMatchObject({ holdingYearBand: 1, anniversaryDate: "2029-02-28" });
    expect(sellerStampDuty(1_000_000, "2028-02-29", "2029-03-01")).toMatchObject({ holdingYearBand: 2, rate: 0.12 });
  });

  it("same-day disposal is band 1; disposal before acquisition is invalid", () => {
    expect(sellerStampDuty(1_000_000, "2026-01-05", "2026-01-05").holdingYearBand).toBe(1);
    expect(sellerStampDuty(1_000_000, "2026-01-05", "2026-01-04")).toMatchObject({ total: 0, holdingYearBand: null, supported: false });
  });

  it("2011–2017 regime (4 years, 16/12/8/4) and unmodelled earlier acquisitions", () => {
    expect(sellerStampDuty(1_000_000, "2015-06-01", "2018-07-01")).toMatchObject({ regime: "2011-01-14", holdingYearBand: 4, total: 40_000, status: "unverified-high-confidence" });
    expect(sellerStampDuty(1_000_000, "2010-06-01", "2011-01-01")).toMatchObject({ regime: "pre-2011", supported: false, total: 0 });
    expect(sellerStampDuty(1_000_000, "not a date", "2011-01-01")).toMatchObject({ regime: "invalid-date", supported: false });
  });

  it("rounds down to the dollar and reports the regime status", () => {
    expect(sellerStampDuty(1_234_567, "2024-01-01", "2024-06-01").total).toBe(148_148); // 12% × 1,234,567 = 148,148.04
    expect(sellerStampDuty(1_000_000.5, "2025-08-01", "2025-09-01").total).toBe(160_000); // 160,000.08
    expect(sellerStampDuty(1_000_000, "2025-08-01", "2025-09-01").status).toBe("verified-secondary");
    expect(sellerStampDuty(0, "2025-08-01", "2025-09-01")).toMatchObject({ total: 0, holdingYearBand: null });
  });

  it("ssdSchedule lists band end dates and the first SSD-free day", () => {
    expect(ssdSchedule("2025-09-01")).toEqual({
      regime: "2025-07-04",
      bands: [
        { band: 1, rate: 0.16, lastDay: "2026-09-01" },
        { band: 2, rate: 0.12, lastDay: "2027-09-01" },
        { band: 3, rate: 0.08, lastDay: "2028-09-01" },
        { band: 4, rate: 0.04, lastDay: "2029-09-01" },
      ],
      ssdFreeFrom: "2029-09-02",
    });
    expect(ssdSchedule("2024-12-31").ssdFreeFrom).toBe("2028-01-01");
    expect(ssdSchedule("2009-01-01")).toEqual({ regime: null, bands: [], ssdFreeFrom: null });
  });
});
