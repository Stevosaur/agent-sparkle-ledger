import Link from "next/link";
import { LineChart, Trophy } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Notice } from "@/components/ui/notice";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";
import { PlusBadge } from "@/components/gating/gated-panel";
import { T } from "@/components/i18n/t";
import { GatedInsight } from "@/components/insights/gated-insight";
import { InsightBody, InsightCard } from "@/components/insights/insight-card";
import { getCoverage, getMeta } from "@/lib/data/meta";
import { getTowns } from "@/lib/data/hdb";
import { formatMonth, formatPsf } from "@/lib/format";
import { ALL_INSIGHT_IDS, availableInsights, getInsight } from "@/lib/insights/modules";
import { pageMetadata } from "@/lib/seo";
import { titleCase } from "@/lib/slug";

export const revalidate = 86400;

export const metadata = pageMetadata({
  title: "Singapore property market insights",
  description: "HDB and private property market charts computed from government records: resale prices and volumes, prices by flat type and town, rents, yields, lease and storey effects, private segments, new-launch take-up and more.",
  path: "/insights/",
});

const REGION_ORDER = ["Central", "East", "North", "North-East", "West"];

export default function InsightsPage() {
  const meta = getMeta();
  const coverage = getCoverage();
  const modules = availableInsights();
  const hidden = ALL_INSIGHT_IDS.length - modules.length;
  const towns = [...getTowns()].sort((a, b) => REGION_ORDER.indexOf(a.region) - REGION_ORDER.indexOf(b.region) || a.town.localeCompare(b.town));
  const asOf = meta.latestMonth.hdb ?? meta.latestMonth.private;
  const missing: string[] = [];
  if (!coverage.hdb) missing.push("HDB resale prices (data.gov.sg)");
  if (!coverage.rentals) missing.push("HDB rental approvals (data.gov.sg)");
  if (!coverage.private) missing.push("URA private transactions (needs a URA Data Service key)");
  if (coverage.private && !coverage.privateRentals) missing.push("URA private rental contracts");
  if (!coverage.launches) missing.push("URA new-launch and pipeline data");

  return (
    <PageContainer className="pb-16">
      <Breadcrumbs items={[{ label: "Insights" }]} />
      <PageHeader
        eyebrow={<T k="insights.page.eyebrow" fallback="Market insights" />}
        title={<T k="insights.page.title" fallback="Singapore property market insights" />}
        description={<T k="insights.page.intro" fallback="Charts and short readings computed from HDB, URA and data.gov.sg records. The first six modules are free; the rest are part of Plus." />}
      >
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href="/trendmaker/" variant="secondary" size="sm">
            <LineChart className="size-4" aria-hidden />
            <T k="insights.trend.cta" fallback="Build your own trend line" />
          </ButtonLink>
          <ButtonLink href="/lists/" variant="outline" size="sm">
            <Trophy className="size-4" aria-hidden />
            <T k="insights.lists.cta" fallback="Rankings" />
          </ButtonLink>
          {asOf ? (
            <span className="text-sm text-muted">
              <T k="insights.dataTo" fallback="Data to {month}" vars={{ month: formatMonth(asOf) }} />
            </span>
          ) : null}
        </div>
      </PageHeader>

      {modules.length === 0 ? (
        <EmptyState title={<T k="insights.empty.title" fallback="No market data yet" />}>
          <T k="insights.empty.modules" fallback="Market modules appear once HDB resale records from data.gov.sg (and, for private modules, URA data) are in the dataset." />
        </EmptyState>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {modules.map((m) => {
            if (m.free) {
              const result = getInsight(m.id);
              if (!result) return null;
              return (
                <InsightCard key={m.id} id={m.id} title={m.title} teaser={m.teaser}>
                  <InsightBody result={result} />
                </InsightCard>
              );
            }
            return (
              <InsightCard key={m.id} id={m.id} title={m.title} teaser={m.teaser} badge={<PlusBadge />}>
                <GatedInsight id={m.id} />
              </InsightCard>
            );
          })}
        </div>
      )}

      {hidden > 0 && missing.length > 0 ? (
        <Notice className="mt-6" title={<T k="insights.hiddenTitle" fallback="Some modules are hidden" />}>
          <T k="insights.hiddenBody" fallback="{n} modules need data that is not in this snapshot yet:" vars={{ n: hidden }} /> {missing.join("; ")}.
        </Notice>
      ) : null}

      {towns.length ? (
        <Section id="towns" className="mt-12" title={<T k="insights.towns.title" fallback="HDB towns" />} description={<T k="insights.towns.desc" fallback="Prices, rents, yields and every block in each town." />}>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {towns.map((t) => (
              <li key={t.slug}>
                <Link href={`/insights/town/${t.slug}/`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 hover:bg-canvas">
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{titleCase(t.town)}</span>
                    <span className="block text-xs text-muted">{t.region}</span>
                  </span>
                  <span className="tabular shrink-0 text-right text-sm text-ink">
                    {formatPsf(t.tx.medianPsf12m)}
                    <span className="block text-xs text-muted">
                      <T k="insights.towns.median12m" fallback="median, 12 months" />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </PageContainer>
  );
}
