import type { Metadata } from "next";
import { cache, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { JsonLd } from "@/components/ui/json-ld";
import { Notice } from "@/components/ui/notice";
import { T } from "@/components/i18n/t";
import { GatedPanel, PlusBadge } from "@/components/gating/gated-panel";
import { AskPanel } from "@/components/ai/ask-panel";
import { MiniMap } from "@/components/map/mini-map";
import { WhatsNext } from "@/components/property/whats-next";
import { LeadForm } from "@/components/leads/lead-form";
import { FairValueCard } from "@/components/homes/fair-value-card";
import { ExitAudiencePanel } from "@/components/homes/exit-audience-panel";
import { OwnerActions } from "@/components/homes/owner-actions";
import { getHdbBlock, estimateRemainingLeaseMonths } from "@/lib/data/hdb";
import { getLandedAddress, getProject } from "@/lib/data/private";
import { getMeta } from "@/lib/data/meta";
import { monthIndex } from "@/lib/data/months";
import { formatArea, formatDistance, formatInt, formatLeaseMonths, formatMonth, formatPsf, sqmToSqft } from "@/lib/format";
import { titleCase } from "@/lib/slug";
import { pageMetadata, absoluteUrl } from "@/lib/seo";
import { site } from "@/lib/config/site";
import { whatsappHref } from "@/lib/leads/contact-links";
import { isListingId } from "@/lib/homes/filters";
import { getListing } from "@/lib/homes/listings";
import { resolveListingProperty, type ListingProperty } from "@/lib/homes/property";
import { fairValueForListing } from "@/lib/homes/fair-value-data";
import { KIND_LABEL, TYPE_LABEL, formatAsking, formatListedDate } from "@/lib/homes/format";
import type { HomeListing } from "@/lib/homes/types";

export const revalidate = 300;

export function generateStaticParams(): { id: string }[] {
  return [];
}

type Params = { params: Promise<{ id: string }> };

/** One lookup per request, shared by generateMetadata and the page. */
const load = cache(async (id: string): Promise<HomeListing | null> => {
  if (!isListingId(id)) return null;
  return getListing(id.toLowerCase());
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const listing = await load(id);
  if (!listing) return { title: "Listing not found", robots: { index: false } };
  const prop = resolveListingProperty(listing.ref);
  const what = listing.listingType === "sale" ? "for sale" : "for rent";
  return pageMetadata({
    title: listing.title,
    description: `${prop?.label ?? "Home"} ${what} at ${formatAsking(listing.askingPrice, listing.listingType)}, with a fair-value range from recent government-recorded deals.`,
    path: `/homes/${listing.id}/`,
    noindex: Boolean(listing.sample),
  });
}

function PropertyFacts({ prop }: { prop: ListingProperty }) {
  const facts: { label: ReactNode; value: ReactNode; sub?: ReactNode }[] = [];
  let source = "";
  if (prop.kind === "hdb") {
    const b = getHdbBlock(prop.ref.slug);
    if (b) {
      const latest = getMeta().latestMonth.hdb;
      facts.push({ label: <T k="homes.prop.town" fallback="Town" />, value: titleCase(b.town) });
      facts.push({ label: <T k="homes.prop.completed" fallback="Year completed" />, value: b.yearCompleted ?? "—" });
      if (b.leaseCommenceYear != null) {
        facts.push({
          label: <T k="homes.prop.lease" fallback="Remaining lease (est.)" />,
          value: latest ? formatLeaseMonths(estimateRemainingLeaseMonths(b.leaseCommenceYear, monthIndex(latest))) : "—",
          sub: <T k="homes.prop.leaseSub" fallback="99 years from {year}" vars={{ year: b.leaseCommenceYear }} />,
        });
      }
      if (b.maxFloor != null) facts.push({ label: <T k="homes.prop.floors" fallback="Storeys" />, value: b.maxFloor });
      if (b.dwellingUnits != null) facts.push({ label: <T k="homes.prop.units" fallback="Flats in block" />, value: formatInt(b.dwellingUnits) });
      facts.push({
        label: <T k="homes.prop.resales" fallback="Resales recorded" />,
        value: formatInt(b.tx.count),
        sub: b.tx.medianPsf12m != null ? <T k="homes.prop.medianPsf" fallback="median {psf} (12 months)" vars={{ psf: formatPsf(b.tx.medianPsf12m) }} /> : undefined,
      });
      if (b.nearestMrt) facts.push({ label: <T k="homes.prop.mrt" fallback="Nearest MRT" />, value: titleCase(b.nearestMrt.name), sub: formatDistance(b.nearestMrt.distanceM) });
      source = "HDB property information and resale flat prices, data.gov.sg; MRT stations, LTA";
    }
  } else if (prop.kind === "condo") {
    const p = getProject(prop.ref.slug);
    if (p) {
      if (p.district != null) facts.push({ label: <T k="homes.prop.district" fallback="District" />, value: `D${p.district}`, sub: p.segment ?? undefined });
      if (p.tenure) facts.push({ label: <T k="homes.prop.tenure" fallback="Tenure" />, value: p.tenure.kind === "freehold" ? "Freehold" : `${p.tenure.years ?? "?"}-year lease`, sub: p.tenure.startYear ? `from ${p.tenure.startYear}` : undefined });
      if (p.propertyTypes.length) facts.push({ label: <T k="homes.prop.type" fallback="Property type" />, value: p.propertyTypes.join(", ") });
      facts.push({
        label: <T k="homes.prop.sales" fallback="Sales recorded" />,
        value: formatInt(p.tx.count),
        sub: p.tx.medianPsf12m != null ? <T k="homes.prop.medianPsf" fallback="median {psf} (12 months)" vars={{ psf: formatPsf(p.tx.medianPsf12m) }} /> : undefined,
      });
      if (p.nearestMrt) facts.push({ label: <T k="homes.prop.mrt" fallback="Nearest MRT" />, value: titleCase(p.nearestMrt.name), sub: formatDistance(p.nearestMrt.distanceM) });
      source = "URA private residential transactions; MRT stations, LTA";
    }
  } else {
    const a = getLandedAddress(prop.ref.slug);
    if (a) {
      if (a.district != null) facts.push({ label: <T k="homes.prop.district" fallback="District" />, value: `D${a.district}`, sub: a.segment ?? undefined });
      if (a.propertyType) facts.push({ label: <T k="homes.prop.type" fallback="Property type" />, value: a.propertyType });
      if (a.tenure) facts.push({ label: <T k="homes.prop.tenure" fallback="Tenure" />, value: a.tenure.kind === "freehold" ? "Freehold" : `${a.tenure.years ?? "?"}-year lease` });
      if (a.landAreaSqm != null) facts.push({ label: <T k="homes.prop.land" fallback="Land area" />, value: formatArea(a.landAreaSqm) });
      facts.push({ label: <T k="homes.prop.sales" fallback="Sales recorded" />, value: formatInt(a.tx.count), sub: a.tx.last ? formatMonth(a.tx.last) : undefined });
      source = "URA private residential transactions";
    }
  }
  return (
    <Card>
      <CardBody className="space-y-4">
        {facts.length ? (
          <StatGrid>
            {facts.map((f, i) => (
              <Stat key={i} label={f.label} value={f.value} sub={f.sub} />
            ))}
          </StatGrid>
        ) : (
          <p className="text-sm text-muted">
            <T k="homes.prop.none" fallback="No further details are recorded for this property." />
          </p>
        )}
        {prop.lat != null && prop.lng != null ? <MiniMap center={{ lat: prop.lat, lng: prop.lng }} zoom={16} markers={[{ lat: prop.lat, lng: prop.lng, label: prop.label, tone: "primary" }]} height={220} /> : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={prop.href} className="text-sm font-medium text-brand-700 hover:underline">
            <T k="homes.prop.open" fallback="Sales, rents and context for {label}" vars={{ label: prop.label }} />
          </Link>
          {source ? (
            <p className="text-xs text-muted">
              <T k="common.source" fallback="Source" />: {source}
            </p>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

export default async function ListingPage({ params }: Params) {
  const { id } = await params;
  const listing = await load(id);
  if (!listing) notFound();

  const prop = resolveListingProperty(listing.ref);
  const fair = fairValueForListing(listing);
  const typeLabel = TYPE_LABEL[listing.listingType];
  const pageUrl = absoluteUrl(`/homes/${listing.id}/`);
  const wa = whatsappHref(listing.whatsapp, `Hi, I saw your listing "${listing.title}" on ${site.name}: ${pageUrl}`);
  const psf = listing.listingType === "sale" && listing.areaSqm ? listing.askingPrice / sqmToSqft(listing.areaSqm) : null;
  const isLanded = prop?.kind === "landed";

  return (
    <PageContainer className="space-y-8 pb-16">
      <div>
        <Breadcrumbs
          items={[
            { label: "Homes", href: "/homes/" },
            { label: listing.listingType === "sale" ? "For sale" : "For rent", href: listing.listingType === "sale" ? "/homes/" : "/homes/?type=rent" },
            { label: listing.title },
          ]}
        />
        <PageHeader
          eyebrow={
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge tone={listing.listingType === "sale" ? "brand" : "info"}>
                <T k={typeLabel[0]} fallback={typeLabel[1]} />
              </Badge>
              {prop ? (
                <Badge>
                  <T k={KIND_LABEL[prop.kind][0]} fallback={KIND_LABEL[prop.kind][1]} />
                </Badge>
              ) : null}
              {listing.sample ? (
                <Badge tone="warn">
                  <T k="homes.sample" fallback="Sample" />
                </Badge>
              ) : null}
            </span>
          }
          title={listing.title}
          description={
            prop ? (
              <>
                <Link href={prop.href} className="text-brand-700 hover:underline">
                  {prop.label}
                </Link>
                {prop.areaLabel ? ` · ${prop.areaLabel}` : ""}
              </>
            ) : undefined
          }
        />
        <OwnerActions listingId={listing.id} />
      </div>

      {listing.sample ? (
        <Notice title={<T k="homes.sampleTitle" fallback="Sample listings" />}>
          <T k="homes.sampleDetail" fallback="This is a sample generated from the synthetic test dataset to demonstrate listing pages. It is not a real home." />
        </Notice>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="min-w-0 space-y-8 lg:col-span-2">
          <Card>
            <CardBody>
              <StatGrid>
                <Stat label={listing.listingType === "sale" ? <T k="homes.detail.asking" fallback="Asking price" /> : <T k="homes.detail.askingRent" fallback="Asking rent" />} value={formatAsking(listing.askingPrice, listing.listingType)} sub={psf ? (isLanded ? <T k="homes.detail.psfLand" fallback="{psf} of land" vars={{ psf: formatPsf(psf) }} /> : formatPsf(psf)) : undefined} />
                {listing.flatType ? <Stat label={<T k="homes.detail.unitType" fallback="Unit type" />} value={titleCase(listing.flatType)} /> : null}
                {listing.areaSqm != null ? (
                  <Stat
                    label={isLanded ? <T k="homes.detail.landArea" fallback="Land area" /> : <T k="homes.detail.area" fallback="Floor area" />}
                    value={`${formatInt(listing.areaSqm)} sqm`}
                    sub={`${formatInt(Math.round(sqmToSqft(listing.areaSqm)))} sqft`}
                  />
                ) : null}
                {listing.floorLevel != null ? <Stat label={<T k="homes.detail.floor" fallback="Floor" />} value={listing.floorLevel} /> : null}
                {listing.bedrooms != null ? <Stat label={<T k="homes.detail.beds" fallback="Bedrooms" />} value={listing.bedrooms === 0 ? <T k="homes.card.studio" fallback="Studio" /> : listing.bedrooms} /> : null}
                {listing.bathrooms != null ? <Stat label={<T k="homes.detail.baths" fallback="Bathrooms" />} value={listing.bathrooms} /> : null}
                <Stat label={<T k="homes.detail.listed" fallback="Listed" />} value={formatListedDate(listing.createdAt)} />
              </StatGrid>
            </CardBody>
          </Card>

          <Section id="fair-value" title={<T k="homes.fv.title" fallback="Fair-value range (estimate)" />} description={<T k="homes.fv.intro" fallback="How the asking price compares with recent comparable deals." />}>
            <FairValueCard outcome={fair} askingPrice={listing.askingPrice} listingType={listing.listingType} propertyHref={prop?.href ?? null} />
          </Section>

          {listing.description ? (
            <Section id="description" title={<T k="homes.detail.description" fallback="From the lister" />}>
              <Card>
                <CardBody>
                  <p className="whitespace-pre-line break-words text-sm leading-6 text-ink">{listing.description}</p>
                </CardBody>
              </Card>
            </Section>
          ) : null}

          {prop ? (
            <Section id="property" title={<T k="homes.detail.property" fallback="About the property" />}>
              <PropertyFacts prop={prop} />
            </Section>
          ) : null}

          {/* AskPanel renders its own heading, and nothing at all when the assistant is not configured. */}
          <AskPanel context={prop ? prop.ref : { kind: "general" }} />

          <Section
            id="exit-audience"
            title={
              <span className="inline-flex flex-wrap items-center gap-2">
                <T k="homes.exit.title" fallback="Exit audience" />
                <PlusBadge />
              </span>
            }
            description={<T k="homes.exit.intro" fallback="Who is likely to buy or sell nearby, from HDB minimum occupation period timing." />}
          >
            <GatedPanel feature="homes.exit-audience">
              <ExitAudiencePanel listingId={listing.id} />
            </GatedPanel>
          </Section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start" aria-label="Contact">
          {wa ? (
            <Card>
              <CardHeader title={<T k="homes.contact.title" fallback="Contact the lister" />} description={listing.contactName ?? undefined} />
              <CardBody className="space-y-2">
                <ButtonLink href={wa} className="w-full">
                  <MessageCircle className="size-4" aria-hidden />
                  <T k="homes.contact.whatsapp" fallback="WhatsApp the lister" />
                </ButtonLink>
                <p className="text-xs text-muted">
                  <T k="homes.contact.note" fallback="Opens WhatsApp with a message about this listing. Never transfer money before viewing a home in person." />
                </p>
              </CardBody>
            </Card>
          ) : (
            <LeadForm type="listing" context={{ listing: listing.id, property: listing.ref }} />
          )}
        </aside>
      </div>

      {prop ? <WhatsNext property={prop.ref} postal={prop.postal} label={prop.label} /> : null}

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "RealEstateListing",
          name: listing.title,
          url: pageUrl,
          datePosted: listing.createdAt,
          ...(listing.description ? { description: listing.description.slice(0, 500) } : {}),
          offers: {
            "@type": "Offer",
            price: listing.askingPrice,
            priceCurrency: "SGD",
            businessFunction: listing.listingType === "sale" ? "http://purl.org/goodrelations/v1#Sell" : "http://purl.org/goodrelations/v1#LeaseOut",
          },
          ...(prop?.lat != null && prop?.lng != null ? { contentLocation: { "@type": "Place", name: prop.label, geo: { "@type": "GeoCoordinates", latitude: prop.lat, longitude: prop.lng } } } : {}),
        }}
      />
    </PageContainer>
  );
}

