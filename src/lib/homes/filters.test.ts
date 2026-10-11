import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, filtersToSearchParams, isAreaKey, isListingId, isUnfiltered, matchesFilters, parseListingFilters } from "./filters";
import type { ListingSummary } from "./types";

const listing = (over: Partial<ListingSummary> = {}): ListingSummary => ({
  id: "00000000-0000-4000-8000-000000000001",
  listingType: "sale",
  title: "x",
  askingPrice: 600_000,
  flatType: "4 ROOM",
  areaSqm: 93,
  floorLevel: 8,
  bedrooms: 3,
  bathrooms: 2,
  createdAt: "2026-09-01T00:00:00Z",
  ref: "hdb:blk-1-x",
  kind: "hdb",
  propertyLabel: "Blk 1 X",
  propertyHref: "/hdb/blk-1-x/",
  areaKey: "town:tampines",
  areaLabel: "Tampines",
  sample: false,
  ...over,
});

describe("listing filters", () => {
  it("parses query params, ignoring invalid values and swapping inverted price bounds", () => {
    expect(parseListingFilters(new URLSearchParams("type=rent&kind=condo&area=d:18&min=4,000&max=3000&beds=2"))).toEqual({
      type: "rent",
      kind: "condo",
      area: "d:18",
      minPrice: 3000,
      maxPrice: 4000,
      bedrooms: 2,
    });
    expect(parseListingFilters(new URLSearchParams("type=lease&kind=castle&area=d:29&min=-5&beds=9"))).toEqual(DEFAULT_FILTERS);
    expect(parseListingFilters({ type: ["rent", "sale"], area: "town:tampines" })).toMatchObject({ type: "rent", area: "town:tampines" });
  });
  it("round-trips and omits defaults", () => {
    const f = parseListingFilters(new URLSearchParams("type=rent&area=town:bishan&min=2000&beds=5"));
    expect(filtersToSearchParams(f).toString()).toBe("type=rent&area=town%3Abishan&min=2000&beds=5");
    expect(parseListingFilters(filtersToSearchParams(f))).toEqual(f);
    expect(filtersToSearchParams(DEFAULT_FILTERS).toString()).toBe("");
    expect(isUnfiltered(DEFAULT_FILTERS)).toBe(true);
    expect(isUnfiltered(f)).toBe(false);
  });
  it("matches listings on type, kind, area, price and bedrooms (5 = 5+)", () => {
    const f = { ...DEFAULT_FILTERS };
    expect(matchesFilters(listing(), f)).toBe(true);
    expect(matchesFilters(listing({ listingType: "rent" }), f)).toBe(false);
    expect(matchesFilters(listing(), { ...f, kind: "condo" })).toBe(false);
    expect(matchesFilters(listing(), { ...f, area: "town:bishan" })).toBe(false);
    expect(matchesFilters(listing(), { ...f, minPrice: 600_000, maxPrice: 600_000 })).toBe(true);
    expect(matchesFilters(listing(), { ...f, minPrice: 600_001 })).toBe(false);
    expect(matchesFilters(listing(), { ...f, bedrooms: 3 })).toBe(true);
    expect(matchesFilters(listing({ bedrooms: null }), { ...f, bedrooms: 3 })).toBe(false);
    expect(matchesFilters(listing({ bedrooms: 6 }), { ...f, bedrooms: 5 })).toBe(true);
    expect(matchesFilters(listing({ bedrooms: 4 }), { ...f, bedrooms: 5 })).toBe(false);
  });
  it("validates area keys and listing ids", () => {
    expect(isAreaKey("town:ang-mo-kio")).toBe(true);
    expect(isAreaKey("d:1")).toBe(true);
    expect(isAreaKey("d:0")).toBe(false);
    expect(isAreaKey("town:<script>")).toBe(false);
    expect(isListingId("00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isListingId("not-a-uuid")).toBe(false);
    expect(isListingId("00000000-0000-4000-8000-00000000000g")).toBe(false);
  });
});
