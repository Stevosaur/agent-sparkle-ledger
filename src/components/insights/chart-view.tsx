"use client";

import { Download } from "lucide-react";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { SimpleBarChart } from "@/components/charts/bar-chart";
import { buttonClass } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import type { ChartSpec } from "@/lib/insights/types";
import { chartToCsv, csvFileName } from "./csv";

/** Trigger a client-side download of `text` as a CSV file. */
export function downloadCsv(text: string, fileName: string): void {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CsvButton({ chart, name, className }: { chart: ChartSpec; name: string; className?: string }) {
  const t = useT();
  const empty = chart.kind === "bar" ? chart.data.length === 0 : chart.series.every((s) => s.points.length === 0);
  return (
    <button type="button" disabled={empty} onClick={() => downloadCsv(chartToCsv(chart), csvFileName(name))} className={buttonClass("ghost", "sm", className)} aria-label={`${t("insights.csv", "Download CSV")}: ${name}`}>
      <Download className="size-4" aria-hidden />
      {t("insights.csv", "Download CSV")}
    </button>
  );
}

/** Renders a serializable ChartSpec with the shared chart kit, plus an optional CSV export button. */
export function ChartView({ chart, name, height, exportable = true }: { chart: ChartSpec; name: string; height?: number; exportable?: boolean }) {
  return (
    <div>
      {chart.kind === "line" ? (
        <TimeSeriesChart series={chart.series} yFormat={chart.yFormat} ariaLabel={chart.ariaLabel} height={height} />
      ) : (
        <SimpleBarChart data={chart.data} yFormat={chart.yFormat} ariaLabel={chart.ariaLabel} height={height} />
      )}
      {exportable ? (
        <div className="mt-1 flex justify-end">
          <CsvButton chart={chart} name={name} />
        </div>
      ) : null}
    </div>
  );
}
