import Link from "next/link";
import { getLaunches } from "@/lib/data/private";
import type { NewLaunch } from "@/lib/data/types";
import { T } from "@/components/i18n/t";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageContainer } from "@/components/ui/section";
import { MapExplorer } from "@/components/map/map-explorer";
import { pageMetadata } from "@/lib/seo";
import { titleCase } from "@/lib/slug";
import { districtLabel, launchHref, listingsHref } from "@/lib/launch-insights";

export const revalidate = 86400;

export const metadata = pageMetadata({
  title: "Map of new launches, MRT stations and schools",
  description: "Explore Singapore's private residential new launches and upcoming projects alongside operational and future MRT stations and primary schools.",
  path: "/map/",
});

/** Server-rendered text list of the launches on the map (crawlable, and reachable without a pointer). */
const LIST_CAP = 150;

function LaunchList({ items, total }: { items: NewLaunch[]; total: number }) {
  return (
    <>
      <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {items.map((l) => (
          <li key={`${l.type}-${l.slug}`} className="flex min-w-0 items-baseline justify-between gap-2">
            <Link href={launchHref(l)} className="min-w-0 truncate text-brand-700 hover:underline">
              {titleCase(l.name)}
            </Link>
            <span className="tabular shrink-0 text-xs text-muted">{[districtLabel(l.district), l.segment].filter(Boolean).join(" · ")}</span>
          </li>
        ))}
      </ul>
      {total > items.length ? (
        <p className="mt-2 text-xs text-muted">
          <T k="launches.map.listCapped" fallback="Showing {n} of {total}." vars={{ n: items.length, total }} />
        </p>
      ) : null}
    </>
  );
}

export default function MapPage() {
  const launches = getLaunches();
  const byName = (a: NewLaunch, b: NewLaunch) => a.name.localeCompare(b.name);
  const launched = launches.filter((l) => l.status === "launched").sort(byName);
  const upcoming = launches.filter((l) => l.status === "upcoming").sort(byName);

  return (
    <>
      <MapExplorer
        heading={
          <h1 className="shrink-0 text-lg font-semibold text-ink">
            <T k="launches.map.title" fallback="Map" />
          </h1>
        }
      />
      <PageContainer>
        <Breadcrumbs items={[{ label: "Map", k: "tools.map" }]} />
        <section aria-labelledby="map-launches" className="mt-4">
          <h2 id="map-launches" className="text-lg font-semibold text-ink">
            <T k="launches.map.listTitle" fallback="Launches on this map" />
          </h2>
          {launches.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              <T k="launches.map.listEmpty" fallback="No launch data yet: new launches come from URA developer sales data, which needs the URA data key." />
            </p>
          ) : (
            <div className="mt-2 space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  <T k="launches.status.launched" fallback="Launched" /> <span className="tabular font-normal text-muted">({launched.length})</span>
                </h3>
                {launched.length ? <LaunchList items={launched.slice(0, LIST_CAP)} total={launched.length} /> : <p className="mt-1 text-sm text-muted">—</p>}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  <T k="launches.status.upcoming" fallback="Upcoming" /> <span className="tabular font-normal text-muted">({upcoming.length})</span>
                </h3>
                {upcoming.length ? <LaunchList items={upcoming.slice(0, LIST_CAP)} total={upcoming.length} /> : <p className="mt-1 text-sm text-muted">—</p>}
              </div>
              <p className="text-sm">
                <Link href={listingsHref({ type: "condo" })} className="text-brand-700 hover:underline">
                  <T k="launches.map.catalogue" fallback="Browse the full new-launch catalogue" />
                </Link>
              </p>
            </div>
          )}
          <p className="mt-6 text-xs text-muted">
            <T
              k="launches.map.scope"
              fallback="Not shown: Government Land Sales sites and new landed listings, which are not in our data sources yet. Future MRT locations marked approximate are estimated from LTA announcements."
            />
          </p>
        </section>
      </PageContainer>
    </>
  );
}
