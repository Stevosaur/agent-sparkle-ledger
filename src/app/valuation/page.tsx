import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";
import { Card, CardBody } from "@/components/ui/card";
import { T } from "@/components/i18n/t";
import { ValuationTool } from "@/components/tools/valuation-tool";
import { getCoverage } from "@/lib/data/meta";
import { pageMetadata } from "@/lib/seo";
import { resolveValuationDeepLink } from "@/lib/tools/valuation-subject";
import { firstParam } from "@/lib/tools/refs";
import { FLOOR_PREMIUM_PER_LEVEL, HDB_LOOKBACK_MONTHS, NEARBY_RADIUS_M, PRIVATE_LOOKBACK_MONTHS } from "@/lib/valuation-service";

export const metadata = pageMetadata({
  title: "Home valuation: what is my HDB, condo or landed home worth?",
  description:
    "Free estimate for any HDB flat, condo or landed home in Singapore from recent comparable sales, with the comparables, method and likely price range.",
  path: "/valuation/",
});

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ValuationPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const link = resolveValuationDeepLink({
    ref: firstParam(sp.ref),
    type: firstParam(sp.type),
    block: firstParam(sp.block),
    street: firstParam(sp.street),
    postal: firstParam(sp.postal),
    project: firstParam(sp.project),
    address: firstParam(sp.address),
  });
  const coverage = getCoverage();
  return (
    <PageContainer className="pb-12">
      <Breadcrumbs items={[{ label: "Valuation", k: "nav.valuation" }]} />
      <PageHeader
        eyebrow={<T k="tools.val.eyebrow" fallback="Valuation" />}
        title={<T k="tools.val.title" fallback="What is my home worth?" />}
        description={
          <T
            k="tools.val.intro"
            fallback="Estimate the value of any HDB flat, condo or landed home from recent sales of comparable homes, adjusted for time, floor and size."
          />
        }
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ValuationTool subject={link.subject} initialType={link.type} unresolved={link.unresolved} approximate={link.approximate} privateAvailable={coverage.private} />
        <aside className="space-y-4">
          <Section title={<T k="tools.val.howTitle" fallback="How it works" />}>
            <Card>
              <CardBody>
                <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
                  <li>
                    <T
                      k="tools.val.how1"
                      fallback="HDB: resales of the same flat type in the same block over the last {m} months, widening to blocks within {km} km when there are too few."
                      vars={{ m: HDB_LOOKBACK_MONTHS, km: NEARBY_RADIUS_M / 1000 }}
                    />
                  </li>
                  <li>
                    <T
                      k="tools.val.how2"
                      fallback="Condo: sales in the same project over the last {m} months, widening to projects within {km} km in the same market segment."
                      vars={{ m: PRIVATE_LOOKBACK_MONTHS, km: NEARBY_RADIUS_M / 1000 }}
                    />
                  </li>
                  <li>
                    <T k="tools.val.how3" fallback="Landed: sales on the same street, widening to the same housing type in the district, compared per square foot of land." />
                  </li>
                  <li>
                    <T
                      k="tools.val.how4"
                      fallback="Each sale is moved to today's prices with a market index, adjusted by {pct}% per floor and, for HDB flats, for remaining lease; the estimate is the median of the adjusted prices."
                      vars={{ pct: FLOOR_PREMIUM_PER_LEVEL * 100 }}
                    />
                  </li>
                </ol>
              </CardBody>
            </Card>
          </Section>
          <p className="text-xs text-muted">
            <T k="common.source" fallback="Source" />: <T k="tools.val.sources" fallback="HDB resale prices (data.gov.sg); URA private residential transactions." />
          </p>
        </aside>
      </div>
    </PageContainer>
  );
}
