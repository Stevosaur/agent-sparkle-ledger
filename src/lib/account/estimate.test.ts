import { describe, expect, it } from "vitest";
import { getBlockTransactions } from "@/lib/data/hdb";
import { getProjectTransactions } from "@/lib/data/private";
import { median } from "@/lib/stats-math";
import { SQFT_PER_SQM } from "@/lib/format";
import { estimateHome } from "./estimate";
import { gainVsPurchase, quarterlyMedians, quarterLabel, quarterOf, roundToThousand } from "./estimate-math";

describe("quarterly medians", () => {
  it("groups by calendar quarter and takes the median", () => {
    // month index 0 = 1990-01; 432 = 2026-01, 434 = 2026-03, 435 = 2026-04
    const q = quarterlyMedians([
      { monthIndex: 432, value: 100 },
      { monthIndex: 434, value: 300 },
      { monthIndex: 433, value: 200 },
      { monthIndex: 435, value: 500 },
    ]);
    expect(q).toEqual([
      { q: 144, x: 433, median: 200, n: 3 },
      { q: 145, x: 436, median: 500, n: 1 },
    ]);
    expect(quarterLabel(144)).toBe("2026 Q1");
    expect(quarterLabel(147)).toBe("2026 Q4");
    expect(quarterOf(435)).toBe(145);
  });

  it("skips invalid values and keeps only the latest quarters", () => {
    const sales = Array.from({ length: 10 }, (_, i) => ({ monthIndex: i * 3, value: 1000 + i }));
    const q = quarterlyMedians([...sales, { monthIndex: 3, value: 0 }, { monthIndex: Number.NaN, value: 5 }], 4);
    expect(q.map((p) => p.q)).toEqual([6, 7, 8, 9]);
    expect(q[0].n).toBe(1);
  });
});

describe("gain vs purchase", () => {
  it("computes the gain, percent and annualised rate", () => {
    // bought 2016-01 (index 312) for 400k; estimate 500k at 2026-01 (index 432): 10 years
    const g = gainVsPurchase(500_000, 432, 400_000, "2016-01");
    expect(g?.amount).toBe(100_000);
    expect(g?.pct).toBeCloseTo(0.25);
    expect(g?.annualised).toBeCloseTo(Math.pow(1.25, 1 / 10) - 1, 6);
  });

  it("omits the annualised rate under a year or without a month", () => {
    expect(gainVsPurchase(500_000, 432, 450_000, "2025-06")?.annualised).toBeNull();
    expect(gainVsPurchase(500_000, 432, 450_000, null)?.annualised).toBeNull();
    expect(gainVsPurchase(500_000, 432, 450_000, "bad")?.annualised).toBeNull();
  });

  it("returns null without a purchase price", () => {
    expect(gainVsPurchase(500_000, 432, null, "2016-01")).toBeNull();
    expect(gainVsPurchase(500_000, 432, 0, "2016-01")).toBeNull();
  });

  it("rounds psf products to S$1,000", () => {
    expect(roundToThousand(1_234_499)).toBe(1_234_000);
    expect(roundToThousand(1_234_500)).toBe(1_235_000);
  });
});

describe("estimateHome on the fixture dataset", () => {
  it("HDB: block median for the flat type by quarter", () => {
    const est = estimateHome({ ref: { kind: "hdb", slug: "blk-872a-tampines-st-86" }, flatType: "4 ROOM", areaSqm: null, purchasePrice: 400_000, purchaseMonth: "2020-06" });
    expect(est.status).toBe("ok");
    if (est.status !== "ok") return;
    expect(est.method).toBe("block-flat-type-median");
    expect(est.flatType).toBe("4 ROOM");
    const tx = getBlockTransactions("blk-872a-tampines-st-86").filter((t) => t.flatType === "4 ROOM");
    // the series covers exactly the sales of that flat type
    expect(est.series.reduce((s, p) => s + p.n, 0)).toBe(tx.length);
    const latestQuarter = Math.max(...tx.map((t) => Math.floor(t.monthIndex / 3)));
    const inLatest = tx.filter((t) => Math.floor(t.monthIndex / 3) === latestQuarter).map((t) => t.price);
    expect(est.latest.value).toBe(Math.round(median(inLatest)));
    expect(est.latest.sales).toBe(inLatest.length);
    expect(est.gain?.amount).toBe(est.latest.value - 400_000);
    // oldest first
    for (let i = 1; i < est.series.length; i++) expect(est.series[i].x).toBeGreaterThan(est.series[i - 1].x);
  });

  it("HDB: falls back to the town median when the block has no sales of that type", () => {
    const est = estimateHome({ ref: { kind: "hdb", slug: "blk-999-tampines-st-99" }, flatType: "4 ROOM", areaSqm: null, purchasePrice: null, purchaseMonth: null });
    expect(est).toMatchObject({ status: "ok", method: "town-flat-type-median", gain: null });
  });

  it("HDB: explains what is missing", () => {
    expect(estimateHome({ ref: { kind: "hdb", slug: "blk-872a-tampines-st-86" }, flatType: null, areaSqm: null, purchasePrice: null, purchaseMonth: null })).toEqual({ status: "unavailable", reason: "needs-flat-type" });
    expect(estimateHome({ ref: { kind: "hdb", slug: "blk-872a-tampines-st-86" }, flatType: "EXECUTIVE", areaSqm: null, purchasePrice: null, purchaseMonth: null })).toEqual({ status: "unavailable", reason: "no-sales" });
    expect(estimateHome({ ref: { kind: "hdb", slug: "blk-0-nowhere" }, flatType: "4 ROOM", areaSqm: null, purchasePrice: null, purchaseMonth: null })).toEqual({ status: "unavailable", reason: "not-found" });
  });

  it("condo: project median psf x area", () => {
    const area = 100;
    const est = estimateHome({ ref: { kind: "condo", slug: "sample-park-condo" }, flatType: null, areaSqm: area, purchasePrice: null, purchaseMonth: null });
    expect(est.status).toBe("ok");
    if (est.status !== "ok") return;
    expect(est.method).toBe("project-median-psf");
    expect(est.areaSqm).toBe(area);
    const tx = getProjectTransactions("sample-park-condo").filter((t) => t.psf > 0 && t.typeOfArea !== "Land");
    const latestQuarter = Math.max(...tx.map((t) => Math.floor(t.monthIndex / 3)));
    const psf = median(tx.filter((t) => Math.floor(t.monthIndex / 3) === latestQuarter).map((t) => t.psf));
    expect(est.latest.value).toBe(roundToThousand(psf * area * SQFT_PER_SQM));
  });

  it("condo: needs an area", () => {
    expect(estimateHome({ ref: { kind: "condo", slug: "sample-park-condo" }, flatType: null, areaSqm: null, purchasePrice: null, purchaseMonth: null })).toEqual({ status: "unavailable", reason: "needs-area" });
  });

  it("landed: street median psf x the address's land area by default", () => {
    const est = estimateHome({ ref: { kind: "landed", slug: "15-sample-ln" }, flatType: null, areaSqm: null, purchasePrice: null, purchaseMonth: null });
    expect(est).toMatchObject({ status: "ok", method: "street-median-psf", areaSqm: 160 });
  });

  it("does not estimate streets or launches", () => {
    expect(estimateHome({ ref: { kind: "landed-street", slug: "sample-ln" }, flatType: null, areaSqm: null, purchasePrice: null, purchaseMonth: null })).toEqual({ status: "unavailable", reason: "unsupported" });
  });
});
