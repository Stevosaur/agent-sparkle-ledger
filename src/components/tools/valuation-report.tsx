"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { useT } from "@/lib/i18n/provider";
import { site } from "@/lib/config/site";
import { formatMonth } from "@/lib/format";
import type { ValuationResponse } from "@/lib/valuation-service";
import { ValuationResult, type ValuationRequestBody } from "./valuation-tool";

type State = { key: string; status: "done"; data: ValuationResponse } | { key: string; status: "error"; message: string };

/**
 * Print-optimised valuation report. Fetches the Plus-gated report endpoint itself (never receives gated data as props).
 * `siteHost` is the host printed on the report, resolved by the server page: client bundles only see NEXT_PUBLIC_*
 * variables, so `site.url` here would fall back to localhost on Vercel. Without it, the current browser host is used.
 */
export function ValuationReport({ body, siteHost }: { body: ValuationRequestBody; siteHost?: string }) {
  const t = useT();
  const key = JSON.stringify(body);
  const [state, setState] = useState<State | null>(null);
  const current = state && state.key === key ? state : null;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/gated/valuation/report/", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: key })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as (ValuationResponse & { message?: string }) | null;
        if (cancelled) return;
        if (res.status === 401 || res.status === 402) setState({ key, status: "error", message: "no_access" });
        else if (!res.ok || !json) setState({ key, status: "error", message: json?.message ?? "error" });
        else setState({ key, status: "done", data: json });
      })
      .catch(() => {
        if (!cancelled) setState({ key, status: "error", message: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const backHref = `/valuation/?ref=${encodeURIComponent(body.ref)}`;

  if (!current)
    return (
      <div className="h-64 animate-pulse rounded-xl bg-canvas" role="status">
        <span className="sr-only">{t("common.loading", "Loading…")}</span>
      </div>
    );
  if (current.status === "error")
    return (
      <div className="space-y-4">
        <Notice tone="warn">
          {current.message === "no_access"
            ? t("tools.val.noAccess", "Your session has ended or your plan does not include this. Refresh the page to sign in again.")
            : current.message === "error"
              ? t("common.error", "Something went wrong. Please try again.")
              : current.message}
        </Notice>
        <Link href={backHref} className={buttonClass("outline", "sm")}>
          {t("tools.val.backToTool", "Back to the valuation tool")}
        </Link>
      </div>
    );

  const d = current.data;
  return (
    <div>
      <style>{PRINT_CSS}</style>
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Button type="button" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden />
          {t("tools.val.print", "Print or save as PDF")}
        </Button>
        <Link href={backHref} className={buttonClass("outline")} prefetch={false}>
          {t("tools.val.backToTool", "Back to the valuation tool")}
        </Link>
      </div>
      <article id="valuation-report" className="rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:p-8 print:border-0 print:p-0">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <div className="text-sm font-semibold text-brand-700">{site.name}</div>
            <h2 className="text-xl font-bold text-ink">
              {t("tools.val.reportFor", "Valuation report: {name}", { name: d.subject.label })}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {[
                d.input.flatType,
                d.input.storeyRange ? `${t("tools.val.storey", "Storey range")} ${d.input.storeyRange}` : null,
                d.input.floor != null && !d.input.storeyRange ? `${t("tools.val.floor", "Floor")} ${d.input.floor}` : null,
                `${Math.round(d.input.areaSqm)} sqm (${Math.round(d.input.areaSqm * 10.764)} sqft)`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="text-right text-xs text-muted">
            <div>{t("tools.val.dataTo", "Data to {month}", { month: formatMonth(d.asOf) })}</div>
            {/* the report only renders after the client fetch, never on the server, so window is defined here */}
            <div>{siteHost ?? window.location.host}</div>
          </div>
        </header>
        <ValuationResult data={d} compact />
        <p className="mt-6 border-t border-line pt-4 text-xs text-muted">
          {t(
            "tools.val.disclaimer",
            "Automated estimate from public transaction records. It is not a valuation by a licensed appraiser and should not be relied on for lending or legal purposes.",
          )}
        </p>
      </article>
    </div>
  );
}

/** Print only the report article (hides site chrome without touching the shared layout). */
const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  #valuation-report, #valuation-report * { visibility: visible !important; }
  #valuation-report { position: absolute; inset: 0 auto auto 0; width: 100%; }
  @page { margin: 14mm; }
}`;
