import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowRight, Mail } from "lucide-react";
import { getDistrictTransactions, getLandedStreets, getLaunch, getLaunches, getProjects } from "@/lib/data/private";
import { getMrtStations, haversineM, schoolsWithin } from "@/lib/data/geo";
import { getMeta } from "@/lib/data/meta";
import { getRates } from "@/lib/data/rates";
import { monthIndex } from "@/lib/data/months";
import type { LatLng, MarketSegment, NewLaunch } from "@/lib/data/types";
import { T } from "@/components/i18n/t";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { JsonLd } from "@/components/ui/json-ld";
import { EmptyState, Notice } from "@/components/ui/notice";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";
import { Stat, StatGrid } from "@/components/ui/stat";
import { DataTable, type Column } from "@/components/ui/table";
import { SimpleBarChart } from "@/components/charts/bar-chart";
import { CHART_COLORS, TimeSeriesChart } from "@/components/charts/time-series-chart";
import { MiniMap, type MapMarker } from "@/components/map/mini-map";
import { LeadForm } from "@/components/leads/lead-form";
import { AskPanel } from "@/components/ai/ask-panel";
import { WhatsNext } from "@/components/property/whats-next";
import { LaunchStatusBadge, LaunchTypeBadge, TenureText } from "@/components/launches/launch-card";
import { SalesProgress } from "@/components/launches/sales-progress";
import { WalkAwayTool } from "@/components/launches/walk-away-tool";
import { formatDistance, formatInt, formatMonth, formatPct, formatPctSigned, formatPsf } from "@/lib/format";
import { titleCase } from "@/lib/slug";
import { absoluteUrl, pageMetadata } from "@/lib/seo";
import {
  districtLabel,
  isLaunchType,
  latestPrice,
  launchHref,
  launchProgress,
  launchTypeLabel,
  listingsHref,
  monthlySoldBars,
  NEARBY_RESALE_RADIUS_M,
  nearbyProjects,
  nearbyResalePsf,
  premiumOver,
  psfTrendSeries,
  type NearbyResaleRow,
} from "@/lib/launch-insights";

export const revalidate = 86400;

/** Launch pages render on first visit and are then cached (ISR). */
export function generateStaticParams(): { type: string; slug: string }[] {
  return [];
}

type Params = Promise<{ type: string; slug: string }>;

const SCHOOL_RADIUS_M = 1000;

const SEGMENT_NAMES: Record<MarketSegment, { key: string; label: string }> = {
  CCR: { key: "launches.segment.CCR", label: "Core Central Region" },
  RCR: { key: "launches.segment.RCR", label: "Rest of Central Region" },
  OCR: { key: "launches.segment.OCR", label: "Outside Central Region" },
};

function findLaunch(type: string, slug: string): NewLaunch | null {
  return isLaunchType(type) ? getLaunch(type, slug) : null;
}

function originOf(l: NewLaunch): LatLng | null {
  return l.lat != null && l.lng != null && Number.isFinite(l.lat) && Number.isFinite(l.lng) ? { lat: l.lat, lng: l.lng } : null;
}

function describe(l: NewLaunch): string {
  const p = launchProgress(l);
  const price = latestPrice(l.sales);
  const parts = [`${titleCase(l.name)} is a ${l.status === "upcoming" ? "upcoming" : "new"} ${launchTypeLabel(l.type).toLowerCase()} launch`];
  if (l.district != null) parts[0] += ` in District ${l.district}${l.segment ? ` (${l.segment})` : ""}`;
  if (l.developer) parts[0] += ` by ${titleCase(l.developer)}`;
  const facts: string[] = [];
  if (p.sold != null && p.total != null) facts.push(`${formatInt(p.sold)} of ${formatInt(p.total)} units sold to ${formatMonth(p.asOf)}`);
  else if (l.totalUnits != null) facts.push(`${formatInt(l.totalUnits)} units`);
  if (price?.medianPsf != null) facts.push(`median ${formatPsf(price.medianPsf)} in ${formatMonth(price.month)}`);
  if (l.expectedCompletionYear != null) facts.push(`expected completion ${l.expectedCompletionYear}`);
  return `${parts[0]}.${facts.length ? ` ${facts.join(", ")}.` : ""}`;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { type, slug } = await params;
  const l = findLaunch(type, slug) ?? getLaunches().find((x) => x.slug === slug) ?? null;
  if (!l) return { title: "New launch not found", robots: { index: false, follow: true } };
  return pageMetadata({
    title: `${titleCase(l.name)}: ${l.status === "upcoming" ? "upcoming" : "new"} ${launchTypeLabel(l.type).toLowerCase()} launch${l.district != null ? ` in ${districtLabel(l.district)}` : ""}`,
    description: `${describe(l)} Units sold, launch prices per square foot, nearby resale prices and a walk-away price calculator.`,
    path: launchHref(l),
  });
}

interface StationPoint {
  name: string;
  codes: string[];
  lat: number;
  lng: number;
  distanceM: number;
  expectedYear: number | null;
  approximate: boolean;
}

function stationsWithin(origin: LatLng, radiusM: number, status: "operational" | "future", limit: number): StationPoint[] {
  return getMrtStations()
    .filter((s) => s.status === status && Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .map((s) => ({ name: s.name, codes: s.codes, lat: s.lat, lng: s.lng, expectedYear: s.expectedYear, approximate: s.approximate, distanceM: Math.round(haversineM(origin, s)) }))
    .filter((s) => s.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit);
}

/** Median resale psf of nearby projects over the 12 months to the dataset's latest private month. */
function resaleComparison(l: NewLaunch, origin: LatLng) {
  const landed = l.type === "landed";
  const nearby = nearbyProjects(origin, getProjects(), { radiusM: NEARBY_RESALE_RADIUS_M, landed, excludeSlugs: [l.projectSlug, l.slug] });
  const slugs = new Set(nearby.map((p) => p.slug));
  const districts = [...new Set(nearby.map((p) => p.district).filter((d): d is number => d != null))].slice(0, 6);
  const transactions = districts.flatMap((d) => getDistrictTransactions(d).filter((t) => slugs.has(t.projectSlug)));
  const latest = getMeta().latestMonth.private;
  const end = latest ? monthIndex(latest) : transactions.reduce((m, t) => Math.max(m, t.monthIndex), -1);
  if (end < 0) return { summary: null, landed };
  return { summary: nearbyResalePsf({ nearby, transactions, endMonthIndex: end, radiusM: NEARBY_RESALE_RADIUS_M, landed, limit: 8 }), landed };
}

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function SourceLine({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 text-xs text-muted">
      <T k="common.source" fallback="Source" />: {children}
    </p>
  );
}

function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}

export default async function NewLaunchPage({ params }: { params: Params }) {
  const { type, slug } = await params;
  const launch = findLaunch(type, slug);
  if (!launch) {
    const other = getLaunches().find((l) => l.slug === slug);
    if (other) permanentRedirect(launchHref(other));
    notFound();
  }

  const name = titleCase(launch.name);
  const href = launchHref(launch);
  const origin = originOf(launch);
  const progress = launchProgress(launch);
  const price = latestPrice(launch.sales);
  const trend = psfTrendSeries(launch.sales).map((s, i) => ({ ...s, color: CHART_COLORS[i] }));
  const trendHasLine = trend.some((s) => s.points.length > 1);
  const soldBars = monthlySoldBars(launch.sales);
  const rates = getRates();
  const sora3m = rates?.sora.compounded3m ?? null;

  const comparison = origin ? resaleComparison(launch, origin) : null;
  const summary = comparison?.summary ?? null;
  const premium = premiumOver(price?.medianPsf, summary?.medianPsf);
  const streetByProject = comparison?.landed ? new Map(getLandedStreets().flatMap((s) => s.projects.map((p) => [p, s.slug] as const))) : null;
  const rowHref = (r: NearbyResaleRow): string | null => (r.isLanded ? (streetByProject?.get(r.slug) ? `/landed-street/${streetByProject.get(r.slug)}/` : null) : `/condo/${r.slug}/`);

  const mrtNear = origin ? stationsWithin(origin, NEARBY_RESALE_RADIUS_M, "operational", 3) : [];
  const futureNear = origin ? stationsWithin(origin, NEARBY_RESALE_RADIUS_M, "future", 3) : [];
  const schools = origin ? schoolsWithin(origin, SCHOOL_RADIUS_M, "PRIMARY").slice(0, 6) : [];

  const markers: MapMarker[] = origin
    ? [
        { lat: origin.lat, lng: origin.lng, label: name, tone: "primary" },
        ...mrtNear.map((s): MapMarker => ({ lat: s.lat, lng: s.lng, label: `${titleCase(s.name)} (${s.codes.join(" ")})`, tone: "mrt" })),
        ...futureNear.map((s): MapMarker => ({ lat: s.lat, lng: s.lng, label: `${titleCase(s.name)} (${s.expectedYear ?? "future"})`, tone: "future-mrt" })),
        ...schools.map((s): MapMarker => ({ lat: s.lat, lng: s.lng, label: titleCase(s.name), tone: "school" })),
        ...(summary?.projects ?? []).map((p): MapMarker => {
          const h = rowHref(p);
          return { lat: p.lat, lng: p.lng, label: titleCase(p.name), tone: "condo", ...(h ? { href: h } : {}) };
        }),
      ]
    : [];

  const resaleColumns: Column<NearbyResaleRow>[] = [
    {
      key: "name",
      header: <T k="launches.resale.project" fallback="Project" />,
      cell: (r) => {
        const h = rowHref(r);
        return h ? (
          <Link href={h} className="font-medium text-brand-700 hover:underline">
            {titleCase(r.name)}
          </Link>
        ) : (
          <span className="font-medium text-ink">{titleCase(r.name)}</span>
        );
      },
    },
    { key: "distance", header: <T k="launches.resale.distance" fallback="Distance" />, align: "right", cell: (r) => formatDistance(r.distanceM) },
    { key: "psf", header: <T k="launches.resale.medianPsf" fallback="Median psf" />, align: "right", cell: (r) => formatPsf(r.medianPsf) },
    { key: "count", header: <T k="launches.resale.sales" fallback="Resales" />, align: "right", cell: (r) => formatInt(r.count) },
  ];

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": launch.type === "landed" ? "Residence" : "ApartmentComplex",
    name,
    url: absoluteUrl(href),
    ...(launch.street ? { address: { "@type": "PostalAddress", streetAddress: titleCase(launch.street), addressCountry: "SG" } } : {}),
    ...(origin ? { geo: { "@type": "GeoCoordinates", latitude: origin.lat, longitude: origin.lng } } : {}),
    ...(launch.totalUnits != null ? { numberOfAccommodationUnits: { "@type": "QuantitativeValue", value: launch.totalUnits } } : {}),
  };

  const sections = [
    { id: "facts", key: "launches.nav.facts", label: "Facts" },
    { id: "sales", key: "launches.nav.sales", label: "Units sold" },
    { id: "prices", key: "launches.nav.prices", label: "Prices" },
    { id: "resale", key: "launches.nav.resale", label: "Nearby resale" },
    { id: "walk-away", key: "launches.nav.walkAway", label: "Walk-away price" },
    { id: "enquire", key: "launches.nav.enquire", label: "Enquire" },
  ];

  return (
    <PageContainer>
      <JsonLd data={jsonLd} />
      <Breadcrumbs items={[{ label: "New launches", href: listingsHref({ type: launch.status === "upcoming" ? "upcoming" : launch.type }) }, { label: name }]} />
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-1.5">
            <LaunchStatusBadge status={launch.status} />
            <LaunchTypeBadge type={launch.type} />
            {launch.district != null ? <Badge tone="neutral">{districtLabel(launch.district)}</Badge> : null}
            {launch.segment ? <Badge tone="neutral">{launch.segment}</Badge> : null}
          </span>
        }
        title={name}
        description={describe(launch)}
      >
        <div className="flex flex-wrap gap-2">
          <a href="#enquire" className={buttonClass("primary", "sm")}>
            <Mail className="size-4" aria-hidden />
            <T k="launches.page.enquire" fallback="Enquire about this launch" />
          </a>
          <a href="#walk-away" className={buttonClass("outline", "sm")}>
            <T k="launches.page.walkAwayCta" fallback="Work out your walk-away price" />
          </a>
        </div>
      </PageHeader>

      <nav aria-label="On this page" className="-mx-4 mb-8 overflow-x-auto border-y border-line px-4 sm:mx-0 sm:rounded-lg sm:border sm:px-2">
        <ul className="flex gap-1 py-1.5">
          {sections.map((s) => (
            <li key={s.id} className="shrink-0">
              <a href={`#${s.id}`} className="block rounded-md px-2.5 py-1 text-sm text-muted hover:bg-canvas hover:text-ink">
                <T k={s.key} fallback={s.label} />
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-12">
        {/* ---------------------------------------------------------- Facts + location */}
        <Section id="facts" title={<T k="launches.facts.title" fallback="Launch facts" />}>
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardBody>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Fact label={<T k="launches.facts.developer" fallback="Developer" />}>{launch.developer ? titleCase(launch.developer) : <T k="launches.facts.notPublished" fallback="Not published" />}</Fact>
                  <Fact label={<T k="launches.facts.totalUnits" fallback="Total units" />}>{launch.totalUnits != null ? formatInt(launch.totalUnits) : <T k="launches.facts.notPublished" fallback="Not published" />}</Fact>
                  <Fact label={<T k="launches.facts.tenure" fallback="Tenure" />}>
                    <TenureText tenure={launch.tenure} />
                    {launch.tenure?.startYear != null ? (
                      <span className="text-muted">
                        {" "}
                        <T k="launches.facts.leaseFrom" fallback="from {year}" vars={{ year: launch.tenure.startYear }} />
                      </span>
                    ) : null}
                  </Fact>
                  <Fact label={<T k="launches.facts.completion" fallback="Expected completion" />}>{launch.expectedCompletionYear ?? <T k="launches.facts.notPublished" fallback="Not published" />}</Fact>
                  <Fact label={<T k="launches.facts.district" fallback="District / segment" />}>
                    {launch.district != null ? `District ${launch.district}` : "—"}
                    {launch.segment ? (
                      <>
                        {" · "}
                        {launch.segment} <span className="text-muted">(<T k={SEGMENT_NAMES[launch.segment].key} fallback={SEGMENT_NAMES[launch.segment].label} />)</span>
                      </>
                    ) : null}
                  </Fact>
                  <Fact label={<T k="launches.facts.street" fallback="Street" />}>{launch.street ? titleCase(launch.street) : "—"}</Fact>
                  <Fact label={<T k="launches.facts.nearestMrt" fallback="Nearest MRT/LRT" />}>
                    {launch.nearestMrt ? (
                      <>
                        {titleCase(launch.nearestMrt.name)} <span className="text-muted">({launch.nearestMrt.codes.join(" · ")})</span>, {formatDistance(launch.nearestMrt.distanceM)}
                      </>
                    ) : (
                      <T k="launches.facts.noMrt" fallback="Unknown: no coordinates for this project yet" />
                    )}
                  </Fact>
                  <Fact label={<T k="launches.facts.futureMrt" fallback="Future MRT within 1.5 km" />}>
                    {futureNear.length ? (
                      <ul>
                        {futureNear.map((s) => (
                          <li key={s.name}>
                            {titleCase(s.name)} <span className="text-muted">({s.codes.join(" · ")})</span>, {formatDistance(s.distanceM)}
                            {s.expectedYear != null ? (
                              <>
                                {" · "}
                                <T k="launches.facts.opens" fallback="opens {year} (expected)" vars={{ year: s.expectedYear }} />
                              </>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : origin ? (
                      <T k="launches.facts.noFutureMrt" fallback="None announced" />
                    ) : (
                      "—"
                    )}
                  </Fact>
                </dl>
                <SourceLine>
                  <T k="launches.facts.source" fallback="URA developer sales and private residential pipeline; MRT stations from LTA via OneMap, straight-line distances." />
                </SourceLine>
              </CardBody>
            </Card>
            <div className="lg:col-span-2">
              {origin ? (
                <>
                  <MiniMap center={origin} zoom={15} markers={markers} height={300} radiusM={NEARBY_RESALE_RADIUS_M} />
                  <p className="mt-2 text-xs text-muted">
                    <T k="launches.map.radiusNote" fallback="Dashed circle: 1.5 km comparison radius." />{" "}
                    <Link href={`/map/?focus=${origin.lat.toFixed(5)},${origin.lng.toFixed(5)},15`} className="text-brand-700 hover:underline">
                      <T k="launches.map.openFull" fallback="Open the full map" />
                    </Link>
                  </p>
                  {schools.length ? (
                    <div className="mt-3 text-sm">
                      <div className="font-medium text-ink">
                        <T k="launches.facts.schools" fallback="Primary schools within 1 km" />
                      </div>
                      <ul className="mt-1 space-y-0.5 text-muted">
                        {schools.map((s) => (
                          <li key={`${s.name}-${s.postal}`} className="flex justify-between gap-3">
                            <span className="min-w-0 truncate">{titleCase(s.name)}</span>
                            <span className="tabular shrink-0">{formatDistance(s.distanceM)}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1 text-xs text-muted">
                        <T k="launches.facts.schoolsSource" fallback="MOE school directory (data.gov.sg); straight-line distance, not the official P1 home-school distance." />
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <Notice title={<T k="launches.map.noCoordsTitle" fallback="Location not available yet" />}>
                  <T k="launches.map.noCoordsBody" fallback="URA has not published coordinates for this project and it could not be geocoded, so the map and nearby comparisons are unavailable." />
                </Notice>
              )}
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------- Units sold */}
        <Section
          id="sales"
          title={<T k="launches.sales.title" fallback="Units sold" />}
          description={<T k="launches.sales.description" fallback="Developer-reported units launched and sold, cumulative to date and month by month." />}
        >
          {launch.sales.length === 0 ? (
            <EmptyState title={<T k="launches.sales.emptyTitle" fallback="Not launched yet" />}>
              <T k="launches.sales.emptyBody" fallback="Sales figures appear once the developer reports launched and sold units to URA (monthly developer sales)." />
            </EmptyState>
          ) : (
            <Card>
              <CardBody className="space-y-6">
                <StatGrid>
                  <Stat label={<T k="launches.sales.sold" fallback="Sold to date" />} value={formatInt(progress.sold)} sub={progress.asOf ? formatMonth(progress.asOf) : undefined} />
                  <Stat label={<T k="launches.sales.launched" fallback="Launched to date" />} value={formatInt(progress.launched)} />
                  <Stat label={<T k="launches.sales.soldOfTotal" fallback="Sold of total units" />} value={formatPct(progress.soldOfTotal, 0)} />
                  <Stat label={<T k="launches.sales.unsold" fallback="Launched, unsold" />} value={formatInt(progress.unsoldLaunched)} />
                </StatGrid>
                <SalesProgress progress={progress} />
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-ink">
                    <T k="launches.sales.monthly" fallback="Units sold per month" />
                  </h3>
                  <SimpleBarChart data={soldBars} yFormat="int" height={220} ariaLabel={`Units sold per month at ${name}`} />
                </div>
                <SourceLine>
                  <T k="launches.sales.source" fallback="URA developer sales of private residential units (monthly)" />
                  {progress.asOf ? `, ${formatMonth(progress.asOf)}` : ""}.
                </SourceLine>
              </CardBody>
            </Card>
          )}
        </Section>

        {/* ---------------------------------------------------------- Prices */}
        <Section
          id="prices"
          title={<T k="launches.price.title" fallback="Launch prices" />}
          description={<T k="launches.price.description" fallback="Median, lowest and highest price per square foot of units the developer sold each month." />}
        >
          {!price ? (
            <EmptyState title={<T k="launches.price.emptyTitle" fallback="No price data yet" />}>
              <T k="launches.price.emptyBody" fallback="Prices appear once the developer reports sales to URA. Check the enquiry form below for the latest price list." />
            </EmptyState>
          ) : (
            <Card>
              <CardBody className="space-y-6">
                <StatGrid>
                  <Stat label={<T k="launches.price.from" fallback="From" />} value={formatPsf(price.fromPsf)} sub={<T k="launches.price.fromSub" fallback="Lowest psf, {month}" vars={{ month: formatMonth(price.month) }} />} />
                  <Stat label={<T k="launches.price.median" fallback="Median" />} value={formatPsf(price.medianPsf)} sub={formatMonth(price.month)} />
                  <Stat label={<T k="launches.price.lowest" fallback="Lowest" />} value={formatPsf(price.lowestPsf)} sub={formatMonth(price.month)} />
                  <Stat label={<T k="launches.price.highest" fallback="Highest" />} value={formatPsf(price.highestPsf)} sub={formatMonth(price.month)} />
                </StatGrid>
                {trendHasLine ? (
                  <TimeSeriesChart series={trend} yFormat="psf" height={260} ariaLabel={`Monthly median, lowest and highest psf at ${name}`} />
                ) : (
                  <p className="text-sm text-muted">
                    <T k="launches.price.oneMonth" fallback="The trend chart appears once there are two months of reported prices." />
                  </p>
                )}
                <SourceLine>
                  <T k="launches.price.source" fallback="URA developer sales; price per square foot of strata floor area" />.
                </SourceLine>
              </CardBody>
            </Card>
          )}
        </Section>

        {/* ---------------------------------------------------------- Nearby resale */}
        <Section
          id="resale"
          title={<T k="launches.resale.title" fallback="Compared with nearby resale" />}
          description={
            comparison?.landed ? (
              <T k="launches.resale.descriptionLanded" fallback="Median resale price per square foot of landed projects within 1.5 km over the last 12 months." />
            ) : (
              <T k="launches.resale.description" fallback="Median resale price per square foot of condo and apartment projects within 1.5 km over the last 12 months." />
            )
          }
        >
          <Card>
            {!origin ? (
              <CardBody>
                <p className="text-sm text-muted">
                  <T k="launches.resale.noCoords" fallback="Needs the project's location, which is not available yet." />
                </p>
              </CardBody>
            ) : !summary || summary.count === 0 ? (
              <CardBody>
                <EmptyState title={<T k="launches.resale.emptyTitle" fallback="No nearby resales in the last 12 months" />} className="border-0 py-6">
                  {summary ? (
                    <T
                      k="launches.resale.emptyBody"
                      fallback="No resale transactions within 1.5 km between {from} and {to} in URA private residential transaction data."
                      vars={{ from: formatMonth(summary.windowStart), to: formatMonth(summary.windowEnd) }}
                    />
                  ) : (
                    <T k="launches.resale.noData" fallback="Private resale transactions come from URA and are not loaded on this deployment (needs the URA Data Service key)." />
                  )}
                </EmptyState>
              </CardBody>
            ) : (
              <>
                <CardBody>
                  <StatGrid>
                    <Stat
                      label={<T k="launches.resale.nearbyMedian" fallback="Nearby resale median" />}
                      value={formatPsf(summary.medianPsf)}
                      sub={<T k="launches.resale.nearbySub" fallback="{n} resales, {projects} projects" vars={{ n: formatInt(summary.count), projects: formatInt(summary.projectCount) }} />}
                    />
                    <Stat
                      label={<T k="launches.resale.launchMedian" fallback="This launch, median" />}
                      value={formatPsf(price?.medianPsf)}
                      sub={price ? formatMonth(price.month) : <T k="launches.resale.noLaunchPrice" fallback="No launch prices yet" />}
                    />
                    {premium != null ? (
                      <Stat
                        label={<T k="launches.resale.premium" fallback="Launch vs resale" />}
                        value={formatPctSigned(premium)}
                        sub={premium > 0 ? <T k="launches.resale.above" fallback="above nearby resale" /> : <T k="launches.resale.below" fallback="below nearby resale" />}
                      />
                    ) : null}
                  </StatGrid>
                </CardBody>
                <div className="border-t border-line">
                  <DataTable columns={resaleColumns} rows={summary.projects} rowKey={(r) => r.slug} />
                </div>
                {summary.projectCount > summary.projects.length ? (
                  <p className="px-5 pt-2 text-xs text-muted">
                    <T k="launches.resale.capped" fallback="Showing the {n} nearest of {total} projects." vars={{ n: summary.projects.length, total: summary.projectCount }} />
                  </p>
                ) : null}
              </>
            )}
            <div className="px-5 pb-4">
              <SourceLine>
                <T k="launches.resale.source" fallback="URA private residential transactions, resales of single units only" />
                {summary ? ` (${formatMonth(summary.windowStart)} – ${formatMonth(summary.windowEnd)})` : ""}
                {"; "}
                <T k="launches.resale.sourceDistance" fallback="straight-line distance" />.
              </SourceLine>
            </div>
          </Card>
          {launch.projectSlug ? (
            <p className="mt-3 text-sm">
              <Link href={`/condo/${launch.projectSlug}/`} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
                <T k="launches.resale.projectLink" fallback="Every recorded sale at {name}" vars={{ name }} />
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </p>
          ) : null}
        </Section>

        {/* ---------------------------------------------------------- Walk-away price */}
        <Section
          id="walk-away"
          title={<T k="launches.walk.title" fallback="Walk-away price" />}
          description={<T k="launches.walk.description" fallback="The resale price you would need, after your holding period, to get back everything you put in: price, stamp duties, interest and selling costs." />}
        >
          <WalkAwayTool
            medianPsf={price?.medianPsf ?? null}
            medianPsfMonth={price?.month ?? null}
            defaultRatePct={sora3m?.value ?? null}
            defaultRateSource={sora3m ? `3M compounded SORA, ${formatDay(sora3m.date)}` : null}
          />
        </Section>

        {/* ---------------------------------------------------------- Enquiry */}
        <Section
          id="enquire"
          title={<T k="launches.enquire.title" fallback="Enquire about this launch" />}
          description={<T k="launches.enquire.description" fallback="Ask for the price list, floor plans or a showflat appointment." />}
        >
          <LeadForm type="enquiry" context={{ launch: launch.slug, launchType: launch.type }} title={`Enquire about ${name}`} />
        </Section>

        <AskPanel context={{ kind: "launch", slug: launch.slug, launchType: launch.type }} />

        <WhatsNext property={{ kind: "launch", slug: launch.slug, launchType: launch.type }} label={name} />
      </div>
    </PageContainer>
  );
}
