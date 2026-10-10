import { CPF_LEASE_COVER_AGE, CPF_MIN_REMAINING_LEASE, CPF_WITHDRAWAL_LIMIT_MULTIPLE, HDB_LEASE_YEARS, RULE_META, type RuleStatus } from "./rules";

/**
 * Bala's Table (SLA leasehold table): value of a leasehold interest in LAND with N whole years remaining, as a percent
 * of the freehold value of the same land. Keys are remaining years (1–99), values percent of freehold.
 *
 * Source: docs/research/bala-table.md §4 (machine-readable table), copied row for row. Current official copy:
 * URA circular DC22-08 Appendix 2 ("current Leasehold Table", used for the Land Betterment Charge from 1 Aug 2022),
 * https://www.ura.gov.sg/-/media/Corporate/Guidelines/Development-control/Circulars/2022/Jul/dc22-08-Appendix2.pdf
 * Status: unverified-reproduction — no official copy has been read. 8 anchor rows are corroborated by several
 * reproductions; rows 57–59 and 61–98 are disputed by a second reproduction (see BALA_TABLE_STATUS). The UI must label
 * the curve "approximate (based on SLA's Bala's Table; reproduction not yet verified against the official table)".
 * Caveats (bala-table.md §3): land only, a valuation convention not market evidence, 96% (not 100%) at 99 years,
 * whole years only; never present a Bala-based number as a lease top-up price.
 */
export const BALA_TABLE: Record<number, number> = {
  1: 3.8, 2: 7.5, 3: 10.9, 4: 14.1, 5: 17.1, 6: 19.9, 7: 22.7, 8: 25.2, 9: 27.7, 10: 30.0,
  11: 32.2, 12: 34.3, 13: 36.3, 14: 38.2, 15: 40.0, 16: 41.8, 17: 43.4, 18: 45.0, 19: 46.6, 20: 48.0,
  21: 49.5, 22: 50.8, 23: 52.1, 24: 53.4, 25: 54.6, 26: 55.8, 27: 56.9, 28: 58.0, 29: 59.0, 30: 60.0,
  31: 61.0, 32: 61.9, 33: 62.8, 34: 63.7, 35: 64.6, 36: 65.4, 37: 66.2, 38: 67.0, 39: 67.7, 40: 68.5,
  41: 69.2, 42: 69.8, 43: 70.5, 44: 71.2, 45: 71.8, 46: 72.4, 47: 73.0, 48: 73.6, 49: 74.1, 50: 74.7,
  51: 75.2, 52: 75.7, 53: 76.2, 54: 76.7, 55: 77.3, 56: 77.9, 57: 78.3, 58: 78.9, 59: 79.4, 60: 80.0,
  61: 80.5, 62: 81.0, 63: 81.5, 64: 82.0, 65: 82.5, 66: 83.0, 67: 83.5, 68: 84.0, 69: 84.5, 70: 85.0,
  71: 85.4, 72: 85.8, 73: 86.2, 74: 86.6, 75: 87.0, 76: 87.4, 77: 87.8, 78: 88.2, 79: 88.6, 80: 89.0,
  81: 89.4, 82: 89.8, 83: 90.2, 84: 90.6, 85: 91.0, 86: 91.4, 87: 91.8, 88: 92.2, 89: 92.6, 90: 93.0,
  91: 93.4, 92: 93.8, 93: 94.2, 94: 94.6, 95: 95.0, 96: 95.3, 97: 95.6, 98: 95.8, 99: 96.0,
};

/** Second reproduction "R1" (github.com/thejaminator/lease_buyback, provenance unverified) where it differs from BALA_TABLE. */
const BALA_R1_DIFFERENCES: Record<number, number> = {
  57: 78.5, 58: 79.0, 59: 79.5, 61: 80.6, 62: 81.2, 63: 81.8, 64: 82.4, 65: 83.0, 66: 83.6, 67: 84.2, 68: 84.5, 69: 85.4,
  70: 86.0, 71: 86.5, 72: 87.0, 73: 87.5, 74: 88.0, 75: 88.5, 76: 89.0, 77: 89.5, 78: 90.0, 79: 90.5, 80: 91.0, 81: 91.4,
  82: 91.8, 83: 92.2, 84: 92.6, 85: 92.9, 86: 93.3, 87: 93.6, 88: 94.0, 89: 94.3, 90: 94.6, 91: 94.8, 92: 95.0, 93: 95.2,
  94: 95.4, 95: 95.6, 96: 95.7, 97: 95.8, 98: 95.9,
};

export type BalaRowStatus = "corroborated" | "approx" | "conflict" | "disputed" | "unverified";

/** Which rows of BALA_TABLE are corroborated anchors and which are unverified reproduction (bala-table.md §0, §2, §4). */
export const BALA_TABLE_STATUS = {
  status: "unverified-reproduction" as RuleStatus,
  verified: false,
  verifiedAgainst: null as string | null,
  label: "Approximate (based on SLA's Bala's Table; reproduction not yet verified against the official table)",
  primarySourceUrl: RULE_META.bala.source,
  legacySourceUrl: "https://www.sla.gov.sg/qql/slot/u143/State-Land-n-Property/Land%20Sales%20and%20Lease%20Management/DP%20policy.pdf",
  /** values reported for the SLA table by several independent sources */
  corroboratedYears: [1, 3, 10, 30, 49, 50, 60, 99] as readonly number[],
  /** only a rounded figure is cited (5 years ≈ 17%) */
  approxYears: [5] as readonly number[],
  /** one consumer site gives a different rounded figure */
  conflictYears: { 20: "one consumer site says ~49%; reproduction R1 agrees with 48.0" } as Readonly<Record<number, string>>,
  /** rows where reproduction R1 differs (by 0.1–2.0 pp) — the least reliable part of the table */
  disputedByR1: BALA_R1_DIFFERENCES as Readonly<Record<number, number>>,
  /** every other row: recalled value lying on a curve through the anchors; UNVERIFIED */
  note: "Rows 1–56 match reproduction R1 exactly; rows 57–59 and 61–98 are disputed (largest gap 80 years: 89.0 vs 91.0). Interpolation between whole years is an app convention.",
} as const;

/** Status of one whole-year row. */
export function balaRowStatus(years: number): BalaRowStatus {
  if (BALA_TABLE_STATUS.corroboratedYears.includes(years)) return "corroborated";
  if (BALA_TABLE_STATUS.approxYears.includes(years)) return "approx";
  if (years in BALA_TABLE_STATUS.conflictYears) return "conflict";
  if (years in BALA_TABLE_STATUS.disputedByR1) return "disputed";
  return "unverified";
}

const BALA_MAX_YEARS = 99;
/** B[0] = 0 is an app convention (lease expired); B[1..99] from the table. */
const B: number[] = Array.from({ length: BALA_MAX_YEARS + 1 }, (_, y) => (y === 0 ? 0 : BALA_TABLE[y]));

/**
 * % of freehold land value for a (possibly fractional) number of years left: linear between whole-year rows (app
 * convention, unverified), 0 at or below 0 years, capped at the 99-year value (96) above 99 — never extrapolated.
 * null for non-finite input.
 */
export function balaPct(yearsRemaining: number): number | null {
  return balaLookup(yearsRemaining)?.pct ?? null;
}

/** `balaPct` with the cap flag and the weakest status of the table rows used (for UI labels). */
export function balaLookup(yearsRemaining: number): { pct: number; capped: boolean; rowStatus: BalaRowStatus; status: RuleStatus } | null {
  if (!Number.isFinite(yearsRemaining)) return null;
  const status = RULE_META.bala.status;
  if (yearsRemaining <= 0) return { pct: 0, capped: false, rowStatus: "corroborated", status };
  if (yearsRemaining >= BALA_MAX_YEARS) return { pct: B[BALA_MAX_YEARS], capped: yearsRemaining > BALA_MAX_YEARS, rowStatus: "corroborated", status };
  const lo = Math.floor(yearsRemaining);
  const f = yearsRemaining - lo;
  const rows = f > 0 ? [lo, lo + 1].filter((y) => y >= 1) : [lo].filter((y) => y >= 1);
  const order: BalaRowStatus[] = ["corroborated", "approx", "unverified", "conflict", "disputed"];
  const rowStatus = rows.map(balaRowStatus).reduce<BalaRowStatus>((w, s) => (order.indexOf(s) > order.indexOf(w) ? s : w), "corroborated");
  return { pct: B[lo] + (B[lo + 1] - B[lo]) * f, capped: false, rowStatus, status };
}

/**
 * Relative land value of N years left vs M years left: B(N) / B(M) (bala-table.md §5), e.g. 60 vs 99 → 80 / 96 = 0.8333.
 * null when B(M) is 0 or an input is not finite. Land only — not a whole-property valuation.
 */
export function balaRatio(nYears: number, mYears: number): number | null {
  const a = balaPct(nYears);
  const b = balaPct(mYears);
  if (a == null || b == null || b === 0) return null;
  return a / b;
}

/** Remaining lease in years at `atYear` (fractional) for a 99-year lease that commenced in `leaseCommenceYear`. */
export function remainingLeaseYears(leaseCommenceYear: number, atYear: number, leaseYears = HDB_LEASE_YEARS): number {
  return Math.max(0, leaseYears - (atYear - leaseCommenceYear));
}

/**
 * CPF usage for buying a flat with `remainingLease` years left (rules from 10 May 2019, loan-rules.md §4 — UNVERIFIED):
 * - below 20 years: CPF cannot be used (exactly 20 years is allowed);
 * - lease covers the youngest buyer to age 95 (age + lease >= 95): full use, up to the Valuation Limit;
 * - otherwise pro-rated: share = remaining lease ÷ (95 − youngest age).
 *   Example (loan-rules.md §4): youngest 50, lease 40 → 40 / 45 = 88.89% of the VL.
 */
export function cpfUsage(remainingLease: number, youngestBuyerAge: number): { allowed: boolean; full: boolean; shareOfValuationLimit: number } {
  if (!(remainingLease >= CPF_MIN_REMAINING_LEASE)) return { allowed: false, full: false, shareOfValuationLimit: 0 };
  const needed = CPF_LEASE_COVER_AGE - youngestBuyerAge;
  if (remainingLease >= needed) return { allowed: true, full: true, shareOfValuationLimit: 1 };
  return { allowed: true, full: false, shareOfValuationLimit: Math.max(0, Math.min(1, remainingLease / needed)) };
}

/**
 * CPF amount limits for a purchase: Valuation Limit = lower of price and valuation; the usable cap is VL × share
 * (pro-rated for short leases); the Withdrawal Limit (120% of VL) can be reached only after setting aside the Basic
 * Retirement Sum. Pro-rating "VL (or WL) × ratio" is the research's best understanding. All UNVERIFIED (loan-rules.md
 * §4); the HDB-flat-with-HDB-loan nuance (VL/WL may not cap the same way) is not modelled.
 * Example (loan-rules.md §4): VL 400,000 × 40/45 = 355,555.56.
 */
export function cpfLimits(price: number, remainingLease: number, youngestBuyerAge: number, valuation?: number) {
  const usage = cpfUsage(remainingLease, youngestBuyerAge);
  const valuationLimit = Math.max(0, Math.min(price, valuation ?? price));
  return {
    ...usage,
    valuationLimit,
    usableUpToValuationLimit: valuationLimit * usage.shareOfValuationLimit,
    withdrawalLimit: valuationLimit * CPF_WITHDRAWAL_LIMIT_MULTIPLE * usage.shareOfValuationLimit,
    status: RULE_META.cpfProration.status,
  };
}
