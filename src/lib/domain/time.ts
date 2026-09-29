/**
 * Time utilities. All instants are stored in UTC. Operations run on Singapore time (UTC+8, no DST).
 *
 * A "market night" is identified by the SGT calendar date on which trading starts (e.g. the night of
 * 29 Sep → early morning 30 Sep has marketDate 2026-09-29). Clock times before noon belong to the
 * following calendar day of that night.
 */
export const SG_TZ = "Asia/Singapore";
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Components of an instant in SGT. */
export function sgtParts(d: Date) {
  const s = new Date(d.getTime() + SGT_OFFSET_MS);
  return {
    year: s.getUTCFullYear(),
    month: s.getUTCMonth() + 1,
    day: s.getUTCDate(),
    hour: s.getUTCHours(),
    minute: s.getUTCMinutes(),
    isoWeekday: ((s.getUTCDay() + 6) % 7) + 1,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function sgtDateStr(d: Date): string {
  const p = sgtParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** ISO weekday (1=Mon..7=Sun) of a YYYY-MM-DD date. */
export function isoWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

/**
 * The market night an instant belongs to. Trading runs overnight; after 07:00 SGT the operational focus moves
 * to the coming night, before 07:00 we are still inside the previous night.
 */
export function marketDateFor(d: Date = new Date()): string {
  const p = sgtParts(d);
  const today = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  return p.hour >= 7 ? today : addDays(today, -1);
}

/** The delivery (morning) date for a market night. */
export const deliveryDateFor = (marketDate: string) => addDays(marketDate, 1);

/** Convert a wall-clock "HH:MM" SGT on a market night into a UTC instant. Times before 12:00 fall on the next day. */
export function atMarketTime(marketDate: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const date = h < 12 ? addDays(marketDate, 1) : marketDate;
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, m) - SGT_OFFSET_MS);
}

/** Midnight SGT at the start of a calendar date, as UTC instant. */
export function sgtMidnight(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - SGT_OFFSET_MS);
}

export function fmtTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const p = sgtParts(new Date(d));
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-").map(Number);
    return `${DAYS[isoWeekday(d) - 1]} ${day} ${MONTHS[m - 1]} ${y}`;
  }
  const p = sgtParts(new Date(d));
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const p = sgtParts(new Date(d));
  return `${p.day} ${MONTHS[p.month - 1]} ${pad(p.hour)}:${pad(p.minute)}`;
}

export const weekdayName = (isoDay: number) => ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][isoDay - 1];

export function minutesBetween(a: Date | string, b: Date | string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

export function compactDate(dateStr: string): string {
  return dateStr.replaceAll("-", "");
}
