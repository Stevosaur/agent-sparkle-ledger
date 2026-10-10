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
      return `${v.toFixed(1)}%`;
    case "int":
      return formatInt(v);
  }
}

export { formatMonthIndex, monthToYearFraction };
