import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LineChart } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/notice";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";
import { Stat, StatGrid } from "@/components/ui/stat";
import { DataTable, type Column } from "@/components/ui/table";
import { T } from "@/components/i18n/t";
import { ChartView } from "@/components/insights/chart-view";
import { getBlocksInTown, getTown, getTowns } from "@/lib/data/hdb";
import { getSeries } from "@/lib/data/stats";
import { HDB_FLAT_TYPES, type HdbBlock } from "@/lib/data/types";
import { formatInt, formatMonth, formatPct, formatPsf, formatSgd } from "@/lib/format";
import { getHdbRentScan, getHdbSalesScan } from "@/lib/insights/hdb-scan";
import { toChartPoints, windowLabel } from "@/lib/insights/math";
import type { ChartLine, ChartSpec } from "@/lib/insights/types";
import { getRankingInputs, RANKING_RULES, townDemandSupply } from "@/lib/rankings";
import { pageMetadata } from "@/lib/seo";
import { titleCase } from "@/lib/slug";

export const revalidate = 86400;

type Props = { params: Promise<{ slug: string }> };

const MIN_YIELD_SAMPLE = 3;
const TOP_N = 10;

export function generateStaticParams() {
  return getTowns().map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const town = getTown(slug);
  if (!town) notFound();
  const name = titleCase(town.town);
  const psf = town.tx.medianPsf12m != null ? ` Median ${formatPsf(town.tx.medianPsf12m)} over the last 12 months across ${formatInt(town.tx.count12m)} resales.` : "";
  return pageMetadata({
    title: `${name} HDB resale prices, rents and blocks`,
    description: `${name} HDB town (${town.region} region): ${formatInt(town.blocks)} blocks.${psf} Prices and rents by flat type, gross yields, busiest and newest blocks.`,
    path: `/insights/town/${slug}/`,
  });
}

function blockLabel(b: HdbBlock): string {
  return `Blk ${b.block} ${titleCase(b.street)}`;
}

function blockNumber(block: string): number {
  return Number.parseInt(block, 10) || 0;
}

function BlockLink({ b }: { b: HdbBlock }) {
  return (
    <Link href={`/hdb/${b.slug}/`} className="font-medium text-brand-800 hover:underline">
      {blockLabel(b)}
    </Link>
  );
}

export default async function TownPage({ params }: Props) {
  const { slug } = await params;
  const town = getTown(slug);
  if (!town) notFound();

  const name = titleCase(town.town);
  const blocks = getBlocksInTown(slug);
  const scan = getHdbSalesScan();
  const rent = getHdbRentScan();
  const townScan = scan.towns.find((t) => t.slug === slug) ?? null;
  const rentTotal = rent.byTown.get(slug) ?? null;
  const inputs = getRankingInputs();
  const mop = townDemandSupply({ ...inputs, towns: [town] })[0] ?? null;
  const mopFrom = inputs.referenceYear + 1;
  const mopTo = inputs.referenceYear + RANKING_RULES.demandYears;

  // by flat type (12-month medians from the town summary; counts from the same 12-month windows)
  const typeRows = HDB_FLAT_TYPES.map((ft) => {
    const price = town.medianPrice12m[ft] ?? null;
    const rentMedian = town.medianRent12m[ft] ?? null;
    const sales = townScan?.byType[ft]?.cur.count ?? 0;
    const rentals = rent.byTownType.get(`${slug}|${ft}`)?.count ?? 0;
    const grossYield = price && rentMedian && sales >= MIN_YIELD_SAMPLE && rentals >= MIN_YIELD_SAMPLE ? (rentMedian * 12) / price : null;
    return { ft, price, rentMedian, sales, rentals, grossYield, psf: townScan?.byType[ft]?.cur.medianPsf ?? null };
  }).filter((r) => r.price != null || r.rentMedian != null);

  // price chart: one line per flat type, last ten years
  const from = scan.latestMonth != null ? scan.latestMonth - 119 : -Infinity;
  const lines: ChartLine[] = [];
  for (const ft of HDB_FLAT_TYPES) {
    const s = getSeries(`hdb:${town.town}:${ft}`);
    const pts = s ? toChartPoints(s.points, "medianPrice", from) : [];
    if (pts.length) lines.push({ name: ft, points: pts });
  }
  const chart: ChartSpec = { kind: "line", yFormat: "sgd", ariaLabel: `Line chart of monthly median HDB resale prices in ${name} by flat type`, series: lines };

  const busiest = [...blocks].filter((b) => b.tx.count12m > 0).sort((a, b) => b.tx.count12m - a.tx.count12m || blockLabel(a).localeCompare(blockLabel(b))).slice(0, TOP_N);
  const newest = [...blocks]
    .filter((b) => (b.leaseCommenceYear ?? b.yearCompleted) != null)
    .sort((a, b) => (b.leaseCommenceYear ?? b.yearCompleted ?? 0) - (a.leaseCommenceYear ?? a.yearCompleted ?? 0) || blockLabel(a).localeCompare(blockLabel(b)))
    .slice(0, TOP_N);
  const allBlocks = [...blocks].sort((a, b) => a.street.localeCompare(b.street) || blockNumber(a.block) - blockNumber(b.block) || a.block.localeCompare(b.block));

  const typeCols: Column<(typeof typeRows)[number]>[] = [
    { key: "ft", header: <T k="insights.filter.flatType" fallback="Flat type" />, cell: (r) => <span className="font-medium">{r.ft}</span> },
    { key: "price", header: <T k="insights.col.medianPrice" fallback="Median price" />, cell: (r) => formatSgd(r.price), align: "right" },
    { key: "psf", header: <T k="insights.col.medianPsf" fallback="Median psf" />, cell: (r) => formatPsf(r.psf), align: "right" },
    { key: "sales", header: <T k="insights.col.sales12m" fallback="Sales (12m)" />, cell: (r) => formatInt(r.sales), align: "right" },
    { key: "rent", header: <T k="insights.col.medianRent" fallback="Median rent" />, cell: (r) => (r.rentMedian != null ? `${formatSgd(r.rentMedian)}/mo` : "—"), align: "right" },
    { key: "rentals", header: <T k="insights.col.rentals12m" fallback="Rentals (12m)" />, cell: (r) => formatInt(r.rentals), align: "right" },
    { key: "yield", header: <T k="insights.col.grossYieldEst" fallback="Gross yield (est.)" />, cell: (r) => formatPct(r.grossYield, 2), align: "right" },
  ];

  const blockCols = (metric: "busy" | "new"): Column<HdbBlock>[] => [
    { key: "block", header: <T k="insights.col.block" fallback="Block" />, cell: (b) => <BlockLink b={b} /> },
    metric === "busy"
      ? { key: "sales", header: <T k="insights.col.sales12m" fallback="Sales (12m)" />, cell: (b) => formatInt(b.tx.count12m), align: "right" }
      : { key: "year", header: <T k="insights.col.leaseStart" fallback="Lease start" />, cell: (b) => (b.leaseCommenceYear != null ? String(b.leaseCommenceYear) : b.yearCompleted != null ? `${b.yearCompleted} (completed)` : "—"), align: "right" },
    { key: "psf", header: <T k="insights.col.medianPsf" fallback="Median psf" />, cell: (b) => formatPsf(b.tx.medianPsf12m), align: "right" },
    { key: "last", header: <T k="insights.col.lastSale" fallback="Last sale" />, cell: (b) => (b.tx.lastPrice != null ? `${formatSgd(b.tx.lastPrice)} · ${formatMonth(b.tx.last)}` : "—"), align: "right" },
  ];

  const allCols: Column<HdbBlock>[] = [
    { key: "block", header: <T k="insights.col.block" fallback="Block" />, cell: (b) => <BlockLink b={b} /> },
    { key: "lease", header: <T k="insights.col.leaseStart" fallback="Lease start" />, cell: (b) => (b.leaseCommenceYear != null ? String(b.leaseCommenceYear) : "—"), align: "right" },
    { key: "units", header: <T k="insights.col.units" fallback="Units" />, cell: (b) => (b.dwellingUnits != null ? formatInt(b.dwellingUnits) : "—"), align: "right" },
    { key: "sales", header: <T k="insights.col.sales12m" fallback="Sales (12m)" />, cell: (b) => formatInt(b.tx.count12m), align: "right" },
    { key: "total", header: <T k="insights.col.allSales" fallback="All sales" />, cell: (b) => formatInt(b.tx.count), align: "right" },
  ];

  const windowText = scan.windows ? windowLabel(scan.windows.cur.to) : null;

  return (
    <PageContainer className="pb-16">
      <Breadcrumbs items={[{ label: "Insights", href: "/insights/" }, { label: "Towns", href: "/insights/#towns" }, { label: name }]} />
      <PageHeader
        eyebrow={
          <>
            <T k="insights.town.eyebrow" fallback="HDB town" /> · {town.region}
          </>
        }
        title={
          <>
            {name} <T k="insights.town.titleSuffix" fallback="HDB prices, rents and blocks" />
          </>
        }
        description={windowText ? <T k="insights.town.intro" fallback="Resale prices, rents and yields over {window}, with every block in the town." vars={{ window: windowText }} /> : undefined}
      >
        <ButtonLink href={`/trendmaker/?s=${encodeURIComponent(`hdb:${town.town}:ALL`)}`} variant="secondary" size="sm">
          <LineChart className="size-4" aria-hidden />
          <T k="insights.town.trend" fallback="Chart this town in the trend builder" />
        </ButtonLink>
      </PageHeader>

      <div className="space-y-10">
        <Card>
          <CardBody>
            <StatGrid>
              <Stat label={<T k="insights.town.region" fallback="Region" />} value={town.region} />
              <Stat label={<T k="insights.town.blocks" fallback="Blocks" />} value={formatInt(town.blocks)} />
              <Stat label={<T k="insights.col.sales12m" fallback="Sales (12m)" />} value={formatInt(town.tx.count12m)} sub={town.tx.last ? <T k="insights.town.lastSale" fallback="Latest {month}" vars={{ month: formatMonth(town.tx.last) }} /> : undefined} />
              <Stat label={<T k="insights.col.medianPsf" fallback="Median psf" />} value={formatPsf(town.tx.medianPsf12m)} sub={<T k="insights.town.allTypes12m" fallback="All flat types, 12 months" />} />
              <Stat label={<T k="insights.col.medianPrice" fallback="Median price" />} value={formatSgd(townScan?.cur.medianPrice)} sub={<T k="insights.town.allTypes12m" fallback="All flat types, 12 months" />} />
              <Stat label={<T k="insights.col.rentals12m" fallback="Rentals (12m)" />} value={formatInt(rentTotal?.count ?? 0)} sub={rentTotal?.medianRent ? `${formatSgd(rentTotal.medianRent)}/mo median` : undefined} />
              {mop ? (
                <Stat
                  label={<T k="insights.town.mop" fallback="Flats reaching MOP {from}–{to}" vars={{ from: mopFrom, to: mopTo }} />}
                  value={formatInt(mop.demandUnits)}
                  sub={
                    <Link href="/lists/demand-supply/" className="hover:underline">
                      <T k="common.estimated" fallback="estimated" />
                    </Link>
                  }
                />
              ) : null}
            </StatGrid>
            <p className="mt-4 text-xs text-muted">
              <T k="common.source" fallback="Source" />: HDB resale prices, rental approvals and property information, data.gov.sg
            </p>
          </CardBody>
        </Card>

        <Section id="by-type" title={<T k="insights.town.byType" fallback="Prices and rents by flat type" />} description={<T k="insights.town.byTypeDesc" fallback="Medians over the latest 12 months. Gross yield = median rent × 12 ÷ median price, shown when both have at least 3 records." />}>
          <Card>
            {typeRows.length ? (
              <DataTable columns={typeCols} rows={typeRows} rowKey={(r) => r.ft} />
            ) : (
              <EmptyState title={<T k="common.noData" fallback="No data yet" />} className="border-0">
                <T k="insights.town.noRecent" fallback="No resales or rentals were recorded in this town in the latest 12 months." />
              </EmptyState>
            )}
          </Card>
        </Section>

        <Section id="price-chart" title={<T k="insights.town.chart" fallback="Resale price by flat type" />} description={<T k="insights.town.chartDesc" fallback="Monthly median resale price over the last ten years." />}>
          <Card>
            <CardBody>
              {lines.length ? (
                <ChartView chart={chart} name={`${name} HDB resale prices by flat type`} height={300} />
              ) : (
                <EmptyState title={<T k="common.noData" fallback="No data yet" />} className="border-0">
                  <T k="insights.town.noSeries" fallback="No monthly price series for this town yet." />
                </EmptyState>
              )}
              <p className="mt-2 text-xs text-muted">
                <T k="common.source" fallback="Source" />: HDB resale prices, data.gov.sg
              </p>
            </CardBody>
          </Card>
        </Section>

        <div className="grid gap-10 lg:grid-cols-2">
          <Section id="busiest" title={<T k="insights.town.busiest" fallback="Busiest blocks" />} description={<T k="insights.town.busiestDesc" fallback="Most resales in the latest 12 months." />}>
            <Card>
              <DataTable columns={blockCols("busy")} rows={busiest} rowKey={(b) => b.slug} empty={<T k="insights.town.noRecent" fallback="No resales or rentals were recorded in this town in the latest 12 months." />} />
            </Card>
          </Section>
          <Section id="newest" title={<T k="insights.town.newest" fallback="Newest blocks" />} description={<T k="insights.town.newestDesc" fallback="By lease commencement year (completion year when there are no resales yet)." />}>
            <Card>
              <DataTable columns={blockCols("new")} rows={newest} rowKey={(b) => b.slug} empty={<T k="common.noData" fallback="No data yet" />} />
            </Card>
          </Section>
        </div>

        <Section id="blocks" title={<T k="insights.town.allBlocks" fallback="All blocks in {town}" vars={{ town: name }} />} description={<T k="insights.town.allBlocksDesc" fallback="{n} blocks, sorted by street." vars={{ n: formatInt(allBlocks.length) }} />}>
          <Card>
            <DataTable columns={allCols} rows={allBlocks} rowKey={(b) => b.slug} dense empty={<T k="common.noData" fallback="No data yet" />} />
          </Card>
        </Section>
      </div>
    </PageContainer>
  );
}
