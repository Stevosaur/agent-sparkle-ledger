import Link from "next/link";
import type { NewLaunch, Tenure } from "@/lib/data/types";
import { T } from "@/components/i18n/t";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatInt, formatMonth, formatSgd } from "@/lib/format";
import { titleCase } from "@/lib/slug";
import { districtLabel, latestPrice, launchHref, launchProgress } from "@/lib/launch-insights";
import { SalesProgress } from "./sales-progress";

export function TenureText({ tenure }: { tenure: Tenure | null }) {
  if (!tenure) return <T k="launches.tenure.unknown" fallback="Not published" />;
  if (tenure.kind === "freehold") return <T k="launches.tenure.freehold" fallback="Freehold" />;
  if (tenure.years != null) return <T k="launches.tenure.leasehold" fallback="{years}-year leasehold" vars={{ years: tenure.years }} />;
  return <>{tenure.raw}</>;
}

export function LaunchTypeBadge({ type }: { type: NewLaunch["type"] }) {
  return (
    <Badge tone="neutral">
      {type === "ec" ? <T k="launches.type.ec" fallback="EC" /> : type === "landed" ? <T k="launches.type.landed" fallback="Landed" /> : <T k="launches.type.condo" fallback="Condo" />}
    </Badge>
  );
}

export function LaunchStatusBadge({ status }: { status: NewLaunch["status"] }) {
  return status === "launched" ? (
    <Badge tone="brand">
      <T k="launches.status.launched" fallback="Launched" />
    </Badge>
  ) : (
    <Badge tone="info">
      <T k="launches.status.upcoming" fallback="Upcoming" />
    </Badge>
  );
}

/** Catalogue card for one launch: location, developer, sales progress, latest psf, completion and tenure. */
export function LaunchCard({ launch }: { launch: NewLaunch }) {
  const progress = launchProgress(launch);
  const price = latestPrice(launch.sales);
  const where = [districtLabel(launch.district), launch.segment, launch.street ? titleCase(launch.street) : null].filter(Boolean).join(" · ");
  return (
    <Card className="relative flex h-full flex-col p-4 transition-shadow focus-within:ring-2 focus-within:ring-brand-200 hover:shadow-md">
      <div className="flex flex-wrap items-center gap-1.5">
        <LaunchStatusBadge status={launch.status} />
        <LaunchTypeBadge type={launch.type} />
        {launch.tenure ? (
          <Badge tone="neutral">
            <TenureText tenure={launch.tenure} />
          </Badge>
        ) : null}
      </div>
      <h3 className="mt-2 text-base font-semibold leading-snug text-ink">
        <Link href={launchHref(launch)} className="after:absolute after:inset-0 hover:underline focus-visible:outline-none">
          {titleCase(launch.name)}
        </Link>
      </h3>
      {where ? <p className="mt-0.5 text-sm text-muted">{where}</p> : null}
      {launch.developer ? <p className="mt-0.5 truncate text-xs text-muted">{titleCase(launch.developer)}</p> : null}

      <div className="mt-3">
        {launch.status === "launched" ? (
          <SalesProgress progress={progress} size="sm" />
        ) : (
          <p className="text-sm text-muted">
            <T k="launches.card.notLaunched" fallback="Not launched yet" />
          </p>
        )}
      </div>

      <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-line pt-3 text-xs">
        <div className="min-w-0">
          <dt className="text-muted">
            <T k="launches.card.medianPsf" fallback="Median psf" />
          </dt>
          <dd className="tabular mt-0.5 font-semibold text-ink">{formatSgd(price?.medianPsf)}</dd>
          {price ? <dd className="text-[11px] text-muted">{formatMonth(price.month)}</dd> : null}
        </div>
        <div className="min-w-0">
          <dt className="text-muted">
            <T k="launches.card.units" fallback="Total units" />
          </dt>
          <dd className="tabular mt-0.5 font-semibold text-ink">{formatInt(launch.totalUnits)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted">
            <T k="launches.card.completion" fallback="Completion" />
          </dt>
          <dd className="tabular mt-0.5 font-semibold text-ink">{launch.expectedCompletionYear ?? "—"}</dd>
        </div>
      </dl>
    </Card>
  );
}
