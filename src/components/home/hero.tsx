import { Fragment } from "react";
import { site } from "@/lib/config/site";
import { formatInt, formatMonth } from "@/lib/format";
import type { CredibilityItem } from "@/lib/home-insights";
import { T } from "@/components/i18n/t";
import { PageContainer } from "@/components/ui/section";
import { SearchBox } from "@/components/search/search-box";

function CredibilityText({ item }: { item: CredibilityItem }) {
  const count = formatInt(item.count);
  switch (item.kind) {
    case "hdb":
      return item.since != null ? (
        <T k="home.cred.hdbSince" fallback="{count} HDB resale records since {year}" vars={{ count, year: item.since }} />
      ) : (
        <T k="home.cred.hdb" fallback="{count} HDB resale records" vars={{ count }} />
      );
    case "private":
      return item.since != null ? (
        <T k="home.cred.privateSince" fallback="{count} private home sales since {year}" vars={{ count, year: item.since }} />
      ) : (
        <T k="home.cred.private" fallback="{count} private home sales" vars={{ count }} />
      );
    case "rentals":
      return <T k="home.cred.rentals" fallback="{count} rental records" vars={{ count }} />;
  }
}

/** Home hero: tagline (the page's only h1), large search box and a line of dataset counts. */
export function HomeHero({ credibility }: { credibility: { items: CredibilityItem[]; latestMonth: string | null } }) {
  const parts = credibility.items.length > 0 || credibility.latestMonth;
  return (
    <section aria-labelledby="home-hero-title" className="border-b border-line bg-gradient-to-b from-brand-50 to-canvas">
      <PageContainer className="py-10 sm:py-16">
        <h1 id="home-hero-title" className="max-w-3xl text-3xl font-bold tracking-tight text-ink sm:text-5xl">
          <T k="home.tagline" fallback={site.tagline} />
        </h1>
        <p className="mt-3 max-w-2xl text-base text-muted sm:text-lg">
          <T k="home.heroSub" fallback="Search any HDB block, condo, landed home or street to see what it sold for, what it rents for and what is around it." />
        </p>
        <div className="mt-6 max-w-2xl">
          <SearchBox size="lg" />
        </div>
        {parts ? (
          <p className="tabular mt-4 flex max-w-3xl flex-wrap gap-x-2 gap-y-1 text-sm text-muted">
            {credibility.items.map((item, i) => (
              <Fragment key={item.kind}>
                {i > 0 ? <span aria-hidden>·</span> : null}
                <span>
                  <CredibilityText item={item} />
                </span>
              </Fragment>
            ))}
            {credibility.latestMonth ? (
              <>
                {credibility.items.length > 0 ? <span aria-hidden>·</span> : null}
                <span>
                  <T k="home.cred.updated" fallback="data to {month}" vars={{ month: formatMonth(credibility.latestMonth) }} />
                </span>
              </>
            ) : null}
          </p>
        ) : null}
      </PageContainer>
    </section>
  );
}
