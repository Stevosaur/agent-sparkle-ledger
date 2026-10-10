import Link from "next/link";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";
import { Card, CardBody } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { EmptyState, Notice } from "@/components/ui/notice";
import { buttonClass } from "@/components/ui/button";
import { T } from "@/components/i18n/t";
import { ComparePicker } from "@/components/tools/compare-pickers";
import { compareColumn, type CompareColumn } from "@/lib/tools/compare";
import { firstParam, formatRefList, MAX_COMPARE, parseRefList } from "@/lib/tools/refs";
import { formatDistance, formatMonth, formatPct, formatPctSigned, formatPsf, formatSgd } from "@/lib/format";
import type { PropertyRef } from "@/lib/property-ref";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Compare properties side by side",
  description: "Compare up to four HDB blocks, condos, landed homes or new launches: prices, psf, sales volume, rents, yields, lease and MRT access.",
  path: "/compare/",
});

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface Metric {
  key: string;
  label: ReactNode;
  value: (c: CompareColumn) => ReactNode;
}

const dash = <span className="text-muted">—</span>;

const METRICS: Metric[] = [
  { key: "type", label: <T k="tools.cmp.type" fallback="Type" />, value: (c) => c.type },
  { key: "location", label: <T k="tools.cmp.location" fallback="Location" />, value: (c) => c.location || dash },
  { key: "tenure", label: <T k="tools.cmp.tenure" fallback="Tenure / lease" />, value: (c) => c.tenure ?? dash },
  {
    key: "last",
    label: <T k="tools.cmp.lastSale" fallback="Last sale" />,
    value: (c) =>
      c.lastSale ? (
        <span>
          {formatSgd(c.lastSale.price)}
          <span className="block text-xs text-muted">{formatMonth(c.lastSale.month)}</span>
        </span>
      ) : (
        dash
      ),
  },
  { key: "psf", label: <T k="tools.cmp.psf12" fallback="Median psf (12 months)" />, value: (c) => (c.medianPsf12m != null ? formatPsf(c.medianPsf12m) : dash) },
  { key: "price", label: <T k="tools.cmp.price12" fallback="Median price (12 months)" />, value: (c) => (c.medianPrice12m != null ? formatSgd(c.medianPrice12m) : dash) },
  { key: "sales", label: <T k="tools.cmp.sales12" fallback="Sales (12 months)" />, value: (c) => (c.sales12m != null ? c.sales12m : dash) },
  { key: "rent", label: <T k="tools.cmp.rent12" fallback="Median rent (12 months)" />, value: (c) => (c.medianRent12m != null ? `${formatSgd(c.medianRent12m)}/mo` : dash) },
  { key: "yield", label: <T k="tools.cmp.yield" fallback="Gross yield" />, value: (c) => (c.grossYield != null ? formatPct(c.grossYield) : dash) },
  {
    key: "mrt",
    label: <T k="tools.cmp.mrt" fallback="Nearest MRT" />,
    value: (c) =>
      c.nearestMrt ? (
        <span>
          {c.nearestMrt.name}
          <span className="block text-xs text-muted">{formatDistance(c.nearestMrt.distanceM)}</span>
        </span>
      ) : (
        dash
      ),
  },
  {
    key: "growth",
    label: <T k="tools.cmp.growth" fallback="5-year price growth (area index)" />,
    value: (c) =>
      c.growth5y ? (
        <span>
          {formatPctSigned(c.growth5y.total)}
          <span className="block text-xs text-muted">
            {formatPctSigned(c.growth5y.cagr)} <T k="tools.cmp.perYear" fallback="a year" /> · {c.growth5y.seriesLabel}
          </span>
        </span>
      ) : (
        <span className="text-xs text-muted">{c.growthSeries ? <T k="tools.cmp.notEnoughHistory" fallback="Less than 5 years of index history" /> : <T k="tools.cmp.noIndex" fallback="No index for this area" />}</span>
      ),
  },
  { key: "notes", label: <T k="tools.cmp.notes" fallback="Notes" />, value: (c) => (c.notes.length ? <span className="text-xs text-muted">{c.notes.join(" · ")}</span> : dash) },
];

function withoutRef(refs: PropertyRef[], i: number): string {
  const rest = refs.filter((_, j) => j !== i);
  return rest.length ? `/compare/?ids=${encodeURIComponent(formatRefList(rest))}` : "/compare/";
}

export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { refs: parsed, invalid } = parseRefList(firstParam(sp.ids) ?? null, MAX_COMPARE);
  const found: { ref: PropertyRef; col: CompareColumn }[] = [];
  const missing: string[] = [...invalid];
  for (const ref of parsed) {
    const col = compareColumn(ref);
    if (col) found.push({ ref, col });
    else missing.push(`${ref.kind}:${ref.slug}`);
  }
  const refs = found.map((f) => f.ref);
  const ids = found.map((f) => f.col.ref);

  return (
    <PageContainer className="space-y-8 pb-12">
      <div>
        <Breadcrumbs items={[{ label: "Compare" }]} />
        <PageHeader
          eyebrow={<T k="tools.cmp.eyebrow" fallback="Compare" />}
          title={<T k="tools.cmp.title" fallback="Compare properties side by side" />}
          description={<T k="tools.cmp.intro" fallback="Add up to four HDB blocks, condos, landed homes or new launches to compare prices, sales activity, rents, lease and transport." />}
        />
        <ComparePicker ids={ids} />
      </div>

      {missing.length ? (
        <Notice tone="warn">
          <T k="tools.cmp.missing" fallback="We could not find: {list}" vars={{ list: missing.join(", ") }} />
        </Notice>
      ) : null}

      {found.length === 0 ? (
        <EmptyState title={<T k="tools.cmp.emptyTitle" fallback="Nothing to compare yet" />}>
          <T k="tools.cmp.emptyBody" fallback="Search above to add the first property. You can also use “Compare” at the end of any property page." />
        </EmptyState>
      ) : (
        <Section title={<T k="tools.cmp.tableTitle" fallback="Key numbers" />}>
          <Card>
            <CardBody className="px-0 py-2 sm:px-2">
              <DataTable
                rows={METRICS}
                rowKey={(m) => m.key}
                columns={[
                  { key: "metric", header: <T k="tools.cmp.metric" fallback="Metric" />, cell: (m) => <span className="font-medium text-ink">{m.label}</span>, className: "sticky left-0 z-10 bg-surface min-w-36 max-w-44 whitespace-normal" },
                  ...found.map(({ col }, i) => ({
                    key: col.ref,
                    header: (
                      <div className="flex min-w-36 max-w-56 items-start justify-between gap-2 normal-case tracking-normal">
                        <Link href={col.href} className="text-sm font-semibold text-brand-800 hover:underline">
                          {col.label}
                        </Link>
                        <Link href={withoutRef(refs, i)} className="rounded p-0.5 text-muted hover:bg-canvas hover:text-down" scroll={false}>
                          <X className="size-4" aria-hidden />
                          <span className="sr-only">
                            <T k="tools.cmp.remove" fallback="Remove {name}" vars={{ name: col.label }} />
                          </span>
                        </Link>
                      </div>
                    ),
                    cell: (m: Metric) => <div className="min-w-36 max-w-56 whitespace-normal">{m.value(col)}</div>,
                  })),
                ]}
              />
            </CardBody>
          </Card>
          <div className="mt-3 space-y-1 text-xs text-muted">
            <p>
              <T
                k="tools.cmp.yieldNote"
                fallback="Gross yield = median monthly rent × 12 ÷ median sale price, both over the last 12 months and across all unit types, so treat it as a rough guide. Growth is the change in the area's median psf index over five years."
              />
            </p>
            <p>
              <T k="common.source" fallback="Source" />:{" "}
              <T
                k="tools.cmp.sources"
                fallback="HDB resale prices and rental approvals (data.gov.sg); URA private residential transactions and rentals; LTA station locations (straight-line distance)."
              />
            </p>
          </div>
          {found.length >= 2 ? (
            <div className="mt-4">
              <Link
                href={`/compare-units/?a=${encodeURIComponent(found[0].col.ref)}&b=${encodeURIComponent(found[1].col.ref)}`}
                className={buttonClass("outline", "sm")}
              >
                <T k="tools.cmp.toUnits" fallback="Compare the first two sale by sale" />
              </Link>
            </div>
          ) : null}
        </Section>
      )}
    </PageContainer>
  );
}
