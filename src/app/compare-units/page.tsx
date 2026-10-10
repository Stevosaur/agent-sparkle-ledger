import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { EmptyState, Notice } from "@/components/ui/notice";
import { Stat, StatGrid } from "@/components/ui/stat";
import { T } from "@/components/i18n/t";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { UnitsPicker } from "@/components/tools/compare-pickers";
import { compareColumn, PSF_LOOKBACK_MONTHS, salesForUnits, type CompareColumn, type SaleRow } from "@/lib/tools/compare";
import { firstParam } from "@/lib/tools/refs";
import { formatMonth, formatPsf, formatSgd } from "@/lib/format";
import { parsePropertyRef, type PropertyRef } from "@/lib/property-ref";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Compare two properties sale by sale",
  description: "Put any two Singapore properties side by side: their latest recorded sales and a price-per-square-foot chart of both.",
  path: "/compare-units/",
});

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface Side {
  raw: string | null;
  ref: PropertyRef | null;
  col: CompareColumn | null;
  sales: ReturnType<typeof salesForUnits> | null;
}

function loadSide(raw: string | undefined): Side {
  const ref = raw ? parsePropertyRef(raw) : null;
  const col = ref ? compareColumn(ref) : null;
  return { raw: raw ?? null, ref, col, sales: ref && col ? salesForUnits(ref, 10) : null };
}

function SalesTable({ rows }: { rows: SaleRow[] }) {
  return (
    <DataTable
      dense
      rows={rows}
      rowKey={(r, i) => `${r.month}-${r.price}-${i}`}
      empty={<T k="tools.cmp.noSales" fallback="No sales recorded." />}
      columns={[
        { key: "m", header: <T k="tools.val.colMonth" fallback="Month" />, cell: (r) => formatMonth(r.month) },
        { key: "d", header: <T k="tools.cmp.colUnit" fallback="Unit" />, cell: (r) => <span className="whitespace-normal text-xs">{r.detail}</span> },
        { key: "a", header: <T k="tools.val.colArea" fallback="Area" />, align: "right", cell: (r) => `${Math.round(r.areaSqm)} sqm` },
        { key: "p", header: <T k="tools.val.colPrice" fallback="Price" />, align: "right", cell: (r) => formatSgd(r.price) },
        { key: "psf", header: <T k="tools.val.colPsf" fallback="psf" />, align: "right", cell: (r) => formatSgd(r.psf) },
      ]}
    />
  );
}

function SideCard({ side, slot, a, b }: { side: Side; slot: "a" | "b"; a: string | null; b: string | null }) {
  const letter = slot.toUpperCase();
  return (
    <Card className="min-w-0">
      <CardHeader
        title={
          side.col ? (
            <span>
              <span className="mr-2 text-muted">{letter}</span>
              <Link href={side.col.href} className="text-brand-800 hover:underline">
                {side.col.label}
              </Link>
            </span>
          ) : (
            <span>
              <span className="mr-2 text-muted">{letter}</span>
              <T k="tools.cmp.choose" fallback="Choose a property" />
            </span>
          )
        }
        description={side.col ? `${side.col.type}${side.col.location ? ` · ${side.col.location}` : ""}` : undefined}
      />
      <CardBody className="space-y-4">
        <UnitsPicker slot={slot} a={a} b={b} />
        {side.raw && !side.col ? (
          <Notice tone="warn">
            <T k="tools.cmp.missing" fallback="We could not find: {list}" vars={{ list: side.raw }} />
          </Notice>
        ) : null}
        {side.col && side.sales ? (
          <>
            <StatGrid className="sm:grid-cols-3 lg:grid-cols-3">
              <Stat label={<T k="tools.cmp.totalSales" fallback="Sales recorded" />} value={side.sales.total} />
              <Stat label={<T k="tools.cmp.psf12" fallback="Median psf (12 months)" />} value={formatPsf(side.col.medianPsf12m)} />
              <Stat label={<T k="tools.cmp.lastSale" fallback="Last sale" />} value={side.col.lastSale ? formatSgd(side.col.lastSale.price) : "—"} sub={side.col.lastSale ? formatMonth(side.col.lastSale.month) : undefined} />
            </StatGrid>
            <div>
              <h3 className="mb-1 text-sm font-semibold text-ink">
                <T k="tools.cmp.recentSales" fallback="Latest sales" />
              </h3>
              <SalesTable rows={side.sales.recent} />
            </div>
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}

export default async function CompareUnitsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const A = loadSide(firstParam(sp.a));
  const B = loadSide(firstParam(sp.b));
  const aId = A.col?.ref ?? null;
  const bId = B.col?.ref ?? null;
  const series = [A, B]
    .filter((s) => s.col && s.sales && s.sales.points.length)
    // fixed colours per slot (chart palette: brand teal for A, amber for B)
    .map((s) => ({ name: `${s === A ? "A" : "B"}: ${s.col!.label}`, points: s.sales!.points, kind: "scatter" as const, color: s === A ? "#19625b" : "#f19414" }));

  return (
    <PageContainer className="space-y-8 pb-12">
      <div>
        <Breadcrumbs items={[{ label: "Compare", href: "/compare/" }, { label: "Sale by sale" }]} />
        <PageHeader
          eyebrow={<T k="tools.cmp.eyebrow" fallback="Compare" />}
          title={<T k="tools.cmp.unitsTitle" fallback="Two properties, sale by sale" />}
          description={<T k="tools.cmp.unitsIntro" fallback="Pick any two HDB blocks, condos or landed homes to see their latest recorded sales and how their prices per square foot compare." />}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <SideCard side={A} slot="a" a={aId} b={bId} />
        <SideCard side={B} slot="b" a={aId} b={bId} />
      </div>

      <Section
        title={<T k="tools.cmp.psfChart" fallback="Price per square foot" />}
        description={<T k="tools.cmp.psfChartDesc" fallback="Each dot is one recorded sale in the last {n} years of each property's records." vars={{ n: PSF_LOOKBACK_MONTHS / 12 }} />}
      >
        <Card>
          <CardBody>
            {series.length ? (
              <TimeSeriesChart
                series={series}
                yFormat="psf"
                height={300}
                ariaLabel={`Scatter chart of sale prices per square foot over time for ${series.map((s) => s.name).join(" and ")}`}
              />
            ) : (
              <EmptyState title={<T k="tools.cmp.noChart" fallback="No sales to chart yet" />} className="border-0">
                <T k="tools.cmp.noChartBody" fallback="Choose properties with recorded sales to see the chart." />
              </EmptyState>
            )}
            <p className="mt-3 text-xs text-muted">
              <T k="common.source" fallback="Source" />: <T k="tools.cmp.unitsSources" fallback="HDB resale prices (data.gov.sg); URA private residential transactions. Bulk purchases are excluded." />
            </p>
          </CardBody>
        </Card>
      </Section>
    </PageContainer>
  );
}
