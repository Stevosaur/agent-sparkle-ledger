import { Camera, MapPin, ScanSearch } from "lucide-react";
import type { ReactNode } from "react";
import { site } from "@/lib/config/site";
import { pageMetadata } from "@/lib/seo";
import { T } from "@/components/i18n/t";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";
import { SearchBox } from "@/components/search/search-box";
import { LeadForm } from "@/components/leads/lead-form";

export const metadata = pageMetadata({
  title: "Spot: name any building",
  description: `Coming soon to ${site.name}: point your camera at a building to name it and open its sales, rents and details. Get notified when it launches.`,
  path: "/spot/",
});

const steps: { icon: ReactNode; k: string; title: string; dk: string; desc: string }[] = [
  {
    icon: <Camera className="size-5" aria-hidden />,
    k: "trust.spot.step1",
    title: "Point your camera",
    dk: "trust.spot.step1d",
    desc: "Aim your phone at an HDB block, condo or house while you walk past it.",
  },
  {
    icon: <MapPin className="size-5" aria-hidden />,
    k: "trust.spot.step2",
    title: "We match where you are",
    dk: "trust.spot.step2d",
    desc: "Your location and the direction you face are compared with the positions of blocks and projects in our data.",
  },
  {
    icon: <ScanSearch className="size-5" aria-hidden />,
    k: "trust.spot.step3",
    title: "Open its page",
    dk: "trust.spot.step3d",
    desc: "See the building's name, recent sales, rents and lease in one tap.",
  },
];

export default function SpotPage() {
  return (
    <PageContainer>
      <Breadcrumbs items={[{ label: "Spot", k: "tabs.spot" }]} />
      <PageHeader
        eyebrow={
          <Badge tone="plus">
            <T k="trust.spot.soon" fallback="Coming soon" />
          </Badge>
        }
        title={<T k="trust.spot.title" fallback="Point your camera at a building to name it" />}
        description={
          <T
            k="trust.spot.intro"
            fallback="Spot will identify the building in front of you and open its {name} page. It is not available yet; leave your email and we will tell you when it is."
            vars={{ name: site.name }}
          />
        }
      />

      <div className="grid gap-8 pb-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="space-y-8">
          <Section id="how" title={<T k="trust.spot.howTitle" fallback="How it will work" />}>
            <ol className="grid gap-3 sm:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.k}>
                  <Card className="h-full">
                    <CardBody>
                      <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">{s.icon}</span>
                      <h3 className="mt-3 font-semibold text-ink">
                        <span className="sr-only">{i + 1}. </span>
                        <T k={s.k} fallback={s.title} />
                      </h3>
                      <p className="mt-1 text-sm text-muted">
                        <T k={s.dk} fallback={s.desc} />
                      </p>
                    </CardBody>
                  </Card>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-sm text-muted">
              <T k="trust.spot.privacy" fallback="When Spot launches, it will ask for camera and location permission only while you use it." />
            </p>
          </Section>

          <Section id="meanwhile" title={<T k="trust.spot.meanwhileTitle" fallback="In the meantime" />} description={<T k="trust.spot.meanwhileBody" fallback="Find any building by name, street or postal code, or browse the map." />}>
            <SearchBox />
            <div className="mt-3 flex flex-wrap gap-2">
              <ButtonLink href="/map/" variant="outline" size="sm">
                <T k="trust.spot.map" fallback="Open the map" />
              </ButtonLink>
              <ButtonLink href="/property-analysis/" variant="ghost" size="sm">
                <T k="trust.spot.analysis" fallback="Property analysis" />
              </ButtonLink>
            </div>
          </Section>
        </div>

        <div>
          <LeadForm type="general" context={{ feature: "spot" }} title={<T k="trust.spot.notifyTitle" fallback="Get notified" />} />
        </div>
      </div>
    </PageContainer>
  );
}
