import { it } from "vitest";
import { executeTool } from "@/lib/ai/tools";
const ctx = { maxSales: 10, now: new Date("2026-10-10T00:00:00Z") };
it("dump", async () => {
  const calls: [string, unknown][] = [
    ["get_property_summary", { ref: "hdb:blk-999-tampines-st-99" }],
    ["get_property_summary", { ref: "hdb:blk-123-bishan-st-12" }],
    ["get_property_summary", { ref: "condo:sample-park-condo" }],
    ["get_property_summary", { ref: "condo:the-fixture-ec" }],
    ["get_property_summary", { ref: "landed:15-sample-ln" }],
    ["get_property_summary", { ref: "landed-street:sample-ln" }],
    ["get_property_summary", { ref: "launch:condo/upcoming-fixture-towers" }],
    ["get_property_summary", { ref: "launch:aurora-fixture-residences" }],
    ["get_recent_sales", { ref: "hdb:blk-999-tampines-st-99", limit: 20 }],
    ["get_recent_sales", { ref: "launch:condo/upcoming-fixture-towers" }],
    ["get_town_stats", { town: "Tampines" }],
    ["get_town_stats", { town: "ang mo kio" }],
    ["calc_affordability", { monthlyIncome: 10000, cash: 100000, cpfOa: 100000, age: 35, propertyClass: "hdb", lender: "hdb" }],
    ["get_rates", {}],
    ["search_properties", { query: "tampines" }],
  ];
  for (const [n, i] of calls) {
    const r = await executeTool(n, i, ctx);
    console.log("=== " + n + " " + JSON.stringify(i) + "\n" + r.content.slice(0, 2500));
  }
});
