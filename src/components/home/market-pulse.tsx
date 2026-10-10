import type { ReactNode } from "react";
import { formatInt, formatMonth, formatPctSigned, formatSgd } from "@/lib/format";
import { formatMonthRange, windowLabels, type MarketPulse as MarketPulseData } from "@/lib/home-insights";
import { T } from "@/components/i18n/t";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/notice";
import { Stat } from "@/components/ui/stat";
import { TimeSeriesChart, type TimeSeries } from "@/components/charts/time-series-chart";
import { SourceLine } from "./source-line";

function FamilyStats({ pulse, titleKey, title }: { pulse: MarketPulseData; titleKey: string; title: string }) {
  const { yoy } = pulse;
  const now = windowLabels(yoy.end, yoy.months);
  const before = windowLabels(yoy.end - 12, yoy.months);
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-semibold text-ink">
        <T k={titleKey} fallback={title} />
      </h3>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <Stat
          label={<T k="home.pulse.median" fallback="Median price, {range}" vars={{ range: formatMonthRange(now) }} />}
          value={yoy.current ? formatSgd(yoy.current.medianPrice) : "—"}
          sub={
            yoy.change != null ? (
              <span className={yoy.change > 0 ? "text-up" : yoy.change < 0 ? "text-down" : undefined}>
                <T k="home.pulse.yoy" fallback="{change} vs {range}" vars={{ change: formatPctSigned(yoy.change), range: formatMonthRange(before) }} />
              </span>
            ) : yoy.current ? (
              <T k="home.pulse.noPrev" fallback="No sales a year earlier to compare" />
            ) : (
              <T k="home.pulse.noCurrent" fallback="No sales recorded in these months" />
            )
          }
        />
        <Stat
          label={<T k="home.pulse.sales" fallback="Sales in {month}" vars={{ month: formatMonth(now.to) }} />}
          value={formatInt(pulse.salesLastMonth)}
          sub={yoy.current ? <T k="home.pulse.salesWindow" fallback="{count} sales over {months} months" vars={{ count: formatInt(yoy.current.count), months: yoy.months }} /> : undefined}
        />
      </div>
    </div>
  );
}

function MissingFamily({ titleKey, title, children }: { titleKey: string; title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-semibold text-ink">
        <T k={titleKey} fallback={title} />
      </h3>
      <p className="mt-2 text-sm text-muted">{children}</p>
    </div>
  );
}

/**
 * Market pulse card: latest three complete months vs the same months a year earlier for HDB resale and
 * private homes, plus a five-year chart of monthly medians. Sits under an h2, so its headings are h3.
 */
export function MarketPulse({ hdb, privateHomes, className }: { hdb: MarketPulseData | null; privateHomes: MarketPulseData | null; className?: string }) {
  if (!hdb && !privateHomes) {
    return (
      <Card className={className}>
        <CardBody>
          <EmptyState title={<T k="home.pulse.emptyTitle" fallback="No transaction data loaded yet" />}>
            <T k="home.pulse.emptyBody" fallback="Prices appear once HDB resale records (data.gov.sg) or URA private transactions are ingested." />
          </EmptyState>
        </CardBody>
      </Card>
    );
  }

  const series: TimeSeries[] = [];
  if (hdb && hdb.points.length > 0) series.push({ name: "HDB resale", points: hdb.points });
  if (privateHomes && privateHomes.points.length > 0) series.push({ name: "Private homes", points: privateHomes.points });

  return (
    <Card className={className}>
      <CardBody>
        <div className="grid gap-6 md:grid-cols-2">
          {hdb ? (
            <FamilyStats pulse={hdb} titleKey="home.pulse.hdb" title="HDB resale" />
          ) : (
            <MissingFamily titleKey="home.pulse.hdb" title="HDB resale">
              <T k="home.pulse.noHdb" fallback="HDB resale prices appear once records from data.gov.sg are ingested." />
            </MissingFamily>
          )}
          {privateHomes ? (
            <FamilyStats pulse={privateHomes} titleKey="home.pulse.private" title="Private homes" />
          ) : (
            <MissingFamily titleKey="home.pulse.private" title="Private homes">
              <T k="home.pulse.noPrivate" fallback="Private-home prices appear once URA private transaction data is connected (needs a URA Data Service access key)." />
            </MissingFamily>
          )}
        </div>

        {series.length > 0 ? (
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold text-ink">
              <T k="home.pulse.chart" fallback="Monthly median price, last five years" />
            </h3>
            <TimeSeriesChart
              series={series}
              yFormat="sgdCompact"
              height={240}
              ariaLabel={`Line chart of monthly median prices over the last five years: ${series.map((s) => s.name).join(" and ")}`}
            />
          </div>
        ) : null}

        <p className="mt-4 text-xs text-muted">
          <T k="home.pulse.method" fallback="Three-month figures combine monthly medians weighted by the number of sales. The month in progress is excluded." />
        </p>
        <SourceLine className="mt-1">
          {hdb ? <T k="home.source.hdb" fallback="HDB resale prices, data.gov.sg" /> : null}
          {hdb && privateHomes ? "; " : null}
          {privateHomes ? <T k="home.source.private" fallback="URA private residential transactions" /> : null}
          {!hdb && !privateHomes ? "—" : null}
        </SourceLine>
      </CardBody>
    </Card>
  );
}
