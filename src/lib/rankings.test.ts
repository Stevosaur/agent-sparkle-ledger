import { describe, expect, it } from "vitest";
import type { HdbBlock, NewLaunch, PrivateProject, TownSummary } from "@/lib/data/types";
import type { WindowStat } from "@/lib/insights/types";
import type { HdbBlockStats } from "@/lib/insights/hdb-scan";
import {
  buildCheapestRows,
  buildCompletionRows,
  buildDemandSupplyRows,
  buildEnblocRows,
  buildGrowthRows,
  buildNewestRows,
  buildYieldRows,
  filterRows,
  freeTopRows,
  getListRows,
  LIST_DEFS,
  LIST_IDS,
  pageRows,
  parseListQuery,
  townDemandSupply,
  type RankingInputs,
} from "./rankings";
import { getHdbBlock } from "@/lib/data/hdb";
import { getBlockRentals, getBlockTransactions, getTownRentals, getTowns } from "@/lib/data/hdb";
import { getMeta } from "@/lib/data/meta";
import { monthIndex } from "@/lib/data/months";
import { median } from "@/lib/stats-math";

const ws = (count: number, medianPrice: number | null, medianPsf: number | null): WindowStat => ({ count, medianPrice, medianPsf });
const tx0 = { count: 0, first: null, last: null, lastPrice: null, medianPsf12m: null, count12m: 0 };

function block(slug: string, over: Partial<HdbBlock> = {}): HdbBlock {
  return {
    slug,
    block: slug.split("-")[1] ?? "1",
    street: "TEST ST 1",
    streetFull: null,
    town: "TESTVILLE",
    townSlug: "testville",
    postal: null,
    leaseCommenceYear: 2000,
    yearCompleted: 2000,
    maxFloor: 12,
    dwellingUnits: 100,
    unitMix: {},
    facilities: null,
    tx: tx0,
    rentals: null,
    nearestMrt: null,
    lat: 1.35,
    lng: 103.9,
    ...over,
  };
}

function project(slug: string, over: Partial<PrivateProject> = {}): PrivateProject {
  return {
    slug,
    name: slug.toUpperCase(),
    street: "TEST RD",
    district: 15,
    segment: "OCR",
    propertyTypes: ["Condominium"],
    isLanded: false,
    tenure: { raw: "99 yrs lease commencing from 2010", kind: "leasehold", years: 99, startYear: 2010 },
    tx: tx0,
    rentals: null,
    launchSlug: null,
    nearestMrt: null,
    hasUnitLevel: false,
    ...over,
  };
}

function launch(slug: string, over: Partial<NewLaunch> = {}): NewLaunch {
  return {
    slug,
    name: slug.toUpperCase(),
    type: "condo",
    status: "launched",
    street: null,
    district: 15,
    segment: "OCR",
    developer: null,
    totalUnits: 500,
    expectedCompletionYear: 2028,
    tenure: null,
    sales: [],
    unitsSold: null,
    unitsLaunched: null,
    projectSlug: null,
    nearestMrt: null,
    lat: 1.35,
    lng: 103.9,
    ...over,
  };
}

const town: TownSummary = { town: "TESTVILLE", slug: "testville", region: "East", blocks: 3, tx: tx0, medianPrice12m: {}, medianRent12m: {} };

function inputs(over: Partial<RankingInputs> = {}): RankingInputs {
  return {
    referenceYear: 2026,
    hdbBlocks: [],
    towns: [town],
    projects: [],
    launches: [],
    hdbBlockStats: new Map(),
    hdbRents: new Map(),
    privateProjectStats: new Map(),
    privateRents: new Map(),
    privateFirstNewSale: new Map(),
    ...over,
  };
}

describe("yield ranking", () => {
  it("needs 3 sales and 3 rentals for the same block and flat type", () => {
    const inp = inputs({
      hdbBlocks: [block("blk-1-test-st-1"), block("blk-2-test-st-1")],
      hdbBlockStats: new Map<string, HdbBlockStats>([
        ["blk-1-test-st-1", { slug: "blk-1-test-st-1", townSlug: "testville", all: { cur: ws(6, 500_000, 500), prev5y: ws(0, null, null) }, byType: { "4 ROOM": { cur: ws(3, 500_000, 500), prev5y: ws(0, null, null) }, "5 ROOM": { cur: ws(3, 600_000, 520), prev5y: ws(0, null, null) } } }],
        ["blk-2-test-st-1", { slug: "blk-2-test-st-1", townSlug: "testville", all: { cur: ws(3, 400_000, 450), prev5y: ws(0, null, null) }, byType: { "3 ROOM": { cur: ws(3, 400_000, 450), prev5y: ws(0, null, null) } } }],
      ]),
      hdbRents: new Map([
        ["blk-1-test-st-1|4 ROOM", { count: 3, medianRent: 2500 }],
        ["blk-1-test-st-1|5 ROOM", { count: 2, medianRent: 3000 }], // too few rentals
        ["blk-2-test-st-1|3 ROOM", { count: 4, medianRent: 2200 }],
      ]),
    });
    const rows = buildYieldRows(inp);
    expect(rows.map((r) => r.id)).toEqual(["hdb:blk-2-test-st-1:3 ROOM", "hdb:blk-1-test-st-1:4 ROOM"]);
    expect(rows[0].value).toBeCloseTo((2200 * 12) / 400_000);
    expect(rows[1].metric).toBe("6.00%");
    expect(rows[1].cells).toEqual(["S$2,500/mo", "S$500,000", "3", "3"]);
  });
  it("uses rent psf for condos and skips landed projects", () => {
    const inp = inputs({
      projects: [project("alpha"), project("landed", { isLanded: true })],
      privateProjectStats: new Map([
        ["alpha", { slug: "alpha", cur: ws(5, 1_200_000, 1500), prev5y: ws(0, null, null) }],
        ["landed", { slug: "landed", cur: ws(5, 3_000_000, 1500), prev5y: ws(0, null, null) }],
      ]),
      privateRents: new Map([
        ["alpha", { count: 4, medianRent: 4000, withArea: 4, medianRentPsf: 4.5 }],
        ["landed", { count: 4, medianRent: 9000, withArea: 4, medianRentPsf: 4.5 }],
      ]),
    });
    const rows = buildYieldRows(inp);
    expect(rows).toHaveLength(1);
    expect(rows[0].group).toBe("condo");
    expect(rows[0].value).toBeCloseTo((4.5 * 12) / 1500);
  });
});

describe("growth ranking", () => {
  it("annualises five-year psf growth and enforces window samples", () => {
    const inp = inputs({
      hdbBlocks: [block("blk-1-test-st-1"), block("blk-2-test-st-1")],
      hdbBlockStats: new Map([
        ["blk-1-test-st-1", { slug: "blk-1-test-st-1", townSlug: "testville", all: { cur: ws(4, 0, 600), prev5y: ws(3, 0, 400) }, byType: {} }],
        ["blk-2-test-st-1", { slug: "blk-2-test-st-1", townSlug: "testville", all: { cur: ws(9, 0, 900), prev5y: ws(2, 0, 400) }, byType: {} }],
      ]),
    });
    const rows = buildGrowthRows(inp);
    expect(rows).toHaveLength(1);
    expect(rows[0].flatType).toBe("ALL");
    expect(rows[0].value).toBeCloseTo(Math.pow(600 / 400, 1 / 5) - 1);
    expect(rows[0].metric).toBe("+8.4%/yr");
  });
});

describe("newest, cheapest, completions", () => {
  it("orders blocks by lease start (falling back to completion) and condos by lease start", () => {
    const inp = inputs({
      hdbBlocks: [block("blk-1-a", { leaseCommenceYear: 1990 }), block("blk-2-a", { leaseCommenceYear: null, yearCompleted: 2024 }), block("blk-3-a", { leaseCommenceYear: null, yearCompleted: null })],
      projects: [project("fh", { tenure: { raw: "Freehold", kind: "freehold", years: null, startYear: null } }), project("new", { tenure: { raw: "99", kind: "leasehold", years: 99, startYear: 2020 } })],
    });
    const rows = buildNewestRows(inp);
    expect(rows.map((r) => r.id)).toEqual(["hdb:blk-2-a", "condo:new", "hdb:blk-1-a"]);
    expect(rows[0].cells[0]).toBe("Completion year");
  });
  it("ranks lowest psf first", () => {
    const inp = inputs({
      hdbBlocks: [block("blk-1-a")],
      hdbBlockStats: new Map([["blk-1-a", { slug: "blk-1-a", townSlug: "testville", all: { cur: ws(6, 0, 0), prev5y: ws(0, null, null) }, byType: { "3 ROOM": { cur: ws(3, 400_000, 550), prev5y: ws(0, null, null) }, "4 ROOM": { cur: ws(3, 500_000, 500), prev5y: ws(0, null, null) } } }]]),
    });
    expect(buildCheapestRows(inp).map((r) => r.value)).toEqual([500, 550]);
  });
  it("lists launches completing from the reference year, soonest first", () => {
    const inp = inputs({ launches: [launch("late", { expectedCompletionYear: 2030 }), launch("done", { expectedCompletionYear: 2024 }), launch("soon", { expectedCompletionYear: 2027, totalUnits: 100 }), launch("none", { expectedCompletionYear: null })] });
    expect(buildCompletionRows(inp).map((r) => r.id)).toEqual(["launch:condo/soon", "launch:condo/late"]);
  });
});

describe("demand vs supply", () => {
  const blocks = [
    block("blk-1-a", { yearCompleted: 2022, dwellingUnits: 200 }), // MOP 2027: counted
    block("blk-2-a", { yearCompleted: 2024, dwellingUnits: 100 }), // MOP 2029: counted
    block("blk-3-a", { yearCompleted: 2015, dwellingUnits: 999 }), // MOP 2020: not counted
    block("blk-4-a", { yearCompleted: null, dwellingUnits: 50 }),
  ];
  it("counts MOP flats in the next three calendar years and launches within 3 km", () => {
    const [r] = townDemandSupply({ referenceYear: 2026, hdbBlocks: blocks, towns: [town], launches: [launch("near", { totalUnits: 600 }), launch("far", { lat: 1.45, lng: 103.9 }), launch("completed", { expectedCompletionYear: 2020 })] });
    expect(r.demandUnits).toBe(300);
    expect(r.demandBlocks).toBe(2);
    expect(r.blocksWithoutYear).toBe(1);
    expect(r.supplyUnits).toBe(600);
    expect(r.launches).toEqual(["Near"]);
    expect(r.ratio).toBeCloseTo(0.5);
  });
  it("puts towns with demand and no nearby launches first", () => {
    const other: TownSummary = { ...town, town: "OTHER", slug: "other" };
    const inp = inputs({
      towns: [town, other],
      hdbBlocks: [...blocks, block("blk-9-o", { townSlug: "other", town: "OTHER", yearCompleted: 2023, dwellingUnits: 80, lat: 1.3, lng: 103.7 })],
      launches: [launch("near", { totalUnits: 600 })],
    });
    const rows = buildDemandSupplyRows(inp);
    expect(rows.map((r) => r.townSlug)).toEqual(["other", "testville"]);
    expect(rows[0].metric).toBe("No launches nearby");
    expect(rows[0].value).toBeNull();
    expect(rows[1].metric).toBe("0.50×");
  });
});

describe("en-bloc ranking", () => {
  it("orders by tier, then age", () => {
    const inp = inputs({
      projects: [
        project("young", { tenure: { raw: "99", kind: "leasehold", years: 99, startYear: 2015 } }),
        project("old99", { tenure: { raw: "99", kind: "leasehold", years: 99, startYear: 1980 } }),
        project("fh", { tenure: { raw: "Freehold", kind: "freehold", years: null, startYear: null }, tx: { ...tx0, first: "2021-09" } }),
        project("ec", { propertyTypes: ["Executive Condominium"] }),
      ],
      privateFirstNewSale: new Map([["fh", monthIndex("1990-05")]]),
    });
    const rows = buildEnblocRows(inp);
    expect(rows.map((r) => r.id)).toEqual(["condo:fh", "condo:old99", "condo:ec", "condo:young"]); // ec (16 yrs) and young (11 yrs) share the "Unlikely" tier
    expect(rows[0].metric).toBe("Tier A · Higher en-bloc potential");
    expect(rows[0].cells).toEqual(["Freehold", "36 yrs", "Earliest developer sale"]);
  });
  it("does not take a freehold project's first resale in a short record as its age", () => {
    // URA's record starts in 2021, so an old freehold condo's earliest sale is a 2021 resale: its age is unknown, not 5 years
    const inp = inputs({
      projects: [
        project("old-fh", { tenure: { raw: "Freehold", kind: "freehold", years: null, startYear: null }, tx: { ...tx0, first: "2021-09" } }),
        project("new-fh", { tenure: { raw: "Freehold", kind: "freehold", years: null, startYear: null }, tx: { ...tx0, first: "2023-03" } }),
        project("lease999", { tenure: { raw: "999 yrs lease commencing from 1885", kind: "leasehold", years: 999, startYear: 1885 }, tx: { ...tx0, first: "2021-10" } }),
      ],
      privateFirstNewSale: new Map([["new-fh", monthIndex("2023-03")]]),
    });
    const rows = buildEnblocRows(inp);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get("condo:new-fh")?.metric).toBe("En bloc unlikely for now");
    expect(byId.get("condo:new-fh")?.cells).toEqual(["Freehold", "3 yrs", "Earliest developer sale"]);
    expect(byId.get("condo:old-fh")?.metric).toBe("Not enough data");
    expect(byId.get("condo:old-fh")?.cells).toEqual(["Freehold", "—", "No developer sale on record"]);
    // a 999-year lease start (1885) is the land tenure, not the building's age
    expect(byId.get("condo:lease999")?.metric).toBe("Not enough data");
    expect(rows.map((r) => r.id)).toEqual(["condo:new-fh", "condo:lease999", "condo:old-fh"]);
  });
});

describe("filters and paging", () => {
  it("validates query parameters against the list definition", () => {
    const q = parseListQuery(LIST_DEFS.yield, new URLSearchParams("group=hdb&town=tampines&flatType=4%20ROOM&segment=XYZ"));
    expect(q).toEqual({ group: "hdb", town: "tampines", flatType: "4 ROOM", segment: null });
    expect(parseListQuery(LIST_DEFS.completions, new URLSearchParams("town=tampines&group=hdb")).town).toBeNull();
    expect(parseListQuery(LIST_DEFS.growth, new URLSearchParams("flatType=ALL")).flatType).toBe("ALL");
    expect(parseListQuery(LIST_DEFS.yield, new URLSearchParams("flatType=ALL")).flatType).toBeNull();
  });
  it("shows block-level growth rows by default and per-type rows on request", () => {
    const rows = [
      { id: "a", group: "hdb" as const, flatType: "ALL", townSlug: "t", segment: null, label: "a", href: "/", sub: "", value: 1, metric: "", cells: [] },
      { id: "b", group: "hdb" as const, flatType: "4 ROOM", townSlug: "t", segment: null, label: "b", href: "/", sub: "", value: 1, metric: "", cells: [] },
      { id: "c", group: "condo" as const, flatType: null, townSlug: null, segment: "OCR" as const, label: "c", href: "/", sub: "", value: 1, metric: "", cells: [] },
    ];
    expect(filterRows(LIST_DEFS.growth, rows, {}).map((r) => r.id)).toEqual(["a", "c"]);
    expect(filterRows(LIST_DEFS.growth, rows, { flatType: "4 ROOM" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterRows(LIST_DEFS.growth, rows, { segment: "OCR" }).map((r) => r.id)).toEqual(["c"]);
    expect(filterRows(LIST_DEFS.yield, rows, {}).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(filterRows(LIST_DEFS.growth, rows, { group: "condo", flatType: "ALL" }).map((r) => r.id)).toEqual(["c"]);
    expect(filterRows(LIST_DEFS.yield, rows, { flatType: "4 ROOM" }).map((r) => r.id)).toEqual(["b"]);
  });
});

describe("rankings on the fixture snapshot", () => {
  it("builds every list and pages it", () => {
    for (const id of LIST_IDS) {
      const rows = getListRows(id);
      expect(Array.isArray(rows)).toBe(true);
      const page = pageRows(id, {}, 0, 2);
      expect(page.rows.length).toBeLessThanOrEqual(2);
      page.rows.forEach((r, i) => expect(r.rank).toBe(i + 1));
      for (const r of rows) {
        expect(r.href.endsWith("/")).toBe(true);
        expect(r.cells).toHaveLength(LIST_DEFS[id].columns.length);
        expect(r.metric).not.toMatch(/NaN|undefined/);
      }
    }
    expect(pageRows("yield", {}, 0, 10_000).limit).toBe(100);
  });
  it("matches a hand computation of the top HDB yield from raw records", () => {
    const top = freeTopRows("yield").find((g) => g.group.id === "hdb")!.rows[0];
    const [, slug, flatType] = top.id.split(":");
    const L = monthIndex(getMeta().latestMonth.hdb!);
    const sales = getBlockTransactions(slug).filter((t) => t.flatType === flatType && t.monthIndex > L - 12);
    const rentals = getBlockRentals(slug).filter((r) => r.flatType === flatType);
    const rentLatest = Math.max(...getTowns().flatMap((t) => getTownRentals(t.slug).map((r) => r.monthIndex)));
    const recent = rentals.filter((r) => r.monthIndex >= rentLatest - 11);
    expect(sales.length).toBeGreaterThanOrEqual(3);
    expect(recent.length).toBeGreaterThanOrEqual(3);
    expect(top.value).toBeCloseTo((Math.round(median(recent.map((r) => r.monthlyRent))) * 12) / Math.round(median(sales.map((s) => s.price))), 6);
    expect(getHdbBlock(slug)).not.toBeNull();
  });
  it("explains the demand-supply heuristic for the fixture towns", () => {
    const rows = getListRows("demand-supply");
    const tampines = rows.find((r) => r.townSlug === "tampines");
    expect(tampines?.cells[0]).toBe("150"); // blk-999 completed 2024 -> MOP 2029
  });
});
