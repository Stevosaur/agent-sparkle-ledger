import { describe, expect, it } from "vitest";
import { hdbBlockSlug, landedAddressSlug, landedStreetSlug, projectSlug, titleCase } from "@/lib/slug";
import { monthIndex, monthIndexFromMmyy, monthLabel } from "@/lib/data/months";
import { getHdbBlock, getBlockTransactions, getTowns } from "@/lib/data/hdb";
import { getProject, getProjectTransactions, getLandedStreet, getLandedStreetTransactions } from "@/lib/data/private";
import { search } from "@/lib/data/search";
import { getMeta } from "@/lib/data/meta";

describe("slug rules (spec examples)", () => {
  it("builds HDB block slugs", () => {
    expect(hdbBlockSlug("872A", "TAMPINES ST 86")).toBe("blk-872a-tampines-st-86");
  });
  it("drops apostrophes in project slugs", () => {
    expect(projectSlug("PEOPLE'S PK COMPLEX")).toBe("peoples-pk-complex");
    expect(projectSlug("THE HILLFORD")).toBe("the-hillford");
  });
  it("abbreviates street suffixes for landed slugs", () => {
    expect(landedAddressSlug("13", "HAIG LANE")).toBe("13-haig-ln");
    expect(landedStreetSlug("HAIG LANE")).toBe("haig-ln");
  });
  it("title-cases government names", () => {
    expect(titleCase("TAMPINES ST 86")).toBe("Tampines St 86");
  });
});

describe("month encoding", () => {
  it("round-trips", () => {
    expect(monthIndex("1990-01")).toBe(0);
    expect(monthLabel(monthIndex("2024-03"))).toBe("2024-03");
    expect(monthIndexFromMmyy("0324")).toBe(monthIndex("2024-03"));
    expect(monthIndexFromMmyy("1299")).toBe(monthIndex("1999-12"));
  });
});

describe("fixture snapshot through the data layer", () => {
  it("is flagged as fixture data", () => {
    expect(getMeta().fixture).toBe(true);
  });
  it("decodes HDB blocks and transactions", () => {
    const b = getHdbBlock("blk-872a-tampines-st-86");
    expect(b?.town).toBe("TAMPINES");
    const tx = getBlockTransactions("blk-872a-tampines-st-86");
    expect(tx.length).toBe(b?.tx.count);
    expect(tx[0].monthIndex).toBeGreaterThanOrEqual(tx[tx.length - 1].monthIndex);
    expect(tx.every((t) => t.psf > 0 && t.storeyMid > 0)).toBe(true);
    expect(getTowns().map((t) => t.slug)).toContain("tampines");
  });
  it("decodes private projects and landed streets", () => {
    const p = getProject("aurora-fixture-residences");
    expect(p?.isLanded).toBe(false);
    expect(getProjectTransactions("aurora-fixture-residences").length).toBe(p?.tx.count);
    const s = getLandedStreet("sample-ln");
    expect(s?.projects).toEqual(["landed-sample-ln"]);
    expect(getLandedStreetTransactions("sample-ln").length).toBe(s?.tx.count);
  });
  it("searches by name and postal code", () => {
    expect(search("872a tampines")[0]?.href).toBe("/hdb/blk-872a-tampines-st-86/");
    expect(search("521872")[0]?.href).toBe("/hdb/blk-872a-tampines-st-86/");
    const aurora = search("aurora").map((r) => r.href);
    expect(aurora).toContain("/condo/aurora-fixture-residences/");
    expect(aurora).toContain("/new-launch/condo/aurora-fixture-residences/");
  });
});
