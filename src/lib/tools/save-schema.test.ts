import { describe, expect, it } from "vitest";
import { affordability, type AffordabilityInput } from "@/lib/calc/affordability";
import { saveCalculationSchema } from "./save-schema";

const input: AffordabilityInput = {
  cash: 100_000,
  cpfOa: 100_000,
  monthlyIncome: 10_000,
  monthlyDebts: 0,
  age: 35,
  propertyClass: "private",
  lender: "bank",
  buyerProfile: "SC",
  propertyCount: 1,
  outstandingLoans: 0,
  tenureYears: 30,
  interestRatePct: 2.5,
};

describe("saveCalculationSchema", () => {
  it("accepts what the affordability tool sends", () => {
    const body = JSON.parse(JSON.stringify({ label: "Budget up to S$1.2M", input, result: affordability(input) }));
    const parsed = saveCalculationSchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  it("rejects nested objects, oversized labels and non-finite numbers", () => {
    expect(saveCalculationSchema.safeParse({ label: "x", input: { a: { b: 1 } }, result: {} }).success).toBe(false);
    expect(saveCalculationSchema.safeParse({ label: "x".repeat(101), input: {}, result: {} }).success).toBe(false);
    expect(saveCalculationSchema.safeParse({ label: " ", input: {}, result: {} }).success).toBe(false);
    expect(saveCalculationSchema.safeParse({ label: "x", input: { a: Infinity }, result: {} }).success).toBe(false);
    const many = Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`k${i}`, i]));
    expect(saveCalculationSchema.safeParse({ label: "x", input: many, result: {} }).success).toBe(false);
  });
});
