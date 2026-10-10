import { PageContainer } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { SearchBox } from "@/components/search/search-box";

export default function NotFound() {
  return (
    <PageContainer className="py-16 text-center">
      <h1 className="text-2xl font-bold text-ink">Page not found</h1>
      <p className="mx-auto mt-2 max-w-md text-muted">We could not find that page. It may not have any recorded sales yet, or the address may be spelt differently.</p>
      <div className="mx-auto mt-6 max-w-lg text-left">
        <SearchBox size="lg" />
      </div>
      <div className="mt-6">
        <ButtonLink href="/" variant="outline">
          Back to home
        </ButtonLink>
      </div>
    </PageContainer>
  );
}
