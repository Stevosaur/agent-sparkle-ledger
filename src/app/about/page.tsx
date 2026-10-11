import Link from "next/link";
import { BookOpen, Calculator, Database, LineChart, Mail, Search } from "lucide-react";
import type { ReactNode } from "react";
import { configuredContactEmail, site } from "@/lib/config/site";
import { pageMetadata } from "@/lib/seo";
import { T } from "@/components/i18n/t";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/ui/section";
import { LegalBody, LegalSection } from "../privacy/_components/legal";

export const metadata = pageMetadata({
  title: `About ${site.name}`,
  description: `${site.name} turns Singapore's government-recorded home sales into free pages, calculators and rankings for HDB, condo and landed buyers, sellers and owners.`,
  path: "/about/",
});

const pillars: { icon: ReactNode; k: string; title: string; dk: string; desc: string; href: string }[] = [
  {
    icon: <Search className="size-5" aria-hidden />,
    k: "trust.about.p1",
    title: "A page for every home",
    dk: "trust.about.p1d",
    desc: "Every HDB block, condo project, landed street and new launch gets its own page with recorded sales, rents and context.",
    href: "/property-analysis/",
  },
  {
    icon: <Calculator className="size-5" aria-hidden />,
    k: "trust.about.p2",
    title: "Calculators on current rules",
    dk: "trust.about.p2d",
    desc: "Affordability, stamp duty and mortgage tools use the current IRAS, MAS, HDB and CPF rules, with their sources.",
    href: "/affordability/",
  },
  {
    icon: <LineChart className="size-5" aria-hidden />,
    k: "trust.about.p3",
    title: "Rankings and insights",
    dk: "trust.about.p3d",
    desc: "Compare towns, projects and trends with rankings and market modules built from the same records.",
    href: "/insights/",
  },
  {
    icon: <Database className="size-5" aria-hidden />,
    k: "trust.about.p4",
    title: "Open about our data",
    dk: "trust.about.p4d",
    desc: "Our methodology page lists every source and how each figure is computed, and our public API is free to use.",
    href: "/methodology/",
  },
];

export default function AboutPage() {
  // Without NEXT_PUBLIC_CONTACT_EMAIL the contact section is left out rather than publishing a placeholder.
  const email = configuredContactEmail();
  return (
    <PageContainer>
      <Breadcrumbs items={[{ label: "About", k: "footer.about" }]} />
      <PageHeader
        title={<T k="trust.about.title" fallback="About {name}" vars={{ name: site.name }} />}
        description={<T k="trust.about.intro" fallback="{tagline} {name} helps you answer the questions behind every home decision: what is it worth, what did it sell for, can I afford it, and who will buy it from me later." vars={{ tagline: site.tagline, name: site.name }} />}
      />

      <ul className="grid gap-4 sm:grid-cols-2">
        {pillars.map((p) => (
          <li key={p.k}>
            <Card className="h-full">
              <CardBody className="flex h-full gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">{p.icon}</span>
                <div className="min-w-0">
                  <h2 className="font-semibold text-ink">
                    <Link href={p.href} className="hover:underline">
                      <T k={p.k} fallback={p.title} />
                    </Link>
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    <T k={p.dk} fallback={p.desc} />
                  </p>
                </div>
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>

      <div className="mt-10">
        <LegalBody>
          <LegalSection id="data" title={<T k="trust.about.dataTitle" fallback="Where the numbers come from" />}>
            <p>
              Sales, rents and building facts come from public government sources: HDB resale prices and property information published on data.gov.sg, URA private property
              transactions, rentals and developer sales, OneMap (Singapore Land Authority) for locations, LTA for MRT stations and MOE for schools. Rates and rules come from MAS, HDB,
              CPF Board and IRAS. The <Link href="/methodology/">methodology</Link> page lists each source, how up to date it is, and how every figure is derived.
            </p>
            <p>
              {site.name} is independent. It is not affiliated with or endorsed by HDB, URA or any other government agency.
            </p>
          </LegalSection>

          <LegalSection id="free" title={<T k="trust.about.freeTitle" fallback="What is free" />}>
            <p>
              Property pages, the latest sales, the calculators and the top of every ranking are free. A free account adds full sales histories, property context, valuation estimates, a watchlist
              and home tracking. <Link href="/plus/">{site.plusName}</Link> is an optional subscription for deeper analysis such as demand versus supply, stacking plans, full
              rankings and alerts.
            </p>
          </LegalSection>

          <LegalSection id="principles" title={<T k="trust.about.principlesTitle" fallback="Our principles" />}>
            <ul>
              <li>We show recorded data as published and label every estimate as an estimate.</li>
              <li>When data is missing, we say so instead of filling the gap.</li>
              <li>We give information, not advice, and point you to official sources before you commit.</li>
              <li>We only share your details with a third party when you ask us to (see the <Link href="/privacy/">privacy policy</Link>).</li>
            </ul>
          </LegalSection>

          {email ? (
            <LegalSection id="contact" title={<T k="trust.about.contactTitle" fallback="Contact" />}>
              <p>Spotted an error, or have a question about the data? Email us with a link to the page and we will look into it.</p>
              <ButtonLink href={`mailto:${email}`} variant="outline">
                <Mail className="size-4" aria-hidden />
                {email}
              </ButtonLink>
            </LegalSection>
          ) : null}

          <p className="flex items-center gap-2 text-sm text-muted">
            <BookOpen className="size-4" aria-hidden />
            <Link href="/research/" className="text-brand-700 hover:underline">
              <T k="trust.about.research" fallback="Read our research and explainers" />
            </Link>
          </p>
        </LegalBody>
      </div>
    </PageContainer>
  );
}
