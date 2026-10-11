/**
 * En-bloc potential tier — a transparent heuristic, not a prediction. Inputs we can observe from the
 * dataset: tenure, age (tenure start year or first sale), and recent sales activity. Collective sales in
 * Singapore have typically involved older freehold / 999-year developments, or 99-year developments with
 * a lease top-up case. Every reason is returned so the page can show its working.
 */
export interface EnblocInput {
  tenureKind: "freehold" | "leasehold" | null;
  leaseYears: number | null;
  /** year the lease started (leasehold) or best estimate of completion (freehold), null if unknown */
  startYear: number | null;
  currentYear: number;
  propertyTypes: string[];
}

export interface EnblocResult {
  tier: "A" | "B" | "C" | "Unlikely" | "Unknown";
  label: string;
  reasons: string[];
}

/**
 * Age thresholds (years) behind the tiers. These are this app's own heuristic, NOT a regulatory rule and not taken
 * from any research file: collective-sale outcomes depend on owner votes, land value and redevelopment potential that
 * the dataset does not hold. Shown to users as "a transparent heuristic".
 */
export const ENBLOC_HEURISTIC_AGE = {
  /** freehold / 999-year developments at least this old: tier A */
  longTenureA: 30,
  /** freehold / 999-year developments at least this old: tier B */
  longTenureB: 20,
  /** 99-year leasehold developments at least this old: tier B */
  leaseholdB: 40,
  /** 99-year leasehold developments at least this old: tier C */
  leaseholdC: 25,
} as const;

/** Tenure treated as "long" (no lease top-up needed): freehold, or a lease of at least this many years. */
export const ENBLOC_LONG_LEASE_YEARS = 999;

export function enblocTier(input: EnblocInput): EnblocResult {
  const reasons: string[] = [];
  if (input.propertyTypes.some((t) => t === "Executive Condominium")) {
    return { tier: "Unlikely", label: "Executive condominium", reasons: ["Executive condominiums are rarely sold en bloc while subject to EC resale restrictions."] };
  }
  if (input.startYear == null || input.tenureKind == null) return { tier: "Unknown", label: "Not enough data", reasons: ["Tenure or age is not recorded for this development."] };
  // a start year after the reference year is a data error or an uncompleted project: treat the age as 0
  const age = Math.max(0, input.currentYear - input.startYear);
  const longTenure = input.tenureKind === "freehold" || (input.leaseYears != null && input.leaseYears >= ENBLOC_LONG_LEASE_YEARS);
  if (longTenure) reasons.push("Freehold or 999-year tenure: no lease top-up premium is needed for redevelopment.");
  else reasons.push(`${input.leaseYears ?? "?"}-year lease: redevelopment needs a lease top-up, which raises the land cost.`);
  reasons.push(`About ${age} years since ${longTenure ? "the earliest record" : "lease start"}.`);
  let tier: EnblocResult["tier"];
  const t = ENBLOC_HEURISTIC_AGE;
  if (longTenure && age >= t.longTenureA) tier = "A";
  else if ((longTenure && age >= t.longTenureB) || (!longTenure && age >= t.leaseholdB)) tier = "B";
  else if (!longTenure && age >= t.leaseholdC) tier = "C";
  else tier = "Unlikely";
  const labels = { A: "Higher en-bloc potential", B: "Moderate en-bloc potential", C: "Lower en-bloc potential", Unlikely: "En bloc unlikely for now", Unknown: "Not enough data" } as const;
  return { tier, label: labels[tier], reasons };
}
