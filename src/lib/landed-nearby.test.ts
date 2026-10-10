import { describe, expect, it } from "vitest";
import { nearbyLandedSales, selectNearbyLandedSales } from "./landed-nearby";
import { getLandedAddress } from "@/lib/data/private";
import type { LandedAddress, LandedStreet, PrivateTransaction, TxSummary } from "@/lib/data/types";

const LATEST = 440;
const origin = { lat: 1.3, lng: 103.9 };
const tx0 = {} as TxSummary;

function street(slug: string, name: string, lat: number | undefined, district: number): LandedStreet {
  return { slug, street: name, district, segment: null, propertyTypes: [], tenures: [], tx: tx0, projects: [`landed-${slug}`], addresses: [], lat, lng: lat == null ? undefined : origin.lng };
}

function address(slug: string, addr: string, streetSlug: string, lat: number): LandedAddress {
  return { slug, address: addr, houseNo: addr.split(" ")[0], street: "", streetSlug, district: null, segment: null, propertyType: "Terrace", tenure: null, landAreaSqm: null, tx: tx0, lat, lng: origin.lng };
}

function sale(projectSlug: string, monthIndex: number, price: number, extra: Partial<PrivateTransaction> = {}): PrivateTransaction {
  return {
    month: "",
    monthIndex,
    projectSlug,
    district: 15,
    propertyType: "Terrace",
    floorRange: "-",
    floorMid: null,
    areaSqm: 200,
    areaSqft: 2153,
    price,
    psf: 1000,
    typeOfSale: "Resale",
    typeOfArea: "Land",
    units: 1,
    unit: null,
    address: null,
    ...extra,
  };
}

// ~200 m, ~300 m and ~1.5 km north of the origin
const D200 = origin.lat + 0.0018;
const D300 = origin.lat + 0.0027;
const D1500 = origin.lat + 0.0135;

const streets = [
  street("own-st", "OWN STREET", origin.lat, 15),
  street("near-rd", "NEAR ROAD", D200, 15),
  street("long-ave", "LONG AVENUE", D1500, 16),
  street("far-cl", "FAR CLOSE", origin.lat + 0.02, 19),
  street("nowhere-ln", "NOWHERE LANE", undefined, 21),
];
const addresses = [
  address("1-own-st", "1 OWN STREET", "own-st", origin.lat),
  address("8-long-ave", "8 LONG AVENUE", "long-ave", D300),
  address("99-long-ave", "99 LONG AVENUE", "long-ave", D1500),
];
const byDistrict: Record<number, PrivateTransaction[]> = {
  15: [
    sale("landed-own-st", LATEST, 1),
    sale("landed-near-rd", LATEST, 2),
    sale("landed-near-rd", LATEST - 23, 3),
    sale("landed-near-rd", LATEST - 24, 4),
    sale("landed-near-rd", LATEST, 5, { propertyType: "Strata Terrace" }),
    sale("some-condo", LATEST, 6, { propertyType: "Condominium" }),
  ],
  16: [
    sale("landed-long-ave", LATEST, 7, { address: "8 LONG AVENUE", district: 16 }),
    sale("landed-long-ave", LATEST, 8, { address: "99 LONG AVENUE", district: 16 }),
    sale("landed-long-ave", LATEST - 1, 9, { district: 16 }),
  ],
  19: [sale("landed-far-cl", LATEST, 10, { district: 19 })],
};

function run(limit?: number) {
  const read: number[] = [];
  const result = selectNearbyLandedSales({
    origin,
    excludeStreetSlug: "own-st",
    streets,
    addresses,
    districtTransactions: (d) => {
      read.push(d);
      return byDistrict[d] ?? [];
    },
    projectDistrict: (slug) => (slug === "landed-long-ave" ? 16 : null),
    latestMonth: LATEST,
    limit,
  });
  return { result, read };
}

describe("selectNearbyLandedSales", () => {
  it("keeps landed-house sales on other streets within 500 m in the last 24 months, latest then nearest first", () => {
    const { result } = run();
    expect(result.sales.map((s) => s.tx.price)).toEqual([2, 7, 3]);
    expect(result.total).toBe(3);
    expect(result.fromMonth).toBe(LATEST - 23);
    expect(result.toMonth).toBe(LATEST);
    const [near, long] = result.sales;
    expect(near).toMatchObject({ street: { slug: "near-rd", street: "NEAR ROAD" }, addressSlug: null });
    expect(near.distanceM).toBeGreaterThan(180);
    expect(near.distanceM).toBeLessThan(220);
    // a geocoded house is placed by its own point, even when its street's point is far away
    expect(long).toMatchObject({ street: { slug: "long-ave" }, addressSlug: "8-long-ave" });
    expect(long.distanceM).toBeGreaterThan(280);
    expect(long.distanceM).toBeLessThan(320);
  });

  it("only reads the districts of streets that can be in range", () => {
    expect(run().read).toEqual([15, 16]);
  });

  it("caps the list but reports the total", () => {
    const { result } = run(2);
    expect(result.sales.map((s) => s.tx.price)).toEqual([2, 7]);
    expect(result.total).toBe(3);
  });

  it("returns nothing when no other street is in range", () => {
    const result = selectNearbyLandedSales({
      origin: { lat: 1.45, lng: 103.7 },
      excludeStreetSlug: "own-st",
      streets,
      addresses,
      districtTransactions: (d) => byDistrict[d] ?? [],
      projectDistrict: () => null,
      latestMonth: LATEST,
    });
    expect(result).toMatchObject({ sales: [], total: 0 });
  });
});

describe("nearbyLandedSales on the fixture snapshot", () => {
  it("finds no other landed street within 500 m of the fixture addresses (the two fixture streets are kilometres apart)", () => {
    const a = getLandedAddress("15-sample-ln")!;
    const result = nearbyLandedSales(a, { lat: a.lat!, lng: a.lng! }, LATEST);
    expect(result.total).toBe(0);
    expect(result.sales).toEqual([]);
  });
});
