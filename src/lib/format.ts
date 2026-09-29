/** Display formatting (client-safe). All operational times are shown in Asia/Singapore. */
const n0 = new Intl.NumberFormat("en-SG", { maximumFractionDigits: 0 });
const n1 = new Intl.NumberFormat("en-SG", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n2 = new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toNum = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export function kg(v: unknown, dp: 0 | 1 = 1) {
  const x = toNum(v);
  if (x === null || Number.isNaN(x)) return "—";
  return `${dp === 0 ? n0.format(x) : n1.format(x)} kg`;
}
export function kgNum(v: unknown, dp: 0 | 1 = 1) {
  const x = toNum(v);
  if (x === null || Number.isNaN(x)) return "—";
  return dp === 0 ? n0.format(x) : n1.format(x);
}
export function sgd(v: unknown, currency = "SGD") {
  const x = toNum(v);
  if (x === null || Number.isNaN(x)) return "—";
  const p = currency === "SGD" ? "S$" : currency === "MYR" ? "RM" : `${currency} `;
  return `${x < 0 ? "-" : ""}${p}${n2.format(Math.abs(x))}`;
}
export function perKg(v: unknown, currency = "SGD") {
  const s = sgd(v, currency);
  return s === "—" ? s : `${s}/kg`;
}
export function pct(v: unknown, dp = 0) {
  const x = toNum(v);
  if (x === null || Number.isNaN(x)) return "—";
  return `${x.toFixed(dp)}%`;
}
const tf = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hour12: false });
const dtf = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const df = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", weekday: "short", day: "numeric", month: "short" });
export const time = (d: Date | string | null | undefined) => (d ? tf.format(new Date(d)) : "—");
export const dateTime = (d: Date | string | null | undefined) => (d ? dtf.format(new Date(d)) : "—");
export function date(d: Date | string | null | undefined) {
  if (!d) return "—";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return df.format(new Date(`${d}T04:00:00Z`));
  return df.format(new Date(d));
}
export const titleCase = (s: string) => s.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
export const sentence = (s: string) => {
  const t = s.toLowerCase().replaceAll("_", " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};
