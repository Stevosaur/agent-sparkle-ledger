import Link from "next/link";
import type { ReactNode } from "react";
import { BedDouble, Bath, Building2, Ruler } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { T } from "@/components/i18n/t";
import { formatInt, sqmToSqft } from "@/lib/format";
import { titleCase } from "@/lib/slug";
import { KIND_LABEL, TYPE_LABEL, formatAsking, formatListedDate } from "@/lib/homes/format";
import type { ListingSummary } from "@/lib/homes/types";

/** One listing in a grid. Works in server and client components (no hooks). */
export function ListingCard({ listing }: { listing: ListingSummary }) {
  const l = listing;
  const facts: { key: string; icon: typeof Ruler; text: ReactNode; label: ReactNode }[] = [];
  if (l.flatType) facts.push({ key: "type", icon: Building2, text: titleCase(l.flatType), label: <T k="homes.detail.unitType" fallback="Unit type" /> });
  if (l.areaSqm != null) {
    facts.push({
      key: "area",
      icon: Ruler,
      text: `${formatInt(l.areaSqm)} sqm · ${formatInt(Math.round(sqmToSqft(l.areaSqm)))} sqft`,
      label: l.kind === "landed" ? <T k="homes.detail.landArea" fallback="Land area" /> : <T k="homes.detail.area" fallback="Floor area" />,
    });
  }
  if (l.bedrooms != null) {
    facts.push({
      key: "beds",
      icon: BedDouble,
      text: l.bedrooms === 0 ? <T k="homes.card.studio" fallback="Studio" /> : <T k="homes.card.beds" fallback="{n} bed" vars={{ n: l.bedrooms }} />,
      label: <T k="homes.detail.beds" fallback="Bedrooms" />,
    });
  }
  if (l.bathrooms != null) facts.push({ key: "baths", icon: Bath, text: <T k="homes.card.baths" fallback="{n} bath" vars={{ n: l.bathrooms }} />, label: <T k="homes.detail.baths" fallback="Bathrooms" /> });
  return (
    <article className="relative flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(15,29,27,0.04)] transition-colors focus-within:border-brand-500 hover:border-brand-300">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={l.listingType === "sale" ? "brand" : "info"}>
          <T k={TYPE_LABEL[l.listingType][0]} fallback={TYPE_LABEL[l.listingType][1]} />
        </Badge>
        {l.kind ? (
          <Badge>
            <T k={KIND_LABEL[l.kind][0]} fallback={KIND_LABEL[l.kind][1]} />
          </Badge>
        ) : null}
        {l.sample ? (
          <Badge tone="warn">
            <T k="homes.sample" fallback="Sample" />
          </Badge>
        ) : null}
      </div>
      <h3 className="mt-2 text-base font-semibold leading-snug text-ink">
        <Link href={`/homes/${l.id}/`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
          {l.title}
        </Link>
      </h3>
      {l.propertyLabel || l.areaLabel ? <p className="mt-0.5 truncate text-sm text-muted">{[l.propertyLabel, l.areaLabel].filter(Boolean).join(" · ")}</p> : null}
      <p className="tabular mt-3 text-xl font-semibold text-ink">{formatAsking(l.askingPrice, l.listingType)}</p>
      {facts.length ? (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          {facts.map((f) => (
            <li key={f.key} className="flex items-center gap-1">
              <f.icon className="size-3.5" aria-hidden />
              <span className="sr-only">
                {f.label}:{" "}
              </span>
              {f.text}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-auto pt-3 text-xs text-muted">
        <T k="homes.listed" fallback="Listed {date}" vars={{ date: formatListedDate(l.createdAt) }} />
      </p>
    </article>
  );
}

export function ListingGrid({ listings }: { listings: ListingSummary[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((l) => (
        <li key={l.id}>
          <ListingCard listing={l} />
        </li>
      ))}
    </ul>
  );
}
