import { describe, expect, it } from "vitest";
import { groupSeriesKeys, isPublicSeriesKey, isRentSeries, isValidSeriesKey, MAX_TREND_SERIES, parseTrendParams, seriesKind, trendQueryString } from "./series-keys";

describe("series keys", () => {
  it("validates key shapes used by the snapshot builder", () => {
    for (const k of ["hdb:ALL:ALL", "hdb:TAMPINES:4 ROOM", "hdb:KALLANG/WHAMPOA:MULTI-GENERATION", "rent-hdb:ALL:3 ROOM", "private:OCR:Condo", "private-d:15:ALL", "rent-private-d:9:ALL"]) {
      expect(isValidSeriesKey(k), k).toBe(true);
    }
    for (const k of ["", "hdb", "hdb:ALL", "<script>:a:b", "hdb:ALL:ALL:extra", "x".repeat(120)]) {
      expect(isValidSeriesKey(k), k).toBe(false);
    }
  });
  it("only national HDB resale series are public", () => {
    expect(isPublicSeriesKey("hdb:ALL:ALL")).toBe(true);
    expect(isPublicSeriesKey("hdb:ALL:4 ROOM")).toBe(true);
    expect(isPublicSeriesKey("hdb:TAMPINES:ALL")).toBe(false);
    expect(isPublicSeriesKey("rent-hdb:ALL:ALL")).toBe(false);
    expect(isPublicSeriesKey("private:ALL:ALL")).toBe(false);
  });
  it("classifies kinds and rent series", () => {
    expect(seriesKind("private-d:15:ALL")).toBe("private-d");
    expect(isRentSeries("rent-hdb:ALL:ALL")).toBe(true);
    expect(isRentSeries("rent-private:ALL:ALL")).toBe(true);
    expect(isRentSeries("hdb:ALL:ALL")).toBe(false);
  });
  it("groups keys for the picker, national HDB first, districts numerically", () => {
    const groups = groupSeriesKeys([
      { key: "private-d:15:ALL", label: "D15" },
      { key: "private-d:9:ALL", label: "D9" },
      { key: "hdb:TAMPINES:ALL", label: "Tampines" },
      { key: "hdb:ALL:ALL", label: "All" },
      { key: "weird:x:y", label: "ignored" },
    ]);
    expect(groups.map((g) => g.id)).toEqual(["hdb-national", "hdb-town", "private-district"]);
    expect(groups[0].options[0]).toEqual({ key: "hdb:ALL:ALL", label: "All", public: true });
    expect(groups[2].options.map((o) => o.key)).toEqual(["private-d:9:ALL", "private-d:15:ALL"]);
  });
});

describe("trend URL state", () => {
  const params = (qs: string) => new URLSearchParams(qs);
  it("parses keys, metric and years, dropping invalid parts", () => {
    const s = parseTrendParams(params("s=hdb:ALL:ALL,hdb:TAMPINES:4%20ROOM,bad,hdb:ALL:ALL&metric=psf&from=2024&to=2015"));
    expect(s.keys).toEqual(["hdb:ALL:ALL", "hdb:TAMPINES:4 ROOM"]);
    expect(s.metric).toBe("psf");
    expect(s.from).toBe(2015);
    expect(s.to).toBe(2024);
    expect(parseTrendParams(params("metric=nope&from=1800")).metric).toBe("price");
    expect(parseTrendParams(params("from=1800")).from).toBeNull();
  });
  it("respects the allowed key set and the series cap", () => {
    const allowed = new Set(["hdb:ALL:ALL"]);
    expect(parseTrendParams(params("s=hdb:ALL:ALL,hdb:TAMPINES:ALL"), allowed).keys).toEqual(["hdb:ALL:ALL"]);
    const many = Array.from({ length: 10 }, (_, i) => `hdb:T${i}:ALL`).join(",");
    expect(parseTrendParams(params(`s=${many}`)).keys).toHaveLength(MAX_TREND_SERIES);
  });
  it("round-trips through the query string", () => {
    const state = { keys: ["hdb:ALL:ALL", "hdb:KALLANG/WHAMPOA:4 ROOM"], metric: "volume" as const, from: 2010, to: 2020 };
    const qs = trendQueryString(state);
    expect(qs).toContain("metric=volume");
    expect(parseTrendParams(params(qs))).toEqual(state);
    expect(trendQueryString({ keys: [], metric: "price", from: null, to: null })).toBe("");
  });
});
