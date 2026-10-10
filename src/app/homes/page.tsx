import { Suspense } from "react";
import { Compass, Plus } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageContainer, PageHeader } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { T } from "@/components/i18n/t";
import { HomesBrowser } from "@/components/homes/homes-browser";
import { ListingGrid } from "@/components/homes/listing-card";
import { homesIndexData } from "@/lib/homes/listings";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/config/site";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Homes for sale and rent",
  description: `HDB flats, condos and landed homes for sale or rent, listed by owners on ${site.name}, each with a fair-value range from recent government-recorded deals.`,
  path: "/homes/",
});

export default async function HomesPage() {
  const data = await homesIndexData();
  return (
    <PageContainer className="pb-16">
      <Breadcrumbs items={[{ label: "Homes" }]} />
      <PageHeader
        title={<T k="homes.title" fallback="Homes for sale and rent" />}
        description={<T k="homes.intro" fallback="Listings from owners, each with a fair-value range worked out from recent HDB and URA records, so you can see how the asking price compares." />}
      >
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/homes/new/">
            <Plus className="size-4" aria-hidden />
            <T k="homes.listYourHome" fallback="List your home" />
          </ButtonLink>
          <ButtonLink href="/homes/fit/" variant="outline">
            <Compass className="size-4" aria-hidden />
            <T k="homes.fitCta" fallback="Find homes near your places" />
          </ButtonLink>
        </div>
      </PageHeader>
      <Suspense fallback={<ListingGrid listings={data.sale.listings} />}>
        <HomesBrowser initial={{ sale: data.sale, rent: data.rent }} areas={data.areas} backend={data.backend} unavailable={data.unavailable} />
      </Suspense>
    </PageContainer>
  );
}
