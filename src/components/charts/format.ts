import { formatInt, formatMonthIndex, formatPct, formatSgd, formatSgdCompact } from "@/lib/format";
import { monthToYearFraction } from "@/lib/data/months";

/** Serializable value formats (formatter functions cannot cross the server/client boundary). */
export type ValueFormat = "sgd" | "sgdCompact" | "psf" | "pct" | "pctRaw" | "int" | "rent";

export function formatValue(v: number, f: ValueFormat): string {
  switch (f) {
    case "sgd":
      return formatSgd(v);
    case "sgdCompact":
      return formatSgdCompact(v);
    case "psf":
      return `${formatSgd(v)} psf`;
    case "pct":
      return formatPct(v);
    case "pctRaw":
      return `${v.toFixed(2)}%`;
    case "int":
      return formatInt(v);
    case "rent":
      return `${formatSgd(v)}/mo`;
  }
}

export function formatAxis(v: number, f: ValueFormat): string {
  switch (f) {
    case "sgd":
    case "sgdCompact":
    case "rent":
      return formatSgdCompact(v);
    case "psf":
      return formatSgd(v);
    case "pct":
      return formatPct(v, 0);
    case "pctRaw":
      // two decimals, as in tooltips: one decimal turned close ticks (3.05 / 3.10 / 3.15) into "3.1%" twice
      return `${v.toFixed(2)}%`;
    case "int":
      return formatInt(v);
  }
}

/**
 * Tick count for a month-index x axis from `minX` to `maxX`: one per month for short spans (so no month is labelled
 * twice), at most 5, at least 2. Pair with `allowDecimals={false}` so ticks land on whole months.
 */
export function monthTickCount(minX: number, maxX: number): number {
  const months = Math.round(maxX) - Math.round(minX) + 1;
  return Math.max(2, Math.min(5, Number.isFinite(months) ? months : 5));
}

export { formatMonthIndex, monthToYearFraction };
