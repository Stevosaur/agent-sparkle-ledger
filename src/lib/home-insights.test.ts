import { describe, expect, it } from "vitest";
import { monthIndex } from "@/lib/data/months";
import { EMPTY_META, getMeta } from "@/lib/data/meta";
import { getSeries } from "@/lib/data/stats";
import { getLaunches, getProjects } from "@/lib/data/private";
import { getHdbBlocks, getTowns } from "@/lib/data/hdb";
import { search } from "@/lib/data/search";
import type { DatasetMeta, MonthlyStat, NewLaunch, SearchEntry, StatSeries, TownSummary, TxSummary } from "@/lib/data/types";
import {
  anchorMonth,
  compareYoY,
  countLaunchTabs,
  credibility,
  formatIsoDate,
  formatMonthRange,
  groupLaunches,
  groupSearchResults,
  launchCard,
  marketPulse,
  normaliseQuery,
  popularTowns,
  recentlyTransacted,
  salesInMonth,
  sgMonthOf,
  trailingPoints,
  weightedMedian,
  windowLabels,
  windowStat,
} from "./home-insights";

const pt = (label: string, count: number, medianPrice: number, medianPsf = 500): MonthlyStat => ({ m: monthIndex(label), count, medianPrice, medianPsf });
const series = (points: MonthlyStat[]): StatSeries => ({ key: "hdb:ALL:ALL", label: "test", points });

describe("weightedMedian", () => {
  it("returns null for empty or zero-weight input", () => {
    expect(weightedMedian([])).toBeNull();
    expect(weightedMedian([{ value: 5, weight: 0 }])).toBeNull();
  });
  it("weights values by count", () => {
    expect(weightedMedian([{ value: 100, weight: 1 }, { value: 200, weight: 5 }, { value: 300, weight: 1 }])).toBe(200);
    expect(weightedMedian([{ value: 300, weight: 10 }, { value: 100, weight: 1 }])).toBe(300);
  });
  it("averages the middle pair when the cumulative weight hits exactly half", () => {
    expect(weightedMedian([{ value: 100, weight: 2 }, { value: 200, weight: 2 }])).toBe(150);
  });
  it("matches the plain median for unit weights", () => {
    expect(weightedMedian([3, 1, 2].map((value) => ({ value, weight: 1 })))).toBe(2);
    expect(weightedMedian([4, 1, 3, 2].map((value) => ({ value, weight: 1 })))).toBe(2.5);
  });
});

describe("months", () => {
  it("reads the generation month in Singapore time", () => {
    expect(sgMonthOf("2026-09-30T17:00:00.000Z")).toBe("2026-10");
    expect(sgMonthOf("2026-09-30T15:00:00.000Z")).toBe("2026-09");
    expect(sgMonthOf("not a date")).toBeNull();
    expect(sgMonthOf(null)).toBeNull();
  });
  it("anchors on the latest complete month", () => {
    // latest month already complete when the snapshot was generated
    expect(anchorMonth("2026-08", "2026-09-01T00:00:00.000Z", null)).toBe(monthIndex("2026-08"));
    // latest month is the generation month: records still arriving, step back
    expect(anchorMonth("2026-10", "2026-10-10T02:00:00.000Z", null)).toBe(monthIndex("2026-09"));
    // no dataset month: fall back to the series' last point
    expect(anchorMonth(null, null, series([pt("2025-01", 1, 1), pt("2025-03", 1, 1)]))).toBe(monthIndex("2025-03"));
    expect(anchorMonth(null, null, null)).toBeNull();
    expect(anchorMonth("garbage", null, null)).toBeNull();
  });
  it("labels windows", () => {
    expect(windowLabels(monthIndex("2026-08"), 3)).toEqual({ from: "2026-06", to: "2026-08" });
    expect(formatMonthRange({ from: "2026-06", to: "2026-08" })).toBe("Jun – Aug 2026");
    expect(formatMonthRange({ from: "2025-11", to: "2026-01" })).toBe("Nov 2025 – Jan 2026");
    expect(formatMonthRange({ from: "2026-08", to: "2026-08" })).toBe("Aug 2026");
  });
});

describe("windowStat / compareYoY", () => {
  const s = series([
    pt("2025-06", 2, 500_000, 550),
    pt("2025-07", 1, 520_000, 560),
    pt("2025-08", 1, 540_000, 570),
    pt("2026-06", 3, 600_000, 620),
    pt("2026-07", 1, 610_000, 630),
    pt("2026-08", 2, 650_000, 660),
  ]);
  const end = monthIndex("2026-08");

  it("computes the sales-weighted median and count over the window", () => {
    expect(windowStat(s.points, end - 2, end)).toEqual({ medianPrice: 605_000, medianPsf: 625, count: 6, monthsWithSales: 3 });
    expect(windowStat(s.points, monthIndex("2024-01"), monthIndex("2024-03"))).toBeNull();
  });

  it("compares with the same months a year earlier", () => {
    const yoy = compareYoY(s, end, 3)!;
    expect(yoy.current?.medianPrice).toBe(605_000);
    expect(yoy.previous?.medianPrice).toBe(510_000);
    expect(yoy.change).toBeCloseTo(605_000 / 510_000 - 1, 10);
  });

  it("returns a null change when the earlier window has no sales", () => {
    const yoy = compareYoY(series([pt("2026-08", 1, 600_000)]), end, 3)!;
    expect(yoy.current?.medianPrice).toBe(600_000);
    expect(yoy.previous).toBeNull();
    expect(yoy.change).toBeNull();
  });

  it("returns null without a series or anchor", () => {
    expect(compareYoY(null, end)).toBeNull();
    expect(compareYoY(s, null)).toBeNull();
  });
});

describe("salesInMonth / trailingPoints", () => {
  const s = series([pt("2026-05", 4, 1), pt("2026-08", 7, 2)]);
  it("reads a month's count, 0 for a gap inside the series, null outside it", () => {
    expect(salesInMonth(s, monthIndex("2026-08"))).toBe(7);
    expect(salesInMonth(s, monthIndex("2026-06"))).toBe(0);
    expect(salesInMonth(s, monthIndex("2026-09"))).toBeNull();
    expect(salesInMonth(null, 1)).toBeNull();
  });
  it("keeps only the trailing window", () => {
    const long = series([pt("2020-01", 1, 10), pt("2021-09", 1, 20), pt("2026-08", 1, 30)]);
    expect(trailingPoints(long, monthIndex("2026-08"), 60)).toEqual([
      { x: monthIndex("2021-09"), y: 20 },
      { x: monthIndex("2026-08"), y: 30 },
    ]);
    expect(trailingPoints(null, 1)).toEqual([]);
  });
});

describe("marketPulse on the fixture dataset", () => {
  it("summarises HDB and private series", () => {
    const meta = getMeta();
    const hdb = marketPulse(getSeries("hdb:ALL:ALL"), meta.latestMonth.hdb, meta.generatedAt)!;
    expect(hdb.end).toBe(monthIndex("2026-08"));
    expect(hdb.yoy.current).not.toBeNull();
    expect(hdb.salesLastMonth).toBeGreaterThan(0);
    expect(hdb.points.length).toBeGreaterThan(0);
    expect(hdb.points.every((p) => p.x > hdb.end - 60 && p.x <= hdb.end)).toBe(true);
    const priv = marketPulse(getSeries("private:ALL:ALL"), meta.latestMonth.private, meta.generatedAt);
    expect(priv?.yoy.current?.medianPrice).toBeGreaterThan(0);
  });
  it("is null when a series is missing", () => {
    expect(marketPulse(null, "2026-08", null)).toBeNull();
    expect(marketPulse(series([]), "2026-08", null)).toBeNull();
  });
});

describe("credibility", () => {
  it("lists only non-zero counts and the latest month", () => {
    const meta: DatasetMeta = {
      ...EMPTY_META,
      counts: { ...EMPTY_META.counts, hdbTransactions: 983_016, privateTransactions: 0, hdbRentals: 10, privateRentals: 5 },
      latestMonth: { hdb: "2026-09", private: null },
    };
    expect(credibility(meta, { hdb: 0, private: null })).toEqual({
      items: [
        { kind: "hdb", count: 983_016, since: 1990 },
        { kind: "rentals", count: 15, since: null },
      ],
      latestMonth: "2026-09",
    });
  });
  it("picks the later of the two latest months", () => {
    const meta: DatasetMeta = { ...EMPTY_META, latestMonth: { hdb: "2026-08", private: "2026-09" } };
    expect(credibility(meta, { hdb: null, private: null })).toEqual({ items: [], latestMonth: "2026-09" });
  });
});

function launch(partial: Partial<NewLaunch> & Pick<NewLaunch, "slug">): NewLaunch {
  return {
    name: partial.slug.toUpperCase(),
    type: "condo",
    status: "launched",
    street: null,
    district: null,
    segment: null,
    developer: null,
    totalUnits: null,
    expectedCompletionYear: null,
    tenure: null,
    sales: [],
    unitsSold: null,
    unitsLaunched: null,
    projectSlug: null,
    nearestMrt: null,
    ...partial,
  };
}

const salesPoint = (month: string, soldToDate: number | null, launchedToDate: number | null, medianPsf: number | null) => ({
  month,
  launchedInMonth: null,
  soldInMonth: null,
  launchedToDate,
  soldToDate,
  medianPsf,
  lowestPsf: null,
  highestPsf: null,
});

describe("launch cards", () => {
  it("uses the reported totals and the latest median psf", () => {
    const card = launchCard(
      launch({ slug: "a", unitsSold: 240, unitsLaunched: 300, sales: [salesPoint("2026-08", 240, 300, null), salesPoint("2026-07", 180, 200, 2120)] }),
    );
    expect(card.href).toBe("/new-launch/condo/a/");
    expect(card.soldShare).toBeCloseTo(0.8);
    expect(card.latestMedianPsf).toBe(2120);
    expect(card.latestPsfMonth).toBe("2026-07");
    expect(card.latestSalesMonth).toBe("2026-08");
  });
  it("falls back to the latest sales point and clamps the share", () => {
    const card = launchCard(launch({ slug: "b", type: "ec", sales: [salesPoint("2026-08", 120, 100, 1500)] }));
    expect(card.sold).toBe(120);
    expect(card.launched).toBe(100);
    expect(card.soldShare).toBe(1);
    expect(card.href).toBe("/new-launch/ec/b/");
  });
  it("has no share when launched units are unknown", () => {
    expect(launchCard(launch({ slug: "c", unitsSold: 5 })).soldShare).toBeNull();
  });
  it("groups by type with upcoming separate, sorted and capped", () => {
    const groups = groupLaunches(
      [
        launch({ slug: "old", sales: [salesPoint("2025-01", 1, 1, 1)] }),
        launch({ slug: "new", sales: [salesPoint("2026-08", 1, 1, 1)] }),
        launch({ slug: "ec1", type: "ec" }),
        launch({ slug: "land", type: "landed" }),
        launch({ slug: "up-late", status: "upcoming", expectedCompletionYear: 2032 }),
        launch({ slug: "up-soon", status: "upcoming", type: "ec", expectedCompletionYear: 2029 }),
        launch({ slug: "up-unknown", status: "upcoming" }),
      ],
      2,
    );
    expect(groups.condo.map((c) => c.slug)).toEqual(["new", "old"]);
    expect(groups.ec.map((c) => c.slug)).toEqual(["ec1"]);
    expect(groups.landed.map((c) => c.slug)).toEqual(["land"]);
    expect(groups.upcoming.map((c) => c.slug)).toEqual(["up-soon", "up-late"]);
  });
  it("counts every launch per tab, ignoring the carousel cap", () => {
    const launches = [
      launch({ slug: "a" }),
      launch({ slug: "b" }),
      launch({ slug: "c" }),
      launch({ slug: "e", type: "ec" }),
      launch({ slug: "u1", status: "upcoming" }),
      launch({ slug: "u2", status: "upcoming", type: "landed" }),
    ];
    expect(groupLaunches(launches, 2).condo).toHaveLength(2);
    expect(countLaunchTabs(launches)).toEqual({ condo: 3, ec: 1, landed: 0, upcoming: 2 });
    expect(countLaunchTabs([])).toEqual({ condo: 0, ec: 0, landed: 0, upcoming: 0 });
  });
  it("splits the fixture launches into launched and upcoming", () => {
    const groups = groupLaunches(getLaunches());
    expect(groups.condo.map((c) => c.slug)).toContain("aurora-fixture-residences");
    expect(groups.upcoming.map((c) => c.slug)).toContain("upcoming-fixture-towers");
  });
});

const tx = (last: string | null, count12m = 0, count = 0): TxSummary => ({ count, first: null, last, lastPrice: null, medianPsf12m: null, count12m });

describe("popularTowns", () => {
  it("ranks by 12-month sales and drops towns without recent sales", () => {
    const town = (t: string, count12m: number, count = 0) => ({ town: t, slug: t.toLowerCase(), region: "East", blocks: 1, tx: tx(null, count12m, count), medianPrice12m: {}, medianRent12m: {} }) as TownSummary;
    expect(popularTowns([town("A", 5), town("B", 9), town("C", 0), town("D", 5, 100)]).map((t) => t.town)).toEqual(["B", "D", "A"]);
    expect(popularTowns(getTowns()).map((t) => t.slug)).toEqual(["tampines", "punggol", "bishan"]);
  });
});

describe("recentlyTransacted", () => {
  it("keeps the latest sales first, ties by recent volume then slug", () => {
    const items = [
      { slug: "a", tx: tx("2026-01", 1) },
      { slug: "b", tx: tx(null) },
      { slug: "c", tx: tx("2026-08", 1) },
      { slug: "d", tx: tx("2026-08", 4) },
      { slug: "e", tx: tx("2025-12", 9) },
      { slug: "f", tx: tx("2026-08", 1) },
    ];
    expect(recentlyTransacted(items, 4).map((i) => i.slug)).toEqual(["d", "c", "f", "a"]);
    expect(recentlyTransacted(items, 10).map((i) => i.slug)).toEqual(["d", "c", "f", "a", "e"]);
    expect(recentlyTransacted(items, 0)).toEqual([]);
  });
  it("matches a full sort on the fixture blocks and projects", () => {
    const blocks = recentlyTransacted(getHdbBlocks(), 10);
    expect(blocks.length).toBe(7); // blk-999 has no sales
    expect(blocks[0].tx.last).toBe("2026-08");
    const condos = recentlyTransacted(getProjects().filter((p) => !p.isLanded), 10);
    expect(condos.map((c) => c.slug)).toEqual(["the-fixture-ec", "aurora-fixture-residences", "sample-park-condo"]);
  });
});

describe("search helpers", () => {
  it("groups results by kind in order of first appearance", () => {
    const e = (kind: SearchEntry["kind"], label: string): SearchEntry => ({ kind, href: `/${label}/`, label, sub: "", postal: null, terms: "", weight: 0 });
    const groups = groupSearchResults([e("town", "t"), e("hdb", "h1"), e("condo", "c"), e("hdb", "h2")]);
    expect(groups.map((g) => g.kind)).toEqual(["town", "hdb", "condo"]);
    expect(groups[1].entries.map((x) => x.label)).toEqual(["h1", "h2"]);
    expect(groupSearchResults(search("tampines", { limit: 30 }))[0].kind).toBe("town");
  });
  it("normalises the query parameter", () => {
    expect(normaliseQuery("  tampines   st  ")).toBe("tampines st");
    expect(normaliseQuery(["a", "b"])).toBe("a");
    expect(normaliseQuery(undefined)).toBe("");
    expect(normaliseQuery("x".repeat(500)).length).toBe(100);
  });
});

describe("formatIsoDate", () => {
  it("formats ISO dates", () => {
    expect(formatIsoDate("2026-09-30")).toBe("30 Sep 2026");
    expect(formatIsoDate("2026-07-01")).toBe("1 Jul 2026");
    expect(formatIsoDate(null)).toBe("—");
    expect(formatIsoDate("soon")).toBe("soon");
  });
});
