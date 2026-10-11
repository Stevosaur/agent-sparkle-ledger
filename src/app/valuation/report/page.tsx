import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageContainer, PageHeader } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/notice";
import { buttonClass } from "@/components/ui/button";
import { T } from "@/components/i18n/t";
import { GatedPanel } from "@/components/gating/gated-panel";
import { ValuationReport } from "@/components/tools/valuation-report";
import { resolveProperty } from "@/lib/data/resolve";
import { formatPropertyRef, parsePropertyRef } from "@/lib/property-ref";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/config/site";
import { firstParam } from "@/lib/tools/refs";

export const metadata = pageMetadata({
  title: "Valuation report",
  description: "Printable valuation report with the estimate, comparable sales and method.",
  path: "/valuation/report/",
  noindex: true,
});

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Host printed on the report, resolved on the server where Vercel's system variables are readable: the configured
 * site URL (NEXT_PUBLIC_SITE_URL, else the production domain, see site.url), else this deployment's own host.
 */
function reportHost(): string {
  const deployment = process.env.VERCEL_URL;
  if (!process.env.NEXT_PUBLIC_SITE_URL && !process.env.VERCEL_PROJECT_PRODUCTION_URL && deployment) return deployment;
  return site.url.replace(/^https?:\/\//, "");
}

function num(v: string | undefined): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default async function ValuationReportPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ref = parsePropertyRef(firstParam(sp.ref) ?? "");
  const area = num(firstParam(sp.area));
  const resolved = ref ? resolveProperty(ref) : null;
  const valid = Boolean(resolved && area != null && area > 0 && area <= 100_000);
  return (
    <PageContainer className="pb-12">
      <div className="print:hidden">
        <Breadcrumbs items={[{ label: "Valuation", href: "/valuation/", k: "nav.valuation" }, { label: "Report", k: "crumbs.report" }]} />
      </div>
      <div className="print:hidden">
        <PageHeader
          title={<T k="tools.val.reportTitle" fallback="Valuation report" />}
          description={resolved ? resolved.label : undefined}
        />
      </div>
      {valid && ref && area != null ? (
        <GatedPanel feature="valuation.report" minHeight={240}>
          <ValuationReport
            siteHost={reportHost()}
            body={{
              ref: formatPropertyRef(ref),
              flatType: firstParam(sp.flatType)?.slice(0, 40) ?? null,
              storeyRange: firstParam(sp.storey)?.slice(0, 20) ?? null,
              floor: num(firstParam(sp.floor)),
              areaSqm: area,
            }}
          />
        </GatedPanel>
      ) : (
        <EmptyState
          title={<T k="tools.val.reportMissing" fallback="Nothing to report yet" />}
          action={
            <Link href="/valuation/" className={buttonClass("primary")}>
              <T k="tools.val.backToTool" fallback="Back to the valuation tool" />
            </Link>
          }
        >
          <T k="tools.val.reportMissingBody" fallback="Run an estimate on the valuation page first, then use “Download report”." />
        </EmptyState>
      )}
    </PageContainer>
  );
}
