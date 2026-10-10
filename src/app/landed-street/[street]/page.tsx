import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLandedStreet, getLandedStreets, getLandedStreetTransactions } from "@/lib/data/private";
import { getSeries } from "@/lib/data/stats";
import { getCoverage } from "@/lib/data/meta";
import { monthIndex } from "@/lib/data/months";
import { displayAddress, formatDistrict, isLandedHouse, latestFirst, salesScatter, seriesPsfPoints, timeAdjustedEstimate, type TimeAdjustedEstimate, toSaleRow } from "@/lib/private-insights";
import { formatArea, formatInt, formatMonth, formatPsf, formatSgd } from "@/lib/format";
import { titleCase } from "@/lib/slug";
import { absoluteUrl, pageMetadata } from "@/lib/seo";
import type { LandedAddress } from "@/lib/data/types";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { JsonLd } from "@/components/ui/json-ld";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stat, StatGrid } from "@/components/ui/stat";
import { DataTable, type Column } from "@/components/ui/table";
import { EmptyState, Notice } from "@/components/ui/notice";
import { TimeSeriesChart, type TimeSeries } from "@/components/charts/time-series-chart";
import { GatedPanel } from "@/components/gating/gated-panel";
import { AskPanel } from "@/components/ai/ask-panel";
import { WhatsNext } from "@/components/property/whats-next";
import { T } from "@/components/i18n/t";
import { SalesTable } from "@/components/private/sales-table";
import { SalesHistory } from "@/components/private/sales-history";
import { NearbyAmenities } from "@/components/private/nearby";
import { SectionNav } from "@/components/private/section-nav";
import { SourceLine } from "@/components/private/source-line";
import { addressesOnStreet, latestPrivateMonth, nearbyContext, pointOf } from "@/components/private/server-data";

export const revalidate = 86400;

/** Prerender the 100 most actively traded landed streets; the rest render on first request. */
export function generateStaticParams(): { street: string }[] {
  return getLandedStreets()
    .slice()
    .sort((a, b) => b.tx.count12m - a.tx.count12m || b.tx.count - a.tx.count)
    .slice(0, 100)
    .map((s) => ({ street: s.slug }));
}

type Props = { params: Promise<{ street: string }> };

const SEGMENT_NAMES = { CCR: "Core Central Region", RCR: "Rest of Central Region", OCR: "Outside Central Region" } as const;
/** Long streets can have hundreds of houses; the table is server-rendered but still capped. */
const MAX_ADDRESSES = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { street } = await params;
  const s = getLandedStreet(street);
  if (!s) return { title: "Street not found", robots: { index: false, follow: true } };
  const name = titleCase(s.street);
  const facts = [
    `Landed homes on ${name}${s.district != null ? ` (District ${s.district})` : ""}: ${s.propertyTypes.join(", ") || "landed"}.`,
    s.tx.count ? `${formatInt(s.tx.count)} recorded sales${s.tx.lastPrice ? `, latest ${formatSgd(s.tx.lastPrice)} in ${formatMonth(s.tx.last)}` : ""}.` : null,
    s.tx.medianPsf12m ? `Median land price ${formatPsf(s.tx.medianPsf12m)} over the last 12 months.` : null,
    s.addresses.length ? `${formatInt(s.addresses.length)} addresses with sales and estimates.` : null,
  ];
  return pageMetadata({ title: `${name} — landed home prices`, description: facts.filter(Boolean).join(" "), path: `/landed-street/${s.slug}/` });
}

const NAV = [
  { id: "addresses", k: "private.nav.addresses", fallback: "Addresses" },
  { id: "sales", k: "private.nav.propertySales", fallback: "Sales" },
  { id: "prices", k: "private.nav.prices", fallback: "Price chart" },
  { id: "map", k: "private.nav.map", fallback: "Map" },
];

const SECTION = "scroll-mt-32";

interface AddressRow {
  a: LandedAddress;
  estimate: TimeAdjustedEstimate | null;
}

export default async function LandedStreetPage({ params }: Props) {
  const { street } = await params;
  const s = getLandedStreet(street);
  if (!s) notFound();

  const name = titleCase(s.street);
  // landed houses only, matching the street's summary (strata landed homes are not part of landed streets)
  const txs = latestFirst(getLandedStreetTransactions(s.slug).filter(isLandedHouse));
  const addresses = addressesOnStreet(s.slug);
  const slugs = new Map(addresses.map((a) => [a.address, a.slug]));
  const asOf = latestPrivateMonth(txs);
  const coverage = getCoverage();
  const point = pointOf(s);
  const near = point ? nearbyContext(point) : null;
  const districtSeries = s.district != null ? getSeries(`private-d:${s.district}:ALL`) : null;

  const rows: AddressRow[] = addresses.slice(0, MAX_ADDRESSES).map((a) => {
    let estimate: TimeAdjustedEstimate | null = null;
    if (a.tx.last && a.tx.lastPrice && districtSeries && asOf != null) {
      try {
        estimate = timeAdjustedEstimate({ monthIndex: monthIndex(a.tx.last), price: a.tx.lastPrice }, districtSeries.points, asOf);
      } catch {
        estimate = null;
      }
    }
    return { a, estimate };
  });

  const chartFrom = asOf != null ? asOf - 59 : 0;
  const chartSeries: TimeSeries[] = [];
  const scatter = salesScatter(txs, chartFrom);
  if (scatter.length) chartSeries.push({ name: "Sales on this street (land psf)", points: scatter, kind: "scatter" });
  const districtPts = seriesPsfPoints(districtSeries?.points, chartFrom, asOf ?? undefined);
  if (districtPts.length) chartSeries.push({ name: `${formatDistrict(s.district)} median psf (all private)`, points: districtPts });

  const addressCols: Column<AddressRow>[] = [
    {
      key: "address",
      header: <T k="private.sales.address" fallback="Address" />,
      cell: (r) => (
        <Link href={`/landed/${r.a.slug}/`} className="font-medium text-brand-700 hover:underline">
          {displayAddress(r.a.address)}
        </Link>
      ),
    },
    { key: "type", header: <T k="private.sales.propertyType" fallback="Type" />, cell: (r) => r.a.propertyType ?? "—" },
    { key: "land", header: <T k="private.sales.landArea" fallback="Land area" />, align: "right", cell: (r) => (r.a.landAreaSqm != null ? formatArea(r.a.landAreaSqm) : "—") },
    {
      key: "last",
      header: <T k="private.street.latestSale" fallback="Latest sale" />,
      align: "right",
      cell: (r) => (
        <>
          {formatSgd(r.a.tx.lastPrice)}
          <span className="block text-xs text-muted">{formatMonth(r.a.tx.last)}</span>
        </>
      ),
    },
    {
      key: "estimate",
      header: <T k="private.street.estimate" fallback="Estimate" />,
      align: "right",
      cell: (r) =>
        r.estimate ? (
          <>
            {formatSgd(r.estimate.estimate)}
            <span className="block text-xs text-muted">
              <T k="private.landed.estimateSub" fallback="Estimate as of {m}" vars={{ m: formatMonth(r.estimate.asOfMonth) }} />
            </span>
          </>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ];

  return (
    <PageContainer className="pb-16">
      <Breadcrumbs items={[{ label: "Property analysis", href: "/property-analysis/" }, { label: name }]} />
      {point ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "Place",
            name,
            url: absoluteUrl(`/landed-street/${s.slug}/`),
            geo: { "@type": "GeoCoordinates", latitude: point.lat, longitude: point.lng },
          }}
        />
      ) : null}

      <PageHeader
        eyebrow={<T k="private.street.eyebrow" fallback="Landed street" />}
        title={name}
        description={
          s.district != null ? (
            <T k="private.street.desc" fallback="Landed homes in District {d}" vars={{ d: s.district }} />
          ) : (
            <T k="private.street.descNoDistrict" fallback="Landed homes" />
          )
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {s.district != null ? <Badge>{formatDistrict(s.district)}</Badge> : null}
          {s.segment ? (
            <Badge tone="brand" title={SEGMENT_NAMES[s.segment]}>
              {s.segment} · <T k={`private.segment.${s.segment}`} fallback={SEGMENT_NAMES[s.segment]} />
            </Badge>
          ) : null}
          {s.propertyTypes.map((t) => (
            <Badge key={t} tone="neutral">
              {t}
            </Badge>
          ))}
          {s.tenures.map((t) => (
            <Badge key={t} tone="info">
              {t}
            </Badge>
          ))}
        </div>
        <Card className="mt-5">
          <CardBody>
            <StatGrid>
              <Stat label={<T k="private.stat.lastSale" fallback="Last sale" />} value={formatSgd(s.tx.lastPrice)} sub={formatMonth(s.tx.last)} />
              <Stat
                label={<T k="private.street.medianLandPsf12m" fallback="Median land psf (12 mths)" />}
                value={formatPsf(s.tx.medianPsf12m)}
                sub={s.tx.medianPsf12m == null ? <T k="private.street.noSales12m" fallback="No sales in 12 months" /> : undefined}
              />
              <Stat label={<T k="private.stat.sales12m" fallback="Sales (12 mths)" />} value={formatInt(s.tx.count12m)} />
              <Stat
                label={<T k="private.landed.salesRecorded" fallback="Sales recorded" />}
                value={formatInt(s.tx.count)}
                sub={s.tx.first ? <T k="private.landed.since" fallback="Since {m}" vars={{ m: formatMonth(s.tx.first) }} /> : undefined}
              />
            </StatGrid>
          </CardBody>
        </Card>
      </PageHeader>

      <SectionNav links={NAV} />

      <div className="space-y-12">
        <Section
          id="addresses"
          className={SECTION}
          title={<T k="private.street.addressesTitle" fallback="Addresses on this street" />}
          description={
            addresses.length === 1 ? (
              <T k="private.street.addressesDesc1" fallback="1 address with recorded sales." />
            ) : addresses.length ? (
              <T k="private.street.addressesDesc" fallback="{n} addresses with recorded sales." vars={{ n: formatInt(addresses.length) }} />
            ) : undefined
          }
        >
          {addresses.length ? (
            <Card>
              <DataTable columns={addressCols} rows={rows} rowKey={(r) => r.a.slug} />
              <CardBody className="pt-0">
                {addresses.length > MAX_ADDRESSES ? (
                  <p className="mt-3 text-sm text-muted">
                    <T k="private.street.capped" fallback="Showing the first {n} addresses." vars={{ n: MAX_ADDRESSES }} />
                  </p>
                ) : null}
                <p className="mt-3 text-xs text-muted">
                  <T
                    k="private.street.estimateMethod"
                    fallback="Estimate = each address's latest sale price moved by the change in the district's median psf (6-month median) since that sale. It assumes the house moved with its district and ignores renovation, rebuilding and lot differences."
                  />
                </p>
                <SourceLine>
                  <T k="private.source.uraUnit" fallback="URA private residential transactions with unit-level (REALIS-style) records" />
                </SourceLine>
              </CardBody>
            </Card>
          ) : (
            <Notice>
              <T
                k="private.street.noAddresses"
                fallback="House numbers aren't in URA's public transaction data, so individual addresses need unit-level (REALIS-style) records, which aren't loaded for this street."
              />
            </Notice>
          )}
        </Section>

        <Section id="sales" className={SECTION} title={<T k="private.street.salesTitle" fallback="Sales on this street" />}>
          <div className="space-y-6">
            <Card>
              <CardHeader
                title={<T k="private.sales.latest" fallback="Latest sales" />}
                description={<T k="private.street.latestDesc" fallback="The 10 most recent landed sales on this street." />}
              />
              <SalesTable rows={txs.slice(0, 10).map((t) => toSaleRow(t, t.address ? (slugs.get(t.address) ?? null) : null))} variant="landed" showAddress={txs.some((t) => t.address)} />
            </Card>
            {txs.length > 10 ? (
              <div>
                <h3 className="mb-3 text-base font-semibold text-ink">
                  <T k="private.sales.full" fallback="Full sales history" /> <span className="text-sm font-normal text-muted">({formatInt(txs.length)})</span>
                </h3>
                <GatedPanel feature="sales.full">
                  <Card>
                    <CardBody>
                      <SalesHistory endpoint={`/api/gated/private/landed-street/${s.slug}/sales/`} variant="landed" showAddress={txs.some((t) => t.address)} />
                    </CardBody>
                  </Card>
                </GatedPanel>
              </div>
            ) : null}
            <SourceLine>
              <T k="private.source.ura" fallback="URA private residential transactions (caveats lodged), last 5 years" />
            </SourceLine>
          </div>
        </Section>

        <Section
          id="prices"
          className={SECTION}
          title={<T k="private.prices.title" fallback="Price chart" />}
          description={<T k="private.street.chartDesc" fallback="Land price per square foot of each sale on the street, with the district median for comparison." />}
        >
          <Card>
            <CardBody>
              {chartSeries.length ? (
                <TimeSeriesChart series={chartSeries} yFormat="psf" height={300} ariaLabel={`Land price per square foot of sales on ${name} over five years, with the ${formatDistrict(s.district)} median`} />
              ) : (
                <EmptyState title={<T k="private.noSales" fallback="No sales recorded" />}>
                  {coverage.private ? (
                    <T k="private.street.noSalesBody" fallback="No landed sales on this street in the last five years." />
                  ) : (
                    <T k="private.noPrivateSource" fallback="Private transactions (URA) are not loaded on this deployment yet." />
                  )}
                </EmptyState>
              )}
              <p className="mt-3 text-xs text-muted">
                <T
                  k="private.landed.chartNote"
                  fallback="The district median mixes every private sale (strata psf for apartments, land psf for houses), so read it as a market trend, not a like-for-like price."
                />
              </p>
              <SourceLine>
                <T k="private.source.uraStats" fallback="URA private residential transactions; district median from all private sales in the district" />
              </SourceLine>
            </CardBody>
          </Card>
        </Section>

        <Section id="map" className={SECTION} title={<T k="private.street.mapTitle" fallback="Map and nearby" />}>
          {near ? (
            <NearbyAmenities ctx={near} label={name} />
          ) : (
            <EmptyState title={<T k="private.noCoords" fallback="Location not available" />}>
              <T k="private.noCoordsStreet" fallback="This street has not been geocoded (OneMap), so the map and nearby places can't be shown yet." />
            </EmptyState>
          )}
        </Section>

        <AskPanel context={{ kind: "landed-street", slug: s.slug }} title={`Ask about ${name}`} />
        <WhatsNext property={{ kind: "landed-street", slug: s.slug }} label={name} />
      </div>
    </PageContainer>
  );
}
