import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageContainer, PageHeader } from "@/components/ui/section";
import { T } from "@/components/i18n/t";
import { NewListingForm } from "@/components/homes/new-listing-form";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "List your home",
  description: "List your HDB flat, condo or landed home for sale or rent for free. HDB and condo listings show a fair-value range from recent recorded deals next to the asking price.",
  path: "/homes/new/",
  noindex: true,
});

export default function NewListingPage() {
  return (
    <PageContainer className="max-w-3xl pb-16">
      <Breadcrumbs items={[{ label: "Homes", href: "/homes/" }, { label: "List your home" }]} />
      <PageHeader
        title={<T k="homes.new.pageTitle" fallback="List your home" />}
        description={<T k="homes.new.pageIntro" fallback="Free for owners. HDB and condo listings show a fair-value range worked out from recent HDB or URA records, so serious buyers and tenants can see how your price compares." />}
      />
      <NewListingForm />
    </PageContainer>
  );
}
