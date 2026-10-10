import { Suspense } from "react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/notice";
import { PageContainer, PageHeader } from "@/components/ui/section";
import { T } from "@/components/i18n/t";
import { TrendBuilder } from "@/components/insights/trend-builder";
import { getStats } from "@/lib/data/stats";
import { yearOfMonth } from "@/lib/data/months";
import { groupSeriesKeys } from "@/lib/insights/series-keys";
import { memoBySnapshot } from "@/lib/insights/memo";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 86400;

export const metadata = pageMetadata({
  title: "Trend builder: chart Singapore property prices",
  description: "Draw your own trend lines from monthly HDB and private property statistics: median price, price per square foot or transaction volume, by town, flat type, market segment or district. Shareable links.",
  path: "/trendmaker/",
});

/** Series keys and labels (public metadata) plus the overall year range of the data. */
function trendCatalogue() {
  return memoBySnapshot("trend-catalogue", () => {
    const series = getStats().series;
    let min = Infinity;
    let max = -Infinity;
    for (const s of series) {
      for (const p of s.points) {
        if (p.m < min) min = p.m;
        if (p.m > max) max = p.m;
      }
    }
    return {
      groups: groupSeriesKeys(series.map((s) => ({ key: s.key, label: s.label }))),
      minYear: Number.isFinite(min) ? yearOfMonth(min) : 1990,
      maxYear: Number.isFinite(max) ? yearOfMonth(max) : new Date().getUTCFullYear(),
      hasNational: series.some((s) => s.key === "hdb:ALL:ALL"),
    };
  });
}

export default function TrendMakerPage() {
  const { groups, minYear, maxYear, hasNational } = trendCatalogue();
  const defaultKey = hasNational ? "hdb:ALL:ALL" : (groups[0]?.options[0]?.key ?? null);
  return (
    <PageContainer className="pb-16">
      <Breadcrumbs items={[{ label: "Insights", href: "/insights/", k: "nav.insights" }, { label: "Trend builder", k: "insights.trend.title" }]} />
      <PageHeader
        eyebrow={<T k="insights.page.eyebrow" fallback="Market insights" />}
        title={<T k="insights.trend.title" fallback="Trend builder" />}
        description={
          <T
            k="insights.trend.intro"
            fallback="Chart monthly medians and volumes from HDB and URA records. Pick a series, a measure and a date range; the address bar keeps your choices, so you can share the link."
          />
        }
      />
      {groups.length === 0 ? (
        <EmptyState title={<T k="insights.empty.title" fallback="No market data yet" />}>
          <T k="insights.trend.noSeries" fallback="Monthly series appear once HDB resale records (data.gov.sg) or URA private data are in the dataset." />
        </EmptyState>
      ) : (
        <Suspense fallback={<div className="h-[520px] animate-pulse rounded-xl bg-canvas" role="status"><span className="sr-only"><T k="common.loading" fallback="Loading…" /></span></div>}>
          <TrendBuilder groups={groups} defaultKey={defaultKey} minYear={minYear} maxYear={maxYear} />
        </Suspense>
      )}
    </PageContainer>
  );
}
