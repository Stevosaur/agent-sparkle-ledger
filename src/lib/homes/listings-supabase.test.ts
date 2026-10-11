import { beforeEach, describe, expect, it, vi } from "vitest";

// Supabase configured: record the query the public (anon) client builds.
const calls: [string, ...unknown[]][] = [];
let rows: Record<string, unknown>[] = [];

vi.mock("@/lib/auth/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/config")>()),
  isSupabaseConfigured: () => true,
  supabaseUrl: () => "https://example.supabase.co",
  supabasePublicKey: () => "anon-key",
}));

vi.mock("@supabase/supabase-js", () => {
  const builder: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "like", "gte", "lte", "order", "limit"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return builder;
    };
  }
  // awaiting the builder resolves the query
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
  return { createClient: () => builder };
});

import { searchListings } from "./listings";
import { DEFAULT_FILTERS } from "./filters";

const row = (over: Record<string, unknown>) => ({
  id: "8b0c6f1e-6c56-4d7a-9a59-3f2b9f0c1a11",
  listing_type: "sale",
  ref: "hdb:blk-872a-tampines-st-86",
  title: "4 Room flat",
  asking_price: 600000,
  flat_type: "4 ROOM",
  bedrooms: 3,
  status: "active",
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});

describe("searchListings against Supabase", () => {
  beforeEach(() => {
    calls.length = 0;
    rows = [];
  });

  it("pushes type, kind, price and bedroom filters into the query before the row cap", async () => {
    rows = [row({})];
    const page = await searchListings({ ...DEFAULT_FILTERS, kind: "hdb", minPrice: 500_000, maxPrice: 700_000, bedrooms: 3 });
    expect(page.backend).toBe("supabase");
    expect(page.total).toBe(1);
    expect(calls).toEqual(
      expect.arrayContaining([
        ["eq", "status", "active"],
        ["eq", "listing_type", "sale"],
        ["like", "ref", "hdb:%"],
        ["gte", "asking_price", 500_000],
        ["lte", "asking_price", 700_000],
        ["eq", "bedrooms", 3],
      ]),
    );
  });

  it("treats 5 bedrooms as 5 or more, and still filters derived fields in memory", async () => {
    rows = [row({ bedrooms: 6 }), row({ id: "8b0c6f1e-6c56-4d7a-9a59-3f2b9f0c1a12", ref: "hdb:blk-301-punggol-ctrl", bedrooms: 5 })];
    const page = await searchListings({ ...DEFAULT_FILTERS, bedrooms: 5, area: "town:tampines" });
    expect(calls).toContainEqual(["gte", "bedrooms", 5]);
    expect(page.listings.map((l) => l.areaKey)).toEqual(["town:tampines"]);
  });
});
