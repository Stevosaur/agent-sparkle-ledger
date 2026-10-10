import { amortisationSchedule, monthlyPayment } from "@/lib/calc/mortgage";

/**
 * Mortgage package comparer (pure, client-safe).
 * Each package is either a fixed rate or 3M compounded SORA + spread. Floating packages assume today's
 * 3M SORA stays flat for the whole horizon — an assumption the UI states next to the results.
 */

export interface MortgagePackageInput {
  id: string;
  name: string;
  kind: "fixed" | "sora";
  /** fixed: the annual rate %; sora: the spread over 3M SORA in % points */
  ratePct: number | null;
  /** lock-in period in whole years (0 = no lock-in) */
  lockInYears: number;
  /** one-off costs the borrower pays (legal, valuation, fees net of any subsidy), SGD */
  fees: number;
}

export interface PackageComparison {
  id: string;
  name: string;
  kind: "fixed" | "sora";
  effectiveRatePct: number;
  monthlyPayment: number;
  lockInYears: number;
  /** interest paid during the package's own lock-in (0 when there is no lock-in) */
  interestOverLockIn: number;
  /** interest paid over the common comparison horizon */
  interestOverHorizon: number;
  fees: number;
  /** interestOverHorizon + fees */
  costOverHorizon: number;
  /** 1 = cheapest over the horizon */
  rank: number;
}

/** Interest paid in the first `years` whole years of an amortising loan (capped at the tenure). */
export function interestOverYears(principal: number, annualRatePct: number, tenureYears: number, years: number): number {
  if (!(principal > 0) || !(tenureYears > 0) || !(years > 0)) return 0;
  const schedule = amortisationSchedule(principal, annualRatePct, tenureYears);
  let sum = 0;
  for (const row of schedule) {
    if (row.year > years) break;
    sum += row.interest;
  }
  return sum;
}

/** Effective annual rate of a package given today's 3M SORA; null when the rate is missing or invalid. */
export function effectiveRate(pkg: Pick<MortgagePackageInput, "kind" | "ratePct">, sora3mPct: number | null): number | null {
  if (pkg.ratePct == null || !Number.isFinite(pkg.ratePct)) return null;
  if (pkg.kind === "fixed") return pkg.ratePct >= 0 ? pkg.ratePct : null;
  if (sora3mPct == null || !Number.isFinite(sora3mPct)) return null;
  const r = sora3mPct + pkg.ratePct;
  return r >= 0 ? r : null;
}

/** Default common horizon: the longest lock-in among the packages, at least one year. */
export function defaultHorizon(packages: Pick<MortgagePackageInput, "lockInYears">[]): number {
  return Math.max(1, ...packages.map((p) => Math.max(0, Math.floor(p.lockInYears || 0))));
}

/**
 * Compare packages on the same loan. Packages without a usable rate are skipped. Ranked by interest +
 * fees over `horizonYears` (ties keep input order).
 */
export function comparePackages(
  loan: number,
  tenureYears: number,
  sora3mPct: number | null,
  packages: MortgagePackageInput[],
  horizonYears = defaultHorizon(packages),
): PackageComparison[] {
  if (!(loan > 0) || !(tenureYears > 0)) return [];
  const horizon = Math.max(1, Math.floor(horizonYears));
  const rows: Omit<PackageComparison, "rank">[] = [];
  for (const p of packages) {
    const rate = effectiveRate(p, sora3mPct);
    if (rate == null) continue;
    const lockIn = Math.max(0, Math.floor(p.lockInYears || 0));
    const fees = Math.max(0, p.fees || 0);
    const interestOverHorizon = interestOverYears(loan, rate, tenureYears, horizon);
    rows.push({
      id: p.id,
      name: p.name,
      kind: p.kind,
      effectiveRatePct: rate,
      monthlyPayment: monthlyPayment(loan, rate, tenureYears),
      lockInYears: lockIn,
      interestOverLockIn: lockIn > 0 ? interestOverYears(loan, rate, tenureYears, lockIn) : 0,
      interestOverHorizon,
      fees,
      costOverHorizon: interestOverHorizon + fees,
    });
  }
  const order = rows.map((r, i) => ({ i, cost: r.costOverHorizon })).sort((a, b) => a.cost - b.cost || a.i - b.i);
  const rankOf = new Map(order.map((o, idx) => [o.i, idx + 1]));
  return rows.map((r, i) => ({ ...r, rank: rankOf.get(i) ?? i + 1 }));
}
