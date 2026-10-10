import type { Metadata } from "next";
import { site } from "@/lib/config/site";
import { pageMetadata } from "@/lib/seo";
import { getMeta } from "@/lib/data/meta";
import { getSeries } from "@/lib/data/stats";
import { getRates } from "@/lib/data/rates";
import { getTowns } from "@/lib/data/hdb";
import { getLaunches } from "@/lib/data/private";
import { countLaunchTabs, credibility, groupLaunches, marketPulse, popularTowns } from "@/lib/home-insights";
import { T } from "@/components/i18n/t";
import { PageContainer, Section } from "@/components/ui/section";
import { JsonLd } from "@/components/ui/json-ld";
import { HomeHero } from "@/components/home/hero";
import { QuickTasks } from "@/components/home/quick-tasks";
import { ToolTiles } from "@/components/home/tool-tiles";
import { LaunchCarousel } from "@/components/home/launch-carousel";
import { MarketPulse } from "@/components/home/market-pulse";
import { RateSnapshot, hasRateSnapshot } from "@/components/home/rate-snapshot";
import { PopularTowns } from "@/components/home/popular-towns";

export const revalidate = 3600;

const homeTitle = `${site.name} — Singapore property research`;

const baseMetadata = pageMetadata({ title: homeTitle, description: site.description, path: "/" });

export const metadata: Metadata = {
  ...baseMetadata,
  // the home title already carries the brand, so skip the "| name" template
  title: { absolute: homeTitle },
  openGraph: { ...baseMetadata.openGraph, title: homeTitle },
  twitter: { ...baseMetadata.twitter, title: homeTitle },
};

export default function HomePage() {
  const meta = getMeta();
  const generatedAt = meta.generatedAt || null;
  const hdbSeries = getSeries("hdb:ALL:ALL");
  const privateSeries = getSeries("private:ALL:ALL");
  const rates = getRates();
  const showRates = hasRateSnapshot(rates);

  const cred = credibility(meta, { hdb: hdbSeries?.points[0]?.m ?? null, private: privateSeries?.points[0]?.m ?? null });
  const hdbPulse = marketPulse(hdbSeries, meta.latestMonth.hdb, generatedAt);
  const privatePulse = marketPulse(privateSeries, meta.latestMonth.private, generatedAt);
  const allLaunches = getLaunches();
  const launches = groupLaunches(allLaunches);
  const launchTotals = countLaunchTabs(allLaunches);
  const towns = popularTowns(getTowns(), 12);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: site.name,
          url: `${site.url}/`,
          description: site.description,
          inLanguage: site.locale,
          potentialAction: {
            "@type": "SearchAction",
            target: { "@type": "EntryPoint", urlTemplate: `${site.url}/property-analysis/?q={search_term_string}` },
            "query-input": "required name=search_term_string",
          },
        }}
      />
      <HomeHero credibility={cred} />
      <PageContainer className="space-y-10 py-8 sm:space-y-12 sm:py-10">
        <QuickTasks />
        <ToolTiles />
        <LaunchCarousel groups={launches} totals={launchTotals} />
        <Section
          id="market"
          title={<T k="home.pulse.title" fallback="Market pulse" />}
          description={<T k="home.pulse.desc" fallback="Median prices for the latest three complete months against the same months a year earlier." />}
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <MarketPulse hdb={hdbPulse} privateHomes={privatePulse} className={showRates ? "lg:col-span-2" : "lg:col-span-3"} />
            {showRates ? <RateSnapshot rates={rates} className="self-start" /> : null}
          </div>
        </Section>
        <PopularTowns towns={towns} />
      </PageContainer>
    </>
  );
}
