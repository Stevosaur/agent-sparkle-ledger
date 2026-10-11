import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { isStripeConfigured, isSupabaseConfigured, supabaseSecretKey } from "@/lib/auth/config";
import { getViewer } from "@/lib/auth/viewer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { configuredContactEmail, site } from "@/lib/config/site";
import { pageMetadata } from "@/lib/seo";
import { firstParam } from "@/lib/account/next-path";
import { isTelegramConfigured } from "@/lib/account/telegram";
import { eligibleForTrial } from "@/lib/stripe/subscription";
import { T } from "@/components/i18n/t";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";
import { Stat, StatGrid } from "@/components/ui/stat";
import { GatedPanel, PlusBadge } from "@/components/gating/gated-panel";
import { AccountsDisabled } from "@/components/account/notices";
import { ManageBillingButton } from "@/components/account/billing-buttons";
import { WatchlistManager } from "@/components/account/watchlist-manager";
import { TelegramLink } from "@/components/account/telegram-link";
import { AlertsManager } from "@/components/account/alerts-manager";

export const metadata = pageMetadata({
  title: "Your profile",
  description: `Your ${site.name} account: plan and billing, watchlist and alerts.`,
  path: "/profile/",
  noindex: true,
});

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface SubscriptionInfo {
  status: string | null;
  price_id: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

const dateFormat = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" });

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : dateFormat.format(d);
}

const STATUS_LABELS: Record<string, { k: string; fallback: string; tone: "up" | "warn" | "neutral" | "down" }> = {
  active: { k: "account.status.active", fallback: "Active", tone: "up" },
  trialing: { k: "account.status.trialing", fallback: "Free trial", tone: "up" },
  past_due: { k: "account.status.pastDue", fallback: "Payment overdue", tone: "warn" },
  unpaid: { k: "account.status.unpaid", fallback: "Unpaid", tone: "down" },
  canceled: { k: "account.status.canceled", fallback: "Cancelled", tone: "neutral" },
  incomplete: { k: "account.status.incomplete", fallback: "Payment incomplete", tone: "warn" },
  incomplete_expired: { k: "account.status.expired", fallback: "Expired", tone: "neutral" },
  paused: { k: "account.status.paused", fallback: "Paused", tone: "neutral" },
};

export default async function ProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  if (!isSupabaseConfigured()) {
    return (
      <PageContainer className="pb-16">
        <Breadcrumbs items={[{ label: "Profile", k: "tabs.profile" }]} />
        <PageHeader title={<T k="account.profile.title" fallback="Your profile" />} />
        <AccountsDisabled />
      </PageContainer>
    );
  }

  const viewer = await getViewer();
  if (!viewer.userId) redirect(`/login/?next=${encodeURIComponent("/profile/")}`);

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login/");
  const [subResult, profileResult] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("status, price_id, current_period_end, trial_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id")
      .eq("user_id", viewer.userId)
      .maybeSingle(),
    supabase.from("profiles").select("telegram_chat_id").eq("id", viewer.userId).maybeSingle(),
  ]);
  const sub = (subResult.data ?? null) as SubscriptionInfo | null;
  const telegramLinked = Boolean((profileResult.data as { telegram_chat_id?: string | null } | null)?.telegram_chat_id);
  const telegramConfigured = isTelegramConfigured() && Boolean(supabaseSecretKey());
  const billing = isStripeConfigured();

  const isPlus = viewer.plan === "plus";
  const status = sub?.status ? (STATUS_LABELS[sub.status] ?? null) : null;
  const trialing = sub?.status === "trialing";
  const periodEnd = formatDate(sub?.current_period_end ?? null);
  const trialEnd = formatDate(sub?.trial_end ?? null);
  const interval =
    sub?.price_id && sub.price_id === process.env.STRIPE_PRICE_YEARLY ? "year" : sub?.price_id && sub.price_id === process.env.STRIPE_PRICE_MONTHLY ? "month" : null;
  const trialAvailable = eligibleForTrial(sub) && site.plus.trialDays > 0;
  const checkoutSuccess = firstParam(sp.checkout) === "success";
  const contactEmail = configuredContactEmail();

  return (
    <PageContainer className="pb-16">
      <Breadcrumbs items={[{ label: "Profile", k: "tabs.profile" }]} />
      <PageHeader title={<T k="account.profile.title" fallback="Your profile" />} description={viewer.email ?? undefined} />

      {checkoutSuccess ? (
        <Notice className="mb-6" title={<T k="account.profile.checkoutTitle" fallback="Thanks for subscribing" />}>
          <T
            k="account.profile.checkoutBody"
            fallback="Your {plus} membership is being activated. Payment confirmation can take a few seconds to arrive; refresh this page if your plan still shows Free."
            vars={{ plus: site.plusName }}
          />
        </Notice>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-10 lg:col-span-2">
          <Section id="plan" title={<T k="account.profile.planTitle" fallback="Plan" />}>
            <Card>
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    {isPlus ? site.plusName : <T k="account.profile.planFree" fallback="Free account" />}
                    {isPlus ? <PlusBadge /> : null}
                  </span>
                }
                description={
                  isPlus ? (
                    <T k="account.profile.planPlusBody" fallback="Every feature on the site is unlocked." />
                  ) : (
                    <T k="account.profile.planFreeBody" fallback="Full sales histories, valuations, a watchlist and {free} tracked home." vars={{ free: site.freeTrackedHomes }} />
                  )
                }
                actions={
                  status ? (
                    <Badge tone={status.tone}>
                      <T k={status.k} fallback={status.fallback} />
                    </Badge>
                  ) : sub?.status ? (
                    <Badge>{sub.status}</Badge>
                  ) : null
                }
              />
              <CardBody className="space-y-5">
                {sub?.stripe_subscription_id ? (
                  <StatGrid>
                    {interval ? (
                      <Stat
                        label={<T k="account.profile.billing" fallback="Billing" />}
                        value={interval === "year" ? <T k="account.plus.yearly" fallback="Yearly" /> : <T k="account.plus.monthly" fallback="Monthly" />}
                      />
                    ) : null}
                    {trialing && (trialEnd ?? periodEnd) ? <Stat label={<T k="account.profile.trialEnds" fallback="Trial ends" />} value={trialEnd ?? periodEnd} /> : null}
                    {periodEnd && (sub.status === "active" || sub.status === "past_due") ? (
                      <Stat
                        label={sub.cancel_at_period_end ? <T k="account.profile.endsOn" fallback="Access ends" /> : <T k="account.profile.renewsOn" fallback="Renews on" />}
                        value={periodEnd}
                      />
                    ) : null}
                  </StatGrid>
                ) : null}
                {sub?.cancel_at_period_end && periodEnd && (sub.status === "active" || sub.status === "trialing") ? (
                  <p className="text-sm text-muted">
                    <T k="account.profile.cancelNote" fallback="Your membership won't renew. You keep {plus} until {date}." vars={{ plus: site.plusName, date: periodEnd }} />
                  </p>
                ) : null}
                {sub?.status === "past_due" ? (
                  <Notice tone="warn">
                    <T k="account.profile.pastDue" fallback="Your last payment didn't go through. Update your card in Manage billing to keep your membership." />
                  </Notice>
                ) : null}
                <div className="flex flex-wrap items-start gap-2">
                  {billing && sub?.stripe_customer_id ? <ManageBillingButton variant={isPlus ? "primary" : "outline"} /> : null}
                  {!isPlus ? (
                    <ButtonLink href="/plus/" variant="plus">
                      {trialAvailable ? (
                        <T k="account.plus.startTrial" fallback="Start {days}-day free trial" vars={{ days: site.plus.trialDays }} />
                      ) : (
                        <T k="account.plus.upgrade" fallback="Upgrade to {plus}" vars={{ plus: site.plusName }} />
                      )}
                    </ButtonLink>
                  ) : null}
                </div>
                {!billing && !isPlus ? (
                  <p className="text-xs text-muted">
                    <T k="account.plus.noBilling" fallback="Payments aren't enabled on this deployment yet, so checkout is switched off." />
                  </p>
                ) : null}
              </CardBody>
            </Card>
          </Section>

          <Section
            id="watchlist"
            title={<T k="account.watchlist.title" fallback="Watchlist" />}
            description={<T k="account.watchlist.intro" fallback="Properties you follow. Add one with the bookmark button at the end of any property page." />}
          >
            <WatchlistManager />
          </Section>

          <Section
            id="alerts"
            title={<T k="account.alerts.title" fallback="Alerts" />}
            description={<T k="account.alerts.intro" fallback="Get a Telegram message when a property you follow records a new sale, or a new launch reports new sales." />}
          >
            <div className="space-y-4">
              <TelegramLink configured={telegramConfigured} linked={telegramLinked} />
              <GatedPanel feature="alerts" minHeight={200}>
                <AlertsManager />
              </GatedPanel>
            </div>
          </Section>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader title={<T k="account.profile.accountTitle" fallback="Account" />} />
            <CardBody className="space-y-4 text-sm">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted">
                  <T k="account.profile.email" fallback="Email" />
                </div>
                <div className="mt-0.5 break-all text-ink">{viewer.email ?? "—"}</div>
              </div>
              <ul className="space-y-1">
                <li>
                  <Link href="/my-property/" className="text-brand-700 hover:underline">
                    <T k="account.profile.myPropertyLink" fallback="My Property: tracked homes" />
                  </Link>
                </li>
                <li>
                  <Link href="/plus/" className="text-brand-700 hover:underline">
                    <T k="account.profile.plansLink" fallback="Plans and pricing" />
                  </Link>
                </li>
              </ul>
              <form action="/auth/signout/" method="post">
                <Button type="submit" variant="outline" size="sm">
                  <LogOut className="size-4" aria-hidden />
                  <T k="account.profile.signOut" fallback="Sign out" />
                </Button>
              </form>
              {contactEmail ? (
                <p className="text-xs text-muted">
                  <T k="account.profile.deleteNote" fallback="To delete your account and data, email {email} from this address." vars={{ email: contactEmail }} />
                </p>
              ) : null}
            </CardBody>
          </Card>
        </aside>
      </div>
    </PageContainer>
  );
}
