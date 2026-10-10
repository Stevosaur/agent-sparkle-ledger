import Link from "next/link";
import { BookOpen, Braces, Database, LineChart, Newspaper, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { site } from "@/lib/config/site";
import { pageMetadata } from "@/lib/seo";
import { LIST_DEFS, LIST_IDS } from "@/lib/rankings";
import { getArticles } from "@/lib/news";
import { T } from "@/components/i18n/t";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody } from "@/components/ui/card";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";

export const revalidate = 86400;

export const metadata = pageMetadata({
  title: "Research",
  description: `${site.name} research: market explainers and new-launch dossiers, market insights and town trends, rankings, and the methodology and data behind them.`,
  path: "/research/",
});

const hubs: { href: string; icon: ReactNode; k: string; title: string; dk: string; desc: string }[] = [
  {
    href: "/news/",
    icon: <Newspaper className="size-5" aria-hidden />,
    k: "trust.research.news",
    title: "Explainers and launch dossiers",
    dk: "trust.research.newsDesc",
    desc: "Plain-English guides to buying, financing and selling in Singapore, and in-depth write-ups of new launches.",
  },
  {
    href: "/insights/",
    icon: <LineChart className="size-5" aria-hidden />,
    k: "trust.research.insights",
    title: "Market insights",
    dk: "trust.research.insightsDesc",
    desc: "Price and rent trends by town, flat type, district and market segment, plus a trend builder for your own comparisons.",
  },
  {
    href: "/lists/",
    icon: <Trophy className="size-5" aria-hidden />,
    k: "trust.research.lists",
    title: "Rankings",
    dk: "trust.research.listsDesc",
    desc: "Blocks, projects and towns ranked by yield, growth, price, demand vs supply, en-bloc potential and completions.",
  },
];

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export default function ResearchPage() {
  const articles = getArticles().slice(0, 6);
  return (
    <PageContainer>
      <Breadcrumbs items={[{ label: "Research" }]} />
      <PageHeader
        title={<T k="trust.research.title" fallback="Research" />}
        description={<T k="trust.research.intro" fallback="Explainers, market insights and rankings built from Singapore's recorded home sales, with the methods behind every number." />}
      />

      <div className="space-y-10 pb-8">
        <ul className="grid gap-4 md:grid-cols-3">
          {hubs.map((h) => (
            <li key={h.href}>
              <Card className="relative h-full transition-colors hover:border-brand-500">
                <CardBody>
                  <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">{h.icon}</span>
                  <h2 className="mt-3 font-semibold text-ink">
                    <Link href={h.href} className="after:absolute after:inset-0 hover:underline">
                      <T k={h.k} fallback={h.title} />
                    </Link>
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    <T k={h.dk} fallback={h.desc} />
                  </p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>

        <Section
          id="latest"
          title={<T k="trust.research.latestTitle" fallback="Latest from the newsroom" />}
          actions={
            <Link href="/news/" className="text-sm font-medium text-brand-700 hover:underline">
              <T k="common.viewAll" fallback="View all" />
            </Link>
          }
        >
          {articles.length ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {articles.map((a) => (
                <li key={a.slug}>
                  <Link href={`/news/${a.slug}/`} className="block h-full rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-brand-500">
                    <span className="text-xs text-muted">
                      <time dateTime={a.date}>{formatDate(a.date)}</time>
                    </span>
                    <span className="mt-0.5 block font-medium text-ink">{a.title}</span>
                    <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{a.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              <T k="trust.research.noArticles" fallback="No articles have been published yet." />
            </p>
          )}
        </Section>

        <Section id="rankings" title={<T k="trust.research.rankingsTitle" fallback="Rankings" />} description={<T k="trust.research.rankingsIntro" fallback="Each ranking explains its method on its page and on the methodology page." />}>
          <ul className="grid gap-3 sm:grid-cols-2">
            {LIST_IDS.map((id) => {
              const def = LIST_DEFS[id];
              return (
                <li key={id}>
                  <Link href={`/lists/${id}/`} className="block h-full rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-brand-500">
                    <span className="font-medium text-ink">
                      <T k={def.titleKey} fallback={def.title} />
                    </span>
                    <span className="mt-0.5 block text-sm text-muted">
                      <T k={def.descKey} fallback={def.description} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section id="data" title={<T k="trust.research.dataTitle" fallback="Data and methods" />}>
          <ul className="grid gap-3 sm:grid-cols-3">
            <li>
              <Link href="/methodology/" className="flex h-full items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 hover:border-brand-500">
                <Database className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
                <span>
                  <span className="font-medium text-ink">
                    <T k="trust.research.methodology" fallback="Methodology" />
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">
                    <T k="trust.research.methodologyDesc" fallback="Sources, coverage and how each figure is computed." />
                  </span>
                </span>
              </Link>
            </li>
            <li>
              <Link href="/docs/" className="flex h-full items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 hover:border-brand-500">
                <Braces className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
                <span>
                  <span className="font-medium text-ink">
                    <T k="trust.research.api" fallback="Public API" />
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">
                    <T k="trust.research.apiDesc" fallback="Free read-only JSON access to the same data." />
                  </span>
                </span>
              </Link>
            </li>
            <li>
              <Link href="/about/" className="flex h-full items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 hover:border-brand-500">
                <BookOpen className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
                <span>
                  <span className="font-medium text-ink">
                    <T k="trust.research.about" fallback="About {name}" vars={{ name: site.name }} />
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">
                    <T k="trust.research.aboutDesc" fallback="What we do and the principles we follow." />
                  </span>
                </span>
              </Link>
            </li>
          </ul>
        </Section>
      </div>
    </PageContainer>
  );
}
