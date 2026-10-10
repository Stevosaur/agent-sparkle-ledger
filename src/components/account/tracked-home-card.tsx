"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { formatArea, formatMonth, formatPct, formatPctSigned, formatSgd } from "@/lib/format";
import { monthIndex } from "@/lib/data/months";
import type { HomeEstimate, TrackedHomeView } from "@/lib/account/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat, StatGrid } from "@/components/ui/stat";
import { TimeSeriesChart, type TimeSeries } from "@/components/charts/time-series-chart";
import { apiJson } from "./api";
import { draftFrom, draftToBody, HomeDetailsFields, useTrackedErrorText, type HomeDetailsDraft } from "./home-details-fields";

function signedSgd(v: number): string {
  return v > 0 ? `+${formatSgd(v)}` : formatSgd(v);
}

function safeMonthIndex(label: string | null): number | null {
  if (!label) return null;
  try {
    return monthIndex(label);
  } catch {
    return null;
  }
}

function MethodNote({ home, estimate }: { home: TrackedHomeView; estimate: Extract<HomeEstimate, { status: "ok" }> }) {
  const t = useT();
  const area = estimate.areaSqm != null ? formatArea(estimate.areaSqm) : "";
  let method: string;
  switch (estimate.method) {
    case "block-flat-type-median":
      method = t("account.tracked.method.block", "Estimate: the median resale price of {type} flats in this block each quarter. It doesn't adjust for floor, size, condition or renovation.", { type: estimate.flatType ?? "" });
      break;
    case "town-flat-type-median":
      method = t("account.tracked.method.town", "No {type} resales are recorded in this block, so this uses the median {type} resale price across the town each quarter. Treat it as a rough guide.", { type: estimate.flatType ?? "" });
      break;
    case "project-median-psf":
      method = t("account.tracked.method.project", "Estimate: the project's median price per square foot each quarter × your floor area of {area}. It doesn't adjust for floor, facing, stack or condition.", { area });
      break;
    case "street-median-psf":
      method = t("account.tracked.method.street", "Estimate: the street's median landed price per square foot of land each quarter × a land area of {area}. It doesn't adjust for the house itself.", { area });
      break;
  }
  const source = home.kind === "hdb" ? t("account.tracked.sourceHdb", "HDB resale flat prices, data.gov.sg") : t("account.tracked.sourcePrivate", "URA private residential transactions");
  return (
    <div className="space-y-1 text-xs text-muted">
      <p>{method}</p>
      <p>
        {t("common.source", "Source")}: {source}
      </p>
    </div>
  );
}

function Unavailable({ reason }: { reason: Extract<HomeEstimate, { status: "unavailable" }>["reason"] }) {
  const t = useT();
  const text = {
    "not-found": t("account.tracked.na.notFound", "This property is no longer in our dataset, so we can't estimate its value."),
    "no-private-data": t("account.tracked.na.noPrivate", "Private property transactions (URA) aren't loaded on this deployment, so condo and landed estimates are unavailable."),
    "no-sales": t("account.tracked.na.noSales", "There are no recorded sales to base an estimate on yet."),
    "needs-area": t("account.tracked.na.needsArea", "Add the floor area (Edit details) to see an estimate."),
    "needs-flat-type": t("account.tracked.na.needsType", "Add the flat type (Edit details) to see an estimate."),
    unsupported: t("account.tracked.na.unsupported", "Estimates aren't available for this kind of property."),
  }[reason];
  return <p className="rounded-lg bg-canvas px-3 py-3 text-sm text-muted">{text}</p>;
}

/** One tracked home: estimated value, gain vs purchase, quarterly chart, edit and remove. */
export function TrackedHomeCard({ home, onChange, onRemove }: { home: TrackedHomeView; onChange: (next: TrackedHomeView) => void; onRemove: (id: number) => void }) {
  const t = useT();
  const errorText = useTrackedErrorText();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<HomeDetailsDraft>(() => draftFrom(home));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const est = home.estimate;

  const details = [
    home.flatType,
    home.areaSqm != null ? formatArea(home.areaSqm) : null,
    home.floor != null ? t("account.tracked.floorN", "Floor {n}", { n: home.floor }) : null,
    home.purchasePrice != null
      ? home.purchaseMonth
        ? t("account.tracked.boughtFor", "Bought {month} for {price}", { month: formatMonth(home.purchaseMonth), price: formatSgd(home.purchasePrice) })
        : t("account.tracked.boughtPrice", "Bought for {price}", { price: formatSgd(home.purchasePrice) })
      : home.purchaseMonth
        ? t("account.tracked.boughtIn", "Bought {month}", { month: formatMonth(home.purchaseMonth) })
        : null,
  ]
    .filter(Boolean)
    .join(" · ");

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiJson<{ item: TrackedHomeView }>("/api/tracked/", { method: "PATCH", body: { id: home.id, ...draftToBody(draft) } });
    setBusy(false);
    if (res.ok) {
      onChange(res.data.item);
      setEditing(false);
    } else setError(errorText(res.error));
  }

  async function remove() {
    if (!window.confirm(t("account.tracked.confirmRemove", "Stop tracking {label}?", { label: home.label }))) return;
    setBusy(true);
    const res = await apiJson<{ ok: boolean }>("/api/tracked/", { method: "DELETE", body: { id: home.id } });
    setBusy(false);
    if (res.ok) onRemove(home.id);
    else setError(errorText(res.error));
  }

  let series: TimeSeries[] = [];
  if (est.status === "ok") {
    const valueName = t("account.tracked.seriesValue", "Estimated value");
    series = [{ name: valueName, points: est.series.map((p) => ({ x: p.x, y: p.y })) }];
    const bought = safeMonthIndex(home.purchaseMonth);
    if (home.purchasePrice != null && est.series.length > 0) {
      const first = est.series[0].x;
      const last = est.series[est.series.length - 1].x;
      const start = bought != null ? Math.min(Math.max(bought, first), last) : first;
      series.push({ name: t("account.tracked.seriesPurchase", "Purchase price"), points: [{ x: start, y: home.purchasePrice }, { x: last, y: home.purchasePrice }], color: "#f19414" });
    }
  }

  return (
    <Card>
      <CardHeader
        title={
          home.href ? (
            <Link href={home.href} className="hover:text-brand-700 hover:underline">
              {home.label}
            </Link>
          ) : (
            home.label
          )
        }
        description={details || undefined}
        actions={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => {
                if (!editing) setDraft(draftFrom(home));
                setEditing(!editing);
                setError(null);
              }}
              aria-expanded={editing} aria-label={t("account.tracked.edit", "Edit details for {label}", { label: home.label })}>
              <Pencil className="size-4" aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={busy} aria-label={t("account.tracked.remove", "Stop tracking {label}", { label: home.label })}>
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </>
        }
      />
      <CardBody className="space-y-4">
        {editing ? (
          <form onSubmit={save} className="space-y-4 rounded-xl border border-line bg-canvas/60 p-4">
            <HomeDetailsFields kind={home.kind} value={draft} onChange={setDraft} disabled={busy} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={busy}>
                {t("account.tracked.save", "Save details")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(draftFrom(home));
                  setEditing(false);
                  setError(null);
                }}
              >
                {t("account.tracked.cancel", "Cancel")}
              </Button>
            </div>
          </form>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-down">
            {error}
          </p>
        ) : null}
        {est.status === "ok" ? (
          <>
            <StatGrid>
              <Stat
                label={
                  <span className="inline-flex items-center gap-1">
                    {t("account.tracked.value", "Estimated value")} <Badge tone="info">{t("common.estimated", "estimated")}</Badge>
                  </span>
                }
                value={formatSgd(est.latest.value)}
                sub={t("account.tracked.asOf", "{quarter} · {n} sales", { quarter: est.latest.quarter, n: est.latest.sales })}
              />
              {home.purchasePrice != null ? <Stat label={t("account.tracked.paid", "Purchase price")} value={formatSgd(home.purchasePrice)} sub={home.purchaseMonth ? formatMonth(home.purchaseMonth) : undefined} /> : null}
              {est.gain ? (
                <Stat
                  label={t("account.tracked.gain", "Estimated gain")}
                  value={signedSgd(est.gain.amount)}
                  tone={est.gain.amount > 0 ? "up" : est.gain.amount < 0 ? "down" : undefined}
                  sub={
                    est.gain.annualised != null
                      ? t("account.tracked.gainSubAnnual", "{pct} · {annual} a year", { pct: formatPctSigned(est.gain.pct), annual: formatPct(est.gain.annualised) })
                      : formatPctSigned(est.gain.pct)
                  }
                />
              ) : null}
            </StatGrid>
            <TimeSeriesChart
              series={series}
              yFormat="sgdCompact"
              height={240}
              ariaLabel={t("account.tracked.chartLabel", "Estimated value of {label} by quarter", { label: home.label })}
            />
            <MethodNote home={home} estimate={est} />
          </>
        ) : (
          <Unavailable reason={est.reason} />
        )}
      </CardBody>
    </Card>
  );
}
