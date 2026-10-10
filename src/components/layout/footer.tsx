import Link from "next/link";
import { site } from "@/lib/config/site";
import { T } from "@/components/i18n/t";
import { Logo } from "./logo";

const groups = [
  {
    key: "footer.data",
    label: "Data",
    links: [
      { href: "/methodology/", key: "footer.methodology", label: "Methodology" },
      { href: "/research/", key: "footer.research", label: "Research" },
      { href: "/docs/", key: "footer.api", label: "Public API" },
    ],
  },
  {
    key: "footer.company",
    label: "Company",
    links: [
      { href: "/about/", key: "footer.about", label: "About" },
      { href: "/services/", key: "footer.services", label: "Home services" },
      { href: "/plus/", key: "", label: site.plusName },
    ],
  },
  {
    key: "footer.legal",
    label: "Legal",
    links: [
      { href: "/privacy/", key: "footer.privacy", label: "Privacy" },
      { href: "/tos/", key: "footer.tos", label: "Terms" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-surface pb-24 md:pb-10">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 text-sm text-muted">
            <T k="footer.tagline" fallback={site.tagline} />
          </p>
        </div>
        {groups.map((g) => (
          <div key={g.key}>
            <div className="text-sm font-semibold text-ink">
              <T k={g.key} fallback={g.label} />
            </div>
            <ul className="mt-3 space-y-2">
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted hover:text-ink">
                    {l.key ? <T k={l.key} fallback={l.label} /> : l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto max-w-6xl px-4 text-xs leading-5 text-muted sm:px-6">
        <p>
          <T k="footer.disclaimer" fallback="Information only, not financial advice." />
        </p>
        <p className="mt-2">
          Contains information from data.gov.sg (Singapore Open Data Licence), URA, OneMap / SLA, HDB, LTA and MOE, used under their respective terms. © {new Date().getFullYear()} {site.name}.
        </p>
      </div>
    </footer>
  );
}
