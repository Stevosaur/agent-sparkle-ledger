/**
 * Calendar-date helpers for rules keyed on legal dates (stamp-duty regimes, SSD holding periods).
 *
 * Singapore rules are stated in Singapore calendar days ("on or after 4 July 2025, 12:00 am"), so every
 * date input is reduced to a Singapore (UTC+8, no DST) calendar day before comparing:
 * - a "YYYY-MM-DD" string is taken as that calendar day as written;
 * - a Date (or any other string Date can parse) is converted to the Singapore calendar day it falls on.
 *   `new Date("2025-07-04")` (UTC midnight = 08:00 SGT) and `new Date(2025, 6, 4)` created in Singapore
 *   (00:00 SGT) both give 4 Jul 2025.
 */

export type DateInput = Date | string;

export interface CalendarDay {
  y: number;
  /** 1–12 */
  m: number;
  /** 1–31 */
  d: number;
}

const SGT_OFFSET_MS = 8 * 3_600_000;

/** Singapore calendar day of a date input; null when it cannot be parsed. */
export function toSgDay(input: DateInput): CalendarDay | null {
  if (typeof input === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
    if (m) {
      const day = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
      return day.m >= 1 && day.m <= 12 && day.d >= 1 && day.d <= daysInMonth(day.y, day.m) ? day : null;
    }
  }
  const t = typeof input === "string" ? Date.parse(input) : input instanceof Date ? input.getTime() : Number.NaN;
  if (!Number.isFinite(t)) return null;
  const sg = new Date(t + SGT_OFFSET_MS);
  return { y: sg.getUTCFullYear(), m: sg.getUTCMonth() + 1, d: sg.getUTCDate() };
}

const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export function daysInMonth(y: number, m: number): number {
  return m === 2 ? (isLeapYear(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/**
 * Days since 1970-01-01 for a proleptic-Gregorian calendar day (for ordering and differences). Pure arithmetic
 * (H. Hinnant's days_from_civil), so years 0–99 are not remapped to 1900–1999 as `Date.UTC` would do.
 */
export function dayNumber(day: CalendarDay): number {
  const y = day.m <= 2 ? day.y - 1 : day.y;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (day.m + (day.m > 2 ? -3 : 9)) + 2) / 5) + day.d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

/**
 * Calendar months later, clamped to the last day of the target month
 * (31 Jan + 1 month = 28/29 Feb, never 3 Mar as `Date.setUTCMonth` would give).
 */
export function addCalendarMonths(day: CalendarDay, months: number): CalendarDay {
  const total = day.y * 12 + (day.m - 1) + Math.trunc(months);
  const y = Math.floor(total / 12);
  const m = total - y * 12 + 1;
  return { y, m, d: Math.min(day.d, daysInMonth(y, m)) };
}

/** Calendar years later; 29 Feb + 1 year = 28 Feb (docs/research/stamp-duty.md §3.3). */
export function addCalendarYears(day: CalendarDay, years: number): CalendarDay {
  return addCalendarMonths(day, Math.trunc(years) * 12);
}

/** "YYYY-MM-DD" */
export function formatDay(day: CalendarDay): string {
  return `${String(day.y).padStart(4, "0")}-${String(day.m).padStart(2, "0")}-${String(day.d).padStart(2, "0")}`;
}

/** Compare two calendar days: negative if a is earlier, 0 if equal, positive if later. */
export function compareDays(a: CalendarDay, b: CalendarDay): number {
  return dayNumber(a) - dayNumber(b);
}
