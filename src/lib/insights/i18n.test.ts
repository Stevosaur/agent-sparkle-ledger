import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { insights } from "@/lib/i18n/messages/insights";
import { ALL_INSIGHT_IDS, availableInsights } from "./modules";
import { LIST_DEFS, LIST_IDS } from "@/lib/rankings";
import { groupSeriesKeys } from "./series-keys";

const ROOTS = ["src/app/lists", "src/app/insights", "src/app/trendmaker", "src/app/news", "src/components/insights"];

function files(dir: string): string[] {
  const abs = path.resolve(process.cwd(), dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith(".tsx") ? [path.join(dir, e.name)] : []));
}

describe("insights i18n namespace", () => {
  it("has a zh string for every en key and vice versa", () => {
    expect(Object.keys(insights.zh).sort()).toEqual(Object.keys(insights.en).sort());
    for (const [k, v] of Object.entries(insights.zh)) expect(v.trim().length, k).toBeGreaterThan(0);
  });
  it("keeps interpolation variables identical between languages", () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    for (const k of Object.keys(insights.en)) expect(vars(insights.zh[k]), k).toBe(vars(insights.en[k]));
  });
  it("defines every literal insights.* key used in pages and components, with matching English", () => {
    const used = new Map<string, string | null>();
    for (const f of ROOTS.flatMap(files)) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/k="(insights\.[\w.-]+)"\s+fallback="([^"]*)"/g)) used.set(m[1], m[2]);
      for (const m of src.matchAll(/t\("(insights\.[\w.-]+)",\s*"([^"]*)"/g)) used.set(m[1], m[2]);
      for (const m of src.matchAll(/k="(insights\.[\w.-]+)"/g)) if (!used.has(m[1])) used.set(m[1], null);
    }
    expect(used.size).toBeGreaterThan(50);
    for (const [k, fallback] of used) {
      expect(insights.en[k], k).toBeDefined();
      if (fallback != null) expect(insights.en[k], k).toBe(fallback);
    }
  });
  it("covers ranking definitions, modules and trend groups", () => {
    for (const id of LIST_IDS) {
      const d = LIST_DEFS[id];
      expect(insights.en[d.titleKey]).toBe(d.title);
      expect(insights.en[d.descKey]).toBe(d.description);
      expect(insights.en[d.metricHeaderKey]).toBe(d.metricHeader);
      for (const c of d.columns) expect(insights.en[c.headerKey], c.headerKey).toBe(c.header);
      for (const g of d.groups) expect(insights.en[g.labelKey]).toBe(g.label);
    }
    expect(ALL_INSIGHT_IDS.every((id) => insights.en[`insights.mod.${id}.title`] && insights.en[`insights.mod.${id}.teaser`])).toBe(true);
    for (const m of availableInsights()) {
      expect(insights.en[`insights.mod.${m.id}.title`]).toBe(m.title);
      expect(insights.en[`insights.mod.${m.id}.teaser`]).toBe(m.teaser);
    }
    const groups = groupSeriesKeys(["hdb:ALL:ALL", "hdb:A:ALL", "rent-hdb:ALL:ALL", "private:ALL:ALL", "private-d:1:ALL", "rent-private:ALL:ALL"].map((key) => ({ key, label: key })));
    for (const g of groups) expect(insights.en[g.labelKey]).toBe(g.label);
  });
});
