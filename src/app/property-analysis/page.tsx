import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Building, Building2, Compass, Home, LineChart, ListOrdered, MapPin, Receipt, Sparkles, TrainFront, Wallet, type LucideIcon } from "lucide-react";
import { pageMetadata } from "@/lib/seo";
import { search } from "@/lib/data/search";
import { getHdbBlocks } from "@/lib/data/hdb";
import { getProjects } from "@/lib/data/private";
import type { HdbBlock, PrivateProject, SearchKind } from "@/lib/data/types";
import { formatMonth, formatSgd } from "@/lib/format";
import { titleCase } from "@/lib/slug";
import { groupSearchResults, normaliseQuery, recentlyTransacted } from "@/lib/home-insights";
import { T } from "@/components/i18n/t";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/notice";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";
import { DataTable, type Column } from "@/components/ui/table";
import { SourceLine } from "@/components/home/source-line";
import { AnalysisSearch } from "./analysis-search";

const RESULT_LIMIT = 30;
const RECENT_LIMIT = 10;

const KIND_LABELS: Record<SearchKind, { k: string; fallback: string; icon: LucideIcon }> = {
  town: { k: "home.kind.town", fallback: "HDB towns", icon: MapPin },
  hdb: { k: "home.kind.hdb", fallback: "HDB blocks", icon: Building },
  condo: { k: "home.kind.condo", fallback: "Condos and apartments", icon: Building2 },
  launch: { k: "home.kind.launch", fallback: "New launches", icon: Sparkles },
  "landed-street": { k: "home.kind.landedStreet", fallback: "Landed streets", icon: MapPin },
  landed: { k: "home.kind.landed", fallback: "Landed homes", icon: Home },
  mrt: { k: "home.kind.mrt", fallback: "MRT and LRT stations", icon: TrainFront },
};

const EXPLAINER: { icon: LucideIcon; k: string; title: string; dk: string; desc: string }[] = [
  {
    icon: Receipt,
    k: "home.explain.sales",
    title: "Every recorded sale",
    dk: "home.explain.salesDesc",
    desc: "Price, price per square foot, size and floor range, and for HDB flats the lease left at the time of sale.",
  },
  {
    icon: LineChart,
    k: "home.explain.trend",
    title: "Price trend",
    dk: "home.explain.trendDesc",
    desc: "Monthly prices for the property set against its town or district.",
  },
  {
    icon: Wallet,
    k: "home.explain.rents",
    title: "Rents",
    dk: "home.explain.rentsDesc",
    desc: "Recent rental records and the yield they imply, wherever rental data is published.",
  },
  {
    icon: Compass,
    k: "home.explain.location",
    title: "Location",
    dk: "home.explain.locationDesc",
    desc: "Nearest MRT stations, including announced future ones, plus schools and neighbouring blocks or projects.",
  },
  {
    icon: BadgeCheck,
    k: "home.explain.estimates",
    title: "Estimates, clearly labelled",
    dk: "home.explain.estimatesDesc",
    desc: "Valuations and lease-decay figures always say they are estimates and show how they were worked out.",
  },
  {
    icon: ListOrdered,
    k: "home.explain.next",
    title: "What's next",
    dk: "home.explain.nextDesc",
    desc: "Add it to your watchlist, compare it side by side, check supply and demand, or share the link.",
  },
];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const q = normaliseQuery((await searchParams).q);
  return pageMetadata({
    title: q ? `Search results for “${q}”` : "Property analysis",
    description: "Search any Singapore HDB block, condo, landed home, street, town or MRT station and open its analysis: every recorded sale, rents, lease and location.",
    path: "/property-analysis/",
    // result pages are thin duplicates of the property pages they link to
    noindex: !!q,
  });
}

const hdbColumns: Column<HdbBlock>[] = [
  {
    key: "block",
    header: <T k="home.recent.block" fallback="Block" />,
    cell: (b) => (
      <Link href={`/hdb/${b.slug}/`} className="font-medium text-brand-700 hover:underline">
        Blk {b.block} {titleCase(b.street)}
      </Link>
    ),
  },
  { key: "town", header: <T k="home.recent.town" fallback="Town" />, cell: (b) => titleCase(b.town) },
  { key: "last", header: <T k="home.recent.lastSale" fallback="Last sale" />, cell: (b) => formatMonth(b.tx.last) },
  { key: "price", header: <T k="home.recent.lastPrice" fallback="Last price" />, align: "right", cell: (b) => formatSgd(b.tx.lastPrice) },
];

const condoColumns: Column<PrivateProject>[] = [
  {
    key: "project",
    header: <T k="home.recent.project" fallback="Project" />,
    cell: (p) => (
      <Link href={`/condo/${p.slug}/`} className="font-medium text-brand-700 hover:underline">
        {titleCase(p.name)}
      </Link>
    ),
  },
  { key: "district", header: <T k="home.recent.district" fallback="District" />, cell: (p) => [p.district != null ? `D${p.district}` : null, p.segment].filter(Boolean).join(" · ") || "—" },
  { key: "last", header: <T k="home.recent.lastSale" fallback="Last sale" />, cell: (p) => formatMonth(p.tx.last) },
  { key: "price", header: <T k="home.recent.lastPrice" fallback="Last price" />, align: "right", cell: (p) => formatSgd(p.tx.lastPrice) },
];

/**
 * "Recently transacted" lists. This page is dynamic (it reads ?q=), so memoise on the loaders' cached
 * arrays instead of rescanning every HDB block and project on each request; a new snapshot (new array
 * identity) recomputes.
 */
const recentCache = new WeakMap<readonly HdbBlock[], { projects: readonly PrivateProject[]; blocks: HdbBlock[]; condos: PrivateProject[] }>();

function recentLists(): { blocks: HdbBlock[]; condos: PrivateProject[] } {
  const allBlocks = getHdbBlocks();
  const projects = getProjects();
  const hit = recentCache.get(allBlocks);
  if (hit && hit.projects === projects) return hit;
  const entry = {
    projects,
    blocks: recentlyTransacted(allBlocks, RECENT_LIMIT),
    condos: recentlyTransacted(
      projects.filter((p) => !p.isLanded),
      RECENT_LIMIT,
    ),
  };
  recentCache.set(allBlocks, entry);
  return entry;
}

export default async function PropertyAnalysisPage({ searchParams }: { searchParams: SearchParams }) {
  const q = normaliseQuery((await searchParams).q);
  const results = q ? search(q, { limit: RESULT_LIMIT }) : [];
  const groups = groupSearchResults(results);

  const { blocks: recentBlocks, condos: recentCondos } = recentLists();

  return (
    <PageContainer className="pb-12">
      <Breadcrumbs items={[{ label: "Property analysis" }]} />
      <PageHeader
        title={<T k="home.analysis.title" fallback="Property analysis" />}
        description={
          <T
            k="home.analysis.desc"
            fallback="Search any HDB block, condo, landed home, street, town or MRT station, then open its page for every recorded sale, rents, lease and location."
          />
        }
      >
        <div className="max-w-3xl">
          <AnalysisSearch key={q} initialQuery={q} />
        </div>
      </PageHeader>

      <div className="space-y-10">
        {q ? (
          <Section
            id="results"
            title={<T k="home.analysis.results" fallback="Results for “{q}”" vars={{ q }} />}
            description={
              results.length === 0 ? undefined : results.length >= RESULT_LIMIT ? (
                <T k="home.analysis.top" fallback="Showing the top {count} matches. Add a street name or block number to narrow it down." vars={{ count: results.length }} />
              ) : (
                <T k="home.analysis.count" fallback="{count} matches" vars={{ count: results.length }} />
              )
            }
          >
            {results.length === 0 ? (
              <EmptyState title={<T k="home.analysis.noResults" fallback="No matches for “{q}”" vars={{ q }} />}>
                <T k="home.analysis.noResultsTip" fallback="Try a block number with its street, a project name, a street name or a 6-digit postal code." />
              </EmptyState>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {groups.map((group) => {
                  const meta = KIND_LABELS[group.kind];
                  const Icon = meta.icon;
                  return (
                    <Card key={group.kind}>
                      <CardHeader
                        title={
                          <span className="flex items-center gap-2">
                            <Icon className="size-4 text-brand-700" aria-hidden />
                            <T k={meta.k} fallback={meta.fallback} />
                            <span className="text-sm font-normal text-muted">{group.entries.length}</span>
                          </span>
                        }
                      />
                      <ul className="divide-y divide-line">
                        {group.entries.map((entry) => (
                          <li key={entry.href}>
                            <Link href={entry.href} className="block px-5 py-3 hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none">
                              <span className="block font-medium text-ink">{entry.label}</span>
                              <span className="block text-sm text-muted">{entry.sub}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  );
                })}
              </div>
            )}
          </Section>
        ) : null}

        <Section id="what-you-get" title={<T k="home.explain.title" fallback="What every property page shows" />}>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {EXPLAINER.map(({ icon: Icon, k, title, dk, desc }) => (
              <li key={k} className="flex gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">
                    <T k={k} fallback={title} />
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">
                    <T k={dk} fallback={desc} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="recent"
          title={<T k="home.recent.title" fallback="Recently transacted" />}
          description={<T k="home.recent.desc" fallback="Properties with the most recent recorded sales." />}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader title={<T k="home.recent.hdb" fallback="HDB blocks" />} />
              {recentBlocks.length > 0 ? (
                <CardBody className="px-2 py-2">
                  <DataTable columns={hdbColumns} rows={recentBlocks} rowKey={(b) => b.slug} dense />
                  <SourceLine className="px-3">
                    <T k="home.source.hdb" fallback="HDB resale prices, data.gov.sg" />
                  </SourceLine>
                </CardBody>
              ) : (
                <CardBody>
                  <p className="text-sm text-muted">
                    <T k="home.recent.hdbEmpty" fallback="HDB resale records from data.gov.sg have not been loaded yet." />
                  </p>
                </CardBody>
              )}
            </Card>
            <Card className="min-w-0">
              <CardHeader title={<T k="home.recent.condo" fallback="Condos and ECs" />} />
              {recentCondos.length > 0 ? (
                <CardBody className="px-2 py-2">
                  <DataTable columns={condoColumns} rows={recentCondos} rowKey={(p) => p.slug} dense />
                  <SourceLine className="px-3">
                    <T k="home.source.private" fallback="URA private residential transactions" />
                  </SourceLine>
                </CardBody>
              ) : (
                <CardBody>
                  <p className="text-sm text-muted">
                    <T k="home.recent.condoEmpty" fallback="Condo sales appear once URA private transaction data is connected (needs a URA Data Service access key)." />
                  </p>
                </CardBody>
              )}
            </Card>
          </div>
        </Section>
      </div>
    </PageContainer>
  );
}
