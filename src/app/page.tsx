import { PageContainer, PageHeader } from "@/components/ui/section";
import { SearchBox } from "@/components/search/search-box";
import { site } from "@/lib/config/site";

// Placeholder: replaced by the home work package.
export default function HomePage() {
  return (
    <PageContainer>
      <PageHeader title={site.tagline} description={site.description} />
      <SearchBox size="lg" />
    </PageContainer>
  );
}
