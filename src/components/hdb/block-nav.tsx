import { T } from "@/components/i18n/t";

const LINKS = [
  { href: "#details", k: "hdb.nav.details", label: "Details" },
  { href: "#location", k: "hdb.nav.location", label: "Location" },
  { href: "#price-history", k: "hdb.nav.prices", label: "Prices" },
  { href: "#sales", k: "hdb.nav.sales", label: "Sales" },
  { href: "#rental-demand", k: "hdb.nav.rent", label: "Rental demand" },
  { href: "#supply", k: "hdb.nav.supply", label: "Supply" },
  { href: "#nearby", k: "hdb.nav.nearby", label: "Nearby" },
  { href: "#lease", k: "hdb.nav.lease", label: "Lease" },
];

/** Horizontally scrolling in-page section links (fits 360px screens). */
export function BlockNav() {
  return (
    <nav aria-labelledby="hdb-on-this-page" className="-mx-4 mt-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <span id="hdb-on-this-page" className="sr-only">
        <T k="hdb.nav.label" fallback="On this page" />
      </span>
      <ul className="flex w-max gap-2">
        {LINKS.map((l) => (
          <li key={l.href}>
            <a href={l.href} className="inline-flex h-8 items-center rounded-full border border-line bg-surface px-3 text-sm text-ink hover:bg-canvas">
              <T k={l.k} fallback={l.label} />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
