"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Link2, Lock, Plus, X } from "lucide-react";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { GatedPanel, PlusBadge } from "@/components/gating/gated-panel";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { DataTable, type Column } from "@/components/ui/table";
import { useFeature } from "@/lib/auth/viewer-context";
import { monthLabel } from "@/lib/data/months";
import { formatInt, formatMonth, formatPsf, formatSgd } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { isPublicSeriesKey, isRentSeries, MAX_TREND_SERIES, parseTrendParams, trendQueryString, type SeriesGroup, type TrendMetric, type TrendState } from "@/lib/insights/series-keys";
import type { ChartSpec, ChartValueFormat } from "@/lib/insights/types";
import { CsvButton } from "./chart-view";

interface SeriesPoint {
  m: number;
  count: number;
  medianPrice: number;
  medianPsf: number;
}

type Loaded = { status: "ok"; label: string; points: SeriesPoint[] } | { status: "error"; code: number | null };

function metricValue(p: SeriesPoint, metric: TrendMetric): number {
  return metric === "price" ? p.medianPrice : metric === "psf" ? p.medianPsf : p.count;
}

function formatMetric(v: number, metric: TrendMetric, rent: boolean): string {
  if (metric === "volume") return formatInt(v);
  if (metric === "psf") return formatPsf(v);
  return rent ? `${formatSgd(v)}/mo` : formatSgd(v);
}

export function TrendBuilder({ groups, defaultKey, minYear, maxYear }: { groups: SeriesGroup[]; defaultKey: string | null; minYear: number; maxYear: number }) {
  const t = useT();
  const uid = useId();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { allowed, loading: viewerLoading } = useFeature("insights.full");
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});
  const [showGate, setShowGate] = useState(false);
  const [copied, setCopied] = useState(false);
  const inflight = useRef(new Set<string>());

  const labels = useMemo(() => new Map(groups.flatMap((g) => g.options.map((o) => [o.key, o.label] as const))), [groups]);
  const validKeys = useMemo(() => new Set(labels.keys()), [labels]);
  const parsed = parseTrendParams(searchParams, validKeys);
  const state: TrendState = parsed.keys.length || !defaultKey ? parsed : { ...parsed, keys: [defaultKey] };
  const keysParam = state.keys.join("|");

  /** Free visitors get one national HDB series (the first slot); everything else needs insights.full. */
  const canUse = (key: string, index: number) => allowed || (index === 0 && isPublicSeriesKey(key));

  useEffect(() => {
    const keys = keysParam ? keysParam.split("|") : [];
    keys.forEach((key, index) => {
      if (loaded[key] || inflight.current.has(key)) return;
      if (!allowed && !(index === 0 && isPublicSeriesKey(key))) return;
      inflight.current.add(key);
      fetch(`/api/stats/series/?key=${encodeURIComponent(key)}`, { credentials: "same-origin" })
        .then(async (res) => {
          const body = await res.json().catch(() => null);
          const value: Loaded = res.ok && body ? { status: "ok", label: body.label as string, points: body.points as SeriesPoint[] } : { status: "error", code: res.status };
          setLoaded((prev) => ({ ...prev, [key]: value }));
        })
        .catch(() => setLoaded((prev) => ({ ...prev, [key]: { status: "error", code: null } })))
        .finally(() => inflight.current.delete(key));
    });
  }, [keysParam, allowed, loaded]);

  function update(next: Partial<TrendState>) {
    const qs = trendQueryString({ ...state, ...next });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function setKey(index: number, key: string) {
    const keys = [...state.keys];
    keys[index] = key;
    update({ keys: keys.filter((k, i) => keys.indexOf(k) === i) });
  }

  function addSeries() {
    if (!allowed) {
      setShowGate(true);
      return;
    }
    const next = groups.flatMap((g) => g.options).find((o) => !state.keys.includes(o.key));
    if (next && state.keys.length < MAX_TREND_SERIES) update({ keys: [...state.keys, next.key] });
  }

  function removeSeries(index: number) {
    update({ keys: state.keys.filter((_, i) => i !== index) });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  const fromM = state.from != null ? (state.from - 1990) * 12 : -Infinity;
  const toM = state.to != null ? (state.to - 1990) * 12 + 11 : Infinity;
  const plotted = state.keys
    .filter((k, i) => canUse(k, i) && loaded[k]?.status === "ok")
    .filter((k) => !(state.metric === "psf" && isRentSeries(k)))
    .map((k) => {
      const l = loaded[k] as Extract<Loaded, { status: "ok" }>;
      const points = l.points
        .filter((p) => p.m >= fromM && p.m <= toM)
        .map((p) => ({ x: p.m, y: metricValue(p, state.metric) }))
        .filter((p) => Number.isFinite(p.y) && (state.metric === "volume" || p.y > 0));
      return { key: k, name: l.label, points, rent: isRentSeries(k) };
    });
  const allRent = plotted.length > 0 && plotted.every((p) => p.rent);
  const yFormat: ChartValueFormat = state.metric === "volume" ? "int" : state.metric === "psf" ? "psf" : allRent ? "rent" : "sgd";
  const lines = plotted.map((p) => ({ name: p.name, points: p.points }));
  const ariaLabel = `Line chart of ${plotted.map((p) => p.name).join(", ") || "no series"}`;
  const chart: ChartSpec = { kind: "line", yFormat, ariaLabel, series: lines };
  const pending = state.keys.some((k, i) => canUse(k, i) && !loaded[k]) || (viewerLoading && state.keys.some((k, i) => !canUse(k, i)));
  const locked = !viewerLoading && state.keys.some((k, i) => !canUse(k, i));
  const rentSkipped = state.metric === "psf" && state.keys.some((k) => isRentSeries(k));
  const failed = state.keys.filter((k) => loaded[k]?.status === "error");
  const years = Array.from({ length: Math.max(0, maxYear - minYear + 1) }, (_, i) => minYear + i);

  const summaryCols: Column<(typeof plotted)[number]>[] = [
    { key: "name", header: t("insights.trend.series", "Series"), cell: (r) => <span className="whitespace-normal">{r.name}</span> },
    { key: "latest", header: t("insights.trend.latest", "Latest"), cell: (r) => (r.points.length ? formatMonth(monthLabel(r.points[r.points.length - 1].x)) : "—"), align: "right" },
    { key: "value", header: t("insights.trend.value", "Value"), cell: (r) => (r.points.length ? formatMetric(r.points[r.points.length - 1].y, state.metric, r.rent) : "—"), align: "right" },
    { key: "n", header: t("insights.trend.months", "Months"), cell: (r) => formatInt(r.points.length), align: "right" },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="space-y-4">
          <div className="space-y-3">
            {state.keys.map((key, i) => (
              <div key={`${key}-${i}`} className="flex items-end gap-2">
                <Field className="min-w-0 flex-1" label={i === 0 ? t("insights.trend.series", "Series") : t("insights.trend.seriesN", "Series {n}", { n: i + 1 })} htmlFor={`${uid}-s${i}`}>
                  <Select id={`${uid}-s${i}`} value={key} onChange={(e) => setKey(i, e.target.value)}>
                    {groups.map((g) => (
                      <optgroup key={g.id} label={t(g.labelKey, g.label)}>
                        {g.options.map((o) => (
                          <option key={o.key} value={o.key} disabled={!o.public && !allowed && o.key !== key}>
                            {o.label}
                            {!o.public && !allowed ? " (Plus)" : ""}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                </Field>
                {state.keys.length > 1 ? (
                  <Button type="button" variant="ghost" size="md" onClick={() => removeSeries(i)} aria-label={t("insights.trend.remove", "Remove series {n}", { n: i + 1 })}>
                    <X className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </div>
            ))}
            {state.keys.length < MAX_TREND_SERIES ? (
              <Button type="button" variant="outline" size="sm" onClick={addSeries}>
                <Plus className="size-4" aria-hidden />
                {t("insights.trend.add", "Add a series")}
                {!allowed ? <PlusBadge /> : null}
              </Button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={t("insights.trend.metric", "Measure")} htmlFor={`${uid}-metric`}>
              <Select id={`${uid}-metric`} value={state.metric} onChange={(e) => update({ metric: e.target.value as TrendMetric })}>
                <option value="price">{t("insights.trend.metricPrice", "Median price (or rent)")}</option>
                <option value="psf">{t("insights.trend.metricPsf", "Median price per sq ft")}</option>
                <option value="volume">{t("insights.trend.metricVolume", "Number of transactions")}</option>
              </Select>
            </Field>
            <Field label={t("insights.trend.from", "From")} htmlFor={`${uid}-from`}>
              <Select id={`${uid}-from`} value={state.from ?? ""} onChange={(e) => update({ from: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{t("insights.trend.earliest", "Earliest")}</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("insights.trend.to", "To")} htmlFor={`${uid}-to`}>
              <Select id={`${uid}-to`} value={state.to ?? ""} onChange={(e) => update({ to: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{t("insights.trend.latestYear", "Latest")}</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </CardBody>
      </Card>

      {showGate && !allowed ? (
        <GatedPanel feature="insights.full" minHeight={140}>
          <span />
        </GatedPanel>
      ) : null}

      {locked ? (
        <Notice tone="warn" title={t("insights.trend.lockedTitle", "Some series need Plus")}>
          {t("insights.trend.lockedBody", "The national HDB series are free. Town, rent and private series, and comparing several series, are part of Plus.")}
        </Notice>
      ) : null}

      <Card>
        <CardBody className="space-y-3">
          {pending ? (
            <div className="h-[320px] animate-pulse rounded-xl bg-canvas" aria-busy="true" aria-label={t("common.loading", "Loading…")} />
          ) : plotted.length ? (
            <TimeSeriesChart series={lines} yFormat={yFormat} ariaLabel={ariaLabel} height={320} />
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted">{t("insights.trend.nothing", "Pick a series to draw a chart.")}</div>
          )}
          {rentSkipped ? <p className="text-xs text-muted">{t("insights.trend.rentNoPsf", "Rent series have no price per square foot, so they are not drawn for this measure.")}</p> : null}
          {failed.length ? <p className="text-xs text-down">{t("insights.trend.failed", "Some series could not be loaded.")}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              {t("common.source", "Source")}: {t("insights.trend.source", "HDB resale prices and rental approvals (data.gov.sg); URA private transactions and rentals. Monthly medians.")}
            </p>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={copyLink}>
                <Link2 className="size-4" aria-hidden />
                {copied ? t("next.copied", "Link copied") : t("insights.trend.share", "Copy share link")}
              </Button>
              <CsvButton chart={chart} name={`trend-${state.metric}`} />
            </div>
          </div>
        </CardBody>
      </Card>

      {plotted.length ? (
        <Card>
          <DataTable columns={summaryCols} rows={plotted} rowKey={(r) => r.key} />
        </Card>
      ) : null}

      {!allowed && !viewerLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Lock className="size-4" aria-hidden />
          {t("insights.trend.freeNote", "Free: one national HDB series at a time. Plus: up to six series from any town, rent or private segment.")}
        </p>
      ) : null}
    </div>
  );
}
