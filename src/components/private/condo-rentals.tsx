"use client";

import { useGatedJson } from "@/components/gating/use-gated-json";
import { DataTable } from "@/components/ui/table";
import { Notice } from "@/components/ui/notice";
import { useT } from "@/lib/i18n/provider";
import { formatInt, formatMonth, formatSgd, sqmToSqft } from "@/lib/format";
import type { GroupRow, RentalRow, RentalSummary } from "@/lib/private-insights";

function areaLabel(lo: number | null, hi: number | null): string {
  if (lo == null || hi == null) return "—";
  return `${lo}–${hi} sqm (${formatInt(Math.round(sqmToSqft(lo)))}–${formatInt(Math.round(sqmToSqft(hi)))} sqft)`;
}

/** Rental contracts for a condo project (gated: property.context). */
export function CondoRentals({ slug }: { slug: string }) {
  const t = useT();
  const { data, error, loading } = useGatedJson<RentalSummary>(`/api/gated/private/condo/${slug}/rentals/`);
  if (error) return <Notice tone="warn">{t("common.error", "Something went wrong. Please try again.")}</Notice>;
  if (loading || !data) return <div className="h-48 animate-pulse rounded-lg bg-canvas" aria-busy="true" />;
  if (data.total === 0) return <p className="text-sm text-muted">{t("private.rent.none", "No rental contracts recorded for this project.")}</p>;

  const groupCols = (labelHeader: string, labelFor: (g: GroupRow) => string) => [
    { key: "label", header: labelHeader, cell: (g: GroupRow) => labelFor(g) },
    { key: "count", header: t("private.rent.contracts", "Contracts"), align: "right" as const, cell: (g: GroupRow) => formatInt(g.count) },
    { key: "median", header: t("private.rent.median", "Median rent"), align: "right" as const, cell: (g: GroupRow) => `${formatSgd(g.median)}/mo` },
  ];

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        {data.window === "12m"
          ? data.windowCount === 1
            ? t("private.rent.window12m1", "Medians use the 1 contract that started since {since}.", { since: formatMonth(data.sinceMonth) })
            : t("private.rent.window12m", "Medians use the {n} contracts that started since {since}.", { n: formatInt(data.windowCount), since: formatMonth(data.sinceMonth) })
          : data.windowCount === 1
            ? t("private.rent.windowAll1", "No contracts started in the last 12 months, so medians use the 1 recorded contract.")
            : t("private.rent.windowAll", "No contracts started in the last 12 months, so medians use all {n} recorded contracts.", { n: formatInt(data.windowCount) })}
      </p>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-semibold text-ink">{t("private.rent.byBedrooms", "Median rent by bedrooms")}</h4>
          <DataTable
            dense
            columns={groupCols(t("private.rent.bedrooms", "Bedrooms"), (g) => (g.key === "na" ? t("private.rent.notPublished", "Not published") : g.label))}
            rows={data.byBedrooms}
            rowKey={(g) => g.key}
          />
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold text-ink">{t("private.rent.byArea", "Median rent by floor area")}</h4>
          <DataTable
            dense
            columns={groupCols(t("private.rent.areaRange", "Floor area (URA range)"), (g) => (g.key === "na" ? t("private.rent.notPublished", "Not published") : g.label))}
            rows={data.byArea}
            rowKey={(g) => g.key}
          />
        </div>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold text-ink">{t("private.rent.latest", "Latest rental contracts")}</h4>
        <DataTable
          dense
          columns={[
            { key: "month", header: t("private.rent.leaseStart", "Lease start"), cell: (r: RentalRow) => formatMonth(r.month) },
            { key: "br", header: t("private.rent.bedrooms", "Bedrooms"), align: "right", cell: (r: RentalRow) => (r.bedrooms == null ? "—" : String(r.bedrooms)) },
            { key: "area", header: t("private.rent.areaRange", "Floor area (URA range)"), cell: (r: RentalRow) => areaLabel(r.areaSqmLow, r.areaSqmHigh) },
            { key: "rent", header: t("private.rent.monthly", "Monthly rent"), align: "right", cell: (r: RentalRow) => formatSgd(r.monthlyRent) },
          ]}
          rows={data.latest}
          rowKey={(r, i) => `${r.month}-${r.monthlyRent}-${i}`}
        />
      </div>
    </div>
  );
}
