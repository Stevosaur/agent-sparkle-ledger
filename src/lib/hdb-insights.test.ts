import { describe, expect, it } from "vitest";
import {
  blockLabel,
  blockPriceSeries,
  chooseGranularity,
  compareFlatTypes,
  distinctFlatTypes,
  dominantFlatType,
  flatTypeLabel,
  inWindow,
  launchesNear,
  leaseOutlook,
  mediansByFlatType,
  mopCohort,
  mopNote,
  paginate,
  parsePage,
  periodLabel,
  periodX,
  storeyLabel,
  summariseRentals,
  townMedianPoints,
  yearFraction,
  yieldsByFlatType,
} from "./hdb-insights";
import { monthIndex } from "@/lib/data/months";
import { getBlockRentals, getBlockTransactions, getHdbBlock, getNearbyBlocks, getTown } from "@/lib/data/hdb";
import { getLaunches } from "@/lib/data/private";
import { getSeries } from "@/lib/data/stats";
import type { NewLaunch } from "@/lib/data/types";

const m = monthIndex;

describe("labels and ordering", () => {
  it("orders flat types the HDB way, unknown last", () => {
    expect(["EXECUTIVE", "3 ROOM", "MYSTERY", "1 ROOM", "5 ROOM"].sort(compareFlatTypes)).toEqual(["1 ROOM", "3 ROOM", "5 ROOM", "EXECUTIVE", "MYSTERY"]);
    expect(distinctFlatTypes([{ flatType: "5 ROOM" }, { flatType: "4 ROOM" }, { flatType: "5 ROOM" }])).toEqual(["4 ROOM", "5 ROOM"]);
  });
  it("formats block, flat type and storey labels", () => {
    expect(blockLabel({ block: "872A", street: "TAMPINES ST 86" })).toBe("Blk 872A Tampines St 86");
    expect(flatTypeLabel("4 ROOM")).toBe("4 Room");
    expect(flatTypeLabel("MULTI-GENERATION")).toBe("Multi-Generation");
    expect(storeyLabel("04 TO 06")).toBe("04–06");
  });
});

describe("windows and medians", () => {
  it("treats the window as the N months ending at the latest month", () => {
    const latest = m("2026-08");
    expect(inWindow(m("2026-08"), latest, 12)).toBe(true);
    expect(inWindow(m("2025-09"), latest, 12)).toBe(true);
    expect(inWindow(m("2025-08"), latest, 12)).toBe(false);
    expect(inWindow(m("2026-09"), latest, 12)).toBe(false);
  });
  it("computes medians per flat type and skips non-finite values", () => {
    const rows = [
      { flatType: "5 ROOM", v: 700 },
      { flatType: "4 ROOM", v: 500 },
      { flatType: "4 ROOM", v: 600 },
      { flatType: "4 ROOM", v: Number.NaN },
    ];
    expect(mediansByFlatType(rows, (r) => r.v)).toEqual([
      { flatType: "4 ROOM", count: 2, median: 550 },
      { flatType: "5 ROOM", count: 1, median: 700 },
    ]);
  });
  it("picks the most-sold flat type, falling back to the unit mix", () => {
    expect(dominantFlatType([{ flatType: "4 ROOM" }, { flatType: "5 ROOM" }, { flatType: "4 ROOM" }])).toBe("4 ROOM");
    // tie on sales -> larger unit-mix share wins
    expect(dominantFlatType([{ flatType: "3 ROOM" }, { flatType: "5 ROOM" }], { "3 ROOM": 10, "5 ROOM": 40 })).toBe("5 ROOM");
    expect(dominantFlatType([], { "4 ROOM": 100, "5 ROOM": 50 })).toBe("4 ROOM");
    expect(dominantFlatType([], {})).toBeNull();
  });
});

describe("price history series", () => {
  const sale = (month: string, flatType: string, price: number) => ({ monthIndex: m(month), flatType, price });

  it("uses yearly medians for sparse blocks", () => {
    const txs = [sale("2024-01", "4 ROOM", 500_000), sale("2024-06", "4 ROOM", 520_000), sale("2025-03", "4 ROOM", 540_000)];
    expect(chooseGranularity(txs)).toBe("year");
    const { granularity, series, fromMonth } = blockPriceSeries(txs);
    expect(granularity).toBe("year");
    expect(fromMonth).toBe(m("2024-01"));
    expect(series).toEqual([
      {
        flatType: "4 ROOM",
        points: [
          { x: m("2024-07"), y: 510_000, n: 2 },
          { x: m("2025-07"), y: 540_000, n: 1 },
        ],
      },
    ]);
  });

  it("switches to quarterly and monthly as density grows", () => {
    const quarterly = Array.from({ length: 12 }, (_, i) => sale(`2025-${String(i + 1).padStart(2, "0")}`, "4 ROOM", 500_000));
    expect(chooseGranularity(quarterly)).toBe("quarter");
    const monthly = Array.from({ length: 12 }, (_, i) => [0, 1, 2].map(() => sale(`2025-${String(i + 1).padStart(2, "0")}`, "4 ROOM", 500_000))).flat();
    expect(chooseGranularity(monthly)).toBe("month");
    expect(chooseGranularity([])).toBe("year");
  });

  it("plots periods at a stable month", () => {
    expect(periodX(m("2025-05"), "month")).toBe(m("2025-05"));
    expect(periodX(m("2025-05"), "quarter")).toBe(m("2025-05")); // Apr-Jun -> May
    expect(periodX(m("2025-06"), "quarter")).toBe(m("2025-05"));
    expect(periodX(m("2025-12"), "year")).toBe(m("2025-07"));
  });

  it("labels periods", () => {
    expect(periodLabel(m("2026-08"), "month")).toBe("Aug 2026");
    expect(periodLabel(periodX(m("2026-08"), "quarter"), "quarter")).toBe("Q3 2026");
    expect(periodLabel(periodX(m("2026-01"), "quarter"), "quarter")).toBe("Q1 2026");
    expect(periodLabel(periodX(m("2026-12"), "year"), "year")).toBe("2026");
  });

  it("orders series by flat type and ignores non-positive prices", () => {
    const { series } = blockPriceSeries([sale("2025-01", "5 ROOM", 700_000), sale("2025-01", "3 ROOM", 400_000), sale("2025-02", "3 ROOM", 0)], "year");
    expect(series.map((s) => s.flatType)).toEqual(["3 ROOM", "5 ROOM"]);
    expect(series[0].points).toEqual([{ x: m("2025-07"), y: 400_000, n: 1 }]);
  });

  it("clips the town line to the block's history", () => {
    const pts = [
      { m: 10, count: 1, medianPrice: 100, medianPsf: 1 },
      { m: 20, count: 1, medianPrice: 0, medianPsf: 1 },
      { m: 30, count: 1, medianPrice: 300, medianPsf: 1 },
    ];
    expect(townMedianPoints(pts, 15)).toEqual([{ x: 30, y: 300 }]);
    expect(townMedianPoints(pts, null)).toEqual([
      { x: 10, y: 100 },
      { x: 30, y: 300 },
    ]);
    expect(townMedianPoints(null, null)).toEqual([]);
  });
});

describe("rentals and yields", () => {
  const latest = m("2026-08");
  const rent = (month: string, flatType: string, monthlyRent: number) => ({ monthIndex: m(month), flatType, monthlyRent });

  it("summarises the last 24 months of rental approvals", () => {
    const s = summariseRentals([rent("2026-08", "4 ROOM", 3000), rent("2025-01", "4 ROOM", 2600), rent("2024-08", "4 ROOM", 1000), rent("2026-01", "3 ROOM", 2201)], latest, 24);
    expect(s.fromMonth).toBe("2024-09");
    expect(s.toMonth).toBe("2026-08");
    expect(s.total).toBe(3);
    expect(s.byFlatType).toEqual([
      { flatType: "3 ROOM", count: 1, medianRent: 2201 },
      { flatType: "4 ROOM", count: 2, medianRent: 2800 },
    ]);
    expect(summariseRentals([], null).fromMonth).toBeNull();
  });

  it("computes gross yield only when the block has both rents and prices in the window", () => {
    const rows = yieldsByFlatType({
      sales: [
        { monthIndex: m("2026-05"), flatType: "4 ROOM", price: 600_000 },
        { monthIndex: m("2024-05"), flatType: "5 ROOM", price: 800_000 }, // outside 12 months
      ],
      rentals: [rent("2026-06", "4 ROOM", 3000), rent("2026-06", "5 ROOM", 3500)],
      salesLatestMonth: latest,
      rentalsLatestMonth: latest,
      town: { medianPrice12m: { "4 ROOM": 500_000, "5 ROOM": 700_000 }, medianRent12m: { "4 ROOM": 2500 } },
      extraFlatTypes: ["3 ROOM"],
    });
    expect(rows.map((r) => r.flatType)).toEqual(["3 ROOM", "4 ROOM", "5 ROOM"]);
    const four = rows[1];
    expect(four.grossYield).toBeCloseTo(0.06, 10);
    expect(four.townGrossYield).toBeCloseTo(0.06, 10);
    expect(four.saleCount).toBe(1);
    const five = rows[2];
    expect(five.medianPrice).toBeNull();
    expect(five.grossYield).toBeNull();
    expect(five.townGrossYield).toBeNull(); // town rent missing
    expect(rows[0]).toMatchObject({ saleCount: 0, rentCount: 0, grossYield: null });
  });
});

describe("MOP", () => {
  it("shows the MOP note from last year onwards", () => {
    expect(mopNote(2024, 2026)).toEqual({ mopYear: 2029, reached: false });
    expect(mopNote(2021, 2026)).toEqual({ mopYear: 2026, reached: false });
    expect(mopNote(2020, 2026)).toEqual({ mopYear: 2025, reached: true });
    expect(mopNote(2019, 2026)).toBeNull();
    expect(mopNote(null, 2026)).toBeNull();
  });

  it("filters nearby blocks to the MOP horizon and totals units", () => {
    const b = (slug: string, yearCompleted: number | null, dwellingUnits: number | null, distanceM: number) => ({
      slug,
      block: slug.toUpperCase(),
      street: "TAMPINES ST 1",
      town: "TAMPINES",
      yearCompleted,
      dwellingUnits,
      distanceM,
    });
    const cohort = mopCohort(
      [b("a", 2021, 100, 300), b("b", 2025, null, 200), b("c", 2026, 80, 100), b("d", 2020, 90, 50), b("e", null, 70, 10), b("f", 2023, 60, 1500), b("g", 2021, 40, 100)],
      2026,
      { radiusM: 1000, limit: 3 },
    );
    expect(cohort.fromYear).toBe(2026);
    expect(cohort.toYear).toBe(2030);
    // d reached MOP in 2025, e has no completion year, c reaches MOP in 2031, f is outside the radius
    expect(cohort.totalBlocks).toBe(3);
    expect(cohort.totalUnits).toBe(140);
    expect(cohort.blocksWithoutUnits).toBe(1);
    expect(cohort.blocks.map((r) => r.slug)).toEqual(["g", "a", "b"]);
    expect(cohort.byYear).toEqual([
      { year: 2026, blocks: 2, units: 140 },
      { year: 2027, blocks: 0, units: 0 },
      { year: 2028, blocks: 0, units: 0 },
      { year: 2029, blocks: 0, units: 0 },
      { year: 2030, blocks: 1, units: 0 },
    ]);
    expect(mopCohort([], 2026, { radiusM: 1000, limit: 1 }).blocks).toEqual([]);
  });
});

describe("launches near a block", () => {
  const launch = (slug: string, lat: number | undefined, lng: number | undefined): NewLaunch => ({
    slug,
    name: slug.toUpperCase().replace(/-/g, " "),
    type: "condo",
    status: "upcoming",
    street: null,
    district: null,
    segment: null,
    developer: null,
    totalUnits: 500,
    expectedCompletionYear: 2030,
    tenure: null,
    sales: [],
    unitsSold: null,
    unitsLaunched: null,
    projectSlug: null,
    nearestMrt: null,
    lat,
    lng,
  });
  it("keeps launches with coordinates inside the radius, nearest first", () => {
    const from = { lat: 1.35, lng: 103.94 };
    const rows = launchesNear([launch("far", 1.4, 103.94), launch("near", 1.351, 103.94), launch("nowhere", undefined, undefined), launch("mid", 1.36, 103.94)], from, 2000);
    expect(rows.map((r) => r.slug)).toEqual(["near", "mid"]);
    expect(rows[0]).toMatchObject({ name: "Near", href: "/new-launch/condo/near/", totalUnits: 500 });
    expect(rows[0].distanceM).toBeGreaterThan(100);
    expect(rows[0].distanceM).toBeLessThan(120);
  });
});

describe("lease outlook", () => {
  it("assumes a mid-year lease start and projects 10 and 20 years ahead", () => {
    const o = leaseOutlook(2015, 2026.5);
    expect(o.expiryYear).toBe(2114);
    expect(o.remainingToday).toBeCloseTo(88, 10);
    expect(o.remainingIn10).toBeCloseTo(78, 10);
    expect(o.remainingIn20).toBeCloseTo(68, 10);
    expect(o.cpf).toMatchObject({ buyerAge: 35, yearsNeededForFullUse: 60, allowed: true, full: true, shareOfValuationLimit: 1 });
  });
  it("pro-rates CPF for short leases and blocks it below 20 years", () => {
    const old = leaseOutlook(1970, 2026.5);
    expect(old.remainingToday).toBeCloseTo(43, 10);
    expect(old.cpf.full).toBe(false);
    expect(old.cpf.shareOfValuationLimit).toBeCloseTo(43 / 60, 10);
    expect(leaseOutlook(1940, 2026.5).cpf.allowed).toBe(false);
  });
  it("returns Bala values only when the table is populated", () => {
    const o = leaseOutlook(2015, 2026.5);
    if (o.bala) {
      expect(o.bala.relIn10).toBeLessThanOrEqual(1);
      expect(o.bala.relIn20).toBeLessThanOrEqual(o.bala.relIn10);
    } else {
      expect(o.bala).toBeNull();
    }
  });
  it("converts dates to mid-month year fractions", () => {
    expect(yearFraction(new Date(Date.UTC(2026, 0, 15)))).toBeCloseTo(2026 + 0.5 / 12, 10);
  });
});

describe("pagination", () => {
  it("parses and clamps pages", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage(null)).toBe(1);
    const rows = Array.from({ length: 120 }, (_, i) => i);
    expect(paginate(rows, 1, 50).rows).toHaveLength(50);
    expect(paginate(rows, 3, 50)).toMatchObject({ page: 3, total: 120, totalPages: 3 });
    expect(paginate(rows, 3, 50).rows).toEqual(rows.slice(100));
    expect(paginate(rows, 9, 50).page).toBe(3);
    expect(paginate([], 2, 50)).toMatchObject({ page: 1, total: 0, totalPages: 1, rows: [] });
  });
});

describe("with the fixture snapshot", () => {
  it("builds a price history and town line for Blk 872A Tampines St 86", () => {
    const txs = getBlockTransactions("blk-872a-tampines-st-86");
    expect(txs.length).toBeGreaterThan(0);
    const { series, fromMonth } = blockPriceSeries(txs);
    expect(series.length).toBeGreaterThan(0);
    const total = series.reduce((s, x) => s + x.points.reduce((a, p) => a + p.n, 0), 0);
    expect(total).toBe(txs.length);
    const dominant = dominantFlatType(txs, getHdbBlock("blk-872a-tampines-st-86")!.unitMix)!;
    const town = townMedianPoints(getSeries(`hdb:TAMPINES:${dominant}`)?.points, fromMonth);
    expect(town.every((p) => fromMonth == null || p.x >= fromMonth)).toBe(true);
  });

  it("computes yields and supply context without throwing for every fixture block", () => {
    for (const slug of ["blk-872a-tampines-st-86", "blk-999-tampines-st-99", "blk-618a-punggol-dr"]) {
      const block = getHdbBlock(slug)!;
      const sales = getBlockTransactions(slug);
      const rentals = getBlockRentals(slug);
      const rows = yieldsByFlatType({
        sales,
        rentals,
        salesLatestMonth: m("2026-08"),
        rentalsLatestMonth: rentals[0]?.monthIndex ?? null,
        town: getTown(block.townSlug),
        extraFlatTypes: Object.keys(block.unitMix),
      });
      for (const r of rows) if (r.grossYield != null) expect(r.grossYield).toBeGreaterThan(0);
      const nearby = getNearbyBlocks({ lat: block.lat!, lng: block.lng! }, 1000, slug, 500);
      const cohort = mopCohort(nearby, 2026, { radiusM: 1000 });
      expect(cohort.totalBlocks).toBe(cohort.byYear.reduce((s, y) => s + y.blocks, 0));
      expect(Array.isArray(launchesNear(getLaunches(), { lat: block.lat!, lng: block.lng! }, 2000))).toBe(true);
    }
  });
});

describe("hdb i18n namespace", () => {
  it("has a Chinese string with the same placeholders for every English key", async () => {
    const { hdb } = await import("@/lib/i18n/messages/hdb");
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort();
    expect(Object.keys(hdb.zh).sort()).toEqual(Object.keys(hdb.en).sort());
    for (const [k, v] of Object.entries(hdb.en)) {
      expect(k.startsWith("hdb.")).toBe(true);
      expect(vars(hdb.zh[k]), k).toEqual(vars(v));
    }
  });
});
