import { Suspense } from "react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageContainer, PageHeader } from "@/components/ui/section";
import { T } from "@/components/i18n/t";
import { FitTool } from "@/components/homes/fit-tool";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Find homes near your places",
  description: "Rank Singapore homes by how close they are to the places that matter to you: work, school, family. Add up to three places and set how much each matters.",
  path: "/homes/fit/",
});

export default function FitPage() {
  return (
    <PageContainer className="max-w-4xl pb-16">
      <Breadcrumbs items={[{ label: "Homes", href: "/homes/", k: "nav.homes" }, { label: "Find homes near your places", k: "homes.fit.title" }]} />
      <PageHeader
        title={<T k="homes.fit.title" fallback="Find homes near your places" />}
        description={<T k="homes.fit.intro" fallback="Add up to three places you travel to often and how much each matters. Homes are ranked by weighted straight-line distance, and the link keeps your places so you can share it." />}
      />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-canvas" role="status"><span className="sr-only"><T k="common.loading" fallback="Loading…" /></span></div>}>
        <FitTool />
      </Suspense>
    </PageContainer>
  );
}
