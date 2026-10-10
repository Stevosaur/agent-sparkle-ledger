import Link from "next/link";
import { formatInt, formatMonth, formatPct, formatPsf } from "@/lib/format";
import { titleCase } from "@/lib/slug";
import type { LaunchCard as LaunchCardData } from "@/lib/home-insights";
import { T } from "@/components/i18n/t";
import { Badge } from "@/components/ui/badge";

const TYPE_LABEL: Record<LaunchCardData["type"], { k: string; fallback: string }> = {
  condo: { k: "home.launches.tab.condo", fallback: "Condo" },
  ec: { k: "home.launches.tab.ec", fallback: "EC" },
  landed: { k: "home.launches.tab.landed", fallback: "Landed" },
};

/** One new-launch card: units sold so far, latest median psf, location and expected completion. */
export function LaunchCard({ card }: { card: LaunchCardData }) {
  const name = titleCase(card.name);
  const typeLabel = TYPE_LABEL[card.type];
  return (
    <Link
      href={card.href}
      className="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-4 transition-colors hover:border-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {card.district != null ? <Badge tone="brand">D{card.district}</Badge> : null}
        {card.segment ? <Badge>{card.segment}</Badge> : null}
        {typeLabel ? (
          <Badge>
            <T k={typeLabel.k} fallback={typeLabel.fallback} />
          </Badge>
        ) : null}
        {card.status === "upcoming" ? (
          <Badge tone="plus">
            <T k="home.launches.tab.upcoming" fallback="Upcoming" />
          </Badge>
        ) : null}
      </div>
      <h3 className="mt-2 line-clamp-2 text-base font-semibold text-ink">{name}</h3>

      {card.status === "launched" ? (
        <div className="mt-3">
          {card.sold != null && card.launched != null && card.soldShare != null ? (
            <>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={card.launched}
                aria-valuenow={Math.min(card.sold, card.launched)}
                aria-label={`${name}: ${formatInt(card.sold)} of ${formatInt(card.launched)} launched units sold`}
                className="h-2 overflow-hidden rounded-full bg-canvas"
              >
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${(card.soldShare * 100).toFixed(1)}%` }} />
              </div>
              <p className="tabular mt-1.5 text-sm text-ink">
                <T k="home.launches.soldOf" fallback="{sold} of {launched} launched units sold" vars={{ sold: formatInt(card.sold), launched: formatInt(card.launched) }} />{" "}
                <span className="text-muted">({formatPct(card.soldShare, 0)})</span>
              </p>
            </>
          ) : card.sold != null ? (
            <p className="tabular text-sm text-ink">
              <T k="home.launches.soldCount" fallback="{sold} units sold" vars={{ sold: formatInt(card.sold) }} />
            </p>
          ) : (
            <p className="text-sm text-muted">
              <T k="home.launches.noSales" fallback="No developer sales reported yet" />
            </p>
          )}
          {card.latestMedianPsf != null && card.latestPsfMonth ? (
            <p className="tabular mt-1 text-sm text-muted">
              <T k="home.launches.medianPsf" fallback="Median {psf} in {month}" vars={{ psf: formatPsf(card.latestMedianPsf), month: formatMonth(card.latestPsfMonth) }} />
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 space-y-1 text-sm text-muted">
          {card.totalUnits != null ? (
            <p className="tabular text-ink">
              <T k="home.launches.units" fallback="{units} units planned" vars={{ units: formatInt(card.totalUnits) }} />
            </p>
          ) : null}
          {card.developer ? <p className="line-clamp-1">{titleCase(card.developer)}</p> : null}
        </div>
      )}

      <p className="mt-auto pt-3 text-xs text-muted">
        {card.expectedCompletionYear != null ? (
          <T k="home.launches.completion" fallback="Expected completion {year}" vars={{ year: card.expectedCompletionYear }} />
        ) : (
          <T k="home.launches.completionUnknown" fallback="Completion year not published" />
        )}
      </p>
    </Link>
  );
}
