"use client";

import { useId, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { DataTable } from "@/components/ui/table";
import { useGatedJson } from "@/components/gating/use-gated-json";
import { useT } from "@/lib/i18n/provider";
import { flatTypeLabel, type HdbSalesPage } from "@/lib/hdb-insights";
import { saleColumns } from "./sale-columns";

/** Gated full resale history (50 per page, newest first) from GET /api/gated/hdb/<slug>/sales/. */
export function HdbSalesHistory({ slug, flatTypes }: { slug: string; flatTypes: string[] }) {
  const t = useT();
  const selectId = useId();
  const [page, setPage] = useState(1);
  const [flatType, setFlatType] = useState("");
  const url = `/api/gated/hdb/${encodeURIComponent(slug)}/sales/?page=${page}${flatType ? `&flatType=${encodeURIComponent(flatType)}` : ""}`;
  const { data, error, loading } = useGatedJson<HdbSalesPage>(url);
  // Keep the previous page on screen (dimmed) while the next one loads, so the table does not collapse.
  const [shown, setShown] = useState<HdbSalesPage | null>(null);
  if (data && data !== shown) setShown(data);
  const view = data ?? shown;

  return (
    <Card>
      <CardHeader
        title={t("hdb.sales.fullTitle", "Full sales history")}
        description={view ? t("hdb.sales.fullCount", "{count} resales recorded", { count: view.total.toLocaleString("en-SG") }) : null}
        actions={
          flatTypes.length > 1 ? (
            <Field label={t("hdb.col.flatType", "Flat type")} htmlFor={selectId} className="w-40">
              <Select
                id={selectId}
                value={flatType}
                onChange={(e) => {
                  setFlatType(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t("hdb.sales.allTypes", "All flat types")}</option>
                {flatTypes.map((ft) => (
                  <option key={ft} value={ft}>
                    {flatTypeLabel(ft)}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null
        }
      />
      <CardBody className="px-2 py-2">
        {error ? (
          <Notice tone="warn" className="m-3">
            {t("common.error", "Something went wrong. Please try again.")}
          </Notice>
        ) : !view ? (
          <div className="min-h-40 animate-pulse rounded-lg bg-canvas" aria-busy="true">
            <span className="sr-only">{t("common.loading", "Loading…")}</span>
          </div>
        ) : (
          <div aria-busy={loading} className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <DataTable rows={view.rows} rowKey={(r, i) => `${r.month}-${r.storeyRange}-${r.price}-${i}`} columns={saleColumns} dense empty={t("hdb.sales.none", "No resales recorded for this selection.")} />
          </div>
        )}
      </CardBody>
      {view && !error && view.totalPages > 1 ? (
        <nav aria-label={t("hdb.sales.pagination", "Sales pages")} className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => setPage(Math.max(1, view.page - 1))} disabled={loading || view.page <= 1}>
            <ChevronLeft className="size-4" aria-hidden />
            {t("hdb.sales.prev", "Newer")}
          </Button>
          <span className="text-sm text-muted" aria-live="polite">
            {t("hdb.sales.pageOf", "Page {page} of {pages}", { page: view.page, pages: view.totalPages })}
          </span>
          <Button variant="outline" size="sm" onClick={() => setPage(Math.min(view.totalPages, view.page + 1))} disabled={loading || view.page >= view.totalPages}>
            {t("hdb.sales.next", "Older")}
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </nav>
      ) : null}
    </Card>
  );
}
