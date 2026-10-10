import { describe, expect, it } from "vitest";
import {
  SIZE_BANDS,
  angleBetween,
  displayAddress,
  enblocStartYear,
  floorRangeSortKey,
  floorSizeGrid,
  formatDistrict,
  isLandedHouse,
  isSingleUnitSale,
  latestFirst,
  monthlyMedianPsf,
  paginate,
  parsePage,
  parseUnit,
  priceRangeSummary,
  profitLoss,
  saleTypeMix,
  salesScatter,
  salesScatterSample,
  seriesLevel,
  seriesPsfPoints,
  sizeBandOf,
  stackGrid,
  stackingPlan,
  summariseRentals,
  sunSummary,
  tenureSummary,
  tenureText,
  timeAdjustedEstimate,
  toSaleRow,
  unitKeyOf,
  unitMix,
} from "./private-insights";
import { monthIndex } from "@/lib/data/months";
import { getProject, getProjectRentals, getProjectTransactions, getLandedStreetTransactions } from "@/lib/data/private";
import type { MonthlyStat, PrivateRental, PrivateTransaction } from "@/lib/data/types";

const SQFT = 10.7639;

function tx(over: Partial<PrivateTransaction> & { month: string }): PrivateTransaction {
  const areaSqm = over.areaSqm ?? 100;
  const areaSqft = over.areaSqft ?? Math.round(areaSqm * SQFT);
  const price = over.price ?? 1_000_000;
  return {
    monthIndex: monthIndex(over.month),
    projectSlug: "p",
    district: 10,
    propertyType: "Condominium",
    floorRange: "06-10",
    floorMid: 8,
    areaSqm,
    areaSqft,
    price,
    psf: over.psf ?? Math.round(price / (areaSqm * SQFT)),
    typeOfSale: "Resale",
    typeOfArea: "Strata",
    units: 1,
    unit: null,
    address: null,
    ...over,
  };
}

function stat(m: string, medianPsf: number, count = 1): MonthlyStat {
  return { m: monthIndex(m), count, medianPrice: 0, medianPsf };
}

describe("formatting helpers", () => {
  it("formats districts as Dnn", () => {
    expect(formatDistrict(5)).toBe("D05");
    expect(formatDistrict(18)).toBe("D18");
    expect(formatDistrict(null)).toBe("—");
  });

  it("keeps house numbers upper-case in addresses", () => {
    expect(displayAddress("17A SAMPLE LANE")).toBe("17A Sample Lane");
    expect(displayAddress("13 HAIG LANE")).toBe("13 Haig Lane");
    expect(displayAddress("  2 JALAN  BUKIT ")).toBe("2 Jalan Bukit");
  });

  it("summarises tenure with years left", () => {
    expect(tenureSummary({ raw: "Freehold", kind: "freehold", years: null, startYear: null }, 2026)).toEqual({ kind: "freehold" });
    expect(tenureSummary({ raw: "99 yrs lease commencing from 2012", kind: "leasehold", years: 99, startYear: 2012 }, 2026)).toEqual({
      kind: "leasehold",
      years: 99,
      startYear: 2012,
      yearsLeft: 85,
    });
    expect(tenureSummary({ raw: "99 yrs", kind: "leasehold", years: 99, startYear: null }, 2026)).toMatchObject({ yearsLeft: null });
    expect(tenureSummary({ raw: "30 yrs from 1980", kind: "leasehold", years: 30, startYear: 1980 }, 2026)).toMatchObject({ yearsLeft: 0 });
    expect(tenureSummary(null, 2026)).toBeNull();
    expect(tenureText({ raw: "99 yrs lease commencing from 2012", kind: "leasehold", years: 99, startYear: 2012 }, 2026)).toBe("99-year leasehold from 2012 (~85 years left)");
    expect(tenureText(null, 2026)).toBe("Tenure not recorded");
  });
});

describe("size bands and unit mix", () => {
  it("assigns band boundaries correctly", () => {
    expect(sizeBandOf(499)?.key).toBe("lt500");
    expect(sizeBandOf(500)?.key).toBe("500");
    expect(sizeBandOf(749)?.key).toBe("500");
    expect(sizeBandOf(750)?.key).toBe("750");
    expect(sizeBandOf(1249)?.key).toBe("1000");
    expect(sizeBandOf(1250)?.key).toBe("1250");
    expect(sizeBandOf(1500)?.key).toBe("1500");
    expect(sizeBandOf(9000)?.key).toBe("1500");
    expect(sizeBandOf(0)).toBeNull();
    expect(sizeBandOf(Number.NaN)).toBeNull();
    expect(SIZE_BANDS).toHaveLength(6);
  });

  it("computes count, median price and median psf per band, excluding bulk deals", () => {
    const rows = [
      tx({ month: "2024-01", areaSqft: 600, areaSqm: 55.7, price: 900_000, psf: 1500 }),
      tx({ month: "2024-02", areaSqft: 700, areaSqm: 65, price: 1_000_000, psf: 1429 }),
      tx({ month: "2024-03", areaSqft: 700, areaSqm: 65, price: 1_100_000, psf: 1571 }),
      tx({ month: "2024-04", areaSqft: 1300, areaSqm: 120.8, price: 2_000_000, psf: 1538 }),
      tx({ month: "2024-05", areaSqft: 5000, areaSqm: 464.5, price: 7_000_000, psf: 1400, units: 5 }),
    ];
    const mix = unitMix(rows);
    expect(mix.sales).toBe(4);
    expect(mix.excludedBulk).toBe(1);
    expect(mix.rows.map((r) => r.key)).toEqual(["500", "1250"]);
    expect(mix.rows[0]).toMatchObject({ count: 3, medianPrice: 1_000_000, medianPsf: 1500 });
    expect(mix.rows[1]).toMatchObject({ count: 1, medianPrice: 2_000_000, medianPsf: 1538 });
  });

  it("treats bulk deals as not single-unit", () => {
    expect(isSingleUnitSale({ units: 1, areaSqft: 800, price: 1 })).toBe(true);
    expect(isSingleUnitSale({ units: 3, areaSqft: 800, price: 1 })).toBe(false);
    expect(isSingleUnitSale({ units: 1, areaSqft: 0, price: 1 })).toBe(false);
  });
});

describe("sale-type mix", () => {
  it("counts new sale, sub sale and resale", () => {
    expect(saleTypeMix([{ typeOfSale: "New Sale" }, { typeOfSale: "New Sale" }, { typeOfSale: "Sub Sale" }, { typeOfSale: "Resale" }])).toEqual({
      newSale: 2,
      subSale: 1,
      resale: 1,
      total: 4,
    });
    expect(saleTypeMix([])).toEqual({ newSale: 0, subSale: 0, resale: 0, total: 0 });
  });
});

describe("chart series", () => {
  const rows = [
    tx({ month: "2024-01", psf: 1000 }),
    tx({ month: "2024-01", psf: 1200 }),
    tx({ month: "2024-01", psf: 1100 }),
    tx({ month: "2023-06", psf: 900 }),
    tx({ month: "2020-01", psf: 800 }),
  ];
  it("computes monthly medians in ascending order", () => {
    expect(monthlyMedianPsf(rows)).toEqual([
      { x: monthIndex("2020-01"), y: 800 },
      { x: monthIndex("2023-06"), y: 900 },
      { x: monthIndex("2024-01"), y: 1100 },
    ]);
  });
  it("keeps only sales since the cut-off", () => {
    const pts = salesScatter(rows, monthIndex("2023-01"));
    expect(pts).toHaveLength(4);
    expect(pts[0].x).toBe(monthIndex("2023-06"));
  });
  it("samples evenly across the whole period above the cap and reports the total", () => {
    const capped = salesScatterSample(rows, 0, 2);
    expect(capped.total).toBe(5);
    expect(capped.points).toEqual([
      { x: monthIndex("2020-01"), y: 800 },
      { x: monthIndex("2024-01"), y: 1200 },
    ]);
    const many = Array.from({ length: 1000 }, (_, i) => tx({ month: `20${String(20 + Math.floor(i / 200)).padStart(2, "0")}-${String((i % 12) + 1).padStart(2, "0")}`, psf: 1000 + i }));
    const s = salesScatterSample(many, 0, 100);
    expect(s.total).toBe(1000);
    expect(s.points).toHaveLength(100);
    expect(s.points[0].x).toBe(monthIndex("2020-01"));
    expect(s.points[99].x).toBe(monthIndex("2024-12"));
    expect(s.points.every((p, i) => i === 0 || p.x >= s.points[i - 1].x)).toBe(true);
    expect(salesScatterSample(rows, monthIndex("2030-01")).points).toEqual([]);
  });
  it("clips a stats series to the chart window", () => {
    const pts = seriesPsfPoints([stat("2019-01", 700), stat("2023-01", 900), stat("2024-01", 0), stat("2025-01", 1000)], monthIndex("2020-01"), monthIndex("2024-12"));
    expect(pts).toEqual([{ x: monthIndex("2023-01"), y: 900 }]);
    expect(seriesPsfPoints(null, 0)).toEqual([]);
  });
});

describe("floor x size grid", () => {
  it("sorts floor ranges highest first, basements last", () => {
    expect(floorRangeSortKey("06-10")).toBe(8);
    expect(floorRangeSortKey("B1-B5")).toBe(-3);
    expect(floorRangeSortKey("-")).toBeNull();
  });

  it("computes median psf and counts per floor range and size band since the cut-off", () => {
    const rows = [
      tx({ month: "2024-01", floorRange: "01-05", areaSqft: 800, psf: 1000 }),
      tx({ month: "2024-02", floorRange: "01-05", areaSqft: 820, psf: 1100 }),
      tx({ month: "2024-03", floorRange: "11-15", areaSqft: 820, psf: 1300 }),
      tx({ month: "2024-03", floorRange: "11-15", areaSqft: 1300, psf: 1250 }),
      tx({ month: "2018-03", floorRange: "21-25", areaSqft: 800, psf: 900 }),
      tx({ month: "2024-03", floorRange: "21-25", areaSqft: 800, psf: 1500, units: 4 }),
      tx({ month: "2024-04", floorRange: "-", areaSqft: 800, psf: 1500 }),
    ];
    const grid = floorSizeGrid(rows, monthIndex("2020-01"));
    expect(grid.mode).toBe("floor-size");
    expect(grid.rows).toEqual(["11-15", "01-05"]);
    expect(grid.cols.map((c) => c.key)).toEqual(["750", "1250"]);
    expect(grid.sales).toBe(4);
    expect(grid.cells.find((c) => c.row === "01-05" && c.col === "750")).toEqual({ row: "01-05", col: "750", count: 2, medianPsf: 1050 });
    expect(grid.sinceMonth).toBe("2020-01");
  });
});

describe("unit-level stacking and profit & loss", () => {
  it("parses unit numbers", () => {
    expect(parseUnit("#05-12")).toEqual({ floor: "05", floorNum: 5, stack: "12" });
    expect(parseUnit("#B1-03")).toEqual({ floor: "B1", floorNum: -1, stack: "03" });
    expect(parseUnit("12-3a")).toEqual({ floor: "12", floorNum: 12, stack: "3A" });
    expect(parseUnit("PH")).toBeNull();
    expect(parseUnit(null)).toBeNull();
  });

  const unitRows = [
    tx({ month: "2015-01", unit: "#05-12", price: 1_000_000, psf: 1000 }),
    tx({ month: "2021-01", unit: "#05-12", price: 1_300_000, psf: 1300 }),
    tx({ month: "2022-06", unit: "#10-12", price: 1_500_000, psf: 1450 }),
    tx({ month: "2016-06", unit: "#10-03", price: 900_000, psf: 950 }),
    tx({ month: "2020-06", unit: "#10-03", price: 850_000, psf: 900 }),
    tx({ month: "2023-01", unit: null, price: 800_000, psf: 800 }),
  ];

  it("builds a stack x floor grid of the latest psf per unit", () => {
    const grid = stackGrid(unitRows);
    expect(grid.mode).toBe("unit");
    expect(grid.rows).toEqual(["10", "05"]);
    expect(grid.cols.map((c) => c.key)).toEqual(["03", "12"]);
    expect(grid.units).toBe(3);
    expect(grid.cells.find((c) => c.row === "05" && c.col === "12")).toMatchObject({ psf: 1300, month: "2021-01" });
  });

  it("separates the same unit number in different blocks", () => {
    const grid = stackGrid([
      tx({ month: "2021-01", unit: "#05-12", address: "8 HILL RD" }),
      tx({ month: "2021-02", unit: "#05-12", address: "10 HILL RD" }),
    ]);
    expect(grid.cols.map((c) => c.key)).toEqual(["8/12", "10/12"]);
    expect(grid.units).toBe(2);
  });

  it("qualifies unit keys by address", () => {
    expect(unitKeyOf({ unit: "#05-12", address: null })).toBe("#05-12");
    expect(unitKeyOf({ unit: "#05-12", address: "8 HILL RD" })).toBe("8 HILL RD #05-12");
    expect(unitKeyOf({ unit: null, address: "8 HILL RD" })).toBeNull();
  });

  it("pairs repeat sales of the same unit only with unit-level data", () => {
    expect(profitLoss(unitRows, false)).toMatchObject({ available: false, total: 0, rows: [] });
    const pl = profitLoss(unitRows, true);
    expect(pl.available).toBe(true);
    expect(pl.total).toBe(2);
    expect(pl.profitable).toBe(1);
    expect(pl.rows[0]).toMatchObject({ unit: "#05-12", bought: "2015-01", sold: "2021-01", gain: 300_000 });
    expect(pl.rows[0].annualised).toBeCloseTo(Math.pow(1.3, 1 / 6) - 1, 6);
    expect(pl.rows[1]).toMatchObject({ unit: "#10-03", gain: -50_000 });
    expect(pl.medianHoldingYears).toBe(5);
  });

  it("falls back to the floor x size grid without unit numbers", () => {
    const plan = stackingPlan(unitRows.map((t) => ({ ...t, unit: null })), true, 0);
    expect(plan.mode).toBe("floor-size");
    expect(stackingPlan(unitRows, true, 0).mode).toBe("unit");
    expect(stackingPlan(unitRows, false, 0).mode).toBe("floor-size");
  });
});

describe("time-adjusted estimate", () => {
  const series = [stat("2020-01", 1000), stat("2020-02", 1000), stat("2020-03", 1000), stat("2024-01", 1200), stat("2024-02", 1210), stat("2024-03", 1190)];

  it("uses a trailing window median as the index level", () => {
    expect(seriesLevel(series, monthIndex("2024-03"))).toBe(1200);
    expect(seriesLevel(series, monthIndex("2022-01"))).toBeNull();
  });

  it("moves the sale price by the change in the index", () => {
    const est = timeAdjustedEstimate({ monthIndex: monthIndex("2020-03"), price: 3_000_000 }, series, monthIndex("2024-03"));
    expect(est).not.toBeNull();
    expect(est!.factor).toBeCloseTo(1.2, 6);
    expect(est!.estimate).toBe(3_600_000);
    expect(est!.saleMonth).toBe("2020-03");
    expect(est!.asOfMonth).toBe("2024-03");
  });

  it("anchors to the latest index month when the as-of month has no sales, within the staleness limit", () => {
    const est = timeAdjustedEstimate({ monthIndex: monthIndex("2020-03"), price: 3_000_000 }, series, monthIndex("2024-10"));
    expect(est?.asOfMonth).toBe("2024-03");
    expect(timeAdjustedEstimate({ monthIndex: monthIndex("2020-03"), price: 3_000_000 }, series, monthIndex("2026-01"))).toBeNull();
  });

  it("returns null without index data at the sale month, or for invalid input", () => {
    expect(timeAdjustedEstimate({ monthIndex: monthIndex("2022-01"), price: 3_000_000 }, series, monthIndex("2024-03"))).toBeNull();
    expect(timeAdjustedEstimate({ monthIndex: monthIndex("2020-03"), price: 0 }, series, monthIndex("2024-03"))).toBeNull();
    expect(timeAdjustedEstimate({ monthIndex: monthIndex("2025-03"), price: 1 }, series, monthIndex("2024-03"))).toBeNull();
    expect(timeAdjustedEstimate({ monthIndex: monthIndex("2020-03"), price: 1 }, [], monthIndex("2024-03"))).toBeNull();
  });
});

describe("price range summary", () => {
  it("summarises single-unit sales", () => {
    expect(priceRangeSummary([])).toEqual({ count: 0, minPrice: null, maxPrice: null, medianPrice: null, medianPsf: null });
    expect(
      priceRangeSummary([
        { price: 3_000_000, psf: 1800, units: 1 },
        { price: 5_000_000, psf: 2000, units: 1 },
        { price: 9_000_000, psf: 2100, units: 3 },
      ]),
    ).toEqual({ count: 2, minPrice: 3_000_000, maxPrice: 5_000_000, medianPrice: 4_000_000, medianPsf: 1900 });
  });
  it("takes the land psf only from caveats that record land area", () => {
    const rows = [
      { price: 3_000_000, psf: 1800, units: 1, typeOfArea: "Land" as const },
      { price: 2_000_000, psf: 1000, units: 1, typeOfArea: "Strata" as const },
      { price: 5_000_000, psf: 2000, units: 1, typeOfArea: "Land" as const },
    ];
    expect(priceRangeSummary(rows).medianPsf).toBe(1800);
    expect(priceRangeSummary(rows, { landPsfOnly: true })).toEqual({ count: 3, minPrice: 2_000_000, maxPrice: 5_000_000, medianPrice: 3_000_000, medianPsf: 1900 });
    expect(priceRangeSummary([rows[1]], { landPsfOnly: true }).medianPsf).toBeNull();
  });
  it("recognises landed house types (not strata landed)", () => {
    expect(isLandedHouse({ propertyType: "Terrace" })).toBe(true);
    expect(isLandedHouse({ propertyType: "Detached" })).toBe(true);
    expect(isLandedHouse({ propertyType: "Strata Terrace" })).toBe(false);
    expect(isLandedHouse({ propertyType: "Condominium" })).toBe(false);
  });
});

describe("sun summary", () => {
  const s = sunSummary(1.354, 103.944, 2026);

  it("covers the three reference dates", () => {
    expect(s.days.map((d) => d.key)).toEqual(["mar", "jun", "dec"]);
  });

  it("puts the afternoon sun in the west, north-west in June and south-west in December (Singapore)", () => {
    const mar = s.days.find((d) => d.key === "mar")!;
    const jun = s.days.find((d) => d.key === "jun")!;
    const dec = s.days.find((d) => d.key === "dec")!;
    expect(mar.directions).toEqual(["W"]);
    expect(jun.directions).toContain("NW");
    expect(jun.directions.every((d) => ["NW", "WNW", "NNW"].includes(d))).toBe(true);
    expect(dec.directions).toContain("SW");
    expect(dec.directions.every((d) => ["SW", "WSW", "SSW"].includes(d))).toBe(true);
    expect(mar.fromAzimuth).toBeGreaterThan(250);
    expect(mar.toAzimuth).toBeLessThan(290);
  });

  it("lists facings that never face the afternoon sun", () => {
    expect(s.shaded).toEqual(["NE", "E", "SE"]);
    expect(s.facings.map((f) => f.direction)).toContain("W");
  });

  it("lists facings that get direct afternoon sun on all three dates (west-facing in Singapore)", () => {
    expect(s.litAllDates).toEqual(["SW", "W", "NW"]);
    for (const d of s.litAllDates) expect(s.shaded).not.toContain(d);
  });

  it("measures bearings both ways round", () => {
    expect(angleBetween(350, 10)).toBe(20);
    expect(angleBetween(10, 350)).toBe(20);
    expect(angleBetween(90, 270)).toBe(180);
  });
});

describe("rentals", () => {
  const r = (month: string, rent: number, bedrooms: number | null, lo: number | null, hi: number | null): PrivateRental => ({
    month,
    monthIndex: monthIndex(month),
    projectSlug: "p",
    district: 10,
    propertyType: "Non-landed Properties",
    monthlyRent: rent,
    areaSqmLow: lo,
    areaSqmHigh: hi,
    bedrooms,
  });

  it("uses the last 12 months when there are contracts in that window", () => {
    const sum = summariseRentals(
      [r("2024-01", 3000, 2, 70, 80), r("2024-02", 3200, 2, 70, 80), r("2024-03", 4500, 3, 100, 110), r("2021-01", 2000, null, null, null)],
      monthIndex("2023-04"),
    );
    expect(sum.window).toBe("12m");
    expect(sum.total).toBe(4);
    expect(sum.windowCount).toBe(3);
    expect(sum.byBedrooms).toEqual([
      { key: "2", label: "2", count: 2, median: 3100 },
      { key: "3", label: "3", count: 1, median: 4500 },
    ]);
    expect(sum.byArea.map((g) => g.key)).toEqual(["70-80", "100-110"]);
    expect(sum.latest[0].month).toBe("2024-03");
  });

  it("falls back to all records when nothing is recent", () => {
    const sum = summariseRentals([r("2021-01", 2000, null, null, null), r("2021-02", 2200, 1, 40, 50)], monthIndex("2023-04"));
    expect(sum.window).toBe("all");
    expect(sum.byBedrooms.map((g) => g.key)).toEqual(["1", "na"]);
    expect(sum.latest).toHaveLength(2);
  });
});

describe("paging and rows", () => {
  it("parses and clamps pages", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage(null)).toBe(1);
    expect(parsePage("2.5")).toBe(1);
    const rows = Array.from({ length: 30 }, (_, i) => i);
    expect(paginate(rows, 2, 25)).toEqual({ page: 2, pageSize: 25, total: 30, totalPages: 2, rows: [25, 26, 27, 28, 29] });
    expect(paginate(rows, 99, 25).page).toBe(2);
    expect(paginate([], 1, 25)).toEqual({ page: 1, pageSize: 25, total: 0, totalPages: 1, rows: [] });
  });

  it("orders latest first, stable within a month", () => {
    const a = tx({ month: "2024-01", price: 1 });
    const b = tx({ month: "2024-03", price: 2 });
    const c = tx({ month: "2024-01", price: 3 });
    expect(latestFirst([a, b, c]).map((t) => t.price)).toEqual([2, 1, 3]);
  });

  it("maps transactions to sale rows with an optional address slug", () => {
    const row = toSaleRow(tx({ month: "2024-01", address: "13 HAIG LANE" }), "13-haig-ln");
    expect(row).toMatchObject({ month: "2024-01", address: "13 HAIG LANE", addressSlug: "13-haig-ln", units: 1 });
  });
});

describe("en-bloc start year", () => {
  it("uses the lease start for leasehold, earliest new sale for freehold", () => {
    expect(enblocStartYear({ raw: "", kind: "leasehold", years: 99, startYear: 1990 }, [])).toBe(1990);
    expect(enblocStartYear({ raw: "", kind: "freehold", years: null, startYear: null }, [tx({ month: "2012-05", typeOfSale: "New Sale" }), tx({ month: "2010-03", typeOfSale: "New Sale" })])).toBe(2010);
    expect(enblocStartYear({ raw: "", kind: "freehold", years: null, startYear: null }, [tx({ month: "2012-05" })])).toBeNull();
  });
});

describe("fixture snapshot", () => {
  it("builds the condo insights from the data layer", () => {
    const p = getProject("aurora-fixture-residences")!;
    const txs = getProjectTransactions(p.slug);
    expect(unitMix(txs).sales).toBe(txs.length);
    expect(saleTypeMix(txs).total).toBe(p.tx.count);
    const plan = stackingPlan(txs, p.hasUnitLevel, monthIndex("2021-08"));
    expect(plan.mode).toBe("floor-size");
    expect(plan.rows[0]).toBe("16-20");
    const rentals = summariseRentals(getProjectRentals(p.slug), monthIndex("2025-09"));
    expect(rentals.total).toBeGreaterThan(0);
  });

  it("attaches addresses on landed streets", () => {
    const txs = getLandedStreetTransactions("sample-ln");
    expect(txs.every((t) => t.address != null)).toBe(true);
    expect(priceRangeSummary(txs).count).toBe(txs.length);
  });
});
