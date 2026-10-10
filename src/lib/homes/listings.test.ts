import { describe, expect, it } from "vitest";
import { areaOptions, getActiveListings, getListing, homesIndexData, listingsBackend, rowToListing, searchListings, toSummary } from "./listings";
import { sampleListings } from "./sample-listings";
import { DEFAULT_FILTERS } from "./filters";
import { getBlockTransactions } from "@/lib/data/hdb";

describe("rowToListing", () => {
  const row = {
    id: "8b0c6f1e-6c56-4d7a-9a59-3f2b9f0c1a11",
    user_id: "u1",
    listing_type: "rent",
    ref: "condo:aurora-fixture-residences",
    title: "2-bedder",
    description: "",
    asking_price: "4200",
    flat_type: null,
    area_sqm: 70.5,
    floor_level: "12",
    bedrooms: 2,
    bathrooms: null,
    contact_name: "Mei",
    whatsapp: "6591234567",
    status: "active",
    lat: 1.35,
    lng: 103.94,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: null,
  };
  it("maps a database row", () => {
    expect(rowToListing(row)).toMatchObject({ listingType: "rent", askingPrice: 4200, floorLevel: 12, description: null, bathrooms: null, whatsapp: "6591234567", status: "active" });
  });
  it("drops malformed rows", () => {
    expect(rowToListing({ ...row, listing_type: "swap" })).toBeNull();
    expect(rowToListing({ ...row, asking_price: null })).toBeNull();
    expect(rowToListing({ ...row, title: "  " })).toBeNull();
  });
});

describe("sample listings (fixture snapshot, no Supabase)", () => {
  it("serves sample listings only in fixture mode", () => {
    expect(listingsBackend()).toBe("sample");
    const all = sampleListings();
    expect(all.length).toBeGreaterThanOrEqual(5);
    expect(all.every((l) => l.sample && l.status === "active" && /^00000000-0000-4000-8000-\d{12}$/.test(l.id))).toBe(true);
    expect(new Set(all.map((l) => l.id)).size).toBe(all.length);
  });
  it("takes every asking price from a fixture record", () => {
    for (const l of sampleListings().filter((x) => x.ref.startsWith("hdb:") && x.listingType === "sale")) {
      const latest = getBlockTransactions(l.ref.slice(4))[0];
      expect(l.askingPrice).toBe(Math.round(latest.price / 1000) * 1000);
      expect(l.flatType).toBe(latest.flatType);
    }
  });
  it("looks listings up by id and filters by type", async () => {
    const [first] = sampleListings();
    expect(await getListing(first.id)).toEqual(first);
    expect(await getListing("00000000-0000-4000-8000-999999999999")).toBeNull();
    const rent = await getActiveListings({ type: "rent" });
    expect(rent.listings.every((l) => l.listingType === "rent")).toBe(true);
  });
});

describe("summaries, areas and search", () => {
  it("summarises without contact details and derives the area", () => {
    const hdb = sampleListings().find((l) => l.ref.startsWith("hdb:"))!;
    const s = toSummary(hdb);
    expect(s).not.toHaveProperty("whatsapp");
    expect(s).not.toHaveProperty("contactName");
    expect(s).not.toHaveProperty("description");
    expect(s.kind).toBe("hdb");
    expect(s.areaKey).toMatch(/^town:/);
    expect(s.propertyHref).toMatch(/^\/hdb\/.+\/$/);
  });
  it("orders area options: towns alphabetically, then districts numerically", () => {
    const opts = areaOptions(sampleListings().map(toSummary));
    const towns = opts.filter((o) => o.group === "town").map((o) => o.label);
    const districts = opts.filter((o) => o.group === "district").map((o) => Number(o.key.slice(2)));
    expect(towns).toEqual([...towns].sort());
    expect(districts).toEqual([...districts].sort((a, b) => a - b));
    expect(opts.findIndex((o) => o.group === "district")).toBeGreaterThan(opts.findLastIndex((o) => o.group === "town"));
  });
  it("filters and paginates", async () => {
    const all = await searchListings(DEFAULT_FILTERS);
    expect(all.total).toBe(sampleListings().filter((l) => l.listingType === "sale").length);
    const page = await searchListings(DEFAULT_FILTERS, { offset: 1, limit: 2 });
    expect(page.listings.map((l) => l.id)).toEqual(all.listings.slice(1, 3).map((l) => l.id));
    const hdbOnly = await searchListings({ ...DEFAULT_FILTERS, kind: "hdb" });
    expect(hdbOnly.listings.every((l) => l.kind === "hdb")).toBe(true);
    const none = await searchListings({ ...DEFAULT_FILTERS, minPrice: 99_000_000 });
    expect(none.total).toBe(0);
  });
  it("builds the /homes/ page data", async () => {
    const d = await homesIndexData();
    expect(d.backend).toBe("sample");
    expect(d.sale.total + d.rent.total).toBe(sampleListings().length);
    expect(d.areas.length).toBeGreaterThan(0);
  });
});
