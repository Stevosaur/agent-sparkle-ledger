import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/notice";
import { PageContainer, PageHeader } from "@/components/ui/section";
import { PlusBadge } from "@/components/gating/gated-panel";
import { T } from "@/components/i18n/t";
import { getArticles, summarize, type ArticleSummary } from "@/lib/news";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 86400;

export const metadata = pageMetadata({
  title: "Property news and explainers",
  description: "A monthly HDB resale market report generated from government records, plus plain-English explainers on stamp duties, MOP, SORA loans, TDSR and MSR, lease decay, ECs and en-bloc sales.",
  path: "/news/",
});

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function ArticleCard({ a, featured = false }: { a: ArticleSummary; featured?: boolean }) {
  return (
    <Card className={featured ? "border-brand-200 bg-brand-50/40" : undefined}>
      <CardBody className="flex h-full flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {a.dataDriven ? (
            <Badge tone="brand">
              <T k="insights.news.report" fallback="Market report" />
            </Badge>
          ) : (
            <Badge>
              <T k="insights.news.explainer" fallback="Explainer" />
            </Badge>
          )}
          {a.plusOnly ? <PlusBadge /> : null}
          <time dateTime={a.date} className="text-xs text-muted">
            {formatDate(a.date)}
          </time>
        </div>
        <h2 className={featured ? "text-xl font-semibold text-ink" : "text-base font-semibold text-ink"}>
          <Link href={`/news/${a.slug}/`} className="hover:underline">
            {a.title}
          </Link>
        </h2>
        <p className="text-sm text-muted">{a.description}</p>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {a.tags.map((t) => (
            <Badge key={t} tone="neutral">
              {t}
            </Badge>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

export default function NewsPage() {
  const articles = getArticles().map(summarize);
  const report = articles.find((a) => a.dataDriven) ?? null;
  const rest = articles.filter((a) => a !== report);
  return (
    <PageContainer className="pb-16">
      <Breadcrumbs items={[{ label: "News", k: "nav.news" }]} />
      <PageHeader
        eyebrow={<T k="insights.news.eyebrow" fallback="News and research" />}
        title={<T k="insights.news.title" fallback="Property news and explainers" />}
        description={<T k="insights.news.intro" fallback="Our market report is generated from the latest government records each month. The explainers cover the rules that shape what you can buy, borrow and pay." />}
      />
      {articles.length === 0 ? (
        <EmptyState title={<T k="common.noData" fallback="No data yet" />} />
      ) : (
        <div className="space-y-6">
          {report ? <ArticleCard a={report} featured /> : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((a) => (
              <ArticleCard key={a.slug} a={a} />
            ))}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
