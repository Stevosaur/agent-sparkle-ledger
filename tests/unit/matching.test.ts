import { describe, expect, it } from "vitest";
import { threeWayMatch } from "@/lib/domain/matching";

const po = [{ poLineId: "p1", speciesId: "s1", description: "Spanish mackerel", quantityKg: "50", pricePerKg: "8" }];

describe("three-way matching", () => {
  it("flags the spec example: 50 kg billed, 47.6 kg received → S$19.20 potential overbilling", () => {
    const r = threeWayMatch({
      poLines: po,
      receipts: [{ poLineId: "p1", speciesId: "s1", acceptedKg: "47.6" }],
      invoiceLines: [{ invoiceLineId: "i1", poLineId: "p1", speciesId: "s1", description: "Batang", quantityKg: "50", unitPrice: "8", lineTotal: "400.00" }],
      invoiceSubtotal: "400.00",
      invoiceGst: "36.00",
      gstRatePct: "9",
    });
    expect(r.status).toBe("EXCEPTION");
    expect(r.lines[0].qtyVarianceKg).toBe("2.400");
    expect(r.potentialOverbillingExGst).toBe("19.20");
    expect(r.potentialOverbillingIncGst).toBe("20.93");
    expect(r.summary).toContain("2.4 kg quantity discrepancy");
    expect(r.summary).toContain("S$19.20 potential overbilling before tax");
  });

  it("matches exactly when all three agree", () => {
    const r = threeWayMatch({
      poLines: po,
      receipts: [{ poLineId: "p1", speciesId: "s1", acceptedKg: "50" }],
      invoiceLines: [{ invoiceLineId: "i1", poLineId: "p1", speciesId: "s1", description: "Batang", quantityKg: "50", unitPrice: "8", lineTotal: "400.00" }],
      invoiceSubtotal: "400.00",
      invoiceGst: "36.00",
      gstRatePct: "9",
    });
    expect(r.status).toBe("MATCHED");
  });

  it("accepts small differences within tolerance", () => {
    const r = threeWayMatch({
      poLines: po,
      receipts: [{ poLineId: "p1", speciesId: "s1", acceptedKg: "49.8" }],
      invoiceLines: [{ invoiceLineId: "i1", poLineId: "p1", speciesId: "s1", description: "Batang", quantityKg: "50", unitPrice: "8", lineTotal: "400.00" }],
      invoiceSubtotal: "400.00",
      invoiceGst: "36.00",
      gstRatePct: "9",
      tolerance: { qtyPct: 1, pricePct: 0.5, amountAbs: 5 },
    });
    expect(r.status).toBe("MATCH_WITHIN_TOLERANCE");
  });

  it("flags price above PO, unordered items and wrong GST", () => {
    const r = threeWayMatch({
      poLines: po,
      receipts: [{ poLineId: "p1", speciesId: "s1", acceptedKg: "50" }],
      invoiceLines: [
        { invoiceLineId: "i1", poLineId: "p1", speciesId: "s1", description: "Batang", quantityKg: "50", unitPrice: "8.5", lineTotal: "425.00" },
        { invoiceLineId: "i2", poLineId: null, speciesId: "s9", description: "Ice", quantityKg: "1", unitPrice: "10", lineTotal: "10.00" },
      ],
      invoiceSubtotal: "435.00",
      invoiceGst: "30.00",
      gstRatePct: "9",
    });
    expect(r.status).toBe("EXCEPTION");
    expect(r.lines[0].flags.join()).toContain("above PO");
    expect(r.lines[1].flags).toContain("Billed item not on the purchase order");
    expect(r.flags.join()).toContain("GST");
  });
});
