import { PageContainer } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { SearchBox } from "@/components/search/search-box";
import { T } from "@/components/i18n/t";

export default function NotFound() {
  return (
    <PageContainer className="py-16 text-center">
      <h1 className="text-2xl font-bold text-ink">
        <T k="common.notFound.title" fallback="Page not found" />
      </h1>
      <p className="mx-auto mt-2 max-w-md text-muted">
        <T k="common.notFound.body" fallback="We could not find that page. It may not have any recorded sales yet, or the address may be spelt differently." />
      </p>
      <div className="mx-auto mt-6 max-w-lg text-left">
        <SearchBox size="lg" />
      </div>
      <div className="mt-6">
        <ButtonLink href="/" variant="outline">
          <T k="common.notFound.home" fallback="Back to home" />
        </ButtonLink>
      </div>
    </PageContainer>
  );
}
