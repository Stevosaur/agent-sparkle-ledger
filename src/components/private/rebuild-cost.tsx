"use client";

import { useId, useState } from "react";
import { Field, Input } from "@/components/ui/form";
import { useT } from "@/lib/i18n/provider";
import { formatInt, formatSgd, SQFT_PER_SQM } from "@/lib/format";

function parsePositive(raw: string): number | null {
  const n = Number(raw.replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Rebuild-cost calculator: the user's own construction cost per sqft × the gross floor area they plan to build.
 * No default rates or areas — construction costs vary widely and we have no sourced figure to prefill.
 */
export function RebuildCost({ landAreaSqm }: { landAreaSqm: number | null }) {
  const t = useT();
  const rateId = useId();
  const gfaId = useId();
  const [rate, setRate] = useState("");
  const [gfa, setGfa] = useState("");
  const r = parsePositive(rate);
  const g = parsePositive(gfa);
  const total = r != null && g != null ? r * g : null;
  const rateInvalid = rate.trim() !== "" && r == null;
  const gfaInvalid = gfa.trim() !== "" && g == null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("private.rebuild.rate", "Construction cost (S$ per sqft of floor area)")}
          htmlFor={rateId}
          hint={t("private.rebuild.rateHint", "Use a quotation from a builder or quantity surveyor for the design you have in mind.")}
        >
          <Input
            id={rateId}
            inputMode="decimal"
            autoComplete="off"
            placeholder={t("private.rebuild.ratePlaceholder", "From your quotation")}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            aria-invalid={rateInvalid || undefined}
          />
        </Field>
        <Field
          label={t("private.rebuild.gfa", "Gross floor area to build (sqft)")}
          htmlFor={gfaId}
          hint={t("private.rebuild.gfaHint", "Total floor area across all storeys, from your architect or the approved plans. URA's landed housing guidelines (storeys, setbacks) limit what each plot can take.")}
        >
          <Input
            id={gfaId}
            inputMode="decimal"
            autoComplete="off"
            placeholder={t("private.rebuild.gfaPlaceholder", "e.g. from your architect")}
            value={gfa}
            onChange={(e) => setGfa(e.target.value)}
            aria-invalid={gfaInvalid || undefined}
          />
        </Field>
      </div>
      {landAreaSqm != null ? (
        <p className="text-xs text-muted">
          {t("private.rebuild.lot", "For reference, the recorded land area of this lot is {sqft} sqft ({sqm} sqm).", {
            sqft: formatInt(Math.round(landAreaSqm * SQFT_PER_SQM)),
            sqm: formatInt(Math.round(landAreaSqm)),
          })}
        </p>
      ) : null}
      <div className="rounded-xl border border-line bg-canvas px-4 py-3" aria-live="polite">
        {total != null && r != null && g != null ? (
          <>
            <div className="text-xs font-medium uppercase tracking-wide text-muted">{t("private.rebuild.result", "Your rebuild cost estimate")}</div>
            <div className="tabular mt-1 text-2xl font-semibold text-ink">{formatSgd(total)}</div>
            <div className="mt-0.5 text-xs text-muted">
              {formatSgd(r)} × {formatInt(g)} sqft ({formatSgd(r * SQFT_PER_SQM)}/sqm × {formatInt(Math.round(g / SQFT_PER_SQM))} sqm)
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">
            {rateInvalid || gfaInvalid
              ? t("private.rebuild.invalid", "Enter positive numbers only.")
              : t("private.rebuild.empty", "Enter both figures to see the estimate. We don't prefill them because rebuild costs depend on the design, specification and site.")}
          </p>
        )}
      </div>
      <p className="text-xs text-muted">
        {t("private.rebuild.excludes", "Excludes demolition, professional fees, authority submission fees and GST, unless your quotation includes them.")}
      </p>
    </div>
  );
}
