import Link from "next/link";
import type { TownSummary } from "@/lib/data/types";
import { formatInt, formatSgd } from "@/lib/format";
import { titleCase } from "@/lib/slug";
import { T } from "@/components/i18n/t";
import { Section } from "@/components/ui/section";
import { SourceLine } from "./source-line";

/** Busiest HDB towns over the last 12 months, each with its 12-month median 4-room resale price. */
export function PopularTowns({ towns }: { towns: TownSummary[] }) {
  if (towns.length === 0) return null;
  return (
    <Section
      id="popular-towns"
      title={<T k="home.towns.title" fallback="Popular HDB towns" />}
      description={<T k="home.towns.desc" fallback="Ranked by resale volume over the last 12 months." />}
    >
      <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {towns.map((town) => {
          const fourRoom = town.medianPrice12m["4 ROOM"];
          return (
            <li key={town.slug}>
              <Link
                href={`/insights/town/${town.slug}/`}
                className="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-4 transition-colors hover:border-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink">{titleCase(town.town)}</span>
                  <span className="text-xs text-muted">{town.region}</span>
                </span>
                {fourRoom != null ? (
                  <>
                    <span className="tabular mt-2 text-lg font-semibold text-ink">{formatSgd(fourRoom)}</span>
                    <span className="text-xs text-muted">
                      <T k="home.towns.fourRoom" fallback="4-room median, last 12 months" />
                    </span>
                  </>
                ) : (
                  <span className="mt-2 text-sm text-muted">
                    <T k="home.towns.noFourRoom" fallback="No 4-room resales in the last 12 months" />
                  </span>
                )}
                <span className="tabular mt-auto pt-2 text-xs text-muted">
                  <T k="home.towns.sales" fallback="{count} resales in 12 months" vars={{ count: formatInt(town.tx.count12m) }} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <SourceLine>
        <T k="home.source.hdb" fallback="HDB resale prices, data.gov.sg" />
      </SourceLine>
    </Section>
  );
}
