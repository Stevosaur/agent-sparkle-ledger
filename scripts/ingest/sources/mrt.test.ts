import { describe, expect, it } from "vitest";
import { buildStations, stationKey } from "./mrt";

const exit = (name: string, lng: number, lat: number) => ({ geometry: { type: "Point", coordinates: [lng, lat] }, properties: { STATION_NA: name, EXIT_CODE: "Exit A" } });

describe("MRT stations", () => {
  it("normalises names", () => {
    expect(stationKey("ONE-NORTH MRT STATION")).toBe("ONE NORTH");
    expect(stationKey("one-north")).toBe("ONE NORTH");
    expect(stationKey("BUKIT PANJANG LRT STATION")).toBe("BUKIT PANJANG");
  });
  it("merges MRT/LRT duplicates, maps code-only names and drops unlisted stations", () => {
    const { stations, unmatched } = buildStations({
      features: [
        exit("BUKIT PANJANG MRT STATION", 103.7615, 1.3786),
        exit("BUKIT PANJANG LRT STATION", 103.7625, 1.3790),
        exit("CC9", 103.8927, 1.3177),
        exit("MARINA SOUTH MRT STATION", 103.863, 1.2742),
      ],
    });
    const bp = stations.find((s) => s.name === "BUKIT PANJANG" && s.status === "operational");
    expect(bp?.lines).toEqual(expect.arrayContaining(["DTL", "BPLRT"]));
    expect(bp?.lat).toBeCloseTo(1.3788, 4);
    expect(stations.find((s) => s.name === "PAYA LEBAR")?.codes).toEqual(expect.arrayContaining(["EW8", "CC9"]));
    expect(stations.some((s) => s.name === "MARINA SOUTH")).toBe(false);
    expect(unmatched).toContain("MARINA SOUTH");
    expect(stations.filter((s) => s.status === "future").length).toBeGreaterThan(10);
  });
});
