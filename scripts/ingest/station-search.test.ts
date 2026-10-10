import { describe, expect, it } from "vitest";
import { stationSearchEntries } from "./build";
import type { MrtStation } from "../../src/lib/data/types";
import { getSearchIndex, search } from "@/lib/data/search";
import { getMrtStations } from "@/lib/data/geo";
import { parseFitParams, placeRefFromSearch } from "@/lib/homes/fit";
import { resolvePlace } from "@/lib/homes/fit-data";

function station(name: string, codes: string[], status: MrtStation["status"] = "operational"): MrtStation {
  return { name, codes, lines: [], status, expectedYear: status === "future" ? 2030 : null, approximate: false, lat: 1.35, lng: 103.85 };
}

describe("stationSearchEntries", () => {
  it("builds one entry per operational station with an MRT or LRT label", () => {
    const entries = stationSearchEntries([
      station("TAMPINES", ["EW2", "DT32"]),
      station("BANGKIT", ["BP9"]),
      station("COMPASSVALE", ["SE1"]),
      station("SENGKANG", ["NE16", "STC"]),
      station("CHOA CHU KANG", ["NS4", "BP1"]),
      station("ONE-NORTH", ["CC23"]),
      station("NO CODE", []),
      station("FUTURE ONLY", ["CR9"], "future"),
      station("TAMPINES", ["TE99"], "future"),
    ]);
    expect(entries.map((e) => e.label)).toEqual([
      "Tampines MRT",
      "Bangkit LRT",
      "Compassvale LRT",
      "Sengkang MRT",
      "Choa Chu Kang MRT",
      "One-North MRT",
      "No Code MRT",
    ]);
    expect(entries[0]).toEqual({
      kind: "mrt",
      href: "/homes/fit/?p=mrt:tampines",
      label: "Tampines MRT",
      sub: "EW2 / DT32",
      postal: null,
      terms: "ew2 dt32 tampines station",
      weight: 50,
    });
    expect(entries.find((e) => e.label === "No Code MRT")?.sub).toBe("MRT station");
    // an MRT interchange with an LRT line keeps its MRT label but also matches "lrt"
    expect(entries.find((e) => e.label === "Sengkang MRT")?.terms).toBe("ne16 stc sengkang station lrt");
    expect(entries.find((e) => e.label === "Bangkit LRT")?.terms).toBe("bp9 bangkit station");
    expect(entries.find((e) => e.label === "One-North MRT")?.href).toBe("/homes/fit/?p=mrt:one-north");
    // every href is unique (search result lists key on it)
    expect(new Set(entries.map((e) => e.href)).size).toBe(entries.length);
  });

  it("maps every entry to the place ref its href opens", () => {
    for (const e of stationSearchEntries([station("TAMPINES WEST", ["DT31"]), station("BANGKIT", ["BP9"]), station("ONE-NORTH", ["CC23"])])) {
      const ref = placeRefFromSearch(e);
      const query = new URLSearchParams(e.href.split("?")[1]);
      expect(parseFitParams(query.get("p"), query.get("w"))).toEqual([{ ref, weight: 1 }]);
    }
  });
});

describe("stations in the fixture search index", () => {
  it("finds operational stations by name and code, never future ones", () => {
    expect(search("tampines west")[0]).toMatchObject({ kind: "mrt", label: "Tampines West MRT", sub: "DT31" });
    expect(search("ew2").map((e) => e.label)).toContain("Tampines MRT");
    expect(search("raffles place station", { kinds: ["mrt"] }).map((e) => e.label)).toEqual(["Raffles Place MRT"]);
    expect(search("fixture future", { kinds: ["mrt"] })).toEqual([]);
    expect(search("punggol lrt", { kinds: ["mrt"] }).map((e) => e.label)).toEqual(["Punggol MRT"]);
    // property searches still rank the property first
    expect(search("872a tampines")[0]?.href).toBe("/hdb/blk-872a-tampines-st-86/");
  });

  it("resolves every station entry to the station's coordinates in /homes/fit/", () => {
    const entries = getSearchIndex().filter((e) => e.kind === "mrt");
    const operational = getMrtStations().filter((s) => s.status === "operational");
    expect(entries.length).toBe(operational.length);
    for (const e of entries) {
      const ref = placeRefFromSearch(e);
      expect(ref, e.label).not.toBeNull();
      const place = resolvePlace(ref!);
      expect(place, e.label).not.toBeNull();
      expect(operational.some((s) => s.lat === place!.lat && s.lng === place!.lng)).toBe(true);
    }
  });
});
