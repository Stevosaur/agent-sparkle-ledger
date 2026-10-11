import { redirect } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/auth/config";
import { getViewer } from "@/lib/auth/viewer";
import { site } from "@/lib/config/site";
import { pageMetadata } from "@/lib/seo";
import { firstParam, safeNextPath } from "@/lib/account/next-path";
import { T } from "@/components/i18n/t";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageContainer, PageHeader } from "@/components/ui/section";
import { AccountsDisabled } from "@/components/account/notices";
import { LoginForm } from "@/components/account/login-form";

export const metadata = pageMetadata({
  title: "Sign in",
  description: `Sign in or create a free ${site.name} account to keep a watchlist, track your home's value and see full sales histories.`,
  path: "/login/",
  noindex: true,
});

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const BENEFITS: { k: string; fallback: string }[] = [
  { k: "account.login.benefitSales", fallback: "Full sales history and context on every property page" },
  { k: "account.login.benefitWatchlist", fallback: "A watchlist of the properties you follow" },
  { k: "account.login.benefitTrack", fallback: "Track your home's estimated value over time" },
  { k: "account.login.benefitValuation", fallback: "Valuation estimates for any HDB flat, condo or landed home" },
];

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const next = safeNextPath(firstParam(sp.next));
  const mode = firstParam(sp.mode) === "signup" ? "signup" : "signin";
  const error = firstParam(sp.error);
  const crumb = mode === "signup" ? { label: "Create account", k: "crumbs.createAccount" } : { label: "Sign in", k: "nav.signIn" };

  if (!isSupabaseConfigured()) {
    return (
      <PageContainer className="pb-16">
        <Breadcrumbs items={[crumb]} />
        <PageHeader title={<T k="account.login.title" fallback="Sign in" />} />
        <AccountsDisabled />
      </PageContainer>
    );
  }

  const viewer = await getViewer();
  if (viewer.userId) redirect(next);

  return (
    <PageContainer className="pb-16">
      <Breadcrumbs items={[crumb]} />
      <div className="mx-auto max-w-md">
        <PageHeader
          title={mode === "signup" ? <T k="account.login.titleSignup" fallback="Create your free account" /> : <T k="account.login.title" fallback="Sign in" />}
          description={
            mode === "signup" ? (
              <T k="account.login.introSignup" fallback="A free account needs only your email. Upgrade to {plus} later if you want the advanced tools." vars={{ plus: site.plusName }} />
            ) : (
              <T k="account.login.intro" fallback="Welcome back. New here? Entering your email creates a free account." />
            )
          }
        />
        {error ? (
          <Notice tone="warn" className="mb-4">
            <T k="account.login.linkInvalid" fallback="That sign-in link is invalid or has expired. Request a new one below." />
          </Notice>
        ) : null}
        <Card>
          <CardBody className="py-6">
            <LoginForm next={next} mode={mode} googleEnabled={process.env.NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED === "true"} />
          </CardBody>
        </Card>
        {mode === "signup" ? (
          <ul className="mt-6 space-y-2 text-sm text-ink">
            {BENEFITS.map((b) => (
              <li key={b.k} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-up" aria-hidden />
                <T k={b.k} fallback={b.fallback} />
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-6 text-xs text-muted">
          <T k="account.login.legal" fallback="By continuing you agree to our" />{" "}
          <Link href="/tos/" className="text-brand-700 hover:underline">
            <T k="account.login.terms" fallback="Terms" />
          </Link>{" "}
          <T k="account.login.and" fallback="and" />{" "}
          <Link href="/privacy/" className="text-brand-700 hover:underline">
            <T k="account.login.privacy" fallback="Privacy policy" />
          </Link>
          .
        </p>
        <p className="mt-2 text-sm">
          {mode === "signup" ? (
            <Link href={`/login/?next=${encodeURIComponent(next)}`} className="text-brand-700 hover:underline">
              <T k="account.login.haveAccount" fallback="Already have an account? Sign in" />
            </Link>
          ) : (
            <Link href={`/plus/`} className="text-brand-700 hover:underline">
              <T k="account.login.seePlus" fallback="See what {plus} adds" vars={{ plus: site.plusName }} />
            </Link>
          )}
        </p>
      </div>
    </PageContainer>
  );
}
