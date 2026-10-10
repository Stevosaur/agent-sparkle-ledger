import { monthLabel } from "@/lib/data/months";

/** sq ft per sq m: URA uses 10.764 for its published sqft and psf figures, so we match it exactly. */
export const SQFT_PER_SQM = 10.764;

export function sqmToSqft(sqm: number): number {
  return sqm * SQFT_PER_SQM;
}

const int0 = new Intl.NumberFormat("en-SG", { maximumFractionDigits: 0 });

/** S$1,234,567 */
export function formatSgd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  return `${rounded < 0 ? "-" : ""}S$${int0.format(Math.abs(rounded))}`;
}

/** S$1.23M / S$850K */
export function formatSgdCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}S$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `${sign}S$${Math.round(abs / 1_000)}K`;
  return `${sign}S$${Math.round(abs)}`;
}

/** S$1,234 psf */
export function formatPsf(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${formatSgd(value)} psf`;
}

export function formatInt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return int0.format(value);
}

/** 0.0523 -> "5.2%" (input is a fraction) */
export function formatPct(fraction: number | null | undefined, digits = 1): string {
  if (fraction == null || !Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** Signed percent: +5.2% / -3.0% */
export function formatPctSigned(fraction: number | null | undefined, digits = 1): string {
  if (fraction == null || !Number.isFinite(fraction)) return "—";
  const s = (fraction * 100).toFixed(digits);
  return fraction > 0 ? `+${s}%` : `${s}%`;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2024-03" -> "Mar 2024" */
export function formatMonth(label: string | null | undefined): string {
  if (!label) return "—";
  const m = /^(\d{4})-(\d{2})/.exec(label);
  if (!m) return label;
  return `${MONTHS_SHORT[Number(m[2]) - 1]} ${m[1]}`;
}

export function formatMonthIndex(index: number): string {
  return formatMonth(monthLabel(index));
}

/** 735 months -> "61 yrs 3 mths" */
export function formatLeaseMonths(months: number | null | undefined): string {
  if (months == null || !Number.isFinite(months)) return "—";
  const m = Math.max(0, Math.round(months));
  const y = Math.floor(m / 12);
  const r = m % 12;
  return r === 0 ? `${y} yrs` : `${y} yrs ${r} mths`;
}

export function formatDistance(metres: number | null | undefined): string {
  if (metres == null || !Number.isFinite(metres)) return "—";
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export function formatArea(sqm: number | null | undefined): string {
  if (sqm == null || !Number.isFinite(sqm)) return "—";
  return `${int0.format(Math.round(sqm))} sqm (${int0.format(Math.round(sqmToSqft(sqm)))} sqft)`;
}
