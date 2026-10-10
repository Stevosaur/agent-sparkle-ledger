import { describe, expect, it } from "vitest";
import { ALL_INSIGHT_IDS, availableInsights, FREE_INSIGHTS, getInsight, isFreeInsight, isInsightId } from "./modules";
import { getHdbRentScan, getHdbSalesScan } from "./hdb-scan";
import { getPrivateRentScan, getPrivateSalesScan, privateGroupOf, rentPsfFromBand } from "./private-scan";
import { getTowns } from "@/lib/data/hdb";
import { getProjects } from "@/lib/data/private";
import { getSeries } from "@/lib/data/stats";
import { formatSgd } from "@/lib/format";

describe("insight modules on the fixture snapshot", () => {
  it("offers 20+ modules, all available on the fixtures, with the first six free", () => {
    expect(ALL_INSIGHT_IDS.length).toBeGreaterThanOrEqual(20);
    const available = availableInsights();
    expect(available.length).toBeGreaterThanOrEqual(20);
    expect(available.filter((m) => m.free).map((m) => m.id)).toEqual(available.slice(0, FREE_INSIGHTS).map((m) => m.id));
    expect(isFreeInsight(available[0].id)).toBe(true);
    expect(isFreeInsight(available[FREE_INSIGHTS].id)).toBe(false);
    expect(isInsightId("nope")).toBe(false);
    expect(getInsight("nope")).toBeNull();
  });

  it("every module has a non-empty chart, a computed caption and a source", () => {
    for (const m of availableInsights()) {
      const r = getInsight(m.id)!;
      expect(r.caption.length, m.id).toBeGreaterThan(20);
      expect(r.caption, m.id).not.toMatch(/NaN|undefined|null|—/);
      expect(r.source.length).toBeGreaterThan(5);
      expect(r.chart.ariaLabel.length).toBeGreaterThan(5);
      if (r.chart.kind === "line") {
        expect(r.chart.series.length, m.id).toBeGreaterThan(0);
        for (const s of r.chart.series) for (const p of s.points) expect(Number.isFinite(p.y)).toBe(true);
      } else {
        expect(r.chart.data.length, m.id).toBeGreaterThan(0);
        for (const d of r.chart.data) expect(Number.isFinite(d.value)).toBe(true);
      }
    }
  });

  it("price trend caption quotes the scanned 12-month median", () => {
    const r = getInsight("hdb-price-trend")!;
    expect(r.caption).toContain(formatSgd(getHdbSalesScan().national.cur.medianPrice));
    expect(r.chart.kind === "line" && r.chart.series[0].points.length).toBe(getSeries("hdb:ALL:ALL")!.points.length);
  });
});

describe("scans agree with the snapshot builder", () => {
  it("12-month town medians by flat type match towns.json", () => {
    const scan = getHdbSalesScan();
    for (const t of getTowns()) {
      const s = scan.towns.find((x) => x.slug === t.slug)!;
      for (const [ft, price] of Object.entries(t.medianPrice12m)) expect(s.byType[ft]?.cur.medianPrice, `${t.slug} ${ft}`).toBe(price);
      expect(s.cur.count).toBe(t.tx.count12m);
      expect(s.cur.medianPsf).toBe(t.tx.medianPsf12m);
    }
  });
  it("12-month rents by town and flat type match towns.json", () => {
    const rent = getHdbRentScan();
    for (const t of getTowns()) {
      for (const [ft, r] of Object.entries(t.medianRent12m)) expect(rent.byTownType.get(`${t.slug}|${ft}`)?.medianRent, `${t.slug} ${ft}`).toBe(r);
    }
  });
  it("project 12-month counts and psf match projects.json for non-bulk sales", () => {
    const scan = getPrivateSalesScan();
    for (const p of getProjects()) {
      const s = scan.projects.get(p.slug);
      expect(s?.cur.count ?? 0, p.slug).toBe(p.tx.count12m);
      expect(s?.cur.medianPsf ?? null, p.slug).toBe(p.tx.medianPsf12m);
    }
  });
  it("project rents use the 12 months to the latest rental contract", () => {
    const rent = getPrivateRentScan();
    for (const p of getProjects()) {
      if (!p.rentals) continue;
      expect(rent.projects.get(p.slug)?.count ?? 0, p.slug).toBe(p.rentals.count12m);
      expect(rent.projects.get(p.slug)?.medianRent ?? null, p.slug).toBe(p.rentals.medianRent12m);
    }
  });
});

describe("private helpers", () => {
  it("groups property types like the builder", () => {
    expect(privateGroupOf("Executive Condominium")).toBe("EC");
    expect(privateGroupOf("Strata Terrace")).toBe("Landed");
    expect(privateGroupOf("Semi-detached")).toBe("Landed");
    expect(privateGroupOf("Apartment")).toBe("Condo");
  });
  it("computes approximate rent psf from an area band", () => {
    expect(rentPsfFromBand(3000, 70, 80)).toBeCloseTo(3000 / (75 * 10.7639));
    expect(rentPsfFromBand(3000, null, 80)).toBeNull();
    expect(rentPsfFromBand(0, 70, 80)).toBeNull();
  });
});
