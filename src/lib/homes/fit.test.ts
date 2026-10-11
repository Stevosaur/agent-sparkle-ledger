import { describe, expect, it } from "vitest";
import { haversineM } from "@/lib/geo-math";
import { clampWeight, fitQueryString, isPlaceRef, parseFitParams, placeRefFromSearch, rankByWeightedDistance } from "./fit";
import { computeFit, resolvePlace } from "./fit-data";

describe("fit params", () => {
  it("parses refs and weights, dropping invalid and duplicate refs and capping at 3", () => {
    expect(parseFitParams("hdb:blk-1-x,condo:foo", "2,1")).toEqual([
      { ref: "hdb:blk-1-x", weight: 2 },
      { ref: "condo:foo", weight: 1 },
    ]);
    expect(parseFitParams("hdb:a,bogus,hdb:a,town:tampines,mrt:bishan,condo:z", "9,1,1,x")).toEqual([
      { ref: "hdb:a", weight: 5 },
      { ref: "town:tampines", weight: 1 },
      { ref: "mrt:bishan", weight: 1 },
    ]);
    expect(parseFitParams("launch:ec/foo-bar,launch:hotel/x", "")).toEqual([{ ref: "launch:ec/foo-bar", weight: 1 }]);
    expect(parseFitParams(null, "1")).toEqual([]);
  });
  it("clamps weights to 1..5 integers", () => {
    expect(clampWeight("0")).toBe(1);
    expect(clampWeight(3.6)).toBe(4);
    expect(clampWeight("99")).toBe(5);
    expect(clampWeight("nope")).toBe(1);
  });
  it("round-trips through the query string", () => {
    const places = [
      { ref: "hdb:blk-872a-tampines-st-86", weight: 3 },
      { ref: "launch:condo/aurora-fixture-residences", weight: 1 },
    ];
    const qs = fitQueryString(places);
    expect(qs).toBe("p=hdb:blk-872a-tampines-st-86,launch:condo/aurora-fixture-residences&w=3,1");
    const sp = new URLSearchParams(qs);
    expect(parseFitParams(sp.get("p"), sp.get("w"))).toEqual(places);
    expect(fitQueryString([])).toBe("");
  });
  it("validates place refs", () => {
    expect(isPlaceRef("landed-street:sample-ln")).toBe(true);
    expect(isPlaceRef("hdb:BLK-1")).toBe(false);
    expect(isPlaceRef("hdb:blk-1/x")).toBe(false);
    expect(isPlaceRef("javascript:alert(1)")).toBe(false);
  });
});

describe("placeRefFromSearch", () => {
  it("maps search results of every kind to place refs", () => {
    expect(placeRefFromSearch({ kind: "hdb", href: "/hdb/blk-872a-tampines-st-86/", label: "" })).toBe("hdb:blk-872a-tampines-st-86");
    expect(placeRefFromSearch({ kind: "condo", href: "/condo/the-fixture-ec/", label: "" })).toBe("condo:the-fixture-ec");
    expect(placeRefFromSearch({ kind: "landed", href: "/landed/13-sample-ln/", label: "" })).toBe("landed:13-sample-ln");
    expect(placeRefFromSearch({ kind: "landed-street", href: "/landed-street/sample-ln/", label: "" })).toBe("landed-street:sample-ln");
    expect(placeRefFromSearch({ kind: "launch", href: "/new-launch/condo/upcoming-fixture-towers/", label: "" })).toBe("launch:condo/upcoming-fixture-towers");
    expect(placeRefFromSearch({ kind: "town", href: "/insights/town/bishan/", label: "Bishan" })).toBe("town:bishan");
    expect(placeRefFromSearch({ kind: "mrt", href: "/map/?station=x", label: "Tampines West MRT" })).toBe("mrt:tampines-west");
    expect(placeRefFromSearch({ kind: "hdb", href: "/elsewhere/", label: "" })).toBeNull();
  });
});

describe("rankByWeightedDistance", () => {
  const work = { lat: 1.2839, lng: 103.8514, weight: 3 };
  const parents = { lat: 1.3546, lng: 103.9453, weight: 1 };
  const nearWork = { id: "a", lat: 1.285, lng: 103.852 };
  const nearParents = { id: "b", lat: 1.355, lng: 103.945 };
  const between = { id: "c", lat: 1.32, lng: 103.9 };
  const noCoords = { id: "d", lat: null, lng: null };

  it("orders by weighted mean distance and reports per-place distances", () => {
    const ranked = rankByWeightedDistance([nearParents, between, nearWork, noCoords], [work, parents], 10);
    expect(ranked.map((r) => r.item.id)).toEqual(["a", "c", "b"]);
    const top = ranked[0];
    const dWork = Math.round(haversineM(nearWork, work));
    const dParents = Math.round(haversineM(nearWork, parents));
    expect(top.distances).toEqual([dWork, dParents]);
    expect(top.score).toBe(Math.round((dWork * 3 + dParents * 1) / 4));
  });
  it("flips when the weights flip", () => {
    const ranked = rankByWeightedDistance([nearParents, nearWork], [{ ...work, weight: 1 }, { ...parents, weight: 5 }], 10);
    expect(ranked[0].item.id).toBe("b");
  });
  it("skips candidates without coordinates, honours the limit and handles no places", () => {
    expect(rankByWeightedDistance([noCoords], [work], 5)).toEqual([]);
    expect(rankByWeightedDistance([nearWork, nearParents, between], [work], 2)).toHaveLength(2);
    expect(rankByWeightedDistance([nearWork], [], 5)).toEqual([]);
  });
});

describe("computeFit on the fixture snapshot", () => {
  it("resolves property, town and MRT places", () => {
    expect(resolvePlace("hdb:blk-872a-tampines-st-86")?.label).toBe("Blk 872A Tampines St 86");
    expect(resolvePlace("town:punggol")?.label).toContain("Punggol");
    expect(resolvePlace("mrt:fixture-future")?.label).toContain("2030");
    expect(resolvePlace("condo:does-not-exist")).toBeNull();
  });
  it("ranks the sample listings (fixture mode) nearest first and reports unresolved places", async () => {
    const r = await computeFit([
      { ref: "mrt:tampines", weight: 2 },
      { ref: "condo:nope", weight: 1 },
    ]);
    expect(r.mode).toBe("listings");
    expect(r.unresolved).toEqual(["condo:nope"]);
    expect(r.places).toHaveLength(1);
    expect(r.results.length).toBeGreaterThan(0);
    for (let i = 1; i < r.results.length; i++) expect(r.results[i].score).toBeGreaterThanOrEqual(r.results[i - 1].score);
    expect(r.results[0].href).toMatch(/^\/homes\/[0-9a-f-]{36}\/$/);
    // the Tampines-area listings beat the Bishan / Punggol ones
    expect(r.results[0].sub).toMatch(/Tampines|District 18/);
  });
  it("filters by listing type", async () => {
    const r = await computeFit([{ ref: "town:bishan", weight: 1 }], { listingType: "rent" });
    expect(r.results.every((x) => x.listingType === "rent")).toBe(true);
  });
  it("returns no results without places", async () => {
    const r = await computeFit([]);
    expect(r.results).toEqual([]);
  });
});
