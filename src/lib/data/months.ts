/** Month encoding shared by the pipeline and the app: months since January 1990 (0 = 1990-01). */

export const MONTH_EPOCH_YEAR = 1990;

/** "2024-03" -> 410 */
export function monthIndex(label: string): number {
  const m = /^(\d{4})-(\d{2})/.exec(label);
  if (!m) throw new Error(`Invalid month label: ${label}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid month label: ${label}`);
  return (year - MONTH_EPOCH_YEAR) * 12 + (month - 1);
}

/** 410 -> "2024-03" */
export function monthLabel(index: number): string {
  const year = MONTH_EPOCH_YEAR + Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Fractional year at the middle of the month, e.g. 410 -> 2024.208 */
export function monthToYearFraction(index: number): number {
  return MONTH_EPOCH_YEAR + (index + 0.5) / 12;
}

export function yearOfMonth(index: number): number {
  return MONTH_EPOCH_YEAR + Math.floor(index / 12);
}

/** URA contract dates are "MMYY", e.g. "0324" = March 2024. Years < 90 are 20xx. */
export function monthIndexFromMmyy(mmyy: string): number {
  const m = /^(\d{2})(\d{2})$/.exec(mmyy.trim());
  if (!m) throw new Error(`Invalid MMYY: ${mmyy}`);
  const month = Number(m[1]);
  const yy = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid MMYY: ${mmyy}`);
  const year = yy < 90 ? 2000 + yy : 1900 + yy;
  return (year - MONTH_EPOCH_YEAR) * 12 + (month - 1);
}
