import { describe, expect, it } from "vitest";
import { executeTool, isToolName, toolDefinitions, TOOL_NAMES } from "./tools";
import { HdbSaleSchema, PrivateSaleSchema } from "@/lib/api/schemas";
import { buyerStampDuty } from "@/lib/calc/stamp-duty";
import { monthlyPayment } from "@/lib/calc/mortgage";

const ctx = { maxSales: 20, now: new Date("2026-10-10T00:00:00Z") };

async function run(name: string, input: unknown, c = ctx) {
  const out = await executeTool(name, input, c);
  return { ...out, data: JSON.parse(out.content) as Record<string, unknown> };
}

describe("tool definitions", () => {
  it("defines every tool with an object JSON schema and a description", () => {
    const defs = toolDefinitions();
    expect(defs.map((d) => d.name).sort()).toEqual([...TOOL_NAMES].sort());
    for (const d of defs) {
      expect(d.description && d.description.length > 20).toBe(true);
      expect(d.input_schema.type).toBe("object");
      expect(d.input_schema).not.toHaveProperty("$schema");
      expect(d.name).toMatch(/^[a-z_]{1,64}$/);
    }
    const sales = defs.find((d) => d.name === "get_recent_sales")!;
    expect(sales.input_schema.required).toEqual(["ref"]);
    expect(sales.input_schema.additionalProperties).toBe(false);
  });

  it("includes the tools named in the brief", () => {
    for (const n of ["get_property_summary", "get_recent_sales", "search_properties", "get_town_stats", "calc_stamp_duty", "calc_mortgage", "calc_affordability"]) {
      expect(isToolName(n)).toBe(true);
    }
    expect(isToolName("delete_everything")).toBe(false);
  });
});

describe("tool dispatch", () => {
  it("rejects unknown tools and invalid input without throwing", async () => {
    const unknown = await run("drop_tables", {});
    expect(unknown.isError).toBe(true);
    const bad = await run("calc_mortgage", { principal: -5, ratePct: 2, years: 25 });
    expect(bad.isError).toBe(true);
    expect(String(bad.data.error)).toContain("principal");
    const extra = await run("get_rates", { sneaky: true });
    expect(extra.isError).toBe(true);
  });

  it("searches properties and returns refs", async () => {
    const r = await run("search_properties", { query: "872a tampines" });
    expect(r.isError).toBe(false);
    const results = r.data.results as { ref: string | null; path: string }[];
    expect(results[0]).toMatchObject({ ref: "hdb:blk-872a-tampines-st-86", path: "/hdb/blk-872a-tampines-st-86/" });
    const none = await run("search_properties", { query: "zzzz qqqq" });
    expect(none.data.results).toEqual([]);
    expect(none.data.note).toBeTruthy();
  });

  it("summarises an HDB block with derived lease and MOP fields", async () => {
    const r = await run("get_property_summary", { ref: "hdb:blk-872a-tampines-st-86" });
    expect(r.isError).toBe(false);
    expect(r.data).toMatchObject({ found: true, ref: "hdb:blk-872a-tampines-st-86", town: "TAMPINES", path: "/hdb/blk-872a-tampines-st-86/" });
    expect(r.data.mopYear).toBe(2015 + 5);
    const lease = r.data.remainingLeaseEstimate as { years: number };
    expect(lease.years).toBeGreaterThan(80);
    expect((r.data.meta as { sampleData: boolean }).sampleData).toBe(true);
    expect(r.data).not.toHaveProperty("lat");
  });

  it("reports missing data honestly", async () => {
    const block = await run("get_property_summary", { ref: "hdb:blk-999-tampines-st-99" });
    expect((block.data.sales as { count: number }).count).toBe(0);
    const sales = await run("get_recent_sales", { ref: "hdb:blk-999-tampines-st-99" });
    expect(sales.data.totalRecorded).toBe(0);
    expect(sales.data.note).toMatch(/No sales/);
    const missing = await run("get_property_summary", { ref: "condo:does-not-exist" });
    expect(missing.data.found).toBe(false);
    const invalid = await run("get_property_summary", { ref: "not a ref" });
    expect(invalid.data.found).toBe(false);
  });

  it("returns recent sales capped by the viewer's allowance", async () => {
    const r = await run("get_recent_sales", { ref: "hdb:blk-872a-tampines-st-86", limit: 20 }, { ...ctx, maxSales: 10 });
    expect(r.data.returned).toBe(10);
    expect(r.data.capNote).toBeTruthy();
    for (const s of r.data.sales as unknown[]) HdbSaleSchema.parse(s);
    const months = (r.data.sales as { month: string }[]).map((s) => s.month);
    expect([...months].sort().reverse()).toEqual(months);

    const condo = await run("get_recent_sales", { ref: "condo:sample-park-condo", limit: 3 });
    expect(condo.data.returned).toBe(3);
    for (const s of condo.data.sales as unknown[]) PrivateSaleSchema.parse(s);
    expect(JSON.stringify(condo.data)).not.toContain('"unit"');

    const street = await run("get_recent_sales", { ref: "landed-street:sample-ln" });
    expect(street.data.found).toBe(true);
    expect(street.data.totalRecorded).toBeGreaterThan(0);

    const launch = await run("get_recent_sales", { ref: "launch:condo/upcoming-fixture-towers" });
    expect(launch.data.totalRecorded).toBe(0);
  });

  it("summarises condos, landed addresses, streets and launches", async () => {
    const condo = await run("get_property_summary", { ref: "condo:aurora-fixture-residences" });
    expect(condo.data).toMatchObject({ found: true, district: 18, segment: "OCR" });
    expect((condo.data.launch as { status: string }).status).toBe("launched");
    const landed = await run("get_property_summary", { ref: "landed:15-sample-ln" });
    expect(landed.data).toMatchObject({ found: true, path: "/landed/15-sample-ln/", streetPath: "/landed-street/sample-ln/" });
    const street = await run("get_property_summary", { ref: "landed-street:fixture-cres" });
    expect(street.data.found).toBe(true);
    const launch = await run("get_property_summary", { ref: "launch:condo/upcoming-fixture-towers" });
    expect(launch.data).toMatchObject({ found: true, status: "upcoming" });
  });

  it("returns town statistics by name or slug and lists towns when unknown", async () => {
    const byName = await run("get_town_stats", { town: "Tampines" });
    expect(byName.data).toMatchObject({ found: true, town: "TAMPINES", path: "/insights/town/tampines/" });
    expect((byName.data.medianPrice12m as Record<string, number>)["4 ROOM"]).toBe(602500);
    expect((byName.data.recentMonths as unknown[]).length).toBeGreaterThan(0);
    const unknown = await run("get_town_stats", { town: "Atlantis" });
    expect(unknown.data.found).toBe(false);
    expect(unknown.data.availableTowns).toContain("Bishan");
  });

  it("runs the calculators with the shared rules", async () => {
    const sd = await run("calc_stamp_duty", { price: 1_500_000, profile: "SC", propertyCount: 2 });
    expect(sd.data.total).toBe(buyerStampDuty(1_500_000).total + 300_000);
    const defaults = await run("calc_stamp_duty", { price: 600_000 });
    expect((defaults.data.absd as { total: number }).total).toBe(0);
    const mort = await run("calc_mortgage", { principal: 500_000, ratePct: 2.6, years: 25 });
    expect(mort.data.monthlyPayment).toBeCloseTo(monthlyPayment(500_000, 2.6, 25), 1);
    expect(mort.data).not.toHaveProperty("schedule");
    const aff = await run("calc_affordability", { monthlyIncome: 10_000, cash: 100_000, cpfOa: 150_000, age: 32, propertyClass: "hdb", lender: "hdb" });
    expect(aff.isError).toBe(false);
    expect(aff.data.maxPrice).toBeGreaterThan(0);
    expect(aff.data.repaymentRatePct).toBe(2.6);
    const bank = await run("calc_affordability", { monthlyIncome: 10_000, cash: 100_000, cpfOa: 150_000, age: 32, propertyClass: "private", lender: "hdb" });
    expect((bank.data.assumptions as string[]).join(" ")).toMatch(/bank loan was assumed/);
    expect(bank.data.repaymentRatePct).toBe(4);
  });

  it("returns rates", async () => {
    const r = await run("get_rates", {});
    expect(r.data).toMatchObject({ found: true, asOf: "2026-09-30" });
  });
});
