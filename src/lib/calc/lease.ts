import { CPF_LEASE_COVER_AGE, CPF_MIN_REMAINING_LEASE, HDB_LEASE_YEARS } from "./rules";

/**
 * Bala's Table: value of a leasehold interest as a percentage of freehold value, by years remaining.
 * Keys are remaining years; values are percent of freehold. Intermediate years are linearly interpolated.
 * SOURCE: see docs/research/bala-table.md — VERIFY every value against that file.
 */
export const BALA_TABLE: Record<number, number> = {};

export function balaPct(yearsRemaining: number): number | null {
  const keys = Object.keys(BALA_TABLE).map(Number).sort((a, b) => a - b);
  if (keys.length === 0) return null;
  const y = Math.max(0, yearsRemaining);
  if (y <= keys[0]) return (BALA_TABLE[keys[0]] * y) / Math.max(keys[0], 1);
  if (y >= keys[keys.length - 1]) return BALA_TABLE[keys[keys.length - 1]];
  for (let i = 1; i < keys.length; i++) {
    if (y <= keys[i]) {
      const a = keys[i - 1];
      const b = keys[i];
      return BALA_TABLE[a] + ((BALA_TABLE[b] - BALA_TABLE[a]) * (y - a)) / (b - a);
    }
  }
  return null;
}

/** Remaining lease in years at `atYear` (fractional) for a 99-year lease that commenced in `leaseCommenceYear`. */
export function remainingLeaseYears(leaseCommenceYear: number, atYear: number, leaseYears = HDB_LEASE_YEARS): number {
  return Math.max(0, leaseYears - (atYear - leaseCommenceYear));
}

/**
 * CPF usage for buying a flat with `remainingLease` years left:
 * - below 20 years: CPF cannot be used
 * - lease covers the youngest buyer to age 95: full use (up to the Valuation Limit)
 * - otherwise pro-rated: (remaining lease − (95 − age)) is negative, so the allowed share is remaining / (95 − age)
 */
export function cpfUsage(remainingLease: number, youngestBuyerAge: number): { allowed: boolean; full: boolean; shareOfValuationLimit: number } {
  if (remainingLease < CPF_MIN_REMAINING_LEASE) return { allowed: false, full: false, shareOfValuationLimit: 0 };
  const needed = CPF_LEASE_COVER_AGE - youngestBuyerAge;
  if (remainingLease >= needed) return { allowed: true, full: true, shareOfValuationLimit: 1 };
  return { allowed: true, full: false, shareOfValuationLimit: Math.max(0, Math.min(1, remainingLease / needed)) };
}
