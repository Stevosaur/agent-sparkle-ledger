import Link from "next/link";
import { AirVent, Building, ShieldCheck, Sparkles, Truck } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";
import { Card, CardBody } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { T } from "@/components/i18n/t";
import { LeadForm } from "@/components/leads/lead-form";
import { search } from "@/lib/data/search";
import { isValidPostalCode } from "@/lib/leads/validate";
import { placeRefFromSearch } from "@/lib/homes/fit";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Home services: cleaning, moving, disinfection, aircon",
  description: "Book home cleaning, movers, disinfection or aircon servicing for your HDB flat, condo or landed home in Singapore. Enter your postal code and preferred date.",
  path: "/services/",
});

const SERVICES = [
  {
    key: "cleaning",
    icon: Sparkles,
    title: ["homes.services.cleaning", "Home cleaning"],
    body: ["homes.services.cleaningDesc", "One-off or regular cleaning, and deep cleans before you move in or after you move out."],
  },
  {
    key: "moving",
    icon: Truck,
    title: ["homes.services.moving", "Moving"],
    body: ["homes.services.movingDesc", "Packing, transport and furniture dismantling and assembly for HDB, condo and landed moves."],
  },
  {
    key: "disinfection",
    icon: ShieldCheck,
    title: ["homes.services.disinfection", "Disinfection"],
    body: ["homes.services.disinfectionDesc", "Disinfection of rooms, kitchens, bathrooms and high-touch surfaces, for example before a new tenant moves in."],
  },
  {
    key: "aircon",
    icon: AirVent,
    title: ["homes.services.aircon", "Aircon servicing"],
    body: ["homes.services.airconDesc", "General servicing, chemical cleaning and checks for wall-mounted and multi-split air-conditioners."],
  },
] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ServicesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = typeof sp.postal === "string" ? sp.postal.trim().slice(0, 12) : "";
  const postal = raw && isValidPostalCode(raw) ? raw : null;
  const invalidPostal = raw !== "" && !postal;
  const match = postal ? (search(postal, { kinds: ["hdb"], limit: 1 })[0] ?? null) : null;
  const blockRef = match ? placeRefFromSearch(match) : null;
  const context: Record<string, string> = {};
  if (postal) context.postal = postal;
  if (blockRef) context.property = blockRef;

  return (
    <PageContainer className="pb-16">
      <Breadcrumbs items={[{ label: "Home services", k: "homes.services.title" }]} />
      <PageHeader
        title={<T k="homes.services.title" fallback="Home services" />}
        description={<T k="homes.services.intro" fallback="Cleaning, moving, disinfection and aircon servicing for your home. Tell us your postal code, the service and a preferred date, and our service partner will confirm the time and quote with you." />}
      />

      <div className="grid gap-8 lg:grid-cols-5">
        <div className="space-y-8 lg:col-span-3">
          <Section id="services" title={<T k="homes.services.listTitle" fallback="What we can arrange" />}>
            <ul className="grid gap-3 sm:grid-cols-2">
              {SERVICES.map((s) => (
                <li key={s.key}>
                  <Card className="h-full">
                    <CardBody className="flex gap-3">
                      <s.icon className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
                      <div>
                        <h3 className="font-semibold text-ink">
                          <T k={s.title[0]} fallback={s.title[1]} />
                        </h3>
                        <p className="mt-1 text-sm text-muted">
                          <T k={s.body[0]} fallback={s.body[1]} />
                        </p>
                      </div>
                    </CardBody>
                  </Card>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="how" title={<T k="homes.services.howTitle" fallback="How it works" />}>
            <ol className="space-y-3 text-sm text-ink">
              {[
                ["homes.services.step1", "Send a request with your postal code, the service you need and a preferred date."],
                ["homes.services.step2", "Our service partner contacts you to confirm the scope, the price and a time slot."],
                ["homes.services.step3", "Sending a request is free and does not commit you to a booking."],
              ].map(([k, fb], i) => (
                <li key={k} className="flex gap-3">
                  <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800" aria-hidden>
                    {i + 1}
                  </span>
                  <span>
                    <T k={k} fallback={fb} />
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <div className="space-y-4 lg:col-span-2">
          {invalidPostal ? (
            <Notice tone="warn">
              <T k="homes.services.badPostal" fallback="The postal code in the link is not a valid 6-digit Singapore postal code, so it was not filled in." />
            </Notice>
          ) : null}
          {postal && match ? (
            <Card>
              <CardBody className="flex gap-3">
                <Building className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
                <div className="min-w-0 text-sm">
                  <div className="text-muted">
                    <T k="homes.services.matched" fallback="Postal code {postal}" vars={{ postal }} />
                  </div>
                  <Link href={match.href} className="font-medium text-brand-700 hover:underline">
                    {match.label}
                  </Link>
                  <div className="text-xs text-muted">{match.sub}</div>
                </div>
              </CardBody>
            </Card>
          ) : postal ? (
            <Notice>
              <T k="homes.services.noMatch" fallback="We could not match postal code {postal} to an HDB block in our records. You can still send a request with it." vars={{ postal }} />
            </Notice>
          ) : null}
          <LeadForm type="services" context={context} initial={{ postal: postal ?? "" }} />
        </div>
      </div>
    </PageContainer>
  );
}
