import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Map as MapIcon } from "lucide-react";
import { getLaunches } from "@/lib/data/private";
import type { MarketSegment } from "@/lib/data/types";
import { T } from "@/components/i18n/t";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/notice";
import { PageContainer, PageHeader } from "@/components/ui/section";
import { LaunchCard } from "@/components/launches/launch-card";
import { DistrictFilter } from "@/components/launches/district-filter";
import { pageMetadata } from "@/lib/seo";
import { formatMonth } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  districtOptions,
  filterLaunches,
  latestSalesMonth,
  LISTING_TYPES,
  LISTINGS_PAGE_SIZE,
  listingsHref,
  listingTypeCounts,
  MARKET_SEGMENTS,
  paginate,
  parseListingFilters,
  segmentCounts,
  type ListingType,
} from "@/lib/launch-insights";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TYPE_LABELS: Record<ListingType, { key: string; label: string; title: string }> = {
  condo: { key: "launches.tab.condo", label: "Condo", title: "New condo launches in Singapore" },
  ec: { key: "launches.tab.ec", label: "EC", title: "New executive condo (EC) launches in Singapore" },
  landed: { key: "launches.tab.landed", label: "Landed", title: "New landed launches in Singapore" },
  upcoming: { key: "launches.tab.upcoming", label: "Upcoming", title: "Upcoming private residential launches in Singapore" },
};

const SEGMENT_NAMES: Record<MarketSegment, { key: string; label: string }> = {
  CCR: { key: "launches.segment.CCR", label: "Core Central Region" },
  RCR: { key: "launches.segment.RCR", label: "Rest of Central Region" },
  OCR: { key: "launches.segment.OCR", label: "Outside Central Region" },
};

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const f = parseListingFilters(await searchParams);
  return pageMetadata({
    title: TYPE_LABELS[f.type].title,
    description: "Private residential new launches from URA developer sales: units sold, launch prices per square foot, expected completion, tenure and developer, filterable by region and district.",
    // the default view (condo, first page) is canonically the bare /listings/ (as in the sitemap)
    path: f.type === "condo" && f.page === 1 ? "/listings/" : listingsHref({ type: f.type, page: f.page }),
  });
}

function Chip({ href, active, children, title }: { href: string; active: boolean; children: ReactNode; title?: string }) {
  return (
    <Link
      href={href}
      title={title}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
        active ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink hover:bg-canvas",
      )}
    >
      {children}
    </Link>
  );
}

export default async function ListingsPage({ searchParams }: { searchParams: SearchParams }) {
  const f = parseListingFilters(await searchParams);
  const all = getLaunches();
  const counts = listingTypeCounts(all, f);
  const segCounts = segmentCounts(all, f);
  const districts = districtOptions(all, f);
  const filtered = filterLaunches(all, f);
  const pageData = paginate(filtered, f.page);
  const latestMonth = all.reduce<string | null>((max, l) => {
    const m = latestSalesMonth(l);
    return m && (!max || m > max) ? m : max;
  }, null);
  const filtersActive = f.segment != null || f.district != null;
  const from = pageData.total ? (pageData.page - 1) * LISTINGS_PAGE_SIZE + 1 : 0;
  const to = from ? from + pageData.items.length - 1 : 0;

  return (
    <PageContainer>
      <Breadcrumbs items={[{ label: "New launches", k: "nav.newLaunches" }]} />
      <PageHeader
        title={<T k="launches.list.title" fallback="New launches" />}
        description={
          <T
            k="launches.list.description"
            fallback="Private residential projects reported to URA: units sold, launch prices per square foot, expected completion, tenure and developer."
          />
        }
      >
        <Link href="/map/" className={buttonClass("outline", "sm")}>
          <MapIcon className="size-4" aria-hidden />
          <T k="launches.list.onMap" fallback="See launches on the map" />
        </Link>
      </PageHeader>

      {all.length === 0 ? (
        <EmptyState title={<T k="launches.list.noDataTitle" fallback="No launch data yet" />}>
          <T
            k="launches.list.noDataBody"
            fallback="New-launch figures come from URA's developer sales and private residential pipeline data. This deployment has not loaded that data yet: it needs the URA Data Service access key."
          />
        </EmptyState>
      ) : (
        <>
          <nav aria-label="Launch type" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ul className="flex gap-0.5 border-b border-line sm:gap-1">
              {LISTING_TYPES.map((type) => {
                const active = f.type === type;
                return (
                  <li key={type} className="shrink-0">
                    <Link
                      href={listingsHref({ type, segment: f.segment, district: f.district })}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "-mb-px flex items-center gap-1 border-b-2 px-2 py-2 text-sm font-medium whitespace-nowrap transition-colors sm:gap-1.5 sm:px-3",
                        active ? "border-brand-600 text-brand-800" : "border-transparent text-muted hover:text-ink",
                      )}
                    >
                      <T k={TYPE_LABELS[type].key} fallback={TYPE_LABELS[type].label} />
                      <span className={cn("tabular rounded-full px-1.5 text-xs", active ? "bg-brand-50 text-brand-800" : "bg-canvas text-muted")}>{counts[type]}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-1 text-xs font-medium text-muted" id="segment-label">
                <T k="launches.filter.segment" fallback="Market segment" />
              </div>
              <div role="group" aria-labelledby="segment-label" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
                <Chip href={listingsHref({ type: f.type, district: f.district })} active={f.segment == null}>
                  <T k="launches.filter.allSegments" fallback="All" />
                </Chip>
                {MARKET_SEGMENTS.map((s) => (
                  <Chip key={s} href={listingsHref({ type: f.type, segment: s, district: f.district })} active={f.segment === s} title={SEGMENT_NAMES[s].label}>
                    <span aria-hidden>{s}</span>
                    <span className="sr-only">
                      <T k={SEGMENT_NAMES[s].key} fallback={SEGMENT_NAMES[s].label} />
                    </span>
                    <span className="tabular text-xs opacity-75">{segCounts[s]}</span>
                  </Chip>
                ))}
              </div>
            </div>
            <DistrictFilter type={f.type} segment={f.segment} district={f.district} options={districts} />
          </div>

          <section aria-labelledby="results-heading" className="mt-6">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="results-heading" className="text-lg font-semibold text-ink">
                <T k={TYPE_LABELS[f.type].key} fallback={TYPE_LABELS[f.type].label} />{" "}
                <span className="tabular font-normal text-muted">
                  {pageData.total > 0 ? (
                    <T k="launches.list.showing" fallback="({from}–{to} of {total})" vars={{ from, to, total: pageData.total }} />
                  ) : null}
                </span>
              </h2>
              {filtersActive ? (
                <Link href={listingsHref({ type: f.type })} className="text-sm text-brand-700 hover:underline">
                  <T k="launches.filter.clear" fallback="Clear filters" />
                </Link>
              ) : null}
            </div>

            {pageData.total === 0 ? (
              <EmptyState
                title={<T k="launches.list.noMatchTitle" fallback="No launches match these filters" />}
                action={
                  filtersActive ? (
                    <Link href={listingsHref({ type: f.type })} className={buttonClass("outline", "sm")}>
                      <T k="launches.filter.clear" fallback="Clear filters" />
                    </Link>
                  ) : undefined
                }
              >
                {f.type === "upcoming" && !filtersActive ? (
                  <T k="launches.list.noUpcoming" fallback="No projects are in URA's pipeline without launched units right now." />
                ) : (
                  <T k="launches.list.noMatchBody" fallback="Try another market segment or district, or switch tabs." />
                )}
              </EmptyState>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pageData.items.map((l) => (
                  <li key={`${l.type}-${l.slug}`}>
                    <LaunchCard launch={l} />
                  </li>
                ))}
              </ul>
            )}

            {pageData.pages > 1 ? (
              <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-2">
                {pageData.page > 1 ? (
                  <Link href={listingsHref({ ...f, page: pageData.page - 1 })} className={buttonClass("outline", "sm")} rel="prev">
                    <ChevronLeft className="size-4" aria-hidden />
                    <T k="launches.list.prev" fallback="Previous" />
                  </Link>
                ) : (
                  <span />
                )}
                <span className="tabular text-sm text-muted">
                  <T k="launches.list.page" fallback="Page {page} of {pages}" vars={{ page: pageData.page, pages: pageData.pages }} />
                </span>
                {pageData.page < pageData.pages ? (
                  <Link href={listingsHref({ ...f, page: pageData.page + 1 })} className={buttonClass("outline", "sm")} rel="next">
                    <T k="launches.list.next" fallback="Next" />
                    <ChevronRight className="size-4" aria-hidden />
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </section>
        </>
      )}

      <div className="mt-8 space-y-1 text-xs text-muted">
        <p>
          <T k="common.source" fallback="Source" />
          {": "}
          <T k="launches.list.source" fallback="URA developer sales and private residential project pipeline" />
          {latestMonth ? ` (${formatMonth(latestMonth)})` : ""}.
        </p>
        <p>
          <T
            k="launches.list.scope"
            fallback="Residential projects only: commercial and industrial launches are not in our sources. Sold and launched counts are developer-reported totals to date."
          />
        </p>
      </div>
    </PageContainer>
  );
}
