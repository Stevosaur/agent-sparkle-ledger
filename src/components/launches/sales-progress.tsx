"use client";

import { useT } from "@/lib/i18n/provider";
import { formatInt, formatPct } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { LaunchProgress } from "@/lib/launch-insights";

/**
 * Two-layer progress bar: launched share (light) and sold share (dark) of the project's total units.
 * When the total is unknown the launched count is the denominator.
 */
export function SalesProgress({ progress, size = "md", className }: { progress: LaunchProgress; size?: "sm" | "md"; className?: string }) {
  const t = useT();
  const { sold, launched, total } = progress;
  const base = total ?? launched;
  const soldPct = base ? Math.min(1, (sold ?? 0) / base) : 0;
  const launchedPct = base && launched != null ? Math.min(1, launched / base) : 0;
  const soldText = sold != null ? formatInt(sold) : "—";
  const summary =
    total != null
      ? t("launches.progress.summaryTotal", "{sold} sold, {launched} launched of {total} units", { sold: soldText, launched: launched != null ? formatInt(launched) : "—", total: formatInt(total) })
      : t("launches.progress.summary", "{sold} sold of {launched} launched units", { sold: soldText, launched: launched != null ? formatInt(launched) : "—" });

  if (sold == null && launched == null) {
    return <p className={cn("text-sm text-muted", className)}>{t("launches.progress.none", "No developer sales reported yet")}</p>;
  }

  return (
    <div className={className}>
      <div className={cn("flex items-baseline justify-between gap-2", size === "sm" ? "text-xs" : "text-sm")}>
        <span className="tabular text-ink">
          <span className="font-semibold">{soldText}</span> {t("launches.progress.sold", "sold")}
          {launched != null ? (
            <span className="text-muted">
              {" / "}
              {formatInt(launched)} {t("launches.progress.launched", "launched")}
            </span>
          ) : null}
        </span>
        {progress.soldOfTotal != null ? (
          <span className="tabular font-medium text-brand-800">{t("launches.progress.pctTotal", "{pct} of total", { pct: formatPct(progress.soldOfTotal, 0) })}</span>
        ) : progress.soldOfLaunched != null ? (
          <span className="tabular font-medium text-brand-800">{t("launches.progress.pctLaunched", "{pct} of launched", { pct: formatPct(progress.soldOfLaunched, 0) })}</span>
        ) : null}
      </div>
      <div role="img" aria-label={summary} className={cn("relative mt-1.5 w-full overflow-hidden rounded-full bg-canvas ring-1 ring-line ring-inset", size === "sm" ? "h-2" : "h-3")}>
        <div className="absolute inset-y-0 left-0 bg-brand-200" style={{ width: `${launchedPct * 100}%` }} />
        <div className="absolute inset-y-0 left-0 bg-brand-700" style={{ width: `${soldPct * 100}%` }} />
      </div>
      {size === "md" ? (
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm bg-brand-700" />
            {t("launches.progress.legendSold", "Sold")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm bg-brand-200" />
            {t("launches.progress.legendLaunched", "Launched, unsold")}
          </span>
          {total != null ? (
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm bg-canvas ring-1 ring-line ring-inset" />
              {t("launches.progress.legendUnlaunched", "Not yet launched")}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
