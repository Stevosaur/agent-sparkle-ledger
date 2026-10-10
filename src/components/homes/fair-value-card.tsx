import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { T } from "@/components/i18n/t";
import { formatMonth, formatSgd } from "@/lib/format";
import { formatAsking } from "@/lib/homes/format";
import { percentAlong } from "@/lib/homes/fair-value";
import type { FairValueOutcome, FairValueUnavailableReason, ListingType } from "@/lib/homes/types";

const METHOD_COPY: Record<string, [string, string]> = {
  "block-iqr:sale": ["homes.fv.method.blockSale", "Middle 50% of {n} resale prices for {scope}, {from} to {to}."],
  "block-iqr:rent": ["homes.fv.method.blockRent", "Middle 50% of {n} approved rents for {scope}, {from} to {to}."],
  "town-iqr:sale": ["homes.fv.method.townSale", "Too few recent sales in this block, so this is the middle 50% of {n} resale prices for {scope}, {from} to {to}."],
  "town-iqr:rent": ["homes.fv.method.townRent", "Too few recent rentals in this block, so this is the middle 50% of {n} approved rents for {scope}, {from} to {to}."],
  "town-median:sale": ["homes.fv.method.townMedianSale", "Only {n} recent resale prices for {scope} ({from} to {to}), so this shows their median rather than a range."],
  "town-median:rent": ["homes.fv.method.townMedianRent", "Only {n} recent approved rents for {scope} ({from} to {to}), so this shows their median rather than a range."],
  "project-psf-iqr:sale": ["homes.fv.method.project", "Middle 50% of {n} prices per square foot at {scope} ({psfLow} to {psfHigh} psf), {from} to {to}, multiplied by this home's floor area."],
  "district-psf-iqr:sale": ["homes.fv.method.district", "Too few recent sales in this project, so this applies the middle 50% of {n} prices per square foot in {scope} ({psfLow} to {psfHigh} psf), {from} to {to}, to this home's floor area."],
  "project-rent-iqr:rent": ["homes.fv.method.projectRent", "Middle 50% of {n} rental contracts for {scope}, {from} to {to}."],
};

const REASON_COPY: Record<FairValueUnavailableReason, [string, string]> = {
  unresolved: ["homes.fv.reason.unresolved", "We could not match this listing to a property in our records, so there is no range."],
  landed: ["homes.fv.reason.landed", "Fair-value ranges are not available for landed homes yet: land size, built-up area and condition vary too much for a simple range."],
  "no-flat-type": ["homes.fv.reason.flatType", "The listing does not state an HDB flat type, so comparable sales cannot be matched."],
  "no-area": ["homes.fv.reason.area", "The listing does not state a floor area, so a price range cannot be worked out."],
  "no-hdb-data": ["homes.fv.reason.hdb", "HDB resale records are not loaded on this deployment, so there is no range."],
  "no-private-data": ["homes.fv.reason.private", "Private transaction records (URA) are not loaded on this deployment, so there is no range."],
  "no-rentals": ["homes.fv.reason.rentals", "Rental records are not loaded on this deployment, so there is no range."],
  "no-recent-records": ["homes.fv.reason.recent", "There are too few comparable records in the latest 12 months to estimate a range."],
};

const POSITION_COPY: Record<ListingType, Record<"below" | "within" | "above", [string, string]>> = {
  sale: {
    below: ["homes.fv.pos.saleBelow", "Asking price is below the range"],
    within: ["homes.fv.pos.saleWithin", "Asking price is within the range"],
    above: ["homes.fv.pos.saleAbove", "Asking price is above the range"],
  },
  rent: {
    below: ["homes.fv.pos.rentBelow", "Asking rent is below the range"],
    within: ["homes.fv.pos.rentWithin", "Asking rent is within the range"],
    above: ["homes.fv.pos.rentAbove", "Asking rent is above the range"],
  },
};

/**
 * "Fair-value range (estimate)" for a listing, with the method, sample, window and source. Server data
 * only (public records), so it renders in the page HTML.
 */
export function FairValueCard({ outcome, askingPrice, listingType, propertyHref }: { outcome: FairValueOutcome; askingPrice: number; listingType: ListingType; propertyHref: string | null }) {
  if (!outcome.ok) {
    const [k, fb] = REASON_COPY[outcome.reason];
    return (
      <Card>
        <CardBody className="space-y-2 text-sm">
          <p className="text-ink">
            <T k={k} fallback={fb} />
          </p>
          {propertyHref ? (
            <p>
              <Link href={propertyHref} className="font-medium text-brand-700 hover:underline">
                <T k="homes.fv.seeSales" fallback="See recorded sales for this property" />
              </Link>
            </p>
          ) : null}
        </CardBody>
      </Card>
    );
  }

  const { range, position } = outcome;
  const isRange = range.high > range.low;
  const fmt = (v: number) => (listingType === "rent" ? `${formatSgd(v)}/mo` : formatSgd(v));
  // scale: pad the range so the asking marker is visible even when it falls outside
  const lo = Math.min(range.low, askingPrice);
  const hi = Math.max(range.high, askingPrice);
  const pad = Math.max((hi - lo) * 0.15, range.mid * 0.03);
  const min = lo - pad;
  const max = hi + pad;
  const [mk, mfb] = METHOD_COPY[`${range.method}:${range.basis}`] ?? METHOD_COPY[`${range.method}:sale`] ?? ["homes.fv.method.generic", "Middle 50% of {n} comparable records for {scope}, {from} to {to}."];
  const [pk, pfb] = POSITION_COPY[listingType][position];

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted">
              <T k="homes.fv.label" fallback="Fair-value range (estimate)" />
            </div>
            <div className="tabular mt-1 text-2xl font-semibold text-ink">{isRange ? `${fmt(range.low)} – ${fmt(range.high)}` : fmt(range.mid)}</div>
            {isRange ? (
              <div className="mt-0.5 text-sm text-muted">
                <T k="homes.fv.median" fallback="Median {value}" vars={{ value: fmt(range.mid) }} />
              </div>
            ) : null}
          </div>
          <Badge tone={position === "within" ? "up" : position === "above" ? "warn" : "info"}>
            <T k={pk} fallback={pfb} />
          </Badge>
        </div>

        <div
          role="img"
          aria-label={`Fair-value range ${fmt(range.low)} to ${fmt(range.high)}; asking ${formatAsking(askingPrice, listingType)}`}
          className="relative h-12"
        >
          <div className="absolute inset-x-0 top-3 h-2 rounded-full bg-canvas" />
          <div
            className="absolute top-3 h-2 rounded-full bg-brand-300"
            style={{ left: `${percentAlong(range.low, min, max)}%`, width: `${Math.max(1, percentAlong(range.high, min, max) - percentAlong(range.low, min, max))}%` }}
          />
          <div className="absolute top-0.5 h-6 w-0.5 -translate-x-1/2 rounded-full bg-ink" style={{ left: `${percentAlong(askingPrice, min, max)}%` }} />
          <div className="absolute top-7 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-ink" style={{ left: `${Math.min(88, Math.max(12, percentAlong(askingPrice, min, max)))}%` }}>
            <T k="homes.fv.asking" fallback="Asking" />
          </div>
        </div>

        <p className="text-sm text-muted">
          <T
            k={mk}
            fallback={mfb}
            vars={{
              n: range.sampleSize,
              scope: range.scope,
              from: formatMonth(range.from),
              to: formatMonth(range.to),
              psfLow: range.psf ? formatSgd(range.psf.low) : "",
              psfHigh: range.psf ? formatSgd(range.psf.high) : "",
            }}
          />{" "}
          <T k="homes.fv.disclaimer" fallback="An estimate from public records, not a valuation; condition, floor, facing and renovation can move the price either way." />
        </p>
        <p className="text-xs text-muted">
          <T k="common.source" fallback="Source" />: {range.source}
        </p>
      </CardBody>
    </Card>
  );
}
