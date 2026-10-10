/**
 * Singapore property rules used by the calculators. Every constant cites its source and effective date
 * so it can be audited and updated in one place. See docs/research/*.md for the underlying research.
 */

export interface Tier {
  /** upper bound of this tier's band (exclusive of the next), null = no limit */
  upTo: number | null;
  rate: number;
}

/** IRAS Buyer's Stamp Duty, residential, for documents executed on or after 15 Feb 2023. */
export const BSD_RESIDENTIAL: Tier[] = [
  { upTo: 180_000, rate: 0.01 },
  { upTo: 360_000, rate: 0.02 },
  { upTo: 1_000_000, rate: 0.03 },
  { upTo: 1_500_000, rate: 0.04 },
  { upTo: 3_000_000, rate: 0.05 },
  { upTo: null, rate: 0.06 },
];

/** IRAS Buyer's Stamp Duty, non-residential, for documents executed on or after 15 Feb 2023. */
export const BSD_NON_RESIDENTIAL: Tier[] = [
  { upTo: 180_000, rate: 0.01 },
  { upTo: 360_000, rate: 0.02 },
  { upTo: 1_000_000, rate: 0.03 },
  { upTo: 1_500_000, rate: 0.04 },
  { upTo: null, rate: 0.05 },
];

export type BuyerProfile = "SC" | "SPR" | "FOREIGNER" | "ENTITY";

/**
 * IRAS Additional Buyer's Stamp Duty rates for acquisitions on or after 27 Apr 2023.
 * Index 0 = first residential property, 1 = second, 2 = third and subsequent.
 */
export const ABSD_RATES: Record<BuyerProfile, [number, number, number]> = {
  SC: [0, 0.2, 0.3],
  SPR: [0.05, 0.3, 0.35],
  FOREIGNER: [0.6, 0.6, 0.6],
  ENTITY: [0.65, 0.65, 0.65],
};

/**
 * Seller's Stamp Duty on residential property, by holding period.
 * Properties acquired on or after 4 Jul 2025: 16% / 12% / 8% / 4% within 1 / 2 / 3 / 4 years.
 * Properties acquired 11 Mar 2017 – 3 Jul 2025: 12% / 8% / 4% within 1 / 2 / 3 years.
 */
export const SSD_FROM_2025_07_04 = { since: "2025-07-04", rates: [0.16, 0.12, 0.08, 0.04] };
export const SSD_FROM_2017_03_11 = { since: "2017-03-11", rates: [0.12, 0.08, 0.04] };

/** MAS Total Debt Servicing Ratio limit. */
export const TDSR_LIMIT = 0.55;
/** MAS / HDB Mortgage Servicing Ratio limit (HDB flats, and ECs bought from developers). */
export const MSR_LIMIT = 0.3;
/** MAS medium-term interest rate floor for TDSR/MSR on residential property bank loans (from 30 Sep 2022). */
export const BANK_STRESS_RATE_PCT = 4;
/** Interest rate floor HDB uses to assess HDB loan eligibility (from 30 Sep 2022). */
export const HDB_LOAN_STRESS_RATE_PCT = 3;

/** HDB concessionary loan: 0.1% above the CPF OA rate (2.5%). */
export const HDB_LOAN_RATE_PCT = 2.6;
/** HDB loan LTV limit for flat applications from 20 Aug 2024. */
export const HDB_LOAN_LTV = 0.75;
export const HDB_LOAN_MAX_TENURE = 25;

/** Maximum bank loan tenure (MAS): HDB flats 30 years, other residential 35 years. */
export const BANK_MAX_TENURE = { hdb: 30, private: 35 } as const;

/**
 * MAS LTV limits for bank housing loans by number of outstanding housing loans (0, 1, 2+).
 * `standard` applies when the tenure is within the threshold and the loan ends by age 65; otherwise `reduced`.
 * Tenure thresholds: 25 years for HDB flats, 30 years for other residential property.
 */
export const BANK_LTV = [
  { standard: 0.75, reduced: 0.55, minCashStandard: 0.05, minCashReduced: 0.1 },
  { standard: 0.45, reduced: 0.25, minCashStandard: 0.25, minCashReduced: 0.25 },
  { standard: 0.35, reduced: 0.15, minCashStandard: 0.25, minCashReduced: 0.25 },
] as const;
export const LTV_TENURE_THRESHOLD = { hdb: 25, private: 30 } as const;
export const LTV_AGE_LIMIT = 65;

/** CPF: full use of CPF for a flat whose remaining lease covers the youngest buyer to age 95. */
export const CPF_LEASE_COVER_AGE = 95;
/** CPF cannot be used if the remaining lease is below 20 years. */
export const CPF_MIN_REMAINING_LEASE = 20;

/** HDB Minimum Occupation Period for most flats (years). Plus and Prime flats (BTO from Oct 2024) carry 10 years. */
export const HDB_MOP_YEARS = 5;
export const HDB_MOP_YEARS_PLUS_PRIME = 10;

/** HDB leases are 99 years from the lease commencement date. */
export const HDB_LEASE_YEARS = 99;
