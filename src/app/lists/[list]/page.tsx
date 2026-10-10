import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody } from "@/components/ui/card";
import { JsonLd } from "@/components/ui/json-ld";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";
import { PlusBadge } from "@/components/gating/gated-panel";
import { T } from "@/components/i18n/t";
import { FullRanking } from "@/components/insights/full-ranking";
import { ListTop } from "@/components/insights/list-top";
import { getMeta } from "@/lib/data/meta";
import { formatMonth } from "@/lib/format";
import { freeTopRows, isListId, LIST_DEFS, LIST_IDS, listFilterOptions } from "@/lib/rankings";
import { absoluteUrl, pageMetadata } from "@/lib/seo";

export const revalidate = 86400;
export const dynamicParams = false;

type Props = { params: Promise<{ list: string }> };

export function generateStaticParams() {
  return LIST_IDS.map((list) => ({ list }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { list } = await params;
  if (!isListId(list)) notFound();
  const def = LIST_DEFS[list];
  return pageMetadata({ title: `${def.title} — Singapore rankings`, description: def.description, path: `/lists/${list}/` });
}

export default async function ListPage({ params }: Props) {
  const { list } = await params;
  if (!isListId(list)) notFound();
  const def = LIST_DEFS[list];
  const meta = getMeta();
  const asOf = meta.latestMonth.hdb ?? meta.latestMonth.private;
  const top = freeTopRows(list, 3).flatMap((g) => g.rows);
  const options = listFilterOptions();

  return (
    <PageContainer className="pb-16">
      <Breadcrumbs items={[{ label: "Rankings", href: "/lists/" }, { label: def.title }]} />
      <PageHeader eyebrow={<T k="insights.lists.eyebrow" fallback="Rankings" />} title={<T k={def.titleKey} fallback={def.title} />} description={<T k={def.descKey} fallback={def.description} />}>
        {asOf ? (
          <p className="text-sm text-muted">
            <T k="insights.dataTo" fallback="Data to {month}" vars={{ month: formatMonth(asOf) }} />
          </p>
        ) : null}
      </PageHeader>

      <div className="space-y-10">
        <Section id="top" title={<T k="insights.top3" fallback="Top 3" />}>
          <Card>
            <CardBody>
              <ListTop id={list} />
            </CardBody>
          </Card>
        </Section>

        <Section
          id="full"
          title={
            <span className="inline-flex items-center gap-2">
              <T k="insights.fullRanking" fallback="Full ranking and filters" />
              <PlusBadge />
            </span>
          }
          description={<T k="insights.fullRankingDesc" fallback="Every ranked block, project or town, filterable by town, flat type or market segment." />}
        >
          <FullRanking
            def={{ id: def.id, title: def.title, metricHeader: def.metricHeader, metricHeaderKey: def.metricHeaderKey, columns: def.columns, groups: def.groups, filters: def.filters, defaultFlatType: def.defaultFlatType }}
            options={options}
          />
        </Section>

        <Section id="method" title={<T k="insights.methodology" fallback="How it is calculated" />}>
          <Card>
            <CardBody className="space-y-3 text-sm text-ink">
              <ul className="list-disc space-y-2 pl-5">
                {def.methodology.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <p className="text-xs text-muted">
                <T k="common.source" fallback="Source" />: {def.source}
              </p>
            </CardBody>
          </Card>
        </Section>

        <nav aria-labelledby="other-lists">
          <h2 id="other-lists" className="mb-3 text-lg font-semibold text-ink">
            <T k="insights.otherLists" fallback="Other rankings" />
          </h2>
          <ul className="flex flex-wrap gap-2">
            {LIST_IDS.filter((id) => id !== list).map((id) => (
              <li key={id}>
                <Link href={`/lists/${id}/`} className="inline-flex h-8 items-center rounded-full border border-line bg-surface px-3 text-sm text-ink hover:bg-canvas">
                  <T k={LIST_DEFS[id].titleKey} fallback={LIST_DEFS[id].title} />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {top.length ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: def.title,
            itemListElement: top.map((r, i) => ({ "@type": "ListItem", position: i + 1, name: r.label, url: absoluteUrl(r.href) })),
          }}
        />
      ) : null}
    </PageContainer>
  );
}
