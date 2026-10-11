import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/notice";
import { buttonClass } from "@/components/ui/button";
import { T } from "@/components/i18n/t";
import { GatedPanel, PlusBadge } from "@/components/gating/gated-panel";
import { SupplyDemandView } from "@/components/tools/supply-demand-view";
import { resolveSlug, type ResolvedProperty } from "@/lib/data/resolve";
import { formatInt } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { currentYearSg, HDB_MOP_YEARS, mopHeadline, SD_HEADLINE_RADIUS } from "@/lib/tools/supply-demand";

export const revalidate = 86400;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

type Params = Promise<{ slug: string }>;

const KIND_LABEL: Record<ResolvedProperty["ref"]["kind"], { k: string; en: string }> = {
  hdb: { k: "tools.sd.kindHdb", en: "HDB block" },
  condo: { k: "tools.sd.kindCondo", en: "Condo" },
  landed: { k: "tools.sd.kindLanded", en: "Landed home" },
  "landed-street": { k: "tools.sd.kindStreet", en: "Landed street" },
  launch: { k: "tools.sd.kindLaunch", en: "New launch" },
};

function lookup(slug: string): ResolvedProperty | null {
  return /^[a-z0-9-]{1,120}$/.test(slug) ? resolveSlug(slug) : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const p = lookup(slug);
  if (!p) return {};
  return pageMetadata({
    title: `Supply and demand around ${p.label}`,
    description: `HDB upgraders reaching their minimum occupation period near ${p.label}, against new private homes completing nearby, by year.`,
    path: `/supply-demand/${slug}/`,
  });
}

export default async function SupplyDemandPage({ params }: { params: Params }) {
  const { slug } = await params;
  const property = lookup(slug);
  if (!property) notFound();
  const located = property.lat != null && property.lng != null;
  const headline = located ? mopHeadline({ lat: property.lat!, lng: property.lng! }) : null;
  const year = currentYearSg();
  const kind = KIND_LABEL[property.ref.kind];

  return (
    <PageContainer className="space-y-8 pb-12">
      <div>
        <Breadcrumbs items={[{ label: property.label, href: property.href }, { label: "Supply & demand", k: "next.supplyDemand" }]} />
        <PageHeader
          eyebrow={
            <span className="inline-flex items-center gap-2">
              <T k="tools.sd.eyebrow" fallback="Supply & demand" />
              <PlusBadge />
            </span>
          }
          title={<T k="tools.sd.title" fallback="Supply and demand around {name}" vars={{ name: property.label }} />}
          description={
            <>
              <T k={kind.k} fallback={kind.en} /> ·{" "}
              <Link href={property.href} className="text-brand-700 hover:underline">
                <T k="tools.sd.viewProperty" fallback="View property page" />
              </Link>
            </>
          }
        />
      </div>

      <Section title={<T k="tools.sd.headlineTitle" fallback="Upgraders nearby" />}>
        {headline ? (
          <Card>
            <CardBody className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted">
                <T
                  k="tools.sd.headlineLabel"
                  fallback="HDB flats within {km} km reaching MOP in {from}–{to}"
                  vars={{ km: SD_HEADLINE_RADIUS / 1000, from: headline.fromYear, to: headline.toYear }}
                />
              </div>
              <div className="tabular text-3xl font-bold text-ink">{formatInt(headline.units)}</div>
              <p className="text-sm text-muted">
                {headline.units > 0 ? (
                  <T
                    k="tools.sd.headlineBlocks"
                    fallback="Blocks counted: {n}, completed {a}–{b}. Once the minimum occupation period ends, owners may sell or buy private property."
                    vars={{ n: headline.blocks, a: headline.fromYear - HDB_MOP_YEARS, b: headline.toYear - HDB_MOP_YEARS }}
                  />
                ) : (
                  <T k="tools.sd.headlineNone" fallback="No HDB blocks within this distance reach their minimum occupation period in these years." />
                )}
              </p>
              <p className="text-xs text-muted">
                <T k="tools.sd.headlineUnits" fallback="Counts are each block's total dwelling units, which include any HDB rental flats in the block (rental flats have no MOP)." />
              </p>
              <p className="text-xs text-muted">
                <T k="common.source" fallback="Source" />: <T k="tools.sd.headlineSource" fallback="HDB property information (year completed, dwelling units), data.gov.sg." />
              </p>
            </CardBody>
          </Card>
        ) : (
          <EmptyState title={<T k="tools.sd.noLocationTitle" fallback="No map location yet" />}>
            <T k="tools.sd.noLocationBody" fallback="This property has not been geocoded (OneMap), so we cannot measure what is nearby." />
          </EmptyState>
        )}
      </Section>

      <Section title={<T k="tools.sd.methodTitle" fallback="How we measure it" />}>
        <Card>
          <CardBody className="space-y-3 text-sm text-ink">
            <p>
              <T
                k="tools.sd.method1"
                fallback="Demand: HDB owners can sell their flat or buy private property once the {mop}-year minimum occupation period (MOP) ends. We count the flats in every HDB block nearby by the year they reach MOP (year completed + {mop})."
                vars={{ mop: HDB_MOP_YEARS }}
              />
            </p>
            <p>
              <T
                k="tools.sd.method2"
                fallback="Supply: private condos, ECs and landed projects nearby that are launched or in the URA pipeline, counted by their expected completion year and total units."
              />
            </p>
            <p>
              <T
                k="tools.sd.method3"
                fallback="When many flats reach MOP while few private homes complete nearby, more local upgraders compete for fewer new homes, and the reverse when supply runs ahead."
              />
            </p>
          </CardBody>
        </Card>
      </Section>

      <Section title={<T k="tools.sd.byYearTitle" fallback="By year, within your chosen radius" />}>
        {located ? (
          <GatedPanel feature="supply-demand" minHeight={260}>
            <SupplyDemandView slug={slug} currentYear={year} />
          </GatedPanel>
        ) : (
          <EmptyState title={<T k="tools.sd.noLocationTitle" fallback="No map location yet" />} />
        )}
      </Section>

      <div>
        <Link href={property.href} className={buttonClass("outline", "sm")}>
          <T k="tools.sd.back" fallback="Back to {name}" vars={{ name: property.label }} />
        </Link>
      </div>
    </PageContainer>
  );
}
