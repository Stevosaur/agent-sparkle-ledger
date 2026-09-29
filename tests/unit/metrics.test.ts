import { describe, expect, it } from "vitest";
import { computeVendorMetrics, metricsBySpecies } from "@/lib/domain/vendor-metrics";
import { assessSurplus } from "@/lib/domain/surplus";
import { balanceStatus, recommendPurchases } from "@/lib/domain/procurement";
import { requiresApproval } from "@/lib/domain/risk";
import { planRoutes } from "@/lib/domain/routing";
import { priceStats } from "@/lib/domain/pricing";
import { atMarketTime, marketDateFor } from "@/lib/domain/time";
import { gst, money } from "@/lib/domain/decimal";

const rec = (o: Partial<Parameters<typeof computeVendorMetrics>[0][number]>) => ({
  speciesId: "s1", expectedAt: "2026-09-29T17:30:00Z", arrivedAt: "2026-09-29T17:40:00Z", declaredKg: 50, orderedKg: 50, receivedKg: 50,
  acceptedKg: 50, rejectedKg: 0, temperatureC: 2, grade: "A", quotedPrice: 9, finalPrice: 8.8, ...o,
});

describe("vendor metrics", () => {
  it("computes each metric independently", () => {
    const m = computeVendorMetrics([
      rec({}),
      rec({ arrivedAt: "2026-09-29T19:00:00Z", receivedKg: 46, acceptedKg: 44, rejectedKg: 2, grade: "B", temperatureC: 6 }),
      rec({ speciesId: "s2", receivedKg: 52, acceptedKg: 52 }),
      rec({ speciesId: "s2" }),
    ], { responseMinutes: [5, 15], docsRequired: 4, docsValid: 3 });
    expect(m.onTimePct).toBe(75);
    expect(m.fillRatePct).toBe(99);
    expect(m.rejectionPct).toBeCloseTo(1, 0);
    expect(m.avgWeightVariancePct).toBe(-1);
    expect(m.tempExceptionRatePct).toBe(25);
    expect(m.gradeAPct).toBe(75);
    expect(m.avgResponseMinutes).toBe(10);
    expect(m.documentCompletenessPct).toBe(75);
  });
  it("separates species performance", () => {
    const by = metricsBySpecies([rec({ receivedKg: 40, acceptedKg: 40 }), rec({ speciesId: "s2" })]);
    expect(by.get("s1")!.fillRatePct).toBe(80);
    expect(by.get("s2")!.fillRatePct).toBe(100);
  });
});

describe("surplus", () => {
  it("never discounts below the approved floor or cost", () => {
    const a = assessSurplus({ speciesId: "s", speciesName: "Batang", unallocatedKg: 27, openDemandKg: 0, minutesToCutoff: 45, freshnessHoursRemaining: 20, costPerKg: 9.5, listPricePerKg: 11, maxDiscountPct: 20, lapsedBuyers: [{ customerId: "c", name: "Tekka Stall", avgKg: 12 }] });
    expect(a.severity).toBe("CRITICAL");
    const d = a.actions.find((x) => x.type === "DISCOUNT");
    expect(d && d.type === "DISCOUNT" && d.toPrice).toBeGreaterThanOrEqual(9.5);
    expect(a.floorPrice).toBe(9.5);
    expect(a.actions.some((x) => x.type === "OFFER_EXISTING_BUYERS")).toBe(true);
  });
});

describe("procurement", () => {
  it("classifies balance with tolerance", () => {
    expect(balanceStatus(85, 57).status).toBe("SHORTAGE");
    expect(balanceStatus(85, 86).status).toBe("BALANCED");
    expect(balanceStatus(50, 90).status).toBe("SURPLUS");
  });
  it("recommends the best-scoring offers and discounts estimated supply", () => {
    const base = { source: "LOT" as const, quality: 0.8, etaSlackMinutes: 120, ageHours: 6, relationshipTier: "STANDARD" as const, isEstimate: false };
    const r = recommendPurchases(45, [
      { ...base, offerId: "A", vendorId: "A", vendorName: "A", availableKg: 40, pricePerKg: 8.7, reliability: 0.95 },
      { ...base, offerId: "B", vendorId: "B", vendorName: "B", availableKg: 30, pricePerKg: 8.4, reliability: 0.97 },
      { ...base, offerId: "C", vendorId: "C", vendorName: "C", availableKg: 35, pricePerKg: 9.0, reliability: 0.8, isEstimate: true },
    ]);
    expect(r.lines[0].vendorId).toBe("B");
    expect(r.totalBuyKg).toBeGreaterThanOrEqual(45);
    expect(r.residualShortfallKg).toBe(0);
  });
});

describe("agent safety policy", () => {
  it("requires approval for commitments, finance and compliance", () => {
    expect(requiresApproval("CREATE_PURCHASE_ORDER").required).toBe(true);
    expect(requiresApproval("APPROVE_INVOICE_EXCEPTION").required).toBe(true);
    expect(requiresApproval("NOTIFY_RECALL_CONTACTS").required).toBe(true);
    expect(requiresApproval("CREATE_DRAFT_LOT").required).toBe(false);
    expect(requiresApproval("TRACE_LOT").required).toBe(false);
  });
  it("only relaxes rules that were explicitly enabled", () => {
    const rules = [{ key: "AUTO_PO_UNDER_LIMIT", enabled: true, params: { maxAmount: 300 } }];
    expect(requiresApproval("CREATE_PURCHASE_ORDER", { rules, amount: 250 }).required).toBe(false);
    expect(requiresApproval("CREATE_PURCHASE_ORDER", { rules, amount: 500 }).required).toBe(true);
    expect(requiresApproval("APPROVE_PAYMENT", { rules }).required).toBe(true);
  });
});

describe("routing, pricing, time, money", () => {
  it("plans capacity-respecting runs", () => {
    const origin = { lat: 1.3036, lng: 103.7194 };
    const stops = [
      { id: "1", label: "Tiong Bahru", lat: 1.2852, lng: 103.8325, loadKg: 300 },
      { id: "2", label: "Chinatown", lat: 1.2822, lng: 103.8431, loadKg: 250 },
      { id: "3", label: "Tekka", lat: 1.3064, lng: 103.8508, loadKg: 400 },
      { id: "4", label: "Clementi", lat: 1.3151, lng: 103.7650, loadKg: 200 },
    ];
    const r = planRoutes({ origin, stops, vehicles: [{ id: "v1", label: "V1", capacityKg: 700 }, { id: "v2", label: "V2", capacityKg: 700 }], departureAt: new Date("2026-09-29T21:30:00Z") });
    expect(r.unassigned).toHaveLength(0);
    for (const run of r.runs) expect(run.loadKg).toBeLessThanOrEqual(run.capacityKg);
    expect(r.runs.flatMap((x) => x.stops)).toHaveLength(4);
  });
  it("computes weighted average prices", () => {
    const s = priceStats([{ at: "2026-09-01", pricePerKg: 8, quantityKg: 10 }, { at: "2026-09-02", pricePerKg: 10, quantityKg: 30 }]);
    expect(s.weightedAvg).toBe(9.5);
  });
  it("maps SGT market night times", () => {
    expect(atMarketTime("2026-09-29", "01:30").toISOString()).toBe("2026-09-29T17:30:00.000Z");
    expect(atMarketTime("2026-09-29", "23:15").toISOString()).toBe("2026-09-29T15:15:00.000Z");
    expect(marketDateFor(new Date("2026-09-29T17:30:00Z"))).toBe("2026-09-29");
    expect(marketDateFor(new Date("2026-09-29T06:00:00Z"))).toBe("2026-09-29");
    expect(marketDateFor(new Date("2026-09-29T02:00:00Z"))).toBe("2026-09-29"); // 10:00 SGT → upcoming night
    expect(marketDateFor(new Date("2026-09-28T21:30:00Z"))).toBe("2026-09-28"); // 05:30 SGT → still last night
  });
  it("rounds GST half-up on decimals", () => {
    expect(gst("400.00", "9").toFixed(2)).toBe("36.00");
    expect(gst("19.20", "9").toFixed(2)).toBe("1.73");
    expect(money("0.105").toFixed(2)).toBe("0.11");
  });
});
