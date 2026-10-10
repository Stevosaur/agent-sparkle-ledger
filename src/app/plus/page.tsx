import { Check, Minus } from "lucide-react";
import { site } from "@/lib/config/site";
import { pageMetadata } from "@/lib/seo";
import { formatSgd } from "@/lib/format";
import { featureRows, includedIn, type FeatureRow } from "@/lib/account/features";
import { TRACKED_MAX } from "@/lib/account/limits";
import { T } from "@/components/i18n/t";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody } from "@/components/ui/card";
import { JsonLd } from "@/components/ui/json-ld";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";
import { DataTable, type Column } from "@/components/ui/table";
import { CheckoutAvailabilityNote, CheckoutButton } from "@/components/account/billing-buttons";

const plus = site.plus;
const yearlySaving = plus.monthlyPrice * 12 - plus.yearlyPrice;
const yearlySavingPct = plus.monthlyPrice > 0 ? yearlySaving / (plus.monthlyPrice * 12) : 0;
const featureVars = { free: site.freeTrackedHomes, max: TRACKED_MAX };

export const metadata = pageMetadata({
  title: `${site.plusName}: plans and pricing`,
  description: `${site.plusName} unlocks demand vs supply, stacking plans, full rankings, insights, alerts and unlimited home tracking. ${formatSgd(plus.monthlyPrice)} a month or ${formatSgd(plus.yearlyPrice)} a year${plus.trialDays > 0 ? `, with a ${plus.trialDays}-day free trial` : ""}.`,
  path: "/plus/",
});

/** FAQ copy. English text also feeds the FAQPage JSON-LD. */
const FAQ: { id: string; q: { k: string; fallback: string }; a: { k: string; fallback: string } }[] = [
  ...(plus.trialDays > 0
    ? [
        {
          id: "trial",
          q: { k: "account.plus.faq.trialQ", fallback: "How does the free trial work?" },
          a: {
            k: "account.plus.faq.trialA",
            fallback:
              "First-time subscribers get {days} days of {plus} free. Checkout asks for a card, and you're only charged when the trial ends. Cancel before then from your profile and you won't pay anything.",
          },
        },
      ]
    : []),
  {
    id: "cancel",
    q: { k: "account.plus.faq.cancelQ", fallback: "Can I cancel any time?" },
    a: { k: "account.plus.faq.cancelA", fallback: "Yes. Open your profile and choose Manage billing. You keep {plus} until the end of the period you've paid for." },
  },
  {
    id: "free",
    q: { k: "account.plus.faq.freeQ", fallback: "What do I get with a free account?" },
    a: {
      k: "account.plus.faq.freeA",
      fallback: "Full sales histories and property context, valuation estimates, a watchlist, and tracking for {free} home on My Property. Everything in the table marked under Free account.",
    },
  },
  {
    id: "data",
    q: { k: "account.plus.faq.dataQ", fallback: "Where does the data come from?" },
    a: {
      k: "account.plus.faq.dataA",
      fallback: "Government records: HDB resale prices published on data.gov.sg and URA private property transactions, rentals and launch data. Our methodology page explains every figure.",
    },
  },
  {
    id: "payments",
    q: { k: "account.plus.faq.paymentsQ", fallback: "How are payments handled?" },
    a: { k: "account.plus.faq.paymentsA", fallback: "Payments are processed by Stripe. Card details go straight to Stripe and are never stored by {site}." },
  },
  {
    id: "advice",
    q: { k: "account.plus.faq.adviceQ", fallback: "Is this financial advice?" },
    a: { k: "account.plus.faq.adviceA", fallback: "No. {site} is a research tool. Estimates can be wrong, so check figures with official sources and a licensed professional before you commit." },
  },
];

const faqVars = { days: plus.trialDays, plus: site.plusName, free: site.freeTrackedHomes, site: site.name };

function fill(text: string): string {
  return text.replace(/\{(\w+)\}/g, (m, key: string) => (key in faqVars ? String(faqVars[key as keyof typeof faqVars]) : m));
}

function Included({ yes }: { yes: boolean }) {
  return yes ? (
    <span className="inline-flex justify-center text-up">
      <Check className="size-4" aria-hidden />
      <span className="sr-only">
        <T k="account.plus.included" fallback="Included" />
      </span>
    </span>
  ) : (
    <span className="inline-flex justify-center text-muted/60">
      <Minus className="size-4" aria-hidden />
      <span className="sr-only">
        <T k="account.plus.notIncluded" fallback="Not included" />
      </span>
    </span>
  );
}

const columns: Column<FeatureRow>[] = [
  {
    key: "feature",
    header: <T k="account.plus.colFeature" fallback="Feature" />,
    cell: (r) => (
      <span className="whitespace-normal">
        <T k={r.k} fallback={r.fallback} vars={featureVars} />
      </span>
    ),
    className: "min-w-48 max-w-md",
  },
  { key: "visitor", header: <T k="account.plus.colVisitor" fallback="Visitor" />, cell: (r) => <Included yes={includedIn(r.level)[0]} />, align: "center" },
  { key: "free", header: <T k="account.plus.colFree" fallback="Free account" />, cell: (r) => <Included yes={includedIn(r.level)[1]} />, align: "center" },
  { key: "plus", header: site.plusName, cell: (r) => <Included yes={includedIn(r.level)[2]} />, align: "center" },
];

function PlanCard({ interval }: { interval: "month" | "year" }) {
  const yearly = interval === "year";
  return (
    <Card className={yearly ? "relative border-plus-400 ring-1 ring-plus-400" : undefined}>
      <CardBody className="flex h-full flex-col gap-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-ink">{yearly ? <T k="account.plus.yearly" fallback="Yearly" /> : <T k="account.plus.monthly" fallback="Monthly" />}</h3>
          {yearly && yearlySaving > 0 ? (
            <Badge tone="plus">
              <T k="account.plus.save" fallback="Save {amount} ({pct}%)" vars={{ amount: formatSgd(yearlySaving), pct: Math.round(yearlySavingPct * 100) }} />
            </Badge>
          ) : null}
        </div>
        <div>
          <span className="tabular text-3xl font-bold text-ink">{formatSgd(yearly ? plus.yearlyPrice : plus.monthlyPrice)}</span>
          <span className="ml-1 text-sm text-muted">{yearly ? <T k="account.plus.perYear" fallback="/ year" /> : <T k="account.plus.perMonth" fallback="/ month" />}</span>
          {yearly && plus.yearlyPrice > 0 ? (
            <p className="mt-1 text-xs text-muted">
              <T k="account.plus.yearlyMonthly" fallback="Works out to {amount} a month" vars={{ amount: formatSgd(plus.yearlyPrice / 12) }} />
            </p>
          ) : null}
        </div>
        {plus.trialDays > 0 ? (
          <p className="text-sm text-ink">
            {yearly ? (
              <T k="account.plus.trialNoteYearly" fallback="{days}-day free trial for first-time subscribers, then billed yearly." vars={{ days: plus.trialDays }} />
            ) : (
              <T k="account.plus.trialNoteMonthly" fallback="{days}-day free trial for first-time subscribers, then billed monthly." vars={{ days: plus.trialDays }} />
            )}
          </p>
        ) : null}
        <div className="mt-auto">
          <CheckoutButton interval={interval} featured={yearly} />
        </div>
      </CardBody>
    </Card>
  );
}

export default function PlusPage() {
  const rows = featureRows();
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: fill(f.q.fallback), acceptedAnswer: { "@type": "Answer", text: fill(f.a.fallback) } })),
  };
  return (
    <PageContainer className="pb-16">
      <Breadcrumbs items={[{ label: site.plusName }]} />
      <PageHeader
        eyebrow={<T k="account.plus.eyebrow" fallback="Membership" />}
        title={site.plusName}
        description={
          <T
            k="account.plus.intro"
            fallback="The deeper tools for serious buyers and owners: demand vs supply, stacking plans, full rankings and insights, alerts and tracking for all your homes."
          />
        }
      />

      <section aria-labelledby="plans-heading" className="space-y-4">
        <h2 id="plans-heading" className="sr-only">
          <T k="account.plus.plans" fallback="Plans" />
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <PlanCard interval="month" />
          <PlanCard interval="year" />
        </div>
        <CheckoutAvailabilityNote />
        <p className="text-xs text-muted">
          <T k="account.plus.priceNote" fallback="Prices in Singapore dollars. Cancel any time from your profile." />
        </p>
      </section>

      <Section
        id="compare"
        className="mt-12"
        title={<T k="account.plus.compareTitle" fallback="What's included" />}
        description={<T k="account.plus.compareBody" fallback="Every gated feature on the site, and which plan unlocks it." />}
      >
        <Card>
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.feature} />
        </Card>
      </Section>

      <Section id="faq" className="mt-12" title={<T k="account.plus.faqTitle" fallback="Questions" />}>
        <div className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
          {FAQ.map((f) => (
            <details key={f.id} className="group px-5 py-4">
              <summary className="cursor-pointer list-none font-medium text-ink marker:hidden">
                <span className="flex items-center justify-between gap-3">
                  <T k={f.q.k} fallback={f.q.fallback} vars={faqVars} />
                  <span className="text-muted transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-2 text-sm text-muted">
                <T k={f.a.k} fallback={f.a.fallback} vars={faqVars} />
              </p>
            </details>
          ))}
        </div>
      </Section>
      <JsonLd data={faqLd} />
    </PageContainer>
  );
}
