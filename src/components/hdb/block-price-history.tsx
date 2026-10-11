import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/notice";
import { TimeSeriesChart, type TimeSeries } from "@/components/charts/time-series-chart";
import { T } from "@/components/i18n/t";
import { formatSgd } from "@/lib/format";
import { titleCase } from "@/lib/slug";
import { flatTypeLabel, periodLabel, type FlatTypeSeries, type Granularity } from "@/lib/hdb-insights";
import { SourceLine } from "./source-line";

const GRANULARITY: Record<Granularity, { k: string; fallback: string }> = {
  year: { k: "hdb.price.yearly", fallback: "Yearly medians, plotted at mid-year." },
  quarter: { k: "hdb.price.quarterly", fallback: "Quarterly medians, plotted at mid-quarter." },
  month: { k: "hdb.price.monthly", fallback: "Monthly medians." },
};

/** Fixed colour for the town comparison line so it never collides with the flat-type palette. */
const TOWN_COLOR = "#8a9a97";

/** Section 4 body: block median price per flat type, with the town median for the block's most common flat type. */
export function BlockPriceHistory({
  label,
  granularity,
  series,
  town,
}: {
  label: string;
  granularity: Granularity;
  series: FlatTypeSeries[];
  /** town median line for the most common flat type; null when the stats series is missing */
  town: { name: string; flatType: string; points: { x: number; y: number }[] } | null;
}) {
  if (series.length === 0) {
    return (
      <EmptyState title={<T k="hdb.price.emptyTitle" fallback="No resale prices to chart yet" />}>
        <T k="hdb.price.empty" fallback="HDB has not recorded a resale in this block. Prices appear here after the first resale (HDB resale prices, data.gov.sg)." />
      </EmptyState>
    );
  }

  const townName = town ? `${titleCase(town.name)} ${flatTypeLabel(town.flatType)} median` : null;
  const chartSeries: TimeSeries[] = series.map((s) => ({
    name: flatTypeLabel(s.flatType),
    points: s.points.map((p) => ({ x: p.x, y: p.y })),
    // a single period cannot draw a line; show it as a dot instead
    kind: s.points.length < 2 ? "scatter" : "line",
  }));
  if (town && town.points.length > 0 && townName) chartSeries.push({ name: townName, points: town.points, color: TOWN_COLOR });

  return (
    <div>
      <Card>
        <CardBody>
          <TimeSeriesChart
            series={chartSeries}
            yFormat="sgdCompact"
            height={300}
            ariaLabel={`Median resale price by flat type for ${label}${townName ? `, compared with the ${townName}` : ""}.`}
          />
          <p className="mt-2 text-xs text-muted">
            <T k={GRANULARITY[granularity].k} fallback={GRANULARITY[granularity].fallback} />{" "}
            {town ? (
              <T
                k="hdb.price.townNote"
                fallback="The grey line is the monthly median for {flatType} flats across {town}."
                vars={{ flatType: flatTypeLabel(town.flatType), town: titleCase(town.name) }}
              />
            ) : null}
          </p>
        </CardBody>
      </Card>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {series.map((s) => {
          const last = s.points[s.points.length - 1];
          return (
            <li key={s.flatType} className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-muted">{flatTypeLabel(s.flatType)}</div>
              <div className="tabular mt-1 font-semibold text-ink">{formatSgd(last.y)}</div>
              <div className="text-xs text-muted">
                {last.n === 1 ? (
                  <T k="hdb.price.latestPeriodOne" fallback="{period} · 1 sale" vars={{ period: periodLabel(last.x, granularity) }} />
                ) : (
                  <T k="hdb.price.latestPeriod" fallback="Median in {period} · {count} sales" vars={{ period: periodLabel(last.x, granularity), count: last.n }} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <SourceLine>
        <T k="hdb.source.resale" fallback="HDB resale prices, data.gov.sg" />
      </SourceLine>
    </div>
  );
}
