import { monthLabel } from "@/lib/data/months";
import type { ChartSpec } from "@/lib/insights/types";

/** RFC 4180 field quoting. */
export function csvField(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : "") : v;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}

/**
 * Chart data as CSV. Line charts become one row per month ("YYYY-MM") with a column per series
 * (blank where a series has no value); bar charts become label,value rows.
 */
export function chartToCsv(chart: ChartSpec, valueHeader = "value"): string {
  if (chart.kind === "bar") return toCsv([["label", valueHeader], ...chart.data.map((d) => [d.label, d.value])]);
  const xs = new Set<number>();
  const maps = chart.series.map((s) => {
    const m = new Map<number, number>();
    for (const p of s.points) {
      m.set(p.x, p.y);
      xs.add(p.x);
    }
    return m;
  });
  const sorted = [...xs].sort((a, b) => a - b);
  return toCsv([["month", ...chart.series.map((s) => s.name)], ...sorted.map((x) => [monthLabel(x), ...maps.map((m) => m.get(x) ?? null)])]);
}

/** Safe file name: lowercase, dashes, .csv */
export function csvFileName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "chart-data"}.csv`;
}
