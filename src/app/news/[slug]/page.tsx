import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { JsonLd } from "@/components/ui/json-ld";
import { Notice } from "@/components/ui/notice";
import { PageContainer } from "@/components/ui/section";
import { PlusBadge } from "@/components/gating/gated-panel";
import { T } from "@/components/i18n/t";
import { ArticleBlocks } from "@/components/insights/article-blocks";
import { GatedArticle } from "@/components/insights/gated-article";
import { site } from "@/lib/config/site";
import { freeBlocks, getArticle, getArticles, resolveBlocks } from "@/lib/news";
import { absoluteUrl, pageMetadata } from "@/lib/seo";

export const revalidate = 86400;
export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getArticles().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) notFound();
  return pageMetadata({ title: a.title, description: a.description, path: `/news/${a.slug}/`, ogType: "article" });
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) notFound();
  const path = `/news/${a.slug}/`;
  const blocks = resolveBlocks(freeBlocks(a));

  return (
    <PageContainer className="pb-16">
      <Breadcrumbs items={[{ label: "News", href: "/news/" }, { label: a.title }]} />
      <article className="mx-auto max-w-3xl">
        <header className="pb-6 pt-6 sm:pt-10">
          <div className="mb-3 flex flex-wrap items-center gap-2">
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
            {a.tags.map((t) => (
              <Badge key={t} tone="neutral">
                {t}
              </Badge>
            ))}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{a.title}</h1>
          <p className="mt-2 text-base text-muted">{a.description}</p>
          <p className="mt-3 text-sm text-muted">
            {a.author} · <time dateTime={a.date}>{formatDate(a.date)}</time>
          </p>
        </header>

        <div className="space-y-4">
          <ArticleBlocks blocks={blocks} slug={a.slug} />
        </div>

        {a.plusOnly ? (
          <div className="plus-content mt-6">
            <GatedArticle slug={a.slug} />
          </div>
        ) : null}

        {a.dataDriven ? (
          <Notice className="mt-8">
            <T k="insights.news.generated" fallback="This report is generated automatically from the latest dataset; every figure is computed from the records, not written by hand." />
          </Notice>
        ) : null}

        {a.sources.length ? (
          <section aria-labelledby="sources" className="mt-10 border-t border-line pt-6">
            <h2 id="sources" className="text-base font-semibold text-ink">
              <T k="insights.news.sources" fallback="Sources" />
            </h2>
            <ul className="mt-2 space-y-1 text-sm">
              {a.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:underline">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {a.related.length ? (
          <nav aria-labelledby="related" className="mt-8">
            <h2 id="related" className="text-base font-semibold text-ink">
              <T k="insights.news.related" fallback="Related" />
            </h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {a.related.map((r) => (
                <li key={r.href}>
                  <Link href={r.href} className="inline-flex h-8 items-center rounded-full border border-line bg-surface px-3 text-sm text-ink hover:bg-canvas">
                    {r.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <p className="mt-10 text-xs text-muted">
          <T k="insights.news.disclaimer" fallback="General information, not financial, legal or tax advice. Rules change; check the official sources before you act." />
        </p>
      </article>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: a.title,
          description: a.description,
          datePublished: a.date,
          dateModified: a.date,
          author: { "@type": "Organization", name: a.author, url: site.url },
          publisher: { "@type": "Organization", name: site.name, url: site.url },
          mainEntityOfPage: absoluteUrl(path),
          keywords: a.tags.join(", "),
          isAccessibleForFree: !a.plusOnly,
          ...(a.plusOnly ? { hasPart: { "@type": "WebPageElement", isAccessibleForFree: false, cssSelector: ".plus-content" } } : {}),
        }}
      />
    </PageContainer>
  );
}
