import { describe, expect, it } from "vitest";
import { ApiError } from "./http";
import {
  CondoResponseSchema,
  HdbBlockResponseSchema,
  HdbSalesResponseSchema,
  LaunchesResponseSchema,
  MortgageResponseSchema,
  RatesResponseSchema,
  SearchResponseSchema,
  StampDutyResponseSchema,
  TownsResponseSchema,
} from "./schemas";
import { v1Condo, v1HdbBlock, v1HdbBlockSales, v1Launches, v1Mortgage, v1Rates, v1Search, v1StampDuty, v1Towns } from "./v1";
import { refFromPath } from "./refs";

const qs = (s: string) => new URLSearchParams(s);

function expectApiError(fn: () => unknown, status: number) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(status);
    return;
  }
  throw new Error("expected an ApiError");
}

describe("public API responses match their documented schemas", () => {
  it("search", () => {
    const r = SearchResponseSchema.parse(v1Search(qs("q=tampines&limit=3")));
    expect(r.results.length).toBeLessThanOrEqual(3);
    expect(r.results.length).toBeGreaterThan(0);
    expect(SearchResponseSchema.parse(v1Search(qs("q=521872"))).results[0].ref).toBe("hdb:blk-872a-tampines-st-86");
    expectApiError(() => v1Search(qs("")), 400);
    expectApiError(() => v1Search(qs("q=a&limit=50")), 400);
  });

  it("HDB block and its latest 10 sales", () => {
    const b = HdbBlockResponseSchema.parse(v1HdbBlock("blk-872a-tampines-st-86"));
    expect(b.block).toMatchObject({ slug: "blk-872a-tampines-st-86", town: "TAMPINES", name: "Blk 872A Tampines St 86" });
    expect(b.meta.sampleData).toBe(true);
    const s = HdbSalesResponseSchema.parse(v1HdbBlockSales("blk-872a-tampines-st-86"));
    expect(s.returned).toBe(10);
    expect(s.totalSales).toBe(30);
    const empty = HdbSalesResponseSchema.parse(v1HdbBlockSales("blk-999-tampines-st-99"));
    expect(empty.sales).toEqual([]);
    expectApiError(() => v1HdbBlock("blk-0-nowhere"), 404);
    expectApiError(() => v1HdbBlock("../../etc"), 404);
  });

  it("towns", () => {
    const t = TownsResponseSchema.parse(v1Towns());
    expect(t.towns.map((x) => x.slug)).toEqual(["bishan", "punggol", "tampines"]);
  });

  it("condo project (not landed) with latest sales", () => {
    const c = CondoResponseSchema.parse(v1Condo("sample-park-condo"));
    expect(c.project).toMatchObject({ district: 20, segment: "RCR" });
    expect(c.returned).toBe(10);
    expect(JSON.stringify(c)).not.toContain('"unit"');
    expectApiError(() => v1Condo("landed-sample-ln"), 404);
    expectApiError(() => v1Condo("nope"), 404);
  });

  it("launches with filters", () => {
    expect(LaunchesResponseSchema.parse(v1Launches(qs(""))).count).toBe(2);
    const up = LaunchesResponseSchema.parse(v1Launches(qs("status=upcoming")));
    expect(up.launches.map((l) => l.slug)).toEqual(["upcoming-fixture-towers"]);
    expectApiError(() => v1Launches(qs("type=castle")), 400);
    const page = LaunchesResponseSchema.parse(v1Launches(qs("limit=1&offset=1")));
    expect(page).toMatchObject({ count: 2, offset: 1, returned: 1 });
    expectApiError(() => v1Launches(qs("limit=1000")), 400);
  });

  it("rates", () => {
    expect(RatesResponseSchema.parse(v1Rates()).sora.compounded3m?.value).toBe(1.7);
  });

  it("calculators validate input", () => {
    const sd = StampDutyResponseSchema.parse(v1StampDuty(qs("price=1,500,000&profile=spr&count=1")));
    expect(sd.input.profile).toBe("SPR");
    expect(sd.absd.rate).toBe(0.05);
    expect(sd.rules.map((r) => r.id)).toEqual(["bsdResidential", "absdRates"]);
    expect(sd.indicative).toBe(sd.rules.some((r) => !r.status.startsWith("verified")));
    if (sd.indicative) expect(sd.note).toMatch(/^Indicative/);
    expectApiError(() => v1StampDuty(qs("price=abc")), 400);
    expectApiError(() => v1StampDuty(qs("price=100&count=1.5")), 400);
    const m = MortgageResponseSchema.parse(v1Mortgage(qs("principal=500000&rate=2.6&years=25")));
    expect(m.schedule).toHaveLength(25);
    expect(m.schedule.at(-1)!.balance).toBe(0);
    expectApiError(() => v1Mortgage(qs("principal=500000&rate=2.6&years=50")), 400);
    // decimal only: no hex / binary / Infinity
    expectApiError(() => v1Mortgage(qs("principal=0x10&rate=2.6&years=25")), 400);
    expectApiError(() => v1StampDuty(qs("price=0b101")), 400);
    expectApiError(() => v1StampDuty(qs("price=Infinity")), 400);
    expect(v1StampDuty(qs("price=1.5e6")).input.price).toBe(1_500_000);
    expect(v1Mortgage(qs("principal=500000&rate=.5&years=25")).input.ratePct).toBe(0.5);
  });
});

describe("refFromPath", () => {
  it("maps page paths to property references", () => {
    expect(refFromPath("/hdb/blk-1-x/")).toEqual({ kind: "hdb", slug: "blk-1-x" });
    expect(refFromPath("/landed-street/haig-ln/")).toEqual({ kind: "landed-street", slug: "haig-ln" });
    expect(refFromPath("/new-launch/ec/foo/")).toEqual({ kind: "launch", slug: "foo", launchType: "ec" });
    expect(refFromPath("/insights/town/tampines/")).toBeNull();
  });
});
