import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LAUNCH_TABS, type LaunchCard as LaunchCardData, type LaunchTab } from "@/lib/home-insights";
import { T } from "@/components/i18n/t";
import { Section } from "@/components/ui/section";
import { Tabs } from "@/components/ui/tabs";
import { LaunchCard } from "./launch-card";
import { ScrollCarousel } from "./scroll-carousel";
import { SourceLine } from "./source-line";

const TAB_LABELS: Record<LaunchTab, { k: string; fallback: string; listingType: string; ariaKey: string; aria: string }> = {
  condo: { k: "home.launches.tab.condo", fallback: "Condo", listingType: "condo", ariaKey: "home.launches.aria.condo", aria: "Condo launches" },
  ec: { k: "home.launches.tab.ec", fallback: "EC", listingType: "ec", ariaKey: "home.launches.aria.ec", aria: "Executive condominium launches" },
  landed: { k: "home.launches.tab.landed", fallback: "Landed", listingType: "landed", ariaKey: "home.launches.aria.landed", aria: "Landed launches" },
  upcoming: { k: "home.launches.tab.upcoming", fallback: "Upcoming", listingType: "upcoming", ariaKey: "home.launches.aria.upcoming", aria: "Upcoming launches" },
};

/**
 * New-launch carousel with one tab per type (Condo / EC / Landed / Upcoming). `groups` holds the
 * (capped) cards per tab; `totals` the uncapped number of launches per tab shown on each tab label.
 */
export function LaunchCarousel({ groups, totals }: { groups: Record<LaunchTab, LaunchCardData[]>; totals?: Record<LaunchTab, number> }) {
  const total = LAUNCH_TABS.reduce((s, tab) => s + groups[tab].length, 0);
  const viewAll = (
    <Link href="/listings/" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
      <T k="home.launches.viewAll" fallback="All new launches" />
      <ArrowRight className="size-4" aria-hidden />
    </Link>
  );

  if (total === 0) {
    return (
      <Section id="new-launches" title={<T k="home.launches.title" fallback="New launches" />}>
        <p className="text-sm text-muted">
          <T k="home.launches.none" fallback="No new-launch sales data has been loaded yet." />{" "}
          <Link href="/listings/" className="font-medium text-brand-700 hover:underline">
            <T k="home.launches.noneLink" fallback="Browse the new-launch catalogue" />
          </Link>
        </p>
      </Section>
    );
  }

  const defaultTab = LAUNCH_TABS.find((tab) => groups[tab].length > 0) ?? "condo";

  return (
    <Section
      id="new-launches"
      title={<T k="home.launches.title" fallback="New launches" />}
      description={<T k="home.launches.desc" fallback="Units sold to date and the latest median price, from developer sales reported to URA." />}
      actions={viewAll}
    >
      <Tabs
        defaultTab={defaultTab}
        items={LAUNCH_TABS.map((tab) => {
          const meta = TAB_LABELS[tab];
          const cards = groups[tab];
          return {
            id: tab,
            label: (
              <>
                <T k={meta.k} fallback={meta.fallback} />
                <span className="ml-1 text-xs text-muted">{totals?.[tab] ?? cards.length}</span>
              </>
            ),
            content:
              cards.length > 0 ? (
                <ScrollCarousel labelKey={meta.ariaKey} label={meta.aria} items={cards.map((card) => ({ key: `${card.type}/${card.slug}`, node: <LaunchCard card={card} /> }))} />
              ) : (
                <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center text-sm text-muted">
                  <T k="home.launches.emptyTab" fallback="Nothing in this category in the current data." />{" "}
                  <Link href={`/listings/?type=${meta.listingType}`} className="font-medium text-brand-700 hover:underline">
                    <T k="home.launches.browse" fallback="Browse launches" />
                  </Link>
                </p>
              ),
          };
        })}
      />
      <SourceLine>
        <T k="home.source.launches" fallback="URA developer sales and private residential pipeline" />
      </SourceLine>
    </Section>
  );
}
