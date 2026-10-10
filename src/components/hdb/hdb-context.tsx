"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Notice } from "@/components/ui/notice";
import { Stat, StatGrid } from "@/components/ui/stat";
import { DataTable } from "@/components/ui/table";
import { SimpleBarChart } from "@/components/charts/bar-chart";
import { PlusBadge } from "@/components/gating/gated-panel";
import { useT } from "@/lib/i18n/provider";
import { formatDistance, formatInt, formatMonth, formatPct, formatSgd } from "@/lib/format";
import { titleCase } from "@/lib/slug";
import { HDB_MOP_YEARS } from "@/lib/calc/rules";
import { flatTypeLabel, type HdbContextData, type LaunchRow, type MopBlockRow, type YieldRow } from "@/lib/hdb-insights";

/* ------------------------------------------------------------------ */
/* Shared fetch: both panels read GET /api/gated/hdb/<slug>/context/  */
/* ------------------------------------------------------------------ */

const contextCache = new Map<string, Promise<HdbContextData>>();

function loadContext(url: string): Promise<HdbContextData> {
  let p = contextCache.get(url);
  if (!p) {
    p = fetch(url, { credentials: "same-origin" }).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as HdbContextData;
    });
    // only successful responses are shared; a failure (e.g. signed out) is retried on the next mount
    p.catch(() => contextCache.delete(url));
    contextCache.set(url, p);
  }
  return p;
}

function useBlockContext(slug: string): { data: HdbContextData | null; error: boolean } {
  const url = `/api/gated/hdb/${encodeURIComponent(slug)}/context/`;
  const [state, setState] = useState<{ url: string; data: HdbContextData | null; error: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadContext(url).then(
      (data) => {
        if (!cancelled) setState({ url, data, error: false });
      },
      () => {
        if (!cancelled) setState({ url, data: null, error: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url]);
  const current = state?.url === url ? state : null;
  return { data: current?.data ?? null, error: current?.error ?? false };
}

function Loading({ label }: { label: string }) {
  return (
    <div className="min-h-40 animate-pulse rounded-xl bg-canvas" aria-busy="true">
      <span className="sr-only">{label}</span>
    </div>
  );
}

function Source({ children }: { children: string }) {
  const t = useT();
  return (
    <p className="mt-3 text-xs text-muted">
      {t("common.source", "Source")}: {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Section 6: rental demand                                            */
/* ------------------------------------------------------------------ */

export function HdbRentalDemand({ slug }: { slug: string }) {
  const t = useT();
  const { data, error } = useBlockContext(slug);
  if (error) return <Notice tone="warn">{t("common.error", "Something went wrong. Please try again.")}</Notice>;
  if (!data) return <Loading label={t("common.loading", "Loading…")} />;

  const { rentals, yields } = data;
  const town = titleCase(data.town);
  const yieldPct = (v: number | null) => (v == null ? "—" : formatPct(v, 1));

  return (
    <div className="space-y-4">
      {!data.rentalsAvailable ? (
        <EmptyState title={t("hdb.rent.unavailableTitle", "Rental data not loaded")}>
          {t("hdb.rent.unavailable", "This deployment has no HDB rental approvals yet (HDB renting out of flats, data.gov.sg).")}
        </EmptyState>
      ) : (
        <Card>
          <CardHeader
            title={t("hdb.rent.approvalsTitle", "Rental approvals in this block")}
            description={
              rentals.fromMonth && rentals.toMonth
                ? t("hdb.rent.window", "{count} approvals in the 24 months from {from} to {to}", { count: rentals.total, from: formatMonth(rentals.fromMonth), to: formatMonth(rentals.toMonth) })
                : null
            }
          />
          <CardBody className="px-2 py-2">
            <DataTable
              rows={rentals.byFlatType}
              rowKey={(r) => r.flatType}
              empty={t("hdb.rent.none", "No rental approvals recorded for this block in the last 24 months.")}
              columns={[
                { key: "type", header: t("hdb.col.flatType", "Flat type"), cell: (r) => flatTypeLabel(r.flatType) },
                { key: "count", header: t("hdb.col.approvals", "Approvals"), cell: (r) => formatInt(r.count), align: "right" },
                { key: "rent", header: t("hdb.col.medianRent", "Median rent"), cell: (r) => `${formatSgd(r.medianRent)}/mo`, align: "right", className: "font-medium" },
              ]}
            />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title={t("hdb.rent.yieldTitle", "Gross rental yield (estimate)")}
          description={t("hdb.rent.yieldDesc", "Median monthly rent × 12 ÷ median resale price, both over the 12 months to the latest data. Before costs, tax and vacancy.")}
        />
        <CardBody className="px-2 py-2">
          <DataTable<YieldRow>
            rows={yields.rows}
            rowKey={(r) => r.flatType}
            empty={t("hdb.rent.noYield", "No flat types to compare yet.")}
            columns={[
              { key: "type", header: t("hdb.col.flatType", "Flat type"), cell: (r) => flatTypeLabel(r.flatType) },
              {
                key: "price",
                header: t("hdb.col.blockPrice", "Block median price"),
                cell: (r) => (r.medianPrice == null ? "—" : `${formatSgd(r.medianPrice)} (${r.saleCount})`),
                align: "right",
              },
              {
                key: "rent",
                header: t("hdb.col.blockRent", "Block median rent"),
                cell: (r) => (r.medianRent == null ? "—" : `${formatSgd(r.medianRent)} (${r.rentCount})`),
                align: "right",
              },
              { key: "yield", header: t("hdb.col.blockYield", "Block yield"), cell: (r) => yieldPct(r.grossYield), align: "right", className: "font-medium" },
              { key: "townRent", header: t("hdb.col.townRent", "{town} median rent", { town }), cell: (r) => (r.townMedianRent == null ? "—" : formatSgd(r.townMedianRent)), align: "right" },
              { key: "townYield", header: t("hdb.col.townYield", "{town} yield", { town }), cell: (r) => yieldPct(r.townGrossYield), align: "right" },
            ]}
          />
          <p className="px-3 pb-1 pt-2 text-xs text-muted">
            {t("hdb.rent.yieldNote", "Figures in brackets are the number of sales or rental approvals behind each median. A dash means this block had none in the window.")}
            {yields.salesToMonth ? ` ${t("hdb.rent.salesTo", "Sales to {month}", { month: formatMonth(yields.salesToMonth) })}.` : ""}
            {yields.rentalsToMonth ? ` ${t("hdb.rent.rentalsTo", "Rentals to {month}", { month: formatMonth(yields.rentalsToMonth) })}.` : ""}
          </p>
        </CardBody>
      </Card>
      <Source>{t("hdb.source.rentals", "HDB renting out of flats and HDB resale prices, data.gov.sg")}</Source>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section 7: competing supply                                         */
/* ------------------------------------------------------------------ */

export function HdbCompetingSupply({ slug }: { slug: string }) {
  const t = useT();
  const { data, error } = useBlockContext(slug);
  if (error) return <Notice tone="warn">{t("common.error", "Something went wrong. Please try again.")}</Notice>;
  if (!data) return <Loading label={t("common.loading", "Loading…")} />;
  const { mop, launches } = data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={t("hdb.supply.mopTitle", "HDB flats reaching MOP nearby")}
          description={
            mop
              ? t("hdb.supply.mopDesc", "Blocks within {radius} whose flats reach their {mopYears}-year MOP in {from}–{to}, when owners may first sell on the open market.", {
                  radius: formatDistance(mop.radiusM),
                  mopYears: HDB_MOP_YEARS,
                  from: mop.fromYear,
                  to: mop.toYear,
                })
              : null
          }
        />
        <CardBody>
          {!mop ? (
            <p className="text-sm text-muted">{t("hdb.supply.noCoords", "This block has no coordinates yet (OneMap), so nearby supply cannot be measured.")}</p>
          ) : mop.totalBlocks === 0 ? (
            <p className="text-sm text-muted">{t("hdb.supply.noMop", "No completed HDB blocks within {radius} reach MOP in {from}–{to}.", { radius: formatDistance(mop.radiusM), from: mop.fromYear, to: mop.toYear })}</p>
          ) : (
            <div className="space-y-4">
              <StatGrid className="lg:grid-cols-3">
                <Stat label={t("hdb.supply.blocks", "Blocks")} value={formatInt(mop.totalBlocks)} />
                <Stat
                  label={t("hdb.supply.flats", "Flats")}
                  value={formatInt(mop.totalUnits)}
                  sub={mop.blocksWithoutUnits > 0 ? t("hdb.supply.unknownUnits", "{count} blocks without a published flat count", { count: mop.blocksWithoutUnits }) : null}
                />
              </StatGrid>
              {mop.totalUnits > 0 ? (
                <SimpleBarChart
                  data={mop.byYear.map((y) => ({ label: String(y.year), value: y.units }))}
                  yFormat="int"
                  height={200}
                  ariaLabel={`Flats reaching MOP within ${formatDistance(mop.radiusM)} by year, ${mop.fromYear} to ${mop.toYear}.`}
                />
              ) : null}
              <DataTable<MopBlockRow>
                rows={mop.blocks}
                rowKey={(r) => r.slug}
                dense
                columns={[
                  {
                    key: "block",
                    header: t("hdb.col.block", "Block"),
                    cell: (r) => (
                      <Link href={`/hdb/${r.slug}/`} className="font-medium text-brand-700 hover:underline">
                        {r.label}
                      </Link>
                    ),
                  },
                  { key: "mop", header: t("hdb.col.mopYear", "MOP (approx.)"), cell: (r) => r.mopYear, align: "right" },
                  { key: "completed", header: t("hdb.col.completed", "Completed"), cell: (r) => r.yearCompleted, align: "right" },
                  { key: "units", header: t("hdb.col.units", "Flats"), cell: (r) => formatInt(r.dwellingUnits), align: "right" },
                  { key: "distance", header: t("hdb.col.distance", "Distance"), cell: (r) => formatDistance(r.distanceM), align: "right" },
                ]}
              />
              {mop.totalBlocks > mop.blocks.length ? (
                <p className="text-xs text-muted">{t("hdb.supply.capped", "Showing the first {shown} of {total} blocks.", { shown: mop.blocks.length, total: mop.totalBlocks })}</p>
              ) : null}
            </div>
          )}
          <p className="mt-3 text-xs text-muted">
            {t("hdb.supply.mopCaveat", "Counts only completed blocks in HDB's property information; flats still under construction are not included. MOP counts from key collection, so years are approximate.")}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("hdb.supply.launchTitle", "New private launches nearby")}
          description={t("hdb.supply.launchDesc", "Launched and upcoming private projects within {radius}.", { radius: formatDistance(launches.radiusM) })}
        />
        <CardBody className="px-2 py-2">
          {!launches.available ? (
            <p className="px-3 py-2 text-sm text-muted">
              {t("hdb.supply.noPrivate", "Private launch data is not loaded on this deployment (URA developer sales and pipeline data need a URA API key).")}
            </p>
          ) : launches.rows == null ? (
            <p className="px-3 py-2 text-sm text-muted">{t("hdb.supply.noCoords", "This block has no coordinates yet (OneMap), so nearby supply cannot be measured.")}</p>
          ) : (
            <DataTable<LaunchRow>
              rows={launches.rows}
              rowKey={(r) => `${r.type}-${r.slug}`}
              dense
              empty={t("hdb.supply.noLaunches", "No launched or upcoming private projects within {radius}.", { radius: formatDistance(launches.radiusM) })}
              columns={[
                {
                  key: "name",
                  header: t("hdb.col.project", "Project"),
                  cell: (r) => (
                    <Link href={r.href} className="font-medium text-brand-700 hover:underline">
                      {r.name}
                    </Link>
                  ),
                },
                {
                  key: "status",
                  header: t("hdb.col.status", "Status"),
                  cell: (r) => <Badge tone={r.status === "launched" ? "brand" : "info"}>{r.status === "launched" ? t("hdb.supply.launched", "Launched") : t("hdb.supply.upcoming", "Upcoming")}</Badge>,
                },
                { key: "units", header: t("hdb.col.totalUnits", "Units"), cell: (r) => formatInt(r.totalUnits), align: "right" },
                { key: "top", header: t("hdb.col.expectedTop", "Expected completion"), cell: (r) => r.expectedCompletionYear ?? "—", align: "right" },
                { key: "distance", header: t("hdb.col.distance", "Distance"), cell: (r) => formatDistance(r.distanceM), align: "right" },
              ]}
            />
          )}
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <Scale className="size-5 text-brand-700" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-ink">{t("hdb.supply.sdPitch", "Compare the HDB upgrader pool around this block with competing private supply, year by year.")}</p>
        <Link href={`/supply-demand/${slug}/`} className={buttonClass("outline", "sm")}>
          {t("hdb.supply.sdCta", "Demand vs supply")}
          <PlusBadge />
        </Link>
      </div>
      <Source>{t("hdb.source.supply", "HDB property information (data.gov.sg); URA new launches and pipeline")}</Source>
    </div>
  );
}
