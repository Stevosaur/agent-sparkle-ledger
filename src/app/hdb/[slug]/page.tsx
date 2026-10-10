import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { JsonLd } from "@/components/ui/json-ld";
import { PageContainer, Section } from "@/components/ui/section";
import { GatedPanel } from "@/components/gating/gated-panel";
import { AskPanel } from "@/components/ai/ask-panel";
import { WhatsNext } from "@/components/property/whats-next";
import { T } from "@/components/i18n/t";
import { BlockHeader } from "@/components/hdb/block-header";
import { BlockNav } from "@/components/hdb/block-nav";
import { BlockDetails } from "@/components/hdb/block-details";
import { BlockLocation, type StationWithCoords } from "@/components/hdb/block-location";
import { BlockPriceHistory } from "@/components/hdb/block-price-history";
import { BlockSales } from "@/components/hdb/block-sales";
import { HdbCompetingSupply, HdbRentalDemand } from "@/components/hdb/hdb-context";
import { BlockNearby, type NearbyBlockRow } from "@/components/hdb/block-nearby";
import { BlockLease } from "@/components/hdb/block-lease";
import { getBlockTransactions, getHdbBlock, getHdbBlocks, getNearbyBlocks } from "@/lib/data/hdb";
import { CBD_POINT, getMrtStations, haversineM, nearestStations } from "@/lib/data/geo";
import { getMeta } from "@/lib/data/meta";
import { getSeries } from "@/lib/data/stats";
import type { LatLng, NearbyStation } from "@/lib/data/types";
import {
  blockLabel,
  blockPriceSeries,
  distinctFlatTypes,
  dominantFlatType,
  flatTypeLabel,
  leaseOutlook,
  toSaleRow,
  townMedianPoints,
  yearFraction,
} from "@/lib/hdb-insights";
import { formatMonth, formatSgd } from "@/lib/format";
import { absoluteUrl, pageMetadata } from "@/lib/seo";
import { titleCase } from "@/lib/slug";

export const revalidate = 86400;

const STATIC_PARAMS = 200;
const STATION_RADIUS_M = 2000;
const NEARBY_RADIUS_M = 500;
const LATEST_SALES = 10;

type Props = { params: Promise<{ slug: string }> };

/** Pre-render the most traded blocks; every other block renders on first request (ISR). */
export function generateStaticParams() {
  return [...getHdbBlocks()]
    .sort((a, b) => b.tx.count12m - a.tx.count12m)
    .slice(0, STATIC_PARAMS)
    .map((b) => ({ slug: b.slug }));
}

/** Block + its transactions, decoded once per request (shared by generateMetadata and the page). */
const loadBlock = cache((slug: string) => {
  const block = getHdbBlock(slug);
  if (!block) return null;
  return { block, txs: getBlockTransactions(slug) };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = loadBlock(slug);
  if (!data) notFound();
  const { block, txs } = data;
  const label = blockLabel(block);
  const town = titleCase(block.town);
  const last = txs[0];
  const parts = [`${label}, ${town}`];
  if (block.leaseCommenceYear != null) {
    const left = Math.floor(leaseOutlook(block.leaseCommenceYear, yearFraction(new Date())).remainingToday);
    parts[0] += `: 99-year lease from ${block.leaseCommenceYear} (~${left} years left)`;
  }
  const lastSale = last ? `Latest resale ${formatSgd(last.price)} (${flatTypeLabel(last.flatType)}, ${formatMonth(last.month)}).` : "No resales recorded yet.";
  return pageMetadata({
    title: `${label} HDB resale prices`,
    description: `${parts[0]}. ${lastSale} Sales with lease left, rents, MRT, MOP supply and nearby blocks.`,
    path: `/hdb/${block.slug}/`,
  });
}

export default async function HdbBlockPage({ params }: Props) {
  const { slug } = await params;
  const data = loadBlock(slug);
  if (!data) notFound();
  const { block, txs } = data;

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const label = blockLabel(block);
  const town = titleCase(block.town);
  const latestMonth = getMeta().latestMonth.hdb;
  const coords: LatLng | null = block.lat != null && block.lng != null ? { lat: block.lat, lng: block.lng } : null;
  const lease = block.leaseCommenceYear != null ? leaseOutlook(block.leaseCommenceYear, yearFraction(now)) : null;
  const last = txs[0] ?? null;

  // Location: station lists come from nearestStations(); coordinates for map markers are joined from the station file.
  const stationIndex = new Map(getMrtStations().map((s) => [`${s.name}|${s.codes.join()}`, s]));
  const withCoords = (list: NearbyStation[]): StationWithCoords[] =>
    list.flatMap((n) => {
      const s = stationIndex.get(`${n.name}|${n.codes.join()}`);
      return s ? [{ ...n, lat: s.lat, lng: s.lng, approximate: s.approximate }] : [];
    });
  const stations = coords ? withCoords(nearestStations(coords, { limit: 5, maxDistanceM: STATION_RADIUS_M })) : [];
  const futureStations = coords ? withCoords(nearestStations(coords, { limit: 5, maxDistanceM: STATION_RADIUS_M, status: "future" })) : [];
  const cbdDistanceM = coords ? Math.round(haversineM(coords, CBD_POINT)) : null;

  // Price history: block medians per flat type + the town median for the most common flat type.
  const { granularity, series, fromMonth } = blockPriceSeries(txs);
  const dominant = dominantFlatType(txs, block.unitMix);
  const townPoints = dominant && series.length > 0 ? townMedianPoints(getSeries(`hdb:${block.town}:${dominant}`)?.points, fromMonth) : [];

  const nearby: NearbyBlockRow[] = coords
    ? getNearbyBlocks(coords, NEARBY_RADIUS_M, block.slug, 10).map((b) => ({
        slug: b.slug,
        label: blockLabel(b),
        distanceM: b.distanceM,
        leaseCommenceYear: b.leaseCommenceYear,
        medianPsf12m: b.tx.medianPsf12m,
        lastPrice: b.tx.lastPrice,
        lastMonth: b.tx.last,
      }))
    : [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Residence",
    name: label,
    url: absoluteUrl(`/hdb/${block.slug}/`),
    address: {
      "@type": "PostalAddress",
      streetAddress: `${block.block} ${titleCase(block.streetFull ?? block.street)}`,
      ...(block.postal ? { postalCode: block.postal } : {}),
      addressLocality: "Singapore",
      addressRegion: town,
      addressCountry: "SG",
    },
    ...(coords ? { geo: { "@type": "GeoCoordinates", latitude: coords.lat, longitude: coords.lng } } : {}),
  };

  return (
    <PageContainer className="pb-12">
      <Breadcrumbs items={[{ label: "HDB", href: "/hdb/" }, { label: town, href: `/insights/town/${block.townSlug}/` }, { label }]} />
      <JsonLd data={jsonLd} />

      <BlockHeader block={block} label={label} lastSale={last ? { price: last.price, flatType: last.flatType, month: last.month } : null} yearsLeft={lease ? Math.floor(lease.remainingToday) : null} latestMonth={latestMonth} />
      <BlockNav />

      <div className="mt-8 space-y-12">
        <Section id="details" title={<T k="hdb.section.details" fallback="Block details" />}>
          <BlockDetails block={block} currentYear={currentYear} />
        </Section>

        <Section id="location" title={<T k="hdb.section.location" fallback="Location & transport" />}>
          <BlockLocation label={label} coords={coords} stations={stations} futureStations={futureStations} cbdDistanceM={cbdDistanceM} nearestMrt={block.nearestMrt} />
        </Section>

        <Section
          id="price-history"
          title={<T k="hdb.section.prices" fallback="Price history" />}
          description={<T k="hdb.section.pricesDesc" fallback="Median resale price per flat type in this block." />}
        >
          <BlockPriceHistory
            label={label}
            granularity={granularity}
            series={series}
            town={dominant && townPoints.length > 0 ? { name: block.town, flatType: dominant, points: townPoints } : null}
          />
        </Section>

        <Section
          id="sales"
          title={<T k="hdb.section.sales" fallback="Sales with lease left" />}
          description={<T k="hdb.section.salesDesc" fallback="Every resale with the remaining lease at the time of sale." />}
        >
          <BlockSales slug={block.slug} latest={txs.slice(0, LATEST_SALES).map(toSaleRow)} total={txs.length} flatTypes={distinctFlatTypes(txs)} />
        </Section>

        <Section
          id="rental-demand"
          title={<T k="hdb.section.rent" fallback="Rental demand" />}
          description={<T k="hdb.section.rentDesc" fallback="Rental approvals, median rents and gross yields for this block and {town}." vars={{ town }} />}
        >
          <GatedPanel feature="property.context" minHeight={200}>
            <HdbRentalDemand slug={block.slug} />
          </GatedPanel>
        </Section>

        <Section
          id="supply"
          title={<T k="hdb.section.supply" fallback="Competing supply" />}
          description={<T k="hdb.section.supplyDesc" fallback="Nearby flats becoming sellable after their MOP, and new private launches." />}
        >
          <GatedPanel feature="property.context" minHeight={200}>
            <HdbCompetingSupply slug={block.slug} />
          </GatedPanel>
        </Section>

        <Section
          id="nearby"
          title={<T k="hdb.section.nearby" fallback="Nearby blocks" />}
          description={<T k="hdb.section.nearbyDesc" fallback="HDB blocks within 500 m, nearest first." />}
        >
          <BlockNearby rows={nearby} hasCoords={coords != null} radiusM={NEARBY_RADIUS_M} />
        </Section>

        <Section id="lease" title={<T k="hdb.section.lease" fallback="Lease" />}>
          <BlockLease outlook={lease} />
        </Section>

        <AskPanel context={{ kind: "hdb", slug: block.slug }} />
        <WhatsNext property={{ kind: "hdb", slug: block.slug }} postal={block.postal} label={label} />
      </div>
    </PageContainer>
  );
}
