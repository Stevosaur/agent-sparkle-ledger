import { describe, expect, it } from "vitest";
import type { MrtStation, NewLaunch, School } from "@/lib/data/types";
import { getLaunches, getMrtStations, getSchools } from "@/lib/data";
import { buildMapLayers, decodeLaunch, decodeSchool, decodeStation, focusHref, parseFocus } from "./layers";
import { shouldFallbackToOsm } from "./styles";

const launch = (p: Partial<NewLaunch>): NewLaunch => ({
  slug: "x",
  name: "X",
  type: "condo",
  status: "launched",
  street: null,
  district: 18,
  segment: "OCR",
  developer: null,
  totalUnits: 100,
  expectedCompletionYear: 2028,
  tenure: null,
  sales: [],
  unitsSold: null,
  unitsLaunched: null,
  projectSlug: null,
  nearestMrt: null,
  lat: 1.354,
  lng: 103.944,
  ...p,
});

const station = (p: Partial<MrtStation>): MrtStation => ({
  name: "S",
  codes: ["EW2", "DT32"],
  lines: ["EWL", "DTL"],
  status: "operational",
  expectedYear: null,
  approximate: false,
  lat: 1.3546,
  lng: 103.9453,
  ...p,
});

const school = (p: Partial<School>): School => ({
  name: "A PRIMARY SCHOOL",
  level: "PRIMARY",
  address: "1 ROAD",
  postal: "123456",
  zone: null,
  type: null,
  lat: 1.35,
  lng: 103.9,
  ...p,
});

describe("buildMapLayers", () => {
  it("encodes launches, splits operational and future stations, keeps primary schools only", () => {
    const payload = buildMapLayers({
      launches: [launch({ slug: "b", name: "B", lat: 1.3540012345 }), launch({ slug: "a", status: "upcoming", lat: undefined }), launch({ slug: "c", lat: 40, lng: -70 })],
      stations: [station({ name: "TAMPINES" }), station({ name: "FUTURE", status: "future", expectedYear: 2030, approximate: true, codes: ["CR9"] })],
      schools: [school({}), school({ name: "SEC", level: "SECONDARY" }), school({ name: "NO COORDS", lat: Number.NaN })],
    });
    expect(payload.launches).toEqual([[1.354, 103.944, "b", "B", "condo", 1, 18, "OCR", 100, 2028]]);
    expect(payload.missingCoords).toEqual({ launches: 2, mrt: 0, schools: 1 });
    expect(payload.mrt.map((m) => m[2])).toEqual(["TAMPINES"]);
    expect(payload.futureMrt).toEqual([[1.3546, 103.9453, "FUTURE", "CR9", 1, 2030]]);
    expect(payload.schools).toEqual([[1.35, 103.9, "A PRIMARY SCHOOL", "1 ROAD", "123456"]]);
  });

  it("round-trips through the decoders", () => {
    const payload = buildMapLayers({ launches: [launch({ status: "upcoming" })], stations: [station({ name: "T" })], schools: [school({})] });
    expect(decodeLaunch(payload.launches[0])).toEqual({
      lat: 1.354,
      lng: 103.944,
      slug: "x",
      name: "X",
      type: "condo",
      status: "upcoming",
      district: 18,
      segment: "OCR",
      totalUnits: 100,
      expectedCompletionYear: 2028,
    });
    expect(decodeStation(payload.mrt[0])).toEqual({ lat: 1.3546, lng: 103.9453, name: "T", codes: ["EW2", "DT32"], approximate: false, expectedYear: null });
    expect(decodeSchool(payload.schools[0])).toMatchObject({ name: "A PRIMARY SCHOOL", postal: "123456" });
  });

  it("builds the fixture payload", () => {
    const payload = buildMapLayers({ launches: getLaunches(), stations: getMrtStations(), schools: getSchools() });
    expect(payload.launches.map((l) => [l[2], l[5]])).toEqual([
      ["aurora-fixture-residences", 1],
      ["upcoming-fixture-towers", 0],
    ]);
    expect(payload.futureMrt.map((s) => [s[2], s[5]])).toEqual([["FIXTURE FUTURE", 2030]]);
    expect(payload.mrt).toHaveLength(6);
    expect(payload.schools.map((s) => s[2])).toEqual(["FIXTURE PRIMARY SCHOOL", "SAMPLE PRIMARY SCHOOL"]);
    expect(JSON.stringify(payload).length).toBeLessThan(2000);
  });
});

describe("parseFocus", () => {
  it("parses lat,lng,zoom and clamps zoom", () => {
    expect(parseFocus("1.354,103.944,17")).toEqual({ lat: 1.354, lng: 103.944, zoom: 17 });
    expect(parseFocus("1.354, 103.944")).toEqual({ lat: 1.354, lng: 103.944, zoom: 16 });
    expect(parseFocus("1.354,103.944,3")?.zoom).toBe(11);
    expect(parseFocus("1.354,103.944,25")?.zoom).toBe(19);
  });

  it("rejects malformed or out-of-Singapore input", () => {
    expect(parseFocus(null)).toBeNull();
    expect(parseFocus("")).toBeNull();
    expect(parseFocus("abc,def")).toBeNull();
    expect(parseFocus("51.5,-0.12,10")).toBeNull();
    expect(parseFocus("1.35")).toBeNull();
    expect(parseFocus("1.35,103.9,12,4")).toBeNull();
    expect(parseFocus("1e1,103.9")).toBeNull();
  });

  it("builds focus links with a trailing slash", () => {
    expect(focusHref(1.354, 103.944)).toBe("/map/?focus=1.35400,103.94400,16");
  });
});

describe("shouldFallbackToOsm", () => {
  it("falls back only when OneMap is clearly failing", () => {
    expect(shouldFallbackToOsm({ loads: 0, errors: 2 })).toBe(false);
    expect(shouldFallbackToOsm({ loads: 0, errors: 3 })).toBe(true);
    expect(shouldFallbackToOsm({ loads: 20, errors: 4 })).toBe(false);
    expect(shouldFallbackToOsm({ loads: 5, errors: 12 })).toBe(true);
    expect(shouldFallbackToOsm({ loads: 10, errors: 12 })).toBe(false);
  });
});
