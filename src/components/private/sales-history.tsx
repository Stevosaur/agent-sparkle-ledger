"use client";

import { useId, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useGatedJson } from "@/components/gating/use-gated-json";
import { Notice } from "@/components/ui/notice";
import { buttonClass } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import type { Page, SaleRow } from "@/lib/private-insights";
import { SalesTable } from "./sales-table";

/** Full, paginated sales history from a gated route handler (`endpoint` ends with "/"). */
export function SalesHistory({ endpoint, variant, showAddress = true }: { endpoint: string; variant: "condo" | "landed"; showAddress?: boolean }) {
  const t = useT();
  const [page, setPage] = useState(1);
  const { data, error, loading } = useGatedJson<Page<SaleRow>>(`${endpoint}?page=${page}`);
  const statusId = useId();

  if (error) return <Notice tone="warn">{t("common.error", "Something went wrong. Please try again.")}</Notice>;
  return (
    <div aria-busy={loading} aria-describedby={statusId}>
      {data ? <SalesTable rows={data.rows} variant={variant} showAddress={showAddress} /> : <div className="h-64 animate-pulse rounded-lg bg-canvas" />}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span id={statusId} className="text-muted" aria-live="polite">
          {data
            ? t("private.history.pageOf", "Page {page} of {pages} · {total} sales", { page: data.page, pages: data.totalPages, total: data.total })
            : t("common.loading", "Loading…")}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className={buttonClass("outline", "sm")}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={loading || !data || data.page <= 1}
          >
            <ChevronLeft className="size-4" aria-hidden />
            {t("private.history.prev", "Newer")}
          </button>
          <button
            type="button"
            className={buttonClass("outline", "sm")}
            onClick={() => setPage((p) => (data ? Math.min(data.totalPages, p + 1) : p))}
            disabled={loading || !data || data.page >= data.totalPages}
          >
            {t("private.history.next", "Older")}
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
