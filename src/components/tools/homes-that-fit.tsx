"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Notice } from "@/components/ui/notice";
import { DataTable } from "@/components/ui/table";
import { useGatedJson } from "@/components/gating/use-gated-json";
import { useT } from "@/lib/i18n/provider";
import { formatMonth, formatPct, formatPsf, formatSgd } from "@/lib/format";
import { titleCase } from "@/lib/slug";
import type { CondoFitRow, HdbFitRow } from "@/lib/tools/fit";
import { NumberField, parseNum, Segmented, SourceLine, useDebounced } from "./controls";

export interface FitResponse {
  kind: "hdb" | "condo";
  maxPrice: number;
  sizeSqft: number | null;
  rows: (HdbFitRow | CondoFitRow)[];
  available: boolean;
  latestMonth: string | null;
  source: string;
}

const DEFAULT_SIZE_SQFT = 1000;

/** "Homes that fit" — HDB towns × flat types and condo projects within the budget (aggregates from /api/affordability/fit/). */
export function HomesThatFit({ maxPrice, defaultKind }: { maxPrice: number; defaultKind: "hdb" | "condo" }) {
  const t = useT();
  // The visitor's own choices win; until they make one, follow the calculator (budget = max price,
  // kind = the property class picked above). An edited budget is dropped when the max price changes.
  const [kindChoice, setKind] = useState<"hdb" | "condo" | null>(null);
  const kind = kindChoice ?? defaultKind;
  const [budgetEdit, setBudgetEdit] = useState<{ forMax: number; value: string } | null>(null);
  const budget = budgetEdit && budgetEdit.forMax === maxPrice ? budgetEdit.value : maxPrice > 0 ? String(maxPrice) : "";
  const setBudget = (value: string) => setBudgetEdit({ forMax: maxPrice, value });
  const [size, setSize] = useState(String(DEFAULT_SIZE_SQFT));
  const budgetNum = parseNum(budget);
  const sizeNum = parseNum(size);
  const validBudget = budgetNum != null && budgetNum > 0;
  const validSize = sizeNum != null && sizeNum >= 200 && sizeNum <= 20000;
  const url =
    validBudget && (kind === "hdb" || validSize)
      ? `/api/affordability/fit/?maxPrice=${Math.round(budgetNum)}&kind=${kind}${kind === "condo" ? `&sizeSqft=${Math.round(sizeNum!)}` : ""}`
      : null;
  const debouncedUrl = useDebounced(url, 350);
  const { data, error, loading } = useGatedJson<FitResponse>(debouncedUrl);

  return (
    <Card>
      <CardHeader
        as="h2"
        title={t("tools.aff.fitTitle", "Homes that fit")}
        description={t("tools.aff.fitDesc", "Where the typical recent sale is within your budget. Medians over the last 12 months.")}
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <NumberField id="fit-budget" className="w-full max-w-56" label={t("tools.aff.fitBudget", "Budget")} value={budget} onChange={setBudget} prefix="S$" min={1} />
          <Segmented
            label={t("tools.aff.fitKind", "Show")}
            value={kind}
            onChange={setKind}
            options={[
              { value: "hdb", label: t("tools.aff.fitHdb", "HDB flats") },
              { value: "condo", label: t("tools.aff.fitCondo", "Condos & ECs") },
            ]}
          />
          {kind === "condo" ? (
            <NumberField
              id="fit-size"
              className="w-full max-w-44"
              label={t("tools.aff.fitSize", "Unit size")}
              value={size}
              onChange={setSize}
              suffix="sqft"
              min={200}
              max={20000}
              step={50}
            />
          ) : null}
        </div>
        {kind === "condo" ? (
          <p className="text-xs text-muted">
            {t("tools.aff.fitSizeNote", "Condo prices are estimated as the project's 12-month median psf × {n} sqft. Change the size to match the home you want.", {
              n: validSize ? Math.round(sizeNum!) : DEFAULT_SIZE_SQFT,
            })}
          </p>
        ) : null}

        {!url ? <p className="text-sm text-muted">{t("tools.aff.fitNeedBudget", "Enter a budget to see what fits.")}</p> : null}
        {url && (loading || url !== debouncedUrl) ? (
          <div className="h-40 animate-pulse rounded-lg bg-canvas" role="status">
            <span className="sr-only">{t("common.loading", "Loading…")}</span>
          </div>
        ) : null}
        {url && url === debouncedUrl && error ? <Notice tone="warn">{t("common.error", "Something went wrong. Please try again.")}</Notice> : null}
        {url && url === debouncedUrl && data ? <FitTable data={data} /> : null}
      </CardBody>
    </Card>
  );
}

function FitTable({ data }: { data: FitResponse }) {
  const t = useT();
  if (!data.available) {
    return (
      <EmptyState title={t("tools.aff.fitNoData", "No data for this home type yet")}>
        {data.kind === "condo"
          ? t("tools.aff.fitNoPrivate", "Condo prices need URA private transaction records, which are not connected on this deployment.")
          : t("tools.aff.fitNoHdb", "HDB resale records are not loaded on this deployment.")}
      </EmptyState>
    );
  }
  if (data.rows.length === 0) {
    return (
      <EmptyState title={t("tools.aff.fitNone", "Nothing fits this budget yet")}>
        {t("tools.aff.fitNoneBody", "No town or project has a 12-month median within {budget}. Try the other home type, a smaller unit, or a larger budget.", { budget: formatSgd(data.maxPrice) })}
      </EmptyState>
    );
  }
  return (
    <div>
      {data.kind === "hdb" ? (
        <DataTable
          rows={data.rows as HdbFitRow[]}
          rowKey={(r) => `${r.townSlug}-${r.flatType}`}
          columns={[
            {
              key: "town",
              header: t("tools.aff.colTown", "Town"),
              cell: (r) => (
                <Link href={`/insights/town/${r.townSlug}/`} className="font-medium text-brand-800 hover:underline">
                  {titleCase(r.town)}
                </Link>
              ),
            },
            { key: "type", header: t("tools.aff.colFlatType", "Flat type"), cell: (r) => r.flatType },
            { key: "region", header: t("tools.aff.colRegion", "Region"), cell: (r) => r.region },
            { key: "median", header: t("tools.aff.colMedian", "Median price (12m)"), align: "right", cell: (r) => formatSgd(r.medianPrice12m) },
            { key: "share", header: t("tools.aff.colShare", "Of budget"), align: "right", cell: (r) => formatPct(r.budgetShare, 0) },
          ]}
        />
      ) : (
        <DataTable
          rows={data.rows as CondoFitRow[]}
          rowKey={(r) => r.slug}
          columns={[
            {
              key: "name",
              header: t("tools.aff.colProject", "Project"),
              cell: (r) => (
                <div className="min-w-40">
                  <Link href={`/condo/${r.slug}/`} className="font-medium text-brand-800 hover:underline">
                    {titleCase(r.name)}
                  </Link>
                  {r.isEc ? (
                    <Badge tone="info" className="ml-2">
                      EC
                    </Badge>
                  ) : null}
                  {r.tenure ? <div className="text-xs text-muted">{r.tenure}</div> : null}
                </div>
              ),
            },
            { key: "where", header: t("tools.aff.colWhere", "District"), cell: (r) => [r.district != null ? `D${r.district}` : null, r.segment].filter(Boolean).join(" · ") || "—" },
            { key: "psf", header: t("tools.aff.colPsf", "Median psf (12m)"), align: "right", cell: (r) => formatPsf(r.medianPsf12m) },
            { key: "est", header: t("tools.aff.colEst", "Est. price"), align: "right", cell: (r) => formatSgd(r.estPrice) },
            { key: "sales", header: t("tools.aff.colSales", "Sales (12m)"), align: "right", cell: (r) => r.sales12m },
          ]}
        />
      )}
      <SourceLine>
        {t("common.source", "Source")}: {data.source}
        {data.latestMonth ? ` · ${t("tools.aff.dataTo", "data to {m}", { m: formatMonth(data.latestMonth) })}` : ""}
        {data.kind === "condo" ? ` · ${t("tools.aff.estNote", "estimated prices")}` : ""}
      </SourceLine>
    </div>
  );
}
