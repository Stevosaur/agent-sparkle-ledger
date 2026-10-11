import { describe, expect, it, vi } from "vitest";
import type { HomeListing } from "./types";

// Only sale listings are active: filtering the fit ranking to rentals must stay in listings mode.
const listing = (over: Partial<HomeListing>): HomeListing => ({
  id: "00000000-0000-4000-8000-0000000000aa",
  userId: null,
  listingType: "sale",
  ref: "hdb:blk-872a-tampines-st-86",
  title: "4 Room flat at Blk 872A Tampines St 86",
  description: null,
  askingPrice: 600_000,
  flatType: "4 ROOM",
  areaSqm: 93,
  floorLevel: 8,
  bedrooms: 3,
  bathrooms: 2,
  contactName: null,
  whatsapp: null,
  status: "active",
  lat: null,
  lng: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: null,
  ...over,
});

vi.mock("./listings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./listings")>();
  return {
    ...actual,
    getActiveListings: async (opts: { type?: "sale" | "rent" } = {}) => {
      const all = [listing({}), listing({ id: "00000000-0000-4000-8000-0000000000ab", sample: true })];
      return { listings: opts.type ? all.filter((l) => l.listingType === opts.type) : all, backend: "supabase" as const, unavailable: false };
    },
  };
});

import { computeFit } from "./fit-data";

describe("computeFit with listings", () => {
  const places = [{ ref: "hdb:blk-872a-tampines-st-86", weight: 1 }];

  it("ranks listings (coordinates from the property when the row has none) and flags samples", async () => {
    const r = await computeFit(places);
    expect(r.mode).toBe("listings");
    expect(r.results.map((x) => x.id).sort()).toEqual(["00000000-0000-4000-8000-0000000000aa", "00000000-0000-4000-8000-0000000000ab"]);
    expect(r.results.every((x) => x.score === 0 && x.href.startsWith("/homes/"))).toBe(true);
    expect(r.results.find((x) => x.id.endsWith("ab"))?.sample).toBe(true);
    expect(r.results.find((x) => x.id.endsWith("aa"))?.sample).toBe(false);
  });

  it("stays in listings mode when no listing has the requested type", async () => {
    const r = await computeFit(places, { listingType: "rent" });
    expect(r.mode).toBe("listings");
    expect(r.results).toEqual([]);
    expect(r.candidates).toBe(0);
  });
});
