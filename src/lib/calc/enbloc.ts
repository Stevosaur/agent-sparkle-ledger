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

export function enblocTier(input: EnblocInput): EnblocResult {
  const reasons: string[] = [];
  if (input.propertyTypes.some((t) => t === "Executive Condominium")) {
    return { tier: "Unlikely", label: "Executive condominium", reasons: ["Executive condominiums are rarely sold en bloc while subject to EC resale restrictions."] };
  }
  if (input.startYear == null || input.tenureKind == null) return { tier: "Unknown", label: "Not enough data", reasons: ["Tenure or age is not recorded for this development."] };
  const age = input.currentYear - input.startYear;
  const longTenure = input.tenureKind === "freehold" || (input.leaseYears != null && input.leaseYears >= 999);
  if (longTenure) reasons.push("Freehold or 999-year tenure: no lease top-up premium is needed for redevelopment.");
  else reasons.push(`${input.leaseYears ?? "?"}-year lease: redevelopment needs a lease top-up, which raises the land cost.`);
  reasons.push(`About ${age} years since ${longTenure ? "the earliest record" : "lease start"}.`);
  let tier: EnblocResult["tier"];
  if (longTenure && age >= 30) tier = "A";
  else if ((longTenure && age >= 20) || (!longTenure && age >= 40)) tier = "B";
  else if (!longTenure && age >= 25) tier = "C";
  else tier = "Unlikely";
  const labels = { A: "Higher en-bloc potential", B: "Moderate en-bloc potential", C: "Lower en-bloc potential", Unlikely: "En bloc unlikely for now", Unknown: "Not enough data" } as const;
  return { tier, label: labels[tier], reasons };
}
