import { it } from "vitest";
import { availableInsights, getInsight, ALL_INSIGHT_IDS } from "./modules";
import { LIST_IDS, getListRows } from "@/lib/rankings";
it("explore", () => {
  for (const id of ALL_INSIGHT_IDS) {
    const r = getInsight(id);
    console.log(id, r ? r.caption : "HIDDEN", r?.chart.kind === "bar" ? JSON.stringify(r.chart.data) : r ? r.chart.series.map(s=>`${s.name}:${s.points.length}`).join(",") : "");
  }
  console.log(availableInsights().map(m=>`${m.id}${m.free?"*":""}`).join(" "));
  for (const id of LIST_IDS) {
    const rows = getListRows(id);
    console.log("LIST", id, rows.length);
    for (const r of rows.slice(0, 6)) console.log("   ", r.group, r.label, r.sub, r.metric, r.cells.join(" | "));
  }
});
