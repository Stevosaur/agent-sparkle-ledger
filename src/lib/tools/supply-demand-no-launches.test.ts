import { describe, expect, it, vi } from "vitest";
import { supplyDemand } from "./supply-demand";

// A snapshot without any URA new-launch records (e.g. no URA key configured). vi.mock is hoisted above the imports.
vi.mock("@/lib/data/private", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/private")>()),
  getLaunches: () => [],
}));

describe("supply & demand without launch data", () => {
  it("flags supply as unknown instead of reporting no new supply", () => {
    const r = supplyDemand({ lat: 1.3555, lng: 103.939 }, 3000, new Date("2026-10-10T04:00:00Z"));
    expect(r.launchData).toBe(false);
    expect(r.coverage.launchesTotal).toBe(0);
    // demand is still measured from the HDB data
    expect(r.totals.mopUnits).toBe(150);
  });
});
