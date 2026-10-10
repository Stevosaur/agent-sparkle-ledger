"use client";

import { useGatedJson } from "@/components/gating/use-gated-json";
import { Notice } from "@/components/ui/notice";
import { useT } from "@/lib/i18n/provider";
import { formatInt, formatMonth, formatSgd } from "@/lib/format";
import type { StackingResponse } from "@/lib/private-insights";

/** Background shade for a psf value between the grid's min and max (teal, 8%–45% opacity). */
function shade(psf: number, min: number, max: number): string {
  const f = max > min ? (psf - min) / (max - min) : 0.5;
  return `rgba(25, 98, 91, ${(0.08 + f * 0.37).toFixed(3)})`;
}

/** Stacking plan / floor x size grid for a condo project (gated: property.stacking). */
export function StackingPlan({ slug }: { slug: string }) {
  const t = useT();
  const { data, error, loading } = useGatedJson<StackingResponse>(`/api/gated/private/condo/${slug}/stacking/`);
  if (error) return <Notice tone="warn">{t("common.error", "Something went wrong. Please try again.")}</Notice>;
  if (loading || !data) return <div className="h-64 animate-pulse rounded-lg bg-canvas" aria-busy="true" />;
  if (data.rows.length === 0 || data.cols.length === 0) {
    return <p className="text-sm text-muted">{t("private.stack.empty", "Not enough single-unit sales with a floor range and size to build a grid.")}</p>;
  }

  const psfs = data.mode === "unit" ? data.cells.map((c) => c.psf) : data.cells.map((c) => c.medianPsf);
  const min = Math.min(...psfs);
  const max = Math.max(...psfs);
  const byKey = new Map<string, (typeof data.cells)[number]>();
  for (const c of data.cells) byKey.set(`${c.row}|${c.col}`, c);

  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        {data.mode === "unit"
          ? t("private.stack.unitIntro", "Latest recorded psf for each unit ({n} units), by stack and floor.", { n: formatInt(data.units) })
          : t("private.stack.gridIntro", "Median psf by floor range and unit size for {n} sales since {since}; the small number is the count of sales.", {
              n: formatInt(data.sales),
              since: formatMonth(data.sinceMonth),
            })}
      </p>
      <div className="overflow-x-auto">
        <table className="tabular w-full min-w-max border-collapse text-sm">
          <caption className="sr-only">
            {data.mode === "unit" ? t("private.stack.captionUnit", "Latest psf by stack and floor") : t("private.stack.captionGrid", "Median psf by floor range and size band")}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted">
                {t("private.stack.floor", "Floor")}
              </th>
              {data.cols.map((c) => (
                <th key={c.key} scope="col" className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row} className="border-t border-line/70">
                <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-left text-xs font-medium text-ink">
                  {row}
                </th>
                {data.cols.map((col) => {
                  const cell = byKey.get(`${row}|${col.key}`);
                  if (!cell) {
                    return (
                      <td key={col.key} className="px-2 py-1.5 text-center text-muted">
                        <span aria-hidden>·</span>
                        <span className="sr-only">{t("private.stack.noSales", "No sales")}</span>
                      </td>
                    );
                  }
                  const psf = "psf" in cell ? cell.psf : cell.medianPsf;
                  return (
                    <td key={col.key} className="px-1 py-1">
                      <div className="rounded-md px-2 py-1 text-center" style={{ background: shade(psf, min, max) }}>
                        <div className="font-medium text-ink">{formatSgd(psf)}</div>
                        <div className="text-[11px] text-ink/70">
                          {"count" in cell ? (cell.count === 1 ? t("private.stack.sale1", "1 sale") : t("private.stack.sales", "{n} sales", { n: formatInt(cell.count) })) : formatMonth(cell.month)}
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        {t("private.stack.legend", "Darker cells have a higher psf (range {min} to {max} psf).", { min: formatSgd(min), max: formatSgd(max) })}
      </p>
    </div>
  );
}
