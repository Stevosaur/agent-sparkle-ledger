import { RULE_META, type RuleStatus, type Tier } from "./rules";

/**
 * Residential property tax (IRAS): progressive rates on the Annual Value (AV) set by IRAS.
 * Source: https://www.iras.gov.sg/taxes/property-tax/property-owners/property-tax-rates/residential-property (not read).
 * Status: UNVERIFIED for every table (docs/research/loan-rules.md §5 — no IRAS page could be read or searched).
 * Whether the owner-occupier bands changed again for 2026 is unknown: 2026 and later use the 2025 bands, flagged.
 * One-off rebates are not modelled. No rounding rule was researched, so amounts are returned unrounded.
 */

/** Owner-occupied residential property, from 1 Jan 2025 (AV bands raised). Status: unverified (loan-rules.md §5.1). */
export const PROPERTY_TAX_OWNER_OCCUPIED_2025: Tier[] = [
  { upTo: 12_000, rate: 0 },
  { upTo: 40_000, rate: 0.04 },
  { upTo: 50_000, rate: 0.06 },
  { upTo: 65_000, rate: 0.1 },
  { upTo: 80_000, rate: 0.14 },
  { upTo: 95_000, rate: 0.2 },
  { upTo: 110_000, rate: 0.26 },
  { upTo: null, rate: 0.32 },
];

/** Owner-occupied residential property, 2024. Status: unverified (loan-rules.md §5.1). */
export const PROPERTY_TAX_OWNER_OCCUPIED_2024: Tier[] = [
  { upTo: 8_000, rate: 0 },
  { upTo: 30_000, rate: 0.04 },
  { upTo: 40_000, rate: 0.06 },
  { upTo: 55_000, rate: 0.1 },
  { upTo: 70_000, rate: 0.14 },
  { upTo: 85_000, rate: 0.2 },
  { upTo: 100_000, rate: 0.26 },
  { upTo: null, rate: 0.32 },
];

/** Non-owner-occupied residential property, from 1 Jan 2024 (believed unchanged in 2025 and 2026). Status: unverified (§5.2). */
export const PROPERTY_TAX_NON_OWNER_OCCUPIED_2024: Tier[] = [
  { upTo: 30_000, rate: 0.12 },
  { upTo: 45_000, rate: 0.2 },
  { upTo: 60_000, rate: 0.28 },
  { upTo: null, rate: 0.36 },
];

export interface PropertyTaxResult {
  tax: number;
  tiers: { from: number; to: number | null; rate: number; taxable: number; amount: number }[];
  /** e.g. "owner-occupied 2025 bands" */
  table: string;
  /** true when the year is later than the latest researched table (bands may have changed) */
  extrapolated: boolean;
  status: RuleStatus;
}

/**
 * Annual residential property tax for an Annual Value. `year` defaults to 2025 (the latest researched owner-occupier
 * table); years before 2024 are not covered (null). Worked example (loan-rules.md §5): owner-occupied, AV 30,000,
 * 2025 bands → 0% × 12,000 + 4% × 18,000 = 720.
 */
export function residentialPropertyTax(annualValue: number, opts: { ownerOccupied: boolean; year?: number }): PropertyTaxResult | null {
  const year = opts.year ?? 2025;
  if (!Number.isFinite(year) || year < 2024 || !(annualValue >= 0)) return null;
  const [tiers, table, latest] = opts.ownerOccupied
    ? year >= 2025
      ? [PROPERTY_TAX_OWNER_OCCUPIED_2025, "owner-occupied 2025 bands", 2025]
      : [PROPERTY_TAX_OWNER_OCCUPIED_2024, "owner-occupied 2024 bands", 2024]
    : [PROPERTY_TAX_NON_OWNER_OCCUPIED_2024, "non-owner-occupied 2024 bands", 2024];
  const avCents = Math.round(annualValue * 100);
  const out: PropertyTaxResult["tiers"] = [];
  let lower = 0;
  let units = 0;
  for (const t of tiers) {
    if (avCents <= lower) break;
    const upper = t.upTo == null ? Number.POSITIVE_INFINITY : t.upTo * 100;
    const slice = Math.min(avCents, upper) - lower;
    const sliceUnits = slice * Math.round(t.rate * 10_000);
    out.push({ from: lower / 100, to: t.upTo, rate: t.rate, taxable: slice / 100, amount: sliceUnits / 1_000_000 });
    units += sliceUnits;
    lower = upper;
  }
  return {
    tax: units / 1_000_000,
    tiers: out,
    table,
    extrapolated: opts.ownerOccupied ? year > 2025 : year > 2026,
    status: (opts.ownerOccupied ? RULE_META.propertyTaxOwnerOccupied : RULE_META.propertyTaxNonOwnerOccupied).status,
  } satisfies PropertyTaxResult & { tax: number };
  void latest;
}
