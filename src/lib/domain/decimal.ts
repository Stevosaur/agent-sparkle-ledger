/**
 * Exact decimal arithmetic for money and weights. Never use JS floats for money.
 * DB numeric columns arrive as strings; wrap them with D() before doing maths.
 */
import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };
export type Num = Decimal.Value | null | undefined;

export function D(v: Num): Decimal {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  return new Decimal(v);
}

/** Round to 2dp for money (half-up, as used on Singapore tax invoices). */
export const money = (v: Num) => D(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
/** Round to 3dp for kg storage. */
export const kg = (v: Num) => D(v).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
/** Round to 4dp for unit prices. */
export const unit = (v: Num) => D(v).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

export const sum = (vals: Num[]) => vals.reduce<Decimal>((a, v) => a.plus(D(v)), new Decimal(0));

export const toMoneyStr = (v: Num) => money(v).toFixed(2);
export const toKgStr = (v: Num) => kg(v).toFixed(3);
export const toPriceStr = (v: Num) => unit(v).toFixed(4);

/** GST on a subtotal at a percentage rate (e.g. 9 for 9%). */
export function gst(subtotal: Num, ratePct: Num): Decimal {
  return money(D(subtotal).times(D(ratePct)).dividedBy(100));
}

export function pct(part: Num, whole: Num): number | null {
  const w = D(whole);
  if (w.isZero()) return null;
  return D(part).dividedBy(w).times(100).toDecimalPlaces(1).toNumber();
}

export function fmtKg(v: Num, dp = 1): string {
  return `${D(v).toDecimalPlaces(dp).toFixed(dp)} kg`;
}

export function fmtMoney(v: Num, currency = "SGD"): string {
  const n = money(v);
  const prefix = currency === "SGD" ? "S$" : currency === "MYR" ? "RM" : `${currency} `;
  const neg = n.isNeg();
  const [i, f] = n.abs().toFixed(2).split(".");
  return `${neg ? "-" : ""}${prefix}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${f}`;
}
