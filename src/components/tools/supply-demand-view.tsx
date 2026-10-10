"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat, StatGrid } from "@/components/ui/stat";
import { DataTable } from "@/components/ui/table";
import { Notice } from "@/components/ui/notice";
import { SimpleBarChart } from "@/components/charts/bar-chart";
import { useGatedJson } from "@/components/gating/use-gated-json";
import { useT } from "@/lib/i18n/provider";
import { formatInt } from "@/lib/format";
import type { SupplyDemandResult } from "@/lib/tools/supply-demand";
import { Segmented, SourceLine } from "./controls";

type Response = SupplyDemandResult & { property: { label: string; href: string } };

const RADII = ["1000", "2000", "3000"] as const;
type RadiusOpt = (typeof RADII)[number];

/** Plus view of /api/gated/supply-demand/<slug>/: MOP cohorts vs private completions by year. */
export function SupplyDemandView({ slug, currentYear }: { slug: string; currentYear: number }) {
  const t = useT();
  const [radius, setRadius] = useState<RadiusOpt>("2000");
  const { data, error, loading, status } = useGatedJson<Response>(`/api/gated/supply-demand/${encodeURIComponent(slug)}/?radius=${radius}`);

  return (
    <Card>
      <CardHeader
        title={t("tools.sd.plusTitle", "Upgrader demand vs new private supply")}
        actions={
          <Segmented
            label={t("tools.sd.radius", "Radius")}
            hideLabel
            value={radius}
            onChange={setRadius}
            options={RADII.map((r) => ({ value: r, label: `${Number(r) / 1000} km` }))}
          />
        }
      />
      <CardBody className="space-y-6">
        {loading ? (
          <div className="h-72 animate-pulse rounded-lg bg-canvas" role="status">
            <span className="sr-only">{t("common.loading", "Loading…")}</span>
          </div>
        ) : null}
        {!loading && error ? (
          <Notice tone="warn">
            {status === 422
              ? t("tools.sd.noLocation", "This property has no map location yet, so nearby supply and demand cannot be measured.")
              : status === 401 || status === 402
                ? t("tools.val.noAccess", "Your session has ended or your plan does not include this. Refresh the page to sign in again.")
                : t("common.error", "Something went wrong. Please try again.")}
          </Notice>
        ) : null}
        {!loading && data ? <Result data={data} currentYear={currentYear} /> : null}
      </CardBody>
    </Card>
  );
}

function Result({ data, currentYear }: { data: Response; currentYear: number }) {
  const t = useT();
  const km = data.radiusM / 1000;
  // without any launch records supply is unknown, not zero: show "—" and say why instead of "no new supply"
  const noLaunchData = !data.launchData;
  const supplyCell = (n: number) => (noLaunchData ? "—" : formatInt(n));
  const ratioText = noLaunchData
    ? t("tools.sd.noLaunchData", "Launch data not loaded")
    : data.totals.ratio == null
      ? t("tools.sd.ratioNoSupply", "No new private supply recorded in range")
      : t("tools.sd.ratioValue", "{r} flats per new private unit", { r: data.totals.ratio.toFixed(data.totals.ratio < 10 ? 2 : 1) });
  return (
    <div className="space-y-6">
      <StatGrid>
        <Stat
          label={t("tools.sd.mopTotal", "HDB flats reaching MOP")}
          value={formatInt(data.totals.mopUnits)}
          sub={t("tools.sd.years", "{from}–{to}, within {km} km", { from: data.fromYear, to: data.toYear, km })}
        />
        <Stat
          label={t("tools.sd.supplyTotal", "Private units completing")}
          value={supplyCell(data.totals.supplyUnits)}
          sub={noLaunchData ? t("tools.sd.noLaunchData", "Launch data not loaded") : t("tools.sd.years", "{from}–{to}, within {km} km", { from: data.fromYear, to: data.toYear, km })}
        />
        <Stat label={t("tools.sd.ratio", "Demand to supply")} value={data.totals.ratio == null ? "—" : `${data.totals.ratio.toFixed(data.totals.ratio < 10 ? 2 : 1)}×`} sub={ratioText} />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">{t("tools.sd.mopChart", "HDB flats reaching MOP, by year")}</h3>
          <SimpleBarChart
            data={data.rows.map((r) => ({ label: String(r.year), value: r.mopUnits, color: r.year === currentYear ? "#0e9384" : undefined }))}
            height={220}
            ariaLabel={t("tools.sd.mopChartAria", "Bar chart of HDB flats within {km} km reaching their minimum occupation period each year from {from} to {to}", { km, from: data.fromYear, to: data.toYear })}
          />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">{t("tools.sd.supplyChart", "Private units completing, by year")}</h3>
          {noLaunchData ? (
            <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-line px-4 text-center text-sm text-muted">
              {t("tools.sd.noLaunchDataBody", "No new-launch records (URA project pipeline) are loaded yet, so new private supply cannot be measured. It is not zero, just unknown.")}
            </div>
          ) : (
            <SimpleBarChart
              data={data.rows.map((r) => ({ label: String(r.year), value: r.supplyUnits }))}
              height={220}
              color="#f19414"
              ariaLabel={t("tools.sd.supplyChartAria", "Bar chart of private homes within {km} km expected to complete each year from {from} to {to}", { km, from: data.fromYear, to: data.toYear })}
            />
          )}
        </div>
      </div>

      <DataTable
        dense
        rows={data.rows}
        rowKey={(r) => String(r.year)}
        columns={[
          { key: "y", header: t("tools.sd.colYear", "Year"), cell: (r) => (r.year === currentYear ? <strong>{r.year}</strong> : r.year) },
          { key: "mop", header: t("tools.sd.colMop", "Flats reaching MOP"), align: "right", cell: (r) => formatInt(r.mopUnits) },
          { key: "blocks", header: t("tools.sd.colBlocks", "Blocks"), align: "right", cell: (r) => formatInt(r.mopBlocks) },
          { key: "supply", header: t("tools.sd.colSupply", "Private units completing"), align: "right", cell: (r) => supplyCell(r.supplyUnits) },
          {
            key: "projects",
            header: t("tools.sd.colProjects", "Projects"),
            cell: (r) => <span className="block max-w-72 whitespace-normal text-xs text-muted">{r.supplyProjects.length ? r.supplyProjects.join(", ") : "—"}</span>,
          },
        ]}
      />

      <div className="space-y-1 text-xs text-muted">
        <h3 className="text-sm font-semibold text-ink">{t("tools.sd.limitsTitle", "Limitations")}</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t("tools.sd.limit1", "MOP year is estimated as the block's completion year + 5. Prime Location Housing, Plus and Prime flats carry a 10-year MOP but are not flagged in the public data, so they reach it later than shown.")}</li>
          <li>{t("tools.sd.limit2", "Not every owner upgrades at MOP; the count is the pool of flats that become eligible, not buyers.")}</li>
          <li>
            {t(
              "tools.sd.limit6",
              "Unit counts are each block's total dwelling units, which include any HDB rental flats in the block; rental flats have no MOP, so the count can be slightly high.",
            )}
          </li>
          <li>
            {t("tools.sd.limit3", "Supply counts only projects in our new-launch list with a known completion year and unit count ({usable} of {total} listed), placed at their mapped location.", {
              usable: data.coverage.launchesUsable,
              total: data.coverage.launchesTotal,
            })}
          </li>
          {data.coverage.blocksMissingCoordsOrYear > 0 ? (
            <li>
              {t("tools.sd.limit4", "{n} HDB blocks have no map location, completion year or unit count and are left out.", { n: formatInt(data.coverage.blocksMissingCoordsOrYear) })}
            </li>
          ) : null}
          <li>{t("tools.sd.limit5", "Distances are straight-line from the property.")}</li>
        </ul>
        <SourceLine>
          {t("common.source", "Source")}: {t("tools.sd.sources", "HDB property information (data.gov.sg); URA project pipeline and new-launch records.")}
        </SourceLine>
      </div>
    </div>
  );
}
