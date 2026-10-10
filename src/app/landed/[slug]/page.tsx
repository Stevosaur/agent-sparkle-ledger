import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  LANDED_TYPES,
  getDistrictTransactions,
  getLandedAddress,
  getLandedAddresses,
  getLandedAddressTransactions,
  getLandedStreet,
  getLandedStreetTransactions,
} from "@/lib/data/private";
import { getSeries } from "@/lib/data/stats";
import { monthLabel } from "@/lib/data/months";
import { displayAddress, formatDistrict, isLandedHouse, latestFirst, priceRangeSummary, salesScatter, seriesPsfPoints, tenureSummary, tenureText, timeAdjustedEstimate, toSaleRow } from "@/lib/private-insights";
import { formatArea, formatInt, formatMonth, formatPctSigned, formatPsf, formatSgd, formatSgdCompact, sqmToSqft } from "@/lib/format";
import { titleCase } from "@/lib/slug";
import { absoluteUrl, pageMetadata } from "@/lib/seo";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { JsonLd } from "@/components/ui/json-ld";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stat, StatGrid } from "@/components/ui/stat";
import { EmptyState, Notice } from "@/components/ui/notice";
import { ButtonLink } from "@/components/ui/button";
import { TimeSeriesChart, type TimeSeries } from "@/components/charts/time-series-chart";
import { AskPanel } from "@/components/ai/ask-panel";
import { WhatsNext } from "@/components/property/whats-next";
import { T } from "@/components/i18n/t";
import { SalesTable } from "@/components/private/sales-table";
import { NearbyAmenities } from "@/components/private/nearby";
import { RebuildCost } from "@/components/private/rebuild-cost";
import { SectionNav } from "@/components/private/section-nav";
import { SourceLine } from "@/components/private/source-line";
import { Detail } from "@/components/private/detail";
import { TenureLabel } from "@/components/private/tenure-label";
import { addressSlugMap, latestPrivateMonth, nearbyContext, pointOf } from "@/components/private/server-data";

export const revalidate = 86400;

/** Prerender the 100 most recently traded addresses; the rest render on first request. */
export function generateStaticParams(): { slug: string }[] {
  return getLandedAddresses()
    .slice()
    .sort((a, b) => b.tx.count12m - a.tx.count12m || b.tx.count - a.tx.count)
    .slice(0, 100)
    .map((a) => ({ slug: a.slug }));
}

type Props = { params: Promise<{ slug: string }> };

const SEGMENT_NAMES = { CCR: "Core Central Region", RCR: "Rest of Central Region", OCR: "Outside Central Region" } as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const a = getLandedAddress(slug);
  if (!a) return { title: "Address not found", robots: { index: false, follow: true } };
  const name = displayAddress(a.address);
  const facts = [
    `${name}${a.propertyType ? `, a ${a.propertyType.toLowerCase()} house` : ""}${a.district != null ? ` in District ${a.district}` : ""}.`,
    a.landAreaSqm != null ? `Land area ${formatArea(a.landAreaSqm)}.` : null,
    `${tenureText(a.tenure, new Date().getFullYear())}.`,
    a.tx.count ? `${formatInt(a.tx.count)} recorded sales${a.tx.lastPrice ? `, latest ${formatSgd(a.tx.lastPrice)} in ${formatMonth(a.tx.last)}` : ""}.` : null,
    "Street and district sales, rebuild-cost calculator and nearby schools and MRT.",
  ];
  return pageMetadata({ title: `${name} — sales, land price & rebuild cost`, description: facts.filter(Boolean).join(" "), path: `/landed/${a.slug}/` });
}

const NAV = [
  { id: "details", k: "private.nav.details", fallback: "Details" },
  { id: "sales", k: "private.nav.propertySales", fallback: "Sales" },
  { id: "street", k: "private.nav.street", fallback: "Street" },
  { id: "district", k: "private.nav.district", fallback: "District" },
  { id: "nearby", k: "private.nav.nearby", fallback: "Nearby" },
  { id: "rebuild", k: "private.nav.rebuild", fallback: "Rebuild cost" },
  { id: "planning", k: "private.nav.planning", fallback: "Planning" },
];

const SECTION = "scroll-mt-32";

export default async function LandedAddressPage({ params }: Props) {
  const { slug } = await params;
  const a = getLandedAddress(slug);
  if (!a) notFound();

  const currentYear = new Date().getFullYear();
  const name = displayAddress(a.address);
  const streetName = titleCase(a.street);
  const street = getLandedStreet(a.streetSlug);
  const own = latestFirst(getLandedAddressTransactions(a.slug));
  // same scope as the street page: landed houses only (strata landed homes are not part of landed streets)
  const others = street ? latestFirst(getLandedStreetTransactions(street.slug)).filter((t) => isLandedHouse(t) && t.address !== a.address) : [];
  const slugs = addressSlugMap(a.streetSlug);
  const asOf = latestPrivateMonth(own);
  const tenure = tenureSummary(a.tenure, currentYear);
  const point = pointOf(a);
  const near = point ? nearbyContext(point) : null;

  // District context: landed sales in the last 12 months + the district's median psf series.
  const districtSeries = a.district != null ? (getSeries(`private-d:${a.district}:Landed`) ?? getSeries(`private-d:${a.district}:ALL`)) : null;
  const landed12 =
    a.district != null && asOf != null ? getDistrictTransactions(a.district).filter((t) => LANDED_TYPES.has(t.propertyType) && t.monthIndex > asOf - 12) : [];
  // median land psf only from caveats that record land area (strata landed homes record floor area)
  const district12 = priceRangeSummary(landed12, { landPsfOnly: true });
  const estimate = own[0] && districtSeries && asOf != null ? timeAdjustedEstimate(own[0], districtSeries.points, asOf) : null;
  const chartFrom = asOf != null ? asOf - 59 : 0;
  const chartSeries: TimeSeries[] = [];
  const districtPts = seriesPsfPoints(districtSeries?.points, chartFrom, asOf ?? undefined);
  if (districtPts.length) chartSeries.push({ name: `${formatDistrict(a.district)} median psf (all private)`, points: districtPts });
  const ownPts = salesScatter(own, chartFrom);
  if (ownPts.length) chartSeries.push({ name: "This property (land psf)", points: ownPts, kind: "scatter" });

  return (
    <PageContainer className="pb-16">
      <Breadcrumbs
        items={[
          { label: "Property analysis", href: "/property-analysis/" },
          ...(street ? [{ label: streetName, href: `/landed-street/${street.slug}/` }] : []),
          { label: name },
        ]}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SingleFamilyResidence",
          name,
          url: absoluteUrl(`/landed/${a.slug}/`),
          address: { "@type": "PostalAddress", streetAddress: name, addressCountry: "SG" },
          ...(point ? { geo: { "@type": "GeoCoordinates", latitude: point.lat, longitude: point.lng } } : {}),
        }}
      />

      <PageHeader
        eyebrow={a.propertyType ?? <T k="private.landed.eyebrow" fallback="Landed home" />}
        title={name}
        description={
          <>
            {street ? (
              <Link href={`/landed-street/${street.slug}/`} className="text-brand-700 hover:underline">
                {streetName}
              </Link>
            ) : (
              streetName
            )}
            {a.district != null ? (
              <>
                {" · "}
                <T k="private.district" fallback="District {d}" vars={{ d: a.district }} />
              </>
            ) : null}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {a.district != null ? <Badge>{formatDistrict(a.district)}</Badge> : null}
          {a.segment ? (
            <Badge tone="brand" title={SEGMENT_NAMES[a.segment]}>
              {a.segment} · <T k={`private.segment.${a.segment}`} fallback={SEGMENT_NAMES[a.segment]} />
            </Badge>
          ) : null}
          <Badge>
            <TenureLabel tenure={tenure} />
          </Badge>
        </div>
        <Card className="mt-5">
          <CardBody>
            <StatGrid>
              <Stat label={<T k="private.stat.lastSale" fallback="Last sale" />} value={formatSgd(a.tx.lastPrice)} sub={formatMonth(a.tx.last)} />
              <Stat
                label={<T k="private.landed.landArea" fallback="Land area" />}
                value={a.landAreaSqm != null ? `${formatInt(Math.round(a.landAreaSqm))} sqm` : "—"}
                sub={a.landAreaSqm != null ? `${formatInt(Math.round(sqmToSqft(a.landAreaSqm)))} sqft` : undefined}
              />
              <Stat
                label={<T k="private.landed.estimate" fallback="Estimate (time-adjusted)" />}
                value={estimate ? formatSgd(estimate.estimate) : "—"}
                sub={
                  estimate ? (
                    <T k="private.landed.estimateSub" fallback="Estimate as of {m}" vars={{ m: formatMonth(estimate.asOfMonth) }} />
                  ) : (
                    <T k="private.landed.noEstimate" fallback="Not enough district data" />
                  )
                }
              />
              <Stat
                label={<T k="private.landed.salesRecorded" fallback="Sales recorded" />}
                value={formatInt(a.tx.count)}
                sub={a.tx.first ? <T k="private.landed.since" fallback="Since {m}" vars={{ m: formatMonth(a.tx.first) }} /> : undefined}
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
                <Detail label={<T k="private.landed.lotSize" fallback="Lot size" />}>
                  {a.landAreaSqm != null ? formatArea(a.landAreaSqm) : <T k="private.landed.lotUnknown" fallback="Not recorded" />}
                  {a.landAreaSqm != null ? (
                    <span className="block text-xs text-muted">
                      <T k="private.landed.lotNote" fallback="Land area recorded in the latest sale caveat." />
                    </span>
                  ) : null}
                </Detail>
                <Detail label={<T k="private.details.tenure" fallback="Tenure" />}>
                  <TenureLabel tenure={tenure} />
                  {a.tenure?.kind === "leasehold" && a.tenure.raw ? <span className="block text-xs text-muted">{a.tenure.raw}</span> : null}
                </Detail>
                <Detail label={<T k="private.landed.propertyType" fallback="Property type" />}>{a.propertyType ?? "—"}</Detail>
                <Detail label={<T k="private.details.district" fallback="District / segment" />}>
                  {formatDistrict(a.district)}
                  {a.segment ? ` · ${a.segment} (${SEGMENT_NAMES[a.segment]})` : ""}
                </Detail>
                <Detail label={<T k="private.details.street" fallback="Street" />}>
                  {street ? (
                    <Link href={`/landed-street/${street.slug}/`} className="text-brand-700 hover:underline">
                      {streetName}
                    </Link>
                  ) : (
                    streetName
                  )}
                </Detail>
              </dl>
              <SourceLine>
                <T k="private.source.uraUnit" fallback="URA private residential transactions with unit-level (REALIS-style) records" />
              </SourceLine>
            </CardBody>
          </Card>
        </Section>

        <Section id="sales" className={SECTION} title={<T k="private.landed.salesTitle" fallback="Sales of this property" />}>
          <Card>
            <SalesTable rows={own.map((t) => toSaleRow(t))} variant="landed" showAddress={false} />
            <CardBody className="pt-0">
              <SourceLine>
                <T k="private.source.uraUnit" fallback="URA private residential transactions with unit-level (REALIS-style) records" />
              </SourceLine>
            </CardBody>
          </Card>
        </Section>

        <Section
          id="street"
          className={SECTION}
          title={<T k="private.landed.streetTitle" fallback="Other sales on {street}" vars={{ street: streetName }} />}
          actions={
            street ? (
              <ButtonLink href={`/landed-street/${street.slug}/`} variant="outline" size="sm">
                <T k="private.landed.allStreet" fallback="All addresses on the street" />
              </ButtonLink>
            ) : undefined
          }
        >
          <Card>
            {others.length ? (
              <>
                <SalesTable rows={others.slice(0, 10).map((t) => toSaleRow(t, t.address ? (slugs.get(t.address) ?? null) : null))} variant="landed" />
                {others.length > 10 ? (
                  <CardBody className="pt-0">
                    <p className="mt-3 text-sm text-muted">
                      <T k="private.landed.moreOnStreet" fallback="Showing the latest 10 of {n} other sales on this street." vars={{ n: formatInt(others.length) }} />
                    </p>
                  </CardBody>
                ) : null}
              </>
            ) : (
              <CardBody>
                <p className="text-sm text-muted">
                  <T k="private.landed.noOthers" fallback="No other landed sales are recorded on this street." />
                </p>
              </CardBody>
            )}
          </Card>
        </Section>

        <Section
          id="district"
          className={SECTION}
          title={<T k="private.landed.districtTitle" fallback="District context" />}
          description={<T k="private.landed.districtDesc" fallback="Landed sales across the postal district and how the district's prices have moved." />}
        >
          <div className="space-y-4">
            <Card>
              <CardHeader
                title={<T k="private.landed.district12" fallback="Landed sales in {d}, last 12 months" vars={{ d: formatDistrict(a.district) }} />}
              />
              <CardBody>
                {district12.count ? (
                  <StatGrid>
                    <Stat
                      label={<T k="private.landed.count" fallback="Sales" />}
                      value={formatInt(district12.count)}
                      sub={
                        district12.minPrice === district12.maxPrice
                          ? formatSgdCompact(district12.minPrice)
                          : `${formatSgdCompact(district12.minPrice)} – ${formatSgdCompact(district12.maxPrice)}`
                      }
                    />
                    <Stat label={<T k="private.landed.medianPrice" fallback="Median price" />} value={formatSgd(district12.medianPrice)} />
                    <Stat label={<T k="private.landed.medianLandPsf" fallback="Median land psf" />} value={formatPsf(district12.medianPsf)} />
                  </StatGrid>
                ) : (
                  <p className="text-sm text-muted">
                    <T k="private.landed.noDistrict12" fallback="No landed sales recorded in this district in the last 12 months." />
                  </p>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title={<T k="private.landed.chartTitle" fallback="District median psf and this property's sales" />} />
              <CardBody>
                {chartSeries.length ? (
                  <TimeSeriesChart series={chartSeries} yFormat="psf" height={300} ariaLabel={`${formatDistrict(a.district)} median price per square foot over five years, with sales of ${name}`} />
                ) : (
                  <EmptyState title={<T k="private.landed.noChart" fallback="No district series" />}>
                    <T k="private.landed.noChartBody" fallback="There are no district statistics for this period yet." />
                  </EmptyState>
                )}
                <p className="mt-3 text-xs text-muted">
                  <T
                    k="private.landed.chartNote"
                    fallback="The district line is the median land price psf of landed-house sales in the district (all private sales where there are too few), so read it as a market trend, not a like-for-like price."
                  />
                </p>
              </CardBody>
            </Card>
            {estimate && own[0] ? (
              <Notice title={<T k="private.landed.estimateHow" fallback="How the estimate is worked out" />}>
                <T
                  k="private.landed.estimateBody"
                  fallback="Latest sale {price} ({month}) × {factor} (change in the district's 6-month median psf from {from} to {to}) = {estimate}. This is an estimate that assumes the house moved with its district; it ignores renovation, rebuilding and lot differences."
                  vars={{
                    price: formatSgd(own[0].price),
                    month: formatMonth(own[0].month),
                    factor: estimate.factor.toFixed(3),
                    from: formatMonth(estimate.saleMonth),
                    to: formatMonth(estimate.asOfMonth),
                    estimate: formatSgd(estimate.estimate),
                  }}
                />{" "}
                <span className="whitespace-nowrap">({formatPctSigned(estimate.factor - 1)})</span>
              </Notice>
            ) : null}
            <SourceLine>
              <T k="private.source.uraStats" fallback="URA private residential transactions; district medians computed separately for landed and non-landed sales" />
              {asOf != null ? ` · ${formatMonth(monthLabel(asOf))}` : ""}
            </SourceLine>
          </div>
        </Section>

        <Section id="nearby" className={SECTION} title={<T k="private.nearby.titleLanded" fallback="Nearby" />}>
          {near ? (
            <NearbyAmenities ctx={near} label={name} />
          ) : (
            <EmptyState title={<T k="private.noCoords" fallback="Location not available" />}>
              <T k="private.noCoordsLanded" fallback="This address has not been geocoded (OneMap), so nearby schools, stations and distances can't be computed yet." />
            </EmptyState>
          )}
        </Section>

        <Section
          id="rebuild"
          className={SECTION}
          title={<T k="private.rebuild.title" fallback="Rebuild cost" />}
          description={<T k="private.rebuild.desc" fallback="Work out what rebuilding would cost with your own quotation and floor area." />}
        >
          <Card>
            <CardBody>
              <RebuildCost landAreaSqm={a.landAreaSqm} />
            </CardBody>
          </Card>
        </Section>

        <Section id="planning" className={SECTION} title={<T k="private.planning.title" fallback="Planning permissions" />}>
          <Notice>
            <T
              k="private.planning.body"
              fallback="URA planning decisions (such as permissions to rebuild or extend) are not connected yet, so we can't list applications for this address. You can search them on URA's website."
            />{" "}
            <a href="https://www.ura.gov.sg/" target="_blank" rel="noopener noreferrer" className="font-medium underline">
              ura.gov.sg
            </a>
          </Notice>
        </Section>

        <AskPanel context={{ kind: "landed", slug: a.slug }} title={`Ask about ${name}`} />
        <WhatsNext property={{ kind: "landed", slug: a.slug }} label={name} />
      </div>
    </PageContainer>
  );
}
