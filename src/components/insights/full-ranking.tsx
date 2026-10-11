"use client";

import { useEffect, useId, useState } from "react";
import { GatedPanel } from "@/components/gating/gated-panel";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { formatInt } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import type { ListColumn, ListFilter, ListGroupDef, RankGroup } from "@/lib/rankings";
import { RankTable, type RankedRow } from "./rank-table";

const PAGE = 50;

export interface FullRankingDef {
  id: string;
  title: string;
  metricHeader: string;
  metricHeaderKey: string;
  columns: ListColumn[];
  groups: ListGroupDef[];
  filters: ListFilter[];
  defaultFlatType: string | null;
}

export interface RankingOptions {
  towns: { slug: string; name: string }[];
  flatTypes: string[];
  segments: string[];
}

interface Filters {
  group: RankGroup;
  town: string;
  flatType: string;
  segment: string;
}

interface Loaded {
  key: string;
  rows: RankedRow[];
  total: number;
  error: string | null;
}

function queryOf(f: Filters, def: FullRankingDef): string {
  const p = new URLSearchParams();
  p.set("group", f.group);
  if (f.town && def.filters.includes("town") && f.group === "hdb") p.set("town", f.town);
  if (f.flatType && def.filters.includes("flatType") && f.group === "hdb") p.set("flatType", f.flatType);
  if (f.segment && def.filters.includes("segment") && f.group !== "hdb" && f.group !== "town") p.set("segment", f.segment);
  return p.toString();
}

async function fetchPage(list: string, query: string, offset: number): Promise<{ rows: RankedRow[]; total: number } | { error: string }> {
  try {
    const res = await fetch(`/api/gated/lists/${encodeURIComponent(list)}/?${query}&offset=${offset}&limit=${PAGE}`, { credentials: "same-origin" });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) return { error: (body && (body.error as string)) || `HTTP ${res.status}` };
    return { rows: body.rows as RankedRow[], total: body.total as number };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "network_error" };
  }
}

function RankingExplorer({ def, options }: { def: FullRankingDef; options: RankingOptions }) {
  const t = useT();
  const uid = useId();
  const [filters, setFilters] = useState<Filters>({ group: def.groups[0].id, town: "", flatType: def.defaultFlatType ?? "", segment: "" });
  const [data, setData] = useState<Loaded | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const query = queryOf(filters, def);

  useEffect(() => {
    let cancelled = false;
    fetchPage(def.id, query, 0).then((r) => {
      if (cancelled) return;
      setData("error" in r ? { key: query, rows: [], total: 0, error: r.error } : { key: query, rows: r.rows, total: r.total, error: null });
    });
    return () => {
      cancelled = true;
    };
  }, [def.id, query]);

  const current = data && data.key === query ? data : null;

  async function loadMore() {
    if (!current || loadingMore) return;
    setLoadingMore(true);
    const r = await fetchPage(def.id, query, current.rows.length);
    setLoadingMore(false);
    if ("error" in r) return;
    setData((prev) => (prev && prev.key === query ? { ...prev, rows: [...prev.rows, ...r.rows.filter((row) => !prev.rows.some((p) => p.id === row.id))], total: r.total } : prev));
  }

  const isHdbLike = filters.group === "hdb" || filters.group === "town";
  const showTown = def.filters.includes("town") && filters.group === "hdb";
  const showFlatType = def.filters.includes("flatType") && filters.group === "hdb";
  const showSegment = def.filters.includes("segment") && !isHdbLike;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {def.groups.length > 1 ? (
          <Field label={t("insights.filter.show", "Show")} htmlFor={`${uid}-group`}>
            <Select id={`${uid}-group`} value={filters.group} onChange={(e) => setFilters({ group: e.target.value as RankGroup, town: "", flatType: def.defaultFlatType ?? "", segment: "" })}>
              {def.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {t(g.labelKey, g.label)}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {showTown ? (
          <Field label={t("insights.filter.town", "Town")} htmlFor={`${uid}-town`}>
            <Select id={`${uid}-town`} value={filters.town} onChange={(e) => setFilters({ ...filters, town: e.target.value })}>
              <option value="">{t("insights.filter.allTowns", "All towns")}</option>
              {options.towns.map((o) => (
                <option key={o.slug} value={o.slug}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {showFlatType ? (
          <Field label={t("insights.filter.flatType", "Flat type")} htmlFor={`${uid}-ft`}>
            <Select id={`${uid}-ft`} value={filters.flatType} onChange={(e) => setFilters({ ...filters, flatType: e.target.value })}>
              {def.defaultFlatType === "ALL" ? <option value="ALL">{t("insights.filter.allTypesBlock", "All flat types (block median)")}</option> : <option value="">{t("insights.filter.anyType", "Any flat type")}</option>}
              {options.flatTypes.map((ft) => (
                <option key={ft} value={ft}>
                  {ft}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {showSegment ? (
          <Field label={t("insights.filter.segment", "Market segment")} htmlFor={`${uid}-seg`}>
            <Select id={`${uid}-seg`} value={filters.segment} onChange={(e) => setFilters({ ...filters, segment: e.target.value })}>
              <option value="">{t("insights.filter.allSegments", "All segments")}</option>
              {options.segments.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>

      {!current ? (
        <div className="h-64 animate-pulse rounded-xl bg-canvas" role="status">
          <span className="sr-only">{t("common.loading", "Loading…")}</span>
        </div>
      ) : current.error ? (
        <Notice tone="warn">{current.error === "plus_required" || current.error === "sign_in_required" ? t("gate.plusBody", "Start a free trial to unlock this section.") : t("common.error", "Something went wrong. Please try again.")}</Notice>
      ) : (
        <>
          <p className="text-sm text-muted" aria-live="polite">
            {t("insights.showing", "Showing {shown} of {total}", { shown: formatInt(current.rows.length), total: formatInt(current.total) })}
          </p>
          <div className="rounded-xl border border-line bg-surface">
            <RankTable rows={current.rows} metricHeader={def.metricHeader} metricHeaderKey={def.metricHeaderKey} columns={def.columns} empty={t("insights.noRows", "Nothing matches these filters yet.")} />
          </div>
          {current.rows.length < current.total ? (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? t("common.loading", "Loading…") : t("common.showMore", "Show more")}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Full ranking with filters, for Plus members. Data comes only from the gated list API. */
export function FullRanking({ def, options }: { def: FullRankingDef; options: RankingOptions }) {
  return (
    <GatedPanel feature="lists.full" minHeight={240}>
      <RankingExplorer def={def} options={options} />
    </GatedPanel>
  );
}
