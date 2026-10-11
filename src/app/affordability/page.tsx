import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageContainer, PageHeader } from "@/components/ui/section";
import { T } from "@/components/i18n/t";
import { AffordabilityTool } from "@/components/tools/affordability-tool";
import { getRates } from "@/lib/data/rates";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 86400;

export const metadata = pageMetadata({
  title: "Affordability calculator: how much home can I afford in Singapore?",
  description:
    "Work out your maximum home price from cash, CPF and income under MAS TDSR, MSR and LTV rules, with stamp duties, loan and monthly instalment, then see the HDB towns and condos that fit.",
  path: "/affordability/",
});

export default function AffordabilityPage() {
  const rates = getRates();
  const sora = rates?.sora.compounded3m ?? null;
  return (
    <PageContainer className="pb-12">
      <Breadcrumbs items={[{ label: "Affordability", k: "nav.affordability" }]} />
      <PageHeader
        eyebrow={<T k="tools.aff.eyebrow" fallback="Affordability" />}
        title={<T k="tools.aff.title" fallback="What can I afford?" />}
        description={
          <T
            k="tools.aff.intro"
            fallback="Start from your savings or your income. We apply the current MAS loan limits, stamp duties and HDB loan rules, then show the towns and projects where recent prices fit."
          />
        }
      />
      <AffordabilityTool defaults={{ sora3m: sora ? { value: sora.value, date: sora.date } : null }} />
    </PageContainer>
  );
}
