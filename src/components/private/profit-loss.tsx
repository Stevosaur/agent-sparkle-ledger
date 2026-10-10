"use client";

import { useGatedJson } from "@/components/gating/use-gated-json";
import { DataTable } from "@/components/ui/table";
import { Notice } from "@/components/ui/notice";
import { Stat, StatGrid } from "@/components/ui/stat";
import { useT } from "@/lib/i18n/provider";
import { formatInt, formatMonth, formatPct, formatPctSigned, formatSgd } from "@/lib/format";
import type { ProfitLossResponse, ProfitLossRow } from "@/lib/private-insights";

/** Same-unit repeat-sale pairs for a condo project (gated: property.profit-loss; unit-level data only). */
export function ProfitLoss({ slug }: { slug: string }) {
  const t = useT();
  const { data, error, loading } = useGatedJson<ProfitLossResponse>(`/api/gated/private/condo/${slug}/profit-loss/`);
  if (error) return <Notice tone="warn">{t("common.error", "Something went wrong. Please try again.")}</Notice>;
  if (loading || !data) return <div className="h-48 animate-pulse rounded-lg bg-canvas" aria-busy="true" />;
  if (!data.available) return <p className="text-sm text-muted">{t("private.pl.needsUnit", "Profit and loss pairs need unit-level records.")}</p>;
  if (data.total === 0) return <p className="text-sm text-muted">{t("private.pl.none", "No unit has been sold twice in the records yet.")}</p>;
  return (
    <div className="space-y-4">
      <StatGrid>
        <Stat label={t("private.pl.pairs", "Resale pairs")} value={formatInt(data.total)} />
        <Stat label={t("private.pl.profitable", "Sold at a gain")} value={formatPct(data.profitable / data.total, 0)} sub={`${formatInt(data.profitable)} / ${formatInt(data.total)}`} />
        <Stat label={t("private.pl.medianAnnual", "Median annualised")} value={formatPctSigned(data.medianAnnualised)} />
        <Stat label={t("private.pl.medianHold", "Median holding period")} value={data.medianHoldingYears == null ? "—" : t("private.pl.years", "{n} yrs", { n: data.medianHoldingYears.toFixed(1) })} />
      </StatGrid>
      <DataTable
        dense
        columns={[
          { key: "unit", header: t("private.pl.unit", "Unit"), cell: (r: ProfitLossRow) => r.unit },
          { key: "bought", header: t("private.pl.bought", "Bought"), cell: (r: ProfitLossRow) => `${formatMonth(r.bought)} · ${formatSgd(r.boughtPrice)}` },
          { key: "sold", header: t("private.pl.sold", "Sold"), cell: (r: ProfitLossRow) => `${formatMonth(r.sold)} · ${formatSgd(r.soldPrice)}` },
          {
            key: "gain",
            header: t("private.pl.gain", "Gain / loss"),
            align: "right",
            cell: (r: ProfitLossRow) => (
              <span className={r.gain > 0 ? "text-up" : r.gain < 0 ? "text-down" : undefined}>
                {formatSgd(r.gain)} ({formatPctSigned(r.gainPct)})
              </span>
            ),
          },
          { key: "ann", header: t("private.pl.annualised", "Annualised"), align: "right", cell: (r: ProfitLossRow) => formatPctSigned(r.annualised) },
          { key: "hold", header: t("private.pl.held", "Held"), align: "right", cell: (r: ProfitLossRow) => t("private.pl.years", "{n} yrs", { n: r.holdingYears.toFixed(1) }) },
        ]}
        rows={data.rows}
        rowKey={(r, i) => `${r.unit}-${r.sold}-${i}`}
      />
      {data.total > data.rows.length ? (
        <p className="text-xs text-muted">{t("private.pl.capped", "Showing the {n} most recent resales.", { n: data.rows.length })}</p>
      ) : null}
      <p className="text-xs text-muted">{t("private.pl.note", "Gains are before stamp duties, agent fees, renovation and financing costs.")}</p>
    </div>
  );
}
