import { describe, expect, it } from "vitest";
import type { LaunchSalesPoint, NewLaunch, PrivateProject, PrivateTransaction } from "@/lib/data/types";
import { monthIndex } from "@/lib/data/months";
import { getLaunches, getProjects } from "@/lib/data/private";
import {
  districtOptions,
  estimatePrice,
  filterLaunches,
  fraction,
  latestPrice,
  launchHref,
  launchProgress,
  listingTypeCounts,
  listingsHref,
  monthlySoldBars,
  nearbyProjects,
  nearbyResalePsf,
  paginate,
  parseListingFilters,
  premiumOver,
  psfTrendSeries,
  segmentCounts,
  sortLaunches,
} from "./launch-insights";

const point = (month: string, p: Partial<LaunchSalesPoint> = {}): LaunchSalesPoint => ({
  month,
  launchedInMonth: null,
  soldInMonth: null,
  launchedToDate: null,
  soldToDate: null,
  medianPsf: null,
  lowestPsf: null,
  highestPsf: null,
  ...p,
});

const launch = (p: Partial<NewLaunch>): NewLaunch => ({
  slug: "x",
  name: "X",
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
  ...p,
});

const project = (p: Partial<PrivateProject>): PrivateProject => ({
  slug: "p",
  name: "P",
  street: "S",
  district: 18,
  segment: "OCR",
  propertyTypes: ["Condominium"],
  isLanded: false,
  tenure: null,
  tx: { count: 0, first: null, last: null, lastPrice: null, medianPsf12m: null, count12m: 0 },
  rentals: null,
  launchSlug: null,
  nearestMrt: null,
  hasUnitLevel: false,
  ...p,
});

const tx = (p: Partial<PrivateTransaction>): PrivateTransaction => ({
  month: "2026-08",
  monthIndex: monthIndex("2026-08"),
  projectSlug: "p",
  district: 18,
  propertyType: "Condominium",
  floorRange: "01-05",
  floorMid: 3,
  areaSqm: 100,
  areaSqft: 1076,
  price: 1_500_000,
  psf: 1400,
  typeOfSale: "Resale",
  typeOfArea: "Strata",
  units: 1,
  unit: null,
  address: null,
  ...p,
});

describe("fraction", () => {
  it("clamps and rejects bad inputs", () => {
    expect(fraction(240, 400)).toBe(0.6);
    expect(fraction(500, 400)).toBe(1);
    expect(fraction(1, 0)).toBeNull();
    expect(fraction(null, 10)).toBeNull();
    expect(fraction(-1, 10)).toBeNull();
    expect(fraction(Number.NaN, 10)).toBeNull();
  });
});

describe("launchProgress", () => {
  it("uses the summary fields and derives percentages", () => {
    const p = launchProgress({ totalUnits: 400, unitsSold: 240, unitsLaunched: 300, sales: [point("2026-07"), point("2026-08")] });
    expect(p).toMatchObject({ sold: 240, launched: 300, total: 400, soldOfTotal: 0.6, launchedOfTotal: 0.75, soldOfLaunched: 0.8, unsoldLaunched: 60, asOf: "2026-08" });
  });

  it("falls back to the latest month with a figure when summary fields are null", () => {
    const p = launchProgress({
      totalUnits: null,
      unitsSold: null,
      unitsLaunched: null,
      sales: [point("2026-08", { soldToDate: null, launchedToDate: 120 }), point("2026-06", { soldToDate: 50, launchedToDate: 100 })],
    });
    expect(p.sold).toBe(50);
    expect(p.launched).toBe(120);
    expect(p.soldOfTotal).toBeNull();
    expect(p.soldOfLaunched).toBeCloseTo(50 / 120);
    expect(p.asOf).toBe("2026-08");
  });

  it("handles upcoming launches with no sales", () => {
    const p = launchProgress({ totalUnits: 650, unitsSold: null, unitsLaunched: null, sales: [] });
    expect(p).toMatchObject({ sold: null, launched: null, total: 650, soldOfTotal: null, unsoldLaunched: null, asOf: null });
  });
});

describe("prices", () => {
  const sales = [
    point("2026-08", { medianPsf: 2150, lowestPsf: 1980, highestPsf: 2450, soldInMonth: 60 }),
    point("2026-06", { medianPsf: 2100, lowestPsf: 1900, highestPsf: 2400, soldInMonth: 150 }),
    point("2026-09", { soldInMonth: 0 }),
  ];

  it("takes the latest priced month and its lowest psf as the from-price", () => {
    expect(latestPrice(sales)).toEqual({ month: "2026-08", medianPsf: 2150, lowestPsf: 1980, highestPsf: 2450, fromPsf: 1980 });
    expect(latestPrice([])).toBeNull();
    expect(latestPrice([point("2026-01", { medianPsf: 0 })])).toBeNull();
  });

  it("builds trend series sorted by month and drops empty series", () => {
    const series = psfTrendSeries(sales);
    expect(series.map((s) => s.name)).toEqual(["Median psf", "Lowest psf", "Highest psf"]);
    expect(series[0].points).toEqual([
      { x: monthIndex("2026-06"), y: 2100 },
      { x: monthIndex("2026-08"), y: 2150 },
    ]);
    expect(psfTrendSeries([point("2026-01")])).toEqual([]);
  });

  it("builds monthly sold bars in month order", () => {
    expect(monthlySoldBars(sales)).toEqual([
      { label: "Jun 2026", value: 150 },
      { label: "Aug 2026", value: 60 },
      { label: "Sep 2026", value: 0 },
    ]);
    expect(monthlySoldBars(sales, 1)).toEqual([{ label: "Sep 2026", value: 0 }]);
  });

  it("estimates a price from psf and size", () => {
    expect(estimatePrice(2150, 700)).toBe(1_505_000);
    expect(estimatePrice(null, 700)).toBeNull();
    expect(estimatePrice(2150, 0)).toBeNull();
  });

  it("computes premium over a comparison", () => {
    expect(premiumOver(2200, 2000)).toBeCloseTo(0.1);
    expect(premiumOver(null, 2000)).toBeNull();
    expect(premiumOver(2000, 0)).toBeNull();
  });
});

describe("nearby resale psf", () => {
  const origin = { lat: 1.354, lng: 103.944 };
  const projects = [
    project({ slug: "self", lat: 1.354, lng: 103.944 }),
    project({ slug: "near", name: "NEAR", lat: 1.36, lng: 103.944 }), // ~667 m
    project({ slug: "far", lat: 1.38, lng: 103.944 }), // ~2.9 km
    project({ slug: "landed", isLanded: true, propertyTypes: ["Terrace"], lat: 1.355, lng: 103.944 }),
    project({ slug: "nocoords" }),
  ];

  it("finds non-landed projects within the radius, excluding the launch's own project", () => {
    const near = nearbyProjects(origin, projects, { radiusM: 1500, landed: false, excludeSlugs: ["self", null] });
    expect(near.map((p) => p.slug)).toEqual(["near"]);
    expect(near[0].distanceM).toBeGreaterThan(600);
    expect(near[0].distanceM).toBeLessThan(700);
    expect(nearbyProjects(origin, projects, { radiusM: 1500, landed: true }).map((p) => p.slug)).toEqual(["landed"]);
  });

  it("pools resales in the 12-month window and skips new sales, bulk deals and old records", () => {
    const nearby = nearbyProjects(origin, projects, { radiusM: 1500, landed: false, excludeSlugs: ["self"] });
    const end = monthIndex("2026-08");
    const summary = nearbyResalePsf({
      nearby,
      endMonthIndex: end,
      radiusM: 1500,
      landed: false,
      transactions: [
        tx({ projectSlug: "near", psf: 1200 }),
        tx({ projectSlug: "near", psf: 1400, monthIndex: monthIndex("2025-09") }),
        tx({ projectSlug: "near", psf: 1300 }),
        tx({ projectSlug: "near", psf: 9999, monthIndex: monthIndex("2025-08") }), // outside window
        tx({ projectSlug: "near", psf: 9999, typeOfSale: "New Sale" }),
        tx({ projectSlug: "near", psf: 9999, units: 3 }),
        tx({ projectSlug: "near", psf: 9999, propertyType: "Strata Terrace" }),
        tx({ projectSlug: "self", psf: 9999 }),
        tx({ projectSlug: "far", psf: 9999 }),
      ],
    });
    expect(summary).toMatchObject({ windowStart: "2025-09", windowEnd: "2026-08", medianPsf: 1300, count: 3, projectCount: 1 });
    expect(summary.projects[0]).toMatchObject({ slug: "near", medianPsf: 1300, count: 3 });
  });

  it("returns an empty summary when there is nothing nearby", () => {
    const s = nearbyResalePsf({ nearby: [], transactions: [tx({})], endMonthIndex: monthIndex("2026-08"), radiusM: 1500, landed: false });
    expect(s.medianPsf).toBeNull();
    expect(s.count).toBe(0);
    expect(s.projects).toEqual([]);
  });
});

describe("catalogue", () => {
  const list = [
    launch({ slug: "a", name: "A", segment: "OCR", district: 18, sales: [point("2026-07")], unitsSold: 10 }),
    launch({ slug: "b", name: "B", segment: "OCR", district: 19, sales: [point("2026-08")], unitsSold: 5 }),
    launch({ slug: "c", name: "C", segment: "RCR", district: 20, type: "ec", sales: [point("2026-08")] }),
    launch({ slug: "d", name: "D", segment: "CCR", district: 10, status: "upcoming", expectedCompletionYear: 2031 }),
    launch({ slug: "e", name: "E", segment: "OCR", district: 18, status: "upcoming", type: "landed", expectedCompletionYear: 2029 }),
  ];

  it("parses and normalises query parameters", () => {
    expect(parseListingFilters({})).toEqual({ type: "condo", segment: null, district: null, page: 1 });
    expect(parseListingFilters({ type: "EC", segment: "ocr", district: "D05", page: "3" })).toEqual({ type: "ec", segment: "OCR", district: 5, page: 3 });
    expect(parseListingFilters({ type: "commercial", segment: "XYZ", district: "99", page: "-1" })).toEqual({ type: "condo", segment: null, district: null, page: 1 });
    expect(parseListingFilters({ type: ["upcoming", "condo"] }).type).toBe("upcoming");
  });

  it("builds canonical hrefs with a trailing slash before the query", () => {
    expect(listingsHref({ type: "ec" })).toBe("/listings/?type=ec");
    expect(listingsHref({ type: "condo", segment: "OCR", district: 18, page: 2 })).toBe("/listings/?type=condo&segment=OCR&district=18&page=2");
    expect(launchHref({ type: "ec", slug: "the-fixture-ec" })).toBe("/new-launch/ec/the-fixture-ec/");
  });

  it("filters by tab, segment and district and sorts", () => {
    expect(filterLaunches(list, { type: "condo", segment: null, district: null }).map((l) => l.slug)).toEqual(["b", "a"]);
    expect(filterLaunches(list, { type: "condo", segment: "OCR", district: 18 }).map((l) => l.slug)).toEqual(["a"]);
    expect(filterLaunches(list, { type: "upcoming", segment: null, district: null }).map((l) => l.slug)).toEqual(["e", "d"]);
    expect(sortLaunches(list.slice(0, 2), "condo").map((l) => l.slug)).toEqual(["b", "a"]);
  });

  it("counts tabs, segments and districts", () => {
    expect(listingTypeCounts(list, { segment: null, district: null })).toEqual({ condo: 2, ec: 1, landed: 0, upcoming: 2 });
    expect(listingTypeCounts(list, { segment: "OCR", district: null })).toEqual({ condo: 2, ec: 0, landed: 0, upcoming: 1 });
    expect(segmentCounts(list, { type: "upcoming", district: null })).toEqual({ CCR: 1, RCR: 0, OCR: 1 });
    expect(districtOptions(list, { type: "condo", segment: null })).toEqual([
      { district: 18, count: 1 },
      { district: 19, count: 1 },
    ]);
  });

  it("paginates and clamps the page", () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    expect(paginate(items, 1, 24)).toMatchObject({ page: 1, pages: 2, total: 30 });
    expect(paginate(items, 2, 24).items).toEqual([24, 25, 26, 27, 28, 29]);
    expect(paginate(items, 9, 24).page).toBe(2);
    expect(paginate([], 1, 24)).toMatchObject({ items: [], page: 1, pages: 1, total: 0 });
  });
});

describe("fixture snapshot", () => {
  it("reads launches and finds no other resale condo within 1.5 km of the fixture launch", () => {
    const aurora = getLaunches().find((l) => l.slug === "aurora-fixture-residences")!;
    expect(launchProgress(aurora)).toMatchObject({ sold: 240, launched: 300, total: 400, soldOfTotal: 0.6 });
    expect(latestPrice(aurora.sales)?.fromPsf).toBe(1980);
    const near = nearbyProjects({ lat: aurora.lat!, lng: aurora.lng! }, getProjects(), { radiusM: 1500, landed: false, excludeSlugs: [aurora.projectSlug] });
    expect(near).toEqual([]);
    const bishan = nearbyProjects({ lat: 1.3505, lng: 103.849 }, getProjects(), { radiusM: 1500, landed: false });
    expect(bishan.map((p) => p.slug)).toEqual(["sample-park-condo"]);
  });
});
