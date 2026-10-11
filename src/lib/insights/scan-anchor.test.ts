import { describe, expect, it, vi } from "vitest";
import { monthIndex } from "@/lib/data/months";
import { getHdbSalesScan } from "./hdb-scan";
import { getPrivateSalesScan } from "./private-scan";
import { getMarketReport } from "@/lib/news/report";

// The fixture snapshot runs to Aug 2026. Pretend it was generated mid-August, while August records are still
// arriving: the scans (and everything built on them) must end at July, as the home page's market pulse does.
vi.mock("@/lib/data/meta", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/data/meta")>();
  return {
    ...orig,
    getMeta: () => ({ ...orig.getMeta(), generatedAt: "2026-08-20T02:00:00.000Z" }),
  };
});

describe("scans anchor on the last complete month", () => {
  it("skips the HDB month the snapshot was generated in", () => {
    const scan = getHdbSalesScan();
    expect(scan.latestMonth).toBe(monthIndex("2026-07"));
    expect(scan.windows?.cur.to).toBe(monthIndex("2026-07"));
  });

  it("skips the private month the snapshot was generated in", () => {
    const scan = getPrivateSalesScan();
    expect(scan.latestMonth).toBe(monthIndex("2026-07"));
    expect(scan.windows?.cur.to).toBe(monthIndex("2026-07"));
  });

  it("titles the market report after the last complete month", () => {
    const report = getMarketReport();
    expect(report).not.toBeNull();
    expect(JSON.stringify(report)).toContain("Jul 2026 at a glance");
    expect(JSON.stringify(report)).not.toContain("Aug 2026 at a glance");
  });
});
