import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectRentals, getProjects, getProjectTransactions } from "@/lib/data/private";
import { getSeries } from "@/lib/data/stats";
import { monthLabel } from "@/lib/data/months";
import { getCoverage } from "@/lib/data/meta";
import { enblocTier } from "@/lib/calc/enbloc";
import {
  enblocStartYear,
  formatDistrict,
  latestFirst,
  monthlyMedianPsf,
  salesScatter,
  saleTypeMix,
  seriesPsfPoints,
  sunSummary,
  tenureSummary,
  tenureText,
  toSaleRow,
  unitMix,
} from "@/lib/private-insights";
import { formatInt, formatMonth, formatPsf, formatSgd } from "@/lib/format";
import { titleCase } from "@/lib/slug";
import { pageMetadata, absoluteUrl } from "@/lib/seo";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { JsonLd } from "@/components/ui/json-ld";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stat, StatGrid } from "@/components/ui/stat";
import { DataTable } from "@/components/ui/table";
import { EmptyState, Notice } from "@/components/ui/notice";
import { TimeSeriesChart, type TimeSeries } from "@/components/charts/time-series-chart";
import { GatedPanel } from "@/components/gating/gated-panel";
import { AskPanel } from "@/components/ai/ask-panel";
import { WhatsNext } from "@/components/property/whats-next";
import { T } from "@/components/i18n/t";
import { SalesTable } from "@/components/private/sales-table";
import { SalesHistory } from "@/components/private/sales-history";
import { CondoRentals } from "@/components/private/condo-rentals";
import { StackingPlan } from "@/components/private/stacking-plan";
import { ProfitLoss } from "@/components/private/profit-loss";
import { SunPathDiagram } from "@/components/private/sun-path";
import { CommuteFacts, NearbyAmenities } from "@/components/private/nearby";
import { SectionNav } from "@/components/private/section-nav";
import { SourceLine } from "@/components/private/source-line";
import { Detail } from "@/components/private/detail";
import { TenureLabel } from "@/components/private/tenure-label";
import { getCondoProject, latestPrivateMonth, launchFor, nearbyContext, pointOf } from "@/components/private/server-data";
import type { UnitMixRow } from "@/lib/private-insights";

export const revalidate = 86400;

/** Prerender the 150 most actively traded projects; the rest render on first request. */
export function generateStaticParams(): { slug: string }[] {
  return getProjects()
    .filter((p) => !p.isLanded)
    .sort((a, b) => b.tx.count12m - a.tx.count12m || b.tx.count - a.tx.count)
    .slice(0, 150)
    .map((p) => ({ slug: p.slug }));
}

type Props = { params: Promise<{ slug: string }> };

const SEGMENT_NAMES = { CCR: "Core Central Region", RCR: "Rest of Central Region", OCR: "Outside Central Region" } as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = getCondoProject(slug);
  if (!p) return { title: "Project not found", robots: { index: false, follow: true } };
  const name = titleCase(p.name);
  const where = [p.district != null ? `District ${p.district}` : null, p.segment].filter(Boolean).join(", ");
  const facts = [
    `${name}${where ? ` (${where})` : ""}: ${tenureText(p.tenure, new Date().getFullYear())}.`,
    p.tx.count ? `${formatInt(p.tx.count)} recorded sales${p.tx.lastPrice ? `, latest ${formatSgd(p.tx.lastPrice)} in ${formatMonth(p.tx.last)}` : ""}.` : null,
    p.tx.medianPsf12m ? `Median ${formatPsf(p.tx.medianPsf12m)} over the last 12 months.` : null,
    "Sales, rents, unit mix, sun path, stacking plan and nearby schools and MRT.",
  ];
  return pageMetadata({ title: `${name} — prices, sales & rents`, description: facts.filter(Boolean).join(" "), path: `/condo/${p.slug}/` });
}

const NAV = [
  { id: "details", k: "private.nav.details", fallback: "Details" },
  { id: "sun-path", k: "private.nav.sun", fallback: "Sun path" },
  { id: "prices", k: "private.nav.prices", fallback: "Price chart" },
  { id: "sales", k: "private.nav.sales", fallback: "Sales & rents" },
  { id: "unit-mix", k: "private.nav.unitMix", fallback: "Unit mix" },
  { id: "profit-loss", k: "private.nav.profitLoss", fallback: "Profit & loss" },
  { id: "en-bloc", k: "private.nav.enbloc", fallback: "En bloc" },
  { id: "amenities", k: "private.nav.amenities", fallback: "Amenities" },
  { id: "commute", k: "private.nav.commute", fallback: "Commute" },
  { id: "stacking", k: "private.nav.stacking", fallback: "Stacking plan" },
];

const SECTION = "scroll-mt-32";

export default async function CondoPage({ params }: Props) {
  const { slug } = await params;
  const p = getCondoProject(slug);
  if (!p) notFound();

  const currentYear = new Date().getFullYear();
  const name = titleCase(p.name);
  const txs = getProjectTransactions(p.slug);
  const latest = latestFirst(txs);
  const asOf = latestPrivateMonth(txs);
  const tenure = tenureSummary(p.tenure, currentYear);
  const point = pointOf(p);
  const mix = saleTypeMix(txs);
  const launch = launchFor(p.launchSlug);
  const units = unitMix(txs);
  const rentalsCount = getProjectRentals(p.slug).length;
  const coverage = getCoverage();
  const enblocStart = enblocStartYear(p.tenure, txs);
  const enbloc = enblocTier({
    tenureKind: p.tenure?.kind ?? null,
    leaseYears: p.tenure?.years ?? null,
    startYear: enblocStart,
    currentYear,
    propertyTypes: p.propertyTypes,
  });
  const tiered = enbloc.tier === "A" || enbloc.tier === "B" || enbloc.tier === "C";
  const sun = point ? sunSummary(point.lat, point.lng, currentYear) : null;
  const near = point ? nearbyContext(point) : null;

  // Price chart: project monthly median + individual sales (last 5 years) + district comparison over the same span.
  const line = monthlyMedianPsf(txs);
  const scatter = asOf != null ? salesScatter(txs, asOf - 59) : [];
  const chartFrom = Math.min(line[0]?.x ?? Number.POSITIVE_INFINITY, scatter[0]?.x ?? Number.POSITIVE_INFINITY);
  const districtSeries = p.district != null ? getSeries(`private-d:${p.district}:ALL`) : null;
  const districtPts = Number.isFinite(chartFrom) ? seriesPsfPoints(districtSeries?.points, chartFrom, asOf ?? undefined) : [];
  const chartSeries: TimeSeries[] = [
    { name: "Monthly median psf", points: line },
    { name: "Individual sales (last 5 years)", points: scatter, kind: "scatter" },
  ];
  if (districtPts.length) chartSeries.push({ name: `${formatDistrict(p.district)} median psf (all private)`, points: districtPts });

  const typeLine = p.propertyTypes.join(", ");
  const unitCols = [
    { key: "band", header: <T k="private.mix.size" fallback="Size" />, cell: (r: UnitMixRow) => r.label },
    { key: "count", header: <T k="private.mix.sales" fallback="Sales" />, align: "right" as const, cell: (r: UnitMixRow) => formatInt(r.count) },
    { key: "price", header: <T k="private.mix.medianPrice" fallback="Median price" />, align: "right" as const, cell: (r: UnitMixRow) => formatSgd(r.medianPrice) },
    { key: "psf", header: <T k="private.mix.medianPsf" fallback="Median psf" />, align: "right" as const, cell: (r: UnitMixRow) => formatPsf(r.medianPsf) },
  ];

  return (
    <PageContainer className="pb-16">
      <Breadcrumbs items={[{ label: "Property analysis", href: "/property-analysis/" }, { label: name }]} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ApartmentComplex",
          name,
          url: absoluteUrl(`/condo/${p.slug}/`),
          address: { "@type": "PostalAddress", streetAddress: titleCase(p.street), addressCountry: "SG" },
          ...(point ? { geo: { "@type": "GeoCoordinates", latitude: point.lat, longitude: point.lng } } : {}),
        }}
      />

      <PageHeader
        eyebrow={typeLine || <T k="private.condo.eyebrow" fallback="Condo" />}
        title={name}
        description={
          <>
            {titleCase(p.street)}
            {p.district != null ? (
              <>
                {" · "}
                <T k="private.district" fallback="District {d}" vars={{ d: p.district }} />
              </>
            ) : null}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {p.district != null ? <Badge tone="neutral">{formatDistrict(p.district)}</Badge> : null}
          {p.segment ? (
            <Badge tone="brand" title={SEGMENT_NAMES[p.segment]}>
              {p.segment} · <T k={`private.segment.${p.segment}`} fallback={SEGMENT_NAMES[p.segment]} />
            </Badge>
          ) : null}
          <Badge tone="neutral">
            <TenureLabel tenure={tenure} />
          </Badge>
          {p.hasUnitLevel ? (
            <Badge tone="info">
              <T k="private.unitLevel" fallback="Unit-level records" />
            </Badge>
          ) : null}
        </div>
        <Card className="mt-5">
          <CardBody>
            <StatGrid>
              <Stat label={<T k="private.stat.lastSale" fallback="Last sale" />} value={formatSgd(p.tx.lastPrice)} sub={formatMonth(p.tx.last)} />
              <Stat
                label={<T k="private.stat.medianPsf12m" fallback="Median psf (12 mths)" />}
                value={formatPsf(p.tx.medianPsf12m)}
                sub={asOf != null ? <T k="private.stat.to" fallback="12 months to {m}" vars={{ m: formatMonth(monthLabel(asOf)) }} /> : undefined}
              />
              <Stat
                label={<T k="private.stat.sales12m" fallback="Sales (12 mths)" />}
                value={formatInt(p.tx.count12m)}
                sub={<T k="private.stat.totalSales" fallback="{n} recorded in total" vars={{ n: formatInt(p.tx.count) }} />}
              />
              <Stat
                label={<T k="private.stat.medianRent12m" fallback="Median rent (12 mths)" />}
                value={p.rentals?.medianRent12m != null ? `${formatSgd(p.rentals.medianRent12m)}/mo` : "—"}
                sub={
                  p.rentals?.medianRent12m != null ? (
                    p.rentals.count12m === 1 ? (
                      <T k="private.stat.contract1" fallback="1 contract" />
                    ) : (
                      <T k="private.stat.contracts" fallback="{n} contracts" vars={{ n: formatInt(p.rentals.count12m) }} />
                    )
                  ) : (
                    <T k="private.stat.noRent" fallback="No contracts in 12 months" />
                  )
                }
              />
            </StatGrid>
          </CardBody>
        </Card>
      </PageHeader>

      <SectionNav links={NAV} />

      <div className="space-y-12">
        <Section id="details" className={SECTION} title={<T k="private.details.title" fallback="Details" />}>
          <Card>
            <CardBody>
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <Detail label={<T k="private.details.tenure" fallback="Tenure" />}>
                  <TenureLabel tenure={tenure} />
                  {p.tenure?.kind === "leasehold" && p.tenure.raw ? <span className="block text-xs text-muted">{p.tenure.raw}</span> : null}
                </Detail>
                <Detail label={<T k="private.details.district" fallback="District / segment" />}>
                  {formatDistrict(p.district)}
                  {p.segment ? ` · ${p.segment} (${SEGMENT_NAMES[p.segment]})` : ""}
                </Detail>
                <Detail label={<T k="private.details.types" fallback="Property types" />}>{typeLine || "—"}</Detail>
                <Detail label={<T k="private.details.street" fallback="Street" />}>{titleCase(p.street)}</Detail>
                <Detail label={<T k="private.details.saleMix" fallback="Sale types recorded" />}>
                  {mix.total ? (
                    <ul className="flex flex-wrap gap-1.5">
                      <li>
                        <Badge>
                          <T k="private.sales.typeNew" fallback="New Sale" /> {formatInt(mix.newSale)}
                        </Badge>
                      </li>
                      <li>
                        <Badge>
                          <T k="private.sales.typeSub" fallback="Sub Sale" /> {formatInt(mix.subSale)}
                        </Badge>
                      </li>
                      <li>
                        <Badge>
                          <T k="private.sales.typeResale" fallback="Resale" /> {formatInt(mix.resale)}
                        </Badge>
                      </li>
                    </ul>
                  ) : (
                    "—"
                  )}
                </Detail>
                <Detail label={<T k="private.details.records" fallback="Sales on record" />}>
                  {p.tx.count === 1 ? (
                    <T k="private.details.records1" fallback="1 sale, {m}" vars={{ m: formatMonth(p.tx.last) }} />
                  ) : p.tx.count ? (
                    <T k="private.details.recordsRange" fallback="{n} sales, {from} to {to}" vars={{ n: formatInt(p.tx.count), from: formatMonth(p.tx.first), to: formatMonth(p.tx.last) }} />
                  ) : (
                    "—"
                  )}
                </Detail>
              </dl>
              {launch ? (
                <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-900">
                  <T k="private.details.launch" fallback="This project also has a new-launch page with units sold and launch prices." />{" "}
                  <Link href={`/new-launch/${launch.type}/${launch.slug}/`} className="font-medium text-brand-700 underline">
                    <T k="private.details.launchLink" fallback="See the new launch" />
                  </Link>
                </div>
              ) : null}
              <SourceLine>
                <T k="private.source.ura" fallback="URA private residential transactions (caveats lodged), last 5 years" />
              </SourceLine>
            </CardBody>
          </Card>
        </Section>

        <Section
          id="sun-path"
          className={SECTION}
          title={<T k="private.sun.title" fallback="Sun path" />}
          description={<T k="private.sun.desc" fallback="Where the sun is through the day at this location, and which facings take the afternoon sun." />}
        >
          {point && sun ? (
            <Card>
              <CardBody className="space-y-5">
                <SunPathDiagram lat={point.lat} lng={point.lng} year={currentYear} />
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-ink">
                    <T k="private.sun.afternoonTitle" fallback="Afternoon sun (from 15:00)" />
                  </h3>
                  <DataTable
                    dense
                    columns={[
                      { key: "day", header: <T k="private.sun.date" fallback="Date" />, cell: (d) => <T k={`private.sun.day.${d.key}`} fallback={d.label} /> },
                      { key: "dir", header: <T k="private.sun.comesFrom" fallback="Comes from" />, cell: (d) => d.directions.join(" → ") },
                      { key: "az", header: <T k="private.sun.bearing" fallback="Bearing" />, align: "right", cell: (d) => `${Math.round(d.fromAzimuth)}° → ${Math.round(d.toAzimuth)}°` },
                      { key: "last", header: <T k="private.sun.lastLight" fallback="Sun above horizon until" />, align: "right", cell: (d) => d.lastLight },
                    ]}
                    rows={sun.days}
                    rowKey={(d) => d.key}
                  />
                  <p className="mt-3 text-sm text-ink">
                    {sun.allYear.length ? (
                      <T k="private.sun.allYear" fallback="Units facing {dirs} take the afternoon sun on all three dates." vars={{ dirs: sun.allYear.join(", ") }} />
                    ) : (
                      <T
                        k="private.sun.seasonal"
                        fallback="No single facing takes the afternoon sun on all three dates: it comes from {mar} in March, {jun} in June and {dec} in December."
                        vars={{
                          mar: sun.days.find((d) => d.key === "mar")?.directions.join("/") ?? "—",
                          jun: sun.days.find((d) => d.key === "jun")?.directions.join("/") ?? "—",
                          dec: sun.days.find((d) => d.key === "dec")?.directions.join("/") ?? "—",
                        }}
                      />
                    )}{" "}
                    {sun.shaded.length ? (
                      <T k="private.sun.shaded" fallback="Units facing {dirs} get no direct sun after 15:00 on these dates." vars={{ dirs: sun.shaded.join(", ") }} />
                    ) : null}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    <T
                      k="private.sun.caveat"
                      fallback="Computed from the project's coordinates only (solar position algorithm). It does not account for surrounding buildings, trees or the block's actual orientation."
                    />
                  </p>
                </div>
              </CardBody>
            </Card>
          ) : (
            <EmptyState title={<T k="private.noCoords" fallback="Location not available" />}>
              <T k="private.noCoordsBody" fallback="This project has not been geocoded (OneMap), so sun path, amenities and distances can't be computed yet." />
            </EmptyState>
          )}
        </Section>

        <Section
          id="prices"
          className={SECTION}
          title={<T k="private.prices.title" fallback="Price chart" />}
          description={<T k="private.prices.desc" fallback="Monthly median psf, every sale in the last five years, and the district median for comparison." />}
        >
          <Card>
            <CardBody>
              {txs.length ? (
                <TimeSeriesChart series={chartSeries} yFormat="psf" height={320} ariaLabel={`Price per square foot over time for ${name}, with the ${formatDistrict(p.district)} median for comparison`} />
              ) : (
                <EmptyState title={<T k="private.noSales" fallback="No sales recorded" />}>
                  <T k="private.noSalesBody" fallback="URA has no caveats lodged for this project in the last five years." />
                </EmptyState>
              )}
              <SourceLine>
                <T k="private.source.uraStats" fallback="URA private residential transactions; district median from all private sales in the district" />
              </SourceLine>
            </CardBody>
          </Card>
        </Section>

        <Section id="sales" className={SECTION} title={<T k="private.sales.title" fallback="Sales & rents" />}>
          <div className="space-y-6">
            <Card>
              <CardHeader
                title={<T k="private.sales.latest" fallback="Latest sales" />}
                description={<T k="private.sales.latestDesc" fallback="The 10 most recent caveats. URA publishes floor ranges, not unit numbers." />}
              />
              <SalesTable rows={latest.slice(0, 10).map((t) => toSaleRow(t))} variant="condo" />
            </Card>
            {txs.length > 10 ? (
              <div>
                <h3 className="mb-3 text-base font-semibold text-ink">
                  <T k="private.sales.full" fallback="Full sales history" /> <span className="text-sm font-normal text-muted">({formatInt(txs.length)})</span>
                </h3>
                <GatedPanel feature="sales.full">
                  <Card>
                    <CardBody>
                      <SalesHistory endpoint={`/api/gated/private/condo/${p.slug}/sales/`} variant="condo" />
                    </CardBody>
                  </Card>
                </GatedPanel>
              </div>
            ) : null}
            <div>
              <h3 className="mb-3 text-base font-semibold text-ink">
                <T k="private.rent.title" fallback="Rental contracts" />
                {rentalsCount ? <span className="text-sm font-normal text-muted"> ({formatInt(rentalsCount)})</span> : null}
              </h3>
              {rentalsCount ? (
                <GatedPanel feature="property.context">
                  <Card>
                    <CardBody>
                      <CondoRentals slug={p.slug} />
                    </CardBody>
                  </Card>
                </GatedPanel>
              ) : (
                <Notice>
                  {coverage.privateRentals ? (
                    <T k="private.rent.noneProject" fallback="No rental contracts are recorded for this project in URA's rental data." />
                  ) : (
                    <T k="private.rent.noSource" fallback="Private rental contracts (URA) are not loaded on this deployment yet." />
                  )}
                </Notice>
              )}
            </div>
            <SourceLine>
              <T k="private.source.uraRent" fallback="URA private residential transactions and rental contracts" />
            </SourceLine>
          </div>
        </Section>

        <Section
          id="unit-mix"
          className={SECTION}
          title={<T k="private.mix.title" fallback="Unit mix" />}
          description={<T k="private.mix.desc" fallback="Sales by unit size, from the floor areas recorded in each caveat." />}
        >
          <Card>
            {units.rows.length ? (
              <DataTable columns={unitCols} rows={units.rows} rowKey={(r) => r.key} />
            ) : (
              <CardBody>
                <p className="text-sm text-muted">
                  <T k="private.mix.none" fallback="No single-unit sales with a recorded floor area." />
                </p>
              </CardBody>
            )}
            <CardBody className="pt-0">
              {units.excludedBulk ? (
                <p className="mt-3 text-xs text-muted">
                  {units.excludedBulk === 1 ? (
                    <T k="private.mix.bulk1" fallback="1 bulk purchase (several units in one caveat) is excluded." />
                  ) : (
                    <T k="private.mix.bulk" fallback="{n} bulk purchases (several units in one caveat) are excluded." vars={{ n: units.excludedBulk }} />
                  )}
                </p>
              ) : null}
              <SourceLine>
                <T k="private.source.ura" fallback="URA private residential transactions (caveats lodged), last 5 years" />
              </SourceLine>
            </CardBody>
          </Card>
        </Section>

        <Section
          id="profit-loss"
          className={SECTION}
          title={<T k="private.pl.title" fallback="Profit & loss" />}
          description={<T k="private.pl.desc" fallback="Units bought and later resold: what owners paid and what they sold for." />}
        >
          {p.hasUnitLevel ? (
            <GatedPanel feature="property.profit-loss">
              <Card>
                <CardBody>
                  <ProfitLoss slug={p.slug} />
                </CardBody>
              </Card>
            </GatedPanel>
          ) : (
            <Notice>
              <T
                k="private.pl.needsUnitLong"
                fallback="Profit and loss pairs need unit-level records (the same unit sold twice). URA's public data has floor ranges but no unit numbers, so sales can't be paired for this project."
              />
            </Notice>
          )}
        </Section>

        <Section
          id="en-bloc"
          className={SECTION}
          title={<T k="private.enbloc.title" fallback="En-bloc potential" />}
          description={<T k="private.enbloc.desc" fallback="A transparent heuristic from tenure and age, not a prediction." />}
        >
          <Card>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={enbloc.tier === "A" ? "up" : enbloc.tier === "B" ? "brand" : enbloc.tier === "C" ? "info" : "neutral"} className="text-sm">
                  {tiered ? (
                    <>
                      <T k="private.enbloc.tier" fallback="Tier {tier}" vars={{ tier: enbloc.tier }} />
                      {" · "}
                    </>
                  ) : null}
                  {enbloc.label}
                </Badge>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
                {enbloc.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
                {p.tenure?.kind === "freehold" && enblocStart != null ? (
                  <li>
                    <T k="private.enbloc.freeholdAge" fallback="Age for freehold projects is taken from the earliest recorded new sale (a launch-year proxy)." />
                  </li>
                ) : null}
                {p.tenure?.kind === "freehold" && enblocStart == null ? (
                  <li>
                    <T k="private.enbloc.freeholdUnknown" fallback="No new-sale record, so the age of this freehold project isn't known from transaction data." />
                  </li>
                ) : null}
              </ul>
              <p className="text-xs text-muted">
                <T
                  k="private.enbloc.note"
                  fallback="Tiers: A = freehold/999-year and 30+ years old; B = freehold/999-year 20+ years, or 99-year 40+ years; C = 99-year 25+ years. A collective sale also needs most owners to agree and a buyer at the right price."
                />
              </p>
            </CardBody>
          </Card>
        </Section>

        <Section
          id="amenities"
          className={SECTION}
          title={<T k="private.nearby.title" fallback="Amenities" />}
          description={<T k="private.nearby.desc" fallback="Primary schools, MRT stations and announced future stations nearby." />}
        >
          {near ? (
            <NearbyAmenities ctx={near} label={name} />
          ) : (
            <EmptyState title={<T k="private.noCoords" fallback="Location not available" />}>
              <T k="private.noCoordsBody" fallback="This project has not been geocoded (OneMap), so sun path, amenities and distances can't be computed yet." />
            </EmptyState>
          )}
        </Section>

        <Section id="commute" className={SECTION} title={<T k="private.commute.title" fallback="Commute" />}>
          {near ? (
            <CommuteFacts ctx={near} />
          ) : (
            <EmptyState title={<T k="private.noCoords" fallback="Location not available" />}>
              <T k="private.noCoordsBody" fallback="This project has not been geocoded (OneMap), so sun path, amenities and distances can't be computed yet." />
            </EmptyState>
          )}
        </Section>

        <Section
          id="stacking"
          className={SECTION}
          title={<T k="private.stack.title" fallback="Stacking plan" />}
          description={
            p.hasUnitLevel ? (
              <T k="private.stack.descUnit" fallback="Latest psf for each unit by stack and floor." />
            ) : (
              <T k="private.stack.descGrid" fallback="Without unit numbers, prices are grouped by floor range and unit size over the last five years." />
            )
          }
        >
          {txs.length ? (
            <GatedPanel feature="property.stacking">
              <Card>
                <CardBody>
                  <StackingPlan slug={p.slug} />
                </CardBody>
              </Card>
            </GatedPanel>
          ) : (
            <EmptyState title={<T k="private.noSales" fallback="No sales recorded" />}>
              <T k="private.noSalesBody" fallback="URA has no caveats lodged for this project in the last five years." />
            </EmptyState>
          )}
        </Section>

        <AskPanel context={{ kind: "condo", slug: p.slug }} title={`Ask about ${name}`} />
        <WhatsNext property={{ kind: "condo", slug: p.slug }} label={name} />
      </div>
    </PageContainer>
  );
}
