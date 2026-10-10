import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody } from "@/components/ui/card";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";
import { PlusBadge } from "@/components/gating/gated-panel";
import { T } from "@/components/i18n/t";
import { ListTop } from "@/components/insights/list-top";
import { getMeta } from "@/lib/data/meta";
import { formatMonth } from "@/lib/format";
import { LIST_DEFS, LIST_IDS } from "@/lib/rankings";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 86400;

export const metadata = pageMetadata({
  title: "Singapore property rankings",
  description: "Ranked lists of HDB blocks, condos and towns: highest rental yield, fastest price growth, newest, lowest price psf, upgrader demand vs supply, en-bloc potential and upcoming completions.",
  path: "/lists/",
});

export default function ListsPage() {
  const meta = getMeta();
  const asOf = meta.latestMonth.hdb ?? meta.latestMonth.private;
  return (
    <PageContainer className="pb-16">
      <Breadcrumbs items={[{ label: "Rankings" }]} />
      <PageHeader
        eyebrow={<T k="insights.lists.eyebrow" fallback="Rankings" />}
        title={<T k="insights.lists.title" fallback="Singapore property rankings" />}
        description={<T k="insights.lists.intro" fallback="Seven ranked lists built from government transaction records. The top three of each list are free; the full ranking with town, flat type and segment filters is part of Plus." />}
      >
        {asOf ? (
          <p className="text-sm text-muted">
            <T k="insights.dataTo" fallback="Data to {month}" vars={{ month: formatMonth(asOf) }} />
          </p>
        ) : null}
      </PageHeader>

      <nav aria-label="Lists" className="-mx-4 mb-8 overflow-x-auto px-4">
        <ul className="flex gap-2">
          {LIST_IDS.map((id) => (
            <li key={id}>
              <a href={`#${id}`} className="inline-flex h-8 items-center whitespace-nowrap rounded-full border border-line bg-surface px-3 text-sm text-ink hover:bg-canvas">
                <T k={LIST_DEFS[id].titleKey} fallback={LIST_DEFS[id].title} />
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-10">
        {LIST_IDS.map((id) => {
          const def = LIST_DEFS[id];
          return (
            <Section key={id} id={id} title={<T k={def.titleKey} fallback={def.title} />} description={<T k={def.descKey} fallback={def.description} />}>
              <Card>
                <CardBody className="space-y-4">
                  <ListTop id={id} />
                  <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted">
                      <T k="common.source" fallback="Source" />: {def.source}
                    </p>
                    <Link href={`/lists/${id}/`} className="inline-flex items-center gap-2 text-sm font-medium text-brand-800 hover:underline">
                      <T k="insights.fullRanking" fallback="Full ranking and filters" />
                      <PlusBadge />
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </div>
                </CardBody>
              </Card>
            </Section>
          );
        })}
      </div>

      <p className="mt-10 text-xs text-muted">
        <T
          k="insights.lists.disclaimer"
          fallback="Rankings are computed from recorded transactions and published data with the stated rules. They are not recommendations, and estimates can be wrong."
        />
      </p>
    </PageContainer>
  );
}
