import { describe, expect, it, vi } from "vitest";

// No active listings: the fit tool falls back to ranking HDB blocks and condos with recent sales.
vi.mock("./listings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./listings")>()),
  getActiveListings: async () => ({ listings: [], backend: "none" as const, unavailable: false }),
}));

import { computeFit } from "./fit-data";
import { getHdbBlock } from "@/lib/data/hdb";

describe("computeFit without listings", () => {
  it("ranks HDB blocks and condos with sales in the latest 12 months", async () => {
    const r = await computeFit([{ ref: "hdb:blk-872a-tampines-st-86", weight: 1 }]);
    expect(r.mode).toBe("properties");
    expect(r.results.length).toBeGreaterThan(0);
    // the place itself is the nearest candidate
    expect(r.results[0]).toMatchObject({ id: "hdb:blk-872a-tampines-st-86", kind: "hdb", href: "/hdb/blk-872a-tampines-st-86/", score: 0 });
    const ids = r.results.map((x) => x.id);
    // no recent sales -> not a candidate
    expect(getHdbBlock("blk-999-tampines-st-99")?.tx.count12m).toBe(0);
    expect(ids).not.toContain("hdb:blk-999-tampines-st-99");
    // condos and ECs are included, landed pseudo-projects are not
    expect(ids).toContain("condo:aurora-fixture-residences");
    expect(ids.some((id) => id.startsWith("condo:landed-"))).toBe(false);
    for (const row of r.results) expect(row.count12m).toBeGreaterThan(0);
  });
});
