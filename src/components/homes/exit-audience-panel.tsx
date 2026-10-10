"use client";

import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { Stat, StatGrid } from "@/components/ui/stat";
import { DataTable } from "@/components/ui/table";
import { Notice } from "@/components/ui/notice";
import { SimpleBarChart } from "@/components/charts/bar-chart";
import { useGatedJson } from "@/components/gating/use-gated-json";
import { useT } from "@/lib/i18n/provider";
import { formatDistance, formatInt } from "@/lib/format";
import type { ExitAudienceBlock, ExitAudienceResult } from "@/lib/homes/types";

/**
 * Plus panel: likely buyers / sellers around a listing from HDB MOP timing. Fetches its own data from
 * the gated GET /api/homes/<id>/exit-audience/ (render inside <GatedPanel feature="homes.exit-audience">).
 */
export function ExitAudiencePanel({ listingId }: { listingId: string }) {
  const t = useT();
  const { data, error, loading } = useGatedJson<ExitAudienceResult>(`/api/homes/${listingId}/exit-audience/`);

  if (loading) return <div className="h-48 animate-pulse rounded-xl bg-canvas" aria-busy="true" aria-label={t("common.loading", "Loading…")} />;
  if (error || !data) return <Notice tone="warn">{t("common.error", "Something went wrong. Please try again.")}</Notice>;
  if (!data.available) {
    return (
      <Notice>
        {data.reason === "no-location"
          ? t("homes.exit.noLocation", "This listing has no map location, so nearby flats cannot be counted.")
          : t("homes.exit.noHdbData", "HDB block information (data.gov.sg) is not loaded on this deployment, so nearby flats cannot be counted.")}
      </Notice>
    );
  }

  const isHdb = data.audience === "hdb";
  const radius = formatDistance(data.radiusM);
  const years = `${data.fromYear}–${data.toYear}`;

  return (
    <Card>
      <CardBody className="space-y-5">
        <p className="text-sm text-muted">
          {isHdb
            ? t(
                "homes.exit.hdbIntro",
                "HDB flats within {radius} that reach their 5-year minimum occupation period (MOP) in {years}. Their owners become free to sell and upgrade, so they are the likely movers around this home: competing sellers, and buyers for whatever they move into.",
                { radius, years },
              )
            : t(
                "homes.exit.privateIntro",
                "HDB flats within {radius} that passed their 5-year minimum occupation period (MOP) in {years}. Owners past MOP can sell and buy private property, so this is the nearby pool of likely upgrader buyers.",
                { radius, years },
              )}
        </p>
        <StatGrid>
          <Stat label={t("homes.exit.units", "Flats")} value={formatInt(data.totalUnits)} sub={isHdb ? t("homes.exit.unitsSubHdb", "reaching MOP {years}", { years }) : t("homes.exit.unitsSubPrivate", "past MOP {years}", { years })} />
          <Stat label={t("homes.exit.blocks", "Blocks")} value={formatInt(data.totalBlocks)} sub={t("homes.exit.within", "within {radius}", { radius })} />
        </StatGrid>
        {data.totalUnits > 0 ? (
          <>
            <SimpleBarChart
              data={data.cohorts.map((c) => ({ label: String(c.year), value: c.units }))}
              yFormat="int"
              height={200}
              ariaLabel={`HDB flats ${isHdb ? "reaching" : "that reached"} MOP by year within ${radius}: ${data.cohorts.map((c) => `${c.year} ${c.units}`).join(", ")}`}
            />
            <DataTable<ExitAudienceBlock>
              dense
              rows={data.topBlocks}
              rowKey={(r) => r.slug}
              columns={[
                {
                  key: "block",
                  header: t("homes.exit.colBlock", "Block"),
                  cell: (r) => (
                    <Link href={`/hdb/${r.slug}/`} className="font-medium text-brand-700 hover:underline">
                      {r.label}
                    </Link>
                  ),
                },
                { key: "town", header: t("homes.exit.colTown", "Town"), cell: (r) => r.town },
                { key: "mop", header: t("homes.exit.colMop", "MOP year"), cell: (r) => r.mopYear, align: "right" },
                { key: "units", header: t("homes.exit.colUnits", "Flats"), cell: (r) => formatInt(r.units), align: "right" },
                { key: "dist", header: t("homes.exit.colDistance", "Distance"), cell: (r) => formatDistance(r.distanceM), align: "right" },
              ]}
            />
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            {isHdb
              ? t("homes.exit.noneHdb", "No HDB blocks within {radius} reach MOP in {years}.", { radius, years })
              : t("homes.exit.nonePrivate", "No HDB blocks within {radius} passed MOP in {years}.", { radius, years })}
          </p>
        )}
        {data.excludedBlocks > 0 ? (
          <p className="text-xs text-muted">{t("homes.exit.excluded", "{n} nearby blocks are left out because their completion year or flat count is not published.", { n: data.excludedBlocks })}</p>
        ) : null}
        <p className="text-xs text-muted">
          {t("homes.exit.method", "Heuristic: MOP year = year completed + 5; straight-line distance; counts all flats in each block (sold and rental). An indicator of nearby demand, not a forecast.")}{" "}
          {t("common.source", "Source")}: {t("homes.exit.source", "HDB property information, data.gov.sg")}
        </p>
      </CardBody>
    </Card>
  );
}
