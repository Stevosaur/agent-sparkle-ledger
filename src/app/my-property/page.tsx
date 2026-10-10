import { isSupabaseConfigured } from "@/lib/auth/config";
import { getViewer } from "@/lib/auth/viewer";
import { site } from "@/lib/config/site";
import { pageMetadata } from "@/lib/seo";
import { T } from "@/components/i18n/t";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageContainer, PageHeader } from "@/components/ui/section";
import { GatedPanel } from "@/components/gating/gated-panel";
import { AccountsDisabled, SignInPrompt } from "@/components/account/notices";
import { TrackedHomes } from "@/components/account/tracked-homes";

export const metadata = pageMetadata({
  title: "My Property",
  description: `Track your home's estimated value over time with ${site.name}, based on recorded HDB resale and URA private transactions.`,
  path: "/my-property/",
  noindex: true,
});

/** Tracked homes. Per-user, so rendered on request (reads the session cookie). */
export default async function MyPropertyPage() {
  const header = (
    <>
      <Breadcrumbs items={[{ label: "My Property" }]} />
      <PageHeader
        title={<T k="account.myProperty.title" fallback="My Property" />}
        description={
          <T
            k="account.myProperty.intro"
            fallback="Follow what your home is worth. Each estimate is built from recorded sales of comparable homes in the same block, project or street (or town), and updates as new records are published."
          />
        }
      />
    </>
  );

  if (!isSupabaseConfigured()) {
    return (
      <PageContainer className="pb-16">
        {header}
        <AccountsDisabled />
      </PageContainer>
    );
  }

  const viewer = await getViewer();
  return (
    <PageContainer className="pb-16">
      {header}
      {viewer.userId ? (
        <GatedPanel feature="tracking.basic" minHeight={240}>
          <TrackedHomes />
        </GatedPanel>
      ) : (
        <SignInPrompt
          next="/my-property/"
          titleKey="account.myProperty.signInTitle"
          title="Track your home's value"
          bodyKey="account.myProperty.signInBody"
          body="Create a free account to track your home's estimated value and see how it has moved since you bought it."
        />
      )}
      <p className="mt-8 text-xs text-muted">
        <T
          k="account.myProperty.disclaimer"
          fallback="Estimates are medians of recorded transactions, not valuations. They don't account for your unit's floor, facing, condition or renovation. Sources: HDB resale flat prices (data.gov.sg) and URA private residential transactions."
        />
      </p>
    </PageContainer>
  );
}
