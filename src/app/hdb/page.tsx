import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/notice";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";
import { DataTable } from "@/components/ui/table";
import { SearchBox } from "@/components/search/search-box";
import { T } from "@/components/i18n/t";
import { SourceLine } from "@/components/hdb/source-line";
import { getHdbBlocks, getTowns } from "@/lib/data/hdb";
import { getMeta } from "@/lib/data/meta";
import { formatInt, formatMonth, formatPsf, formatSgd } from "@/lib/format";
import { blockLabel } from "@/lib/hdb-insights";
import { pageMetadata } from "@/lib/seo";
import { titleCase } from "@/lib/slug";

export const revalidate = 86400;

const TOP_BLOCKS = 30;

export const metadata = pageMetadata({
  title: "HDB resale prices by block",
  description: "HDB resale prices for every block in Singapore: recent sales with lease left, rents, MRT access, MOP supply and nearby blocks, by town.",
  path: "/hdb/",
});

/** /hdb/ — entry point for HDB block pages: search, towns and the most traded blocks. */
export default function HdbIndexPage() {
  const towns = [...getTowns()].sort((a, b) => a.town.localeCompare(b.town));
  // Only the top blocks are sent to the page; the full block list stays on the server.
  const top = getHdbBlocks()
    .filter((b) => b.tx.count12m > 0)
    .sort((a, b) => b.tx.count12m - a.tx.count12m || (b.tx.last ?? "").localeCompare(a.tx.last ?? ""))
    .slice(0, TOP_BLOCKS)
    .map((b) => ({ slug: b.slug, label: blockLabel(b), town: titleCase(b.town), count12m: b.tx.count12m, medianPsf12m: b.tx.medianPsf12m, lastPrice: b.tx.lastPrice, last: b.tx.last }));
  const latestMonth = getMeta().latestMonth.hdb;

  return (
    <PageContainer className="pb-12">
      <Breadcrumbs items={[{ label: "HDB", k: "crumbs.hdb" }]} />
      <PageHeader
        title={<T k="hdb.index.title" fallback="HDB resale prices by block" />}
        description={<T k="hdb.index.desc" fallback="Every HDB block with resale records: recent sales with lease left, rents, MRT access, MOP supply and nearby blocks." />}
      >
        <div className="max-w-xl">
          <SearchBox kinds={["hdb", "town"]} />
        </div>
      </PageHeader>

      {towns.length === 0 ? (
        <EmptyState title={<T k="hdb.index.emptyTitle" fallback="HDB data not loaded yet" />}>
          <T k="hdb.index.empty" fallback="This deployment has no HDB resale records yet (HDB resale prices, data.gov.sg)." />
        </EmptyState>
      ) : (
        <div className="space-y-12">
          <Section
            id="towns"
            title={<T k="hdb.index.towns" fallback="Towns" />}
            description={latestMonth ? <T k="hdb.index.townsDesc" fallback="Sales and median psf over the 12 months to {month}." vars={{ month: formatMonth(latestMonth) }} /> : null}
          >
            <Card>
              <CardBody className="px-2 py-2">
                <DataTable
                  rows={towns}
                  rowKey={(t) => t.slug}
                  columns={[
                    {
                      key: "town",
                      header: <T k="hdb.details.town" fallback="Town" />,
                      cell: (t) => (
                        <Link href={`/insights/town/${t.slug}/`} className="font-medium text-brand-700 hover:underline">
                          {titleCase(t.town)}
                        </Link>
                      ),
                    },
                    { key: "region", header: <T k="hdb.index.region" fallback="Region" />, cell: (t) => t.region },
                    { key: "blocks", header: <T k="hdb.index.blocks" fallback="Blocks" />, cell: (t) => formatInt(t.blocks), align: "right" },
                    { key: "sales", header: <T k="hdb.index.sales12m" fallback="Sales (12m)" />, cell: (t) => formatInt(t.tx.count12m), align: "right" },
                    { key: "psf", header: <T k="hdb.col.medianPsf" fallback="Median psf (12m)" />, cell: (t) => formatPsf(t.tx.medianPsf12m), align: "right" },
                  ]}
                />
              </CardBody>
            </Card>
          </Section>

          <Section id="most-traded" title={<T k="hdb.index.topTitle" fallback="Most traded blocks" />} description={<T k="hdb.index.topDesc" fallback="Blocks with the most resales in the last 12 months." />}>
            <Card>
              <CardBody className="px-2 py-2">
                <DataTable
                  rows={top}
                  rowKey={(b) => b.slug}
                  empty={<T k="hdb.index.topEmpty" fallback="No resales in the last 12 months." />}
                  columns={[
                    {
                      key: "block",
                      header: <T k="hdb.col.block" fallback="Block" />,
                      cell: (b) => (
                        <Link href={`/hdb/${b.slug}/`} className="font-medium text-brand-700 hover:underline">
                          {b.label}
                        </Link>
                      ),
                    },
                    { key: "town", header: <T k="hdb.details.town" fallback="Town" />, cell: (b) => b.town },
                    { key: "sales", header: <T k="hdb.index.sales12m" fallback="Sales (12m)" />, cell: (b) => formatInt(b.count12m), align: "right" },
                    { key: "psf", header: <T k="hdb.col.medianPsf" fallback="Median psf (12m)" />, cell: (b) => formatPsf(b.medianPsf12m), align: "right" },
                    {
                      key: "last",
                      header: <T k="hdb.col.lastSale" fallback="Last sale" />,
                      cell: (b) => (b.lastPrice != null ? `${formatSgd(b.lastPrice)} · ${formatMonth(b.last)}` : "—"),
                      align: "right",
                    },
                  ]}
                />
              </CardBody>
            </Card>
            <SourceLine>
              <T k="hdb.source.resale" fallback="HDB resale prices, data.gov.sg" />
            </SourceLine>
          </Section>
        </div>
      )}
    </PageContainer>
  );
}
