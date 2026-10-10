/**
 * Singapore property rules used by the calculators. Every constant cites its source, effective date and
 * verification status so it can be audited and updated in one place. The research behind each value is in
 * docs/research/stamp-duty.md, loan-rules.md, hdb-rules.md, bala-table.md and rates-data.md (each ends with a
 * "Verification log"). `RULE_META` / `RULE_STATUS` below expose the same information to the UI: anything whose
 * status is not "verified-*" must be shown with an "indicative — check with IRAS / MAS / HDB / CPF" note.
 *
 * Verification vocabulary (mapped from the research tags):
 * - "verified-search": confirmed from a search-result extract of the primary government page
 *   (stamp-duty.md "VERIFIED (search)", loan-rules.md "[PRIMARY]", hdb-rules.md "[PRIMARY]"). The full page was
 *   not read: no primary page could be opened during research.
 * - "verified-secondary": confirmed only through law-firm, bank or industry summaries.
 * - "verified-data": checked against the government dataset itself (hdb-rules.md "[DATA]").
 * - "unverified-high-confidence": long-standing rule from prior knowledge, not re-confirmed.
 * - "unverified": best understanding only; a real risk.
 * - "unverified-conflict": sources disagree; the value used is the research's recommended interim choice.
 * - "unverified-reproduction": a reproduction of an official table that has not been diffed against it.
 */

export interface Tier {
  /** upper bound of this tier's band (cumulative, exclusive of the next), null = no limit */
  upTo: number | null;
  rate: number;
}

/* ------------------------------------------------------------------ */
/* Buyer's Stamp Duty                                                  */
/* ------------------------------------------------------------------ */

/**
 * IRAS Buyer's Stamp Duty, residential, documents executed on or after 15 Feb 2023 (current, Oct 2026).
 * Source: https://iras.gov.sg/quick-links/tax-rates/stamp-duty ; MOF Budget 2023 release
 * https://www.mof.gov.sg/news-resources/newsroom/buyer-s-stamp-duty-bsd-rates-to-be-raised-for-higher-value-properties/
 * Status: verified-search (stamp-duty.md §1.2). Charged on the higher of price and market value, marginal tiers,
 * rounded down to the dollar with a $1 minimum (verified-search, §1.1).
 */
export const BSD_RESIDENTIAL: Tier[] = [
  { upTo: 180_000, rate: 0.01 },
  { upTo: 360_000, rate: 0.02 },
  { upTo: 1_000_000, rate: 0.03 },
  { upTo: 1_500_000, rate: 0.04 },
  { upTo: 3_000_000, rate: 0.05 },
  { upTo: null, rate: 0.06 },
];

/**
 * IRAS Buyer's Stamp Duty, non-residential, documents executed on or after 15 Feb 2023 (top rate 5%, no 6% tier).
 * Source: same MOF Budget 2023 release. Status: unverified-high-confidence (stamp-duty.md §1.3).
 */
export const BSD_NON_RESIDENTIAL: Tier[] = [
  { upTo: 180_000, rate: 0.01 },
  { upTo: 360_000, rate: 0.02 },
  { upTo: 1_000_000, rate: 0.03 },
  { upTo: 1_500_000, rate: 0.04 },
  { upTo: null, rate: 0.05 },
];

/**
 * BSD residential, acquisitions 20 Feb 2018 – 14 Feb 2023 (top rate 4% above $1m).
 * Source: MOF Budget 2023 release (old top rate 4%: verified-search); rest unverified-high-confidence (§1.4).
 */
export const BSD_RESIDENTIAL_2018: Tier[] = [
  { upTo: 180_000, rate: 0.01 },
  { upTo: 360_000, rate: 0.02 },
  { upTo: 1_000_000, rate: 0.03 },
  { upTo: null, rate: 0.04 },
];

/** BSD non-residential, acquisitions 20 Feb 2018 – 14 Feb 2023 (1/2/3%). Status: unverified-high-confidence (§1.4). */
export const BSD_NON_RESIDENTIAL_2018: Tier[] = [
  { upTo: 180_000, rate: 0.01 },
  { upTo: 360_000, rate: 0.02 },
  { upTo: null, rate: 0.03 },
];

/** BSD (residential and non-residential), acquisitions before 20 Feb 2018 (1/2/3%). Status: unverified-high-confidence (§1.4). */
export const BSD_PRE_2018: Tier[] = [
  { upTo: 180_000, rate: 0.01 },
  { upTo: 360_000, rate: 0.02 },
  { upTo: null, rate: 0.03 },
];

/**
 * BSD tables by date of acquisition (OTP exercised / S&P signed), newest first. `since` is inclusive.
 * The OTP-granted-before transitional windows (e.g. OTP granted by 14 Feb 2023 and exercised by 7 Mar 2023)
 * are NOT modelled: pass the date whose table applies.
 */
export const BSD_TABLES: readonly { since: string; residential: Tier[]; nonResidential: Tier[] }[] = [
  { since: "2023-02-15", residential: BSD_RESIDENTIAL, nonResidential: BSD_NON_RESIDENTIAL },
  { since: "2018-02-20", residential: BSD_RESIDENTIAL_2018, nonResidential: BSD_NON_RESIDENTIAL_2018 },
  { since: "0000-01-01", residential: BSD_PRE_2018, nonResidential: BSD_PRE_2018 },
];

/** Minimum BSD when any duty is payable (IRAS rates page; verified-search, stamp-duty.md §1.1). */
export const BSD_MINIMUM_DUTY = 1;

/* ------------------------------------------------------------------ */
/* Additional Buyer's Stamp Duty                                       */
/* ------------------------------------------------------------------ */

export type BuyerProfile = "SC" | "SPR" | "FOREIGNER" | "ENTITY";

/** Buyer types beyond `BuyerProfile` that ABSD distinguishes (stamp-duty.md §2.2). */
export type AbsdProfile = BuyerProfile | "TRUSTEE" | "HOUSING_DEVELOPER";

/**
 * IRAS Additional Buyer's Stamp Duty rates for acquisitions on or after 27 Apr 2023 (current, Oct 2026).
 * Index 0 = first residential property, 1 = second, 2 = third and subsequent. Flat rate on the full
 * higher-of-price-and-market-value; joint purchases pay the highest buyer's rate on the whole value.
 * Source: https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/additional-buyer's-stamp-duty-(absd)
 * (MOF/MND/MAS release of 26 Apr 2023). Status: unverified-high-confidence (stamp-duty.md §2.2; SC/SPR/foreigner
 * rates consistent with a 20 Aug 2026 secondary source). No 2025/2026 change found (Budget 2025 and 2026 speech texts).
 */
export const ABSD_RATES: Record<BuyerProfile, [number, number, number]> = {
  SC: [0, 0.2, 0.3],
  SPR: [0.05, 0.3, 0.35],
  FOREIGNER: [0.6, 0.6, 0.6],
  ENTITY: [0.65, 0.65, 0.65],
};

/**
 * ABSD for trustees ("ABSD (Trust)", 65%) and licensed housing developers (35% remittable + 5% non-remittable = 40%),
 * from 27 Apr 2023. Kept separate from `ABSD_RATES` so code iterating the individual profiles is unaffected.
 * Source: IRAS ABSD page. Status: unverified-high-confidence (stamp-duty.md §2.2). The developer remission/clawback
 * (changed in Budget 2024 for developers selling ≥ 90%) is not modelled.
 */
export const ABSD_RATES_OTHER: Record<"TRUSTEE" | "HOUSING_DEVELOPER", [number, number, number]> = {
  TRUSTEE: [0.65, 0.65, 0.65],
  HOUSING_DEVELOPER: [0.4, 0.4, 0.4],
};

/**
 * Historical ABSD tables by date of acquisition, newest first (`since` inclusive). Earlier acquisitions are not
 * covered by the research. Trustee ABSD started 9 May 2022 (35%); developers paid 25% + 5% (2018) and 35% + 5% (2021).
 * Status: unverified-high-confidence for every row (stamp-duty.md §2.3). Transitional OTP windows are not modelled.
 */
export const ABSD_TABLES: readonly { since: string; rates: Record<AbsdProfile, [number, number, number] | null> }[] = [
  { since: "2023-04-27", rates: { ...ABSD_RATES, ...ABSD_RATES_OTHER } },
  {
    since: "2022-05-09",
    rates: { SC: [0, 0.17, 0.25], SPR: [0.05, 0.25, 0.3], FOREIGNER: [0.3, 0.3, 0.3], ENTITY: [0.35, 0.35, 0.35], TRUSTEE: [0.35, 0.35, 0.35], HOUSING_DEVELOPER: [0.4, 0.4, 0.4] },
  },
  {
    since: "2021-12-16",
    rates: { SC: [0, 0.17, 0.25], SPR: [0.05, 0.25, 0.3], FOREIGNER: [0.3, 0.3, 0.3], ENTITY: [0.35, 0.35, 0.35], TRUSTEE: null, HOUSING_DEVELOPER: [0.4, 0.4, 0.4] },
  },
  {
    since: "2018-07-06",
    rates: { SC: [0, 0.12, 0.15], SPR: [0.05, 0.15, 0.15], FOREIGNER: [0.2, 0.2, 0.2], ENTITY: [0.25, 0.25, 0.25], TRUSTEE: null, HOUSING_DEVELOPER: [0.3, 0.3, 0.3] },
  },
];

export type FtaCountry = "US" | "IS" | "LI" | "NO" | "CH";

/**
 * Free Trade Agreement nationals who get Singapore-Citizen ABSD rates (by remission, individuals only):
 * US nationals (not US permanent residents) under the US–Singapore FTA; nationals AND permanent residents of
 * Iceland, Liechtenstein, Norway and Switzerland under the EFTA–Singapore FTA.
 * Source: IRAS ABSD page. Status: unverified-high-confidence (stamp-duty.md §2.5; same five countries in a 2026
 * secondary source).
 */
export const FTA_SC_EQUIVALENT: Record<FtaCountry, { nationals: true; permanentResidents: boolean }> = {
  US: { nationals: true, permanentResidents: false },
  IS: { nationals: true, permanentResidents: true },
  LI: { nationals: true, permanentResidents: true },
  NO: { nationals: true, permanentResidents: true },
  CH: { nationals: true, permanentResidents: true },
};

/* ------------------------------------------------------------------ */
/* Seller's Stamp Duty (residential)                                   */
/* ------------------------------------------------------------------ */

/**
 * Seller's Stamp Duty on residential property, by holding period, keyed on the date of acquisition.
 * `rates[i]` applies to a disposal "more than i years and up to i+1 years" after acquisition; flat rate on the
 * higher of selling price and market value (unverified-high-confidence, §3.3); rounded down to the dollar (unverified).
 *
 * Acquired on or after 4 Jul 2025 (12:00 am): 16% / 12% / 8% / 4% within 1 / 2 / 3 / 4 years.
 * Source: MND/MAS release of 3 Jul 2025
 * https://www.mnd.gov.sg/newsroom/press-releases/view/extension-of-the-holding-period-of-seller's-stamp-duty-(ssd)-and-higher-ssd-rates-for-residential-properties
 * Status: effective date and "+4 points per tier, 3 → 4 years" verified-search; tier values verified-secondary (§3.1).
 */
export const SSD_FROM_2025_07_04 = { since: "2025-07-04", rates: [0.16, 0.12, 0.08, 0.04] };
/**
 * Acquired 11 Mar 2017 – 3 Jul 2025: 12% / 8% / 4% within 1 / 2 / 3 years.
 * Source: IRAS SSD page; Yuen Law / practitioner tables. Status: verified-secondary (stamp-duty.md §3.2, log #17).
 */
export const SSD_FROM_2017_03_11 = { since: "2017-03-11", rates: [0.12, 0.08, 0.04] };
/**
 * Acquired 14 Jan 2011 – 10 Mar 2017: 16% / 12% / 8% / 4% within 1 / 2 / 3 / 4 years.
 * Status: unverified-high-confidence (stamp-duty.md §3.2, log #18). The 2010 regimes (BSD-based) are not modelled.
 */
export const SSD_FROM_2011_01_14 = { since: "2011-01-14", rates: [0.16, 0.12, 0.08, 0.04] };

/** SSD regimes, newest first. Acquisitions before the last `since` are outside the modelled rules. */
export const SSD_REGIMES = [SSD_FROM_2025_07_04, SSD_FROM_2017_03_11, SSD_FROM_2011_01_14] as const;

/* ------------------------------------------------------------------ */
/* Loan servicing (MAS / HDB)                                          */
/* ------------------------------------------------------------------ */

/**
 * MAS Total Debt Servicing Ratio limit: 55% of gross monthly income, all debts including the new loan.
 * Effective for property loans where the OTP is granted on or after 16 Dec 2021 (60% before).
 * Source: https://www.mas.gov.sg/regulation/explainers/tdsr-for-property-loans/calculating-tdsr-thresholds
 * Status: verified-search (loan-rules.md §1.1).
 */
export const TDSR_LIMIT = 0.55;
/**
 * Mortgage Servicing Ratio limit: 30% of gross monthly income, counting instalments on all property loans incl. the
 * new one. Applies to bank loans for HDB flats (since 2013) and for ECs bought from the developer (OTP on or after
 * 10 Dec 2013) — those must pass both MSR and TDSR; HDB applies its own 30% MSR to HDB loans.
 * Source: https://www.mas.gov.sg/regulation/explainers/new-housing-loans/msr-and-tdsr-rules ,
 * https://www.mas.gov.sg/publications/macroprudential-policies-in-singapore
 * Status: verified-search for bank loans (§1.2); HDB-loan MSR verified-secondary (§3).
 */
export const MSR_LIMIT = 0.3;
/**
 * MAS medium-term interest rate floor for TDSR/MSR on residential property bank loans: the stress rate is
 * max(4% p.a., the loan's "thereafter" rate). OTP granted on or after 30 Sep 2022 (3.5% before).
 * Source: https://www.mas.gov.sg/regulation/explainers/tdsr-for-property-loans/calculating-tdsr ; MAS release 29 Sep 2022.
 * Status: verified-search (loan-rules.md §1.3).
 */
export const BANK_STRESS_RATE_PCT = 4;
/** Same floor for non-residential property loans: 5% p.a. from 30 Sep 2022. Status: verified-search (§1.3). */
export const BANK_STRESS_RATE_NON_RESIDENTIAL_PCT = 5;
/**
 * Rate HDB uses to assess HDB loan eligibility: max(3% p.a., prevailing concessionary rate), for HLE/HFE applications
 * received on or after 30 Sep 2022. No change to the rate actually charged.
 * Source: https://www.hdb.gov.sg/about-us/news-and-publications/press-releases/29092022-propertymeasures2022
 * Status: verified-search (loan-rules.md §1.4).
 */
export const HDB_LOAN_STRESS_RATE_PCT = 3;

/* ------------------------------------------------------------------ */
/* HDB concessionary loan                                              */
/* ------------------------------------------------------------------ */

/**
 * CPF Ordinary Account interest rate for 1 Oct – 31 Dec 2026: 2.5% (the legislated floor binds).
 * Source: https://www.cpf.gov.sg/member/growing-your-savings/earning-higher-returns/earning-attractive-interest
 * Status: unverified-high-confidence for Q4 2026 (rates-data.md §2: not re-fetched; corroborated by loan-rules.md §6;
 * RULE_META.cpfOaRate). Reviewed quarterly — re-check every quarter.
 */
export const CPF_OA_RATE_PCT = 2.5;
/** HDB concessionary loan rate = CPF OA rate + 0.1 point, revised quarterly. Status: unverified-high-confidence (rates-data.md §2). */
export const HDB_LOAN_RATE_SPREAD_PCT = 0.1;
/**
 * HDB concessionary loan rate, 1 Oct – 31 Dec 2026: 2.6% p.a. (2.5% + 0.1%).
 * Source: https://www.hdb.gov.sg/managing-my-home/finances/loan-matters/interest-rate
 * Status: unverified-high-confidence for Q4 2026 (see CPF_OA_RATE_PCT). Re-check quarterly.
 */
export const HDB_LOAN_RATE_PCT = 2.6;
/**
 * HDB loan LTV limit: 75% of the lower of price and valuation, for complete resale applications received on or after
 * 20 Aug 2024 and new-flat applications from the Oct 2024 BTO/SBF exercise (80% before).
 * Source: https://www.hdb.gov.sg/business-partners/estate-agents-and-salespersons/letters-to-keos/measures-to-cool-the-hdb-resale-market-and-provide-greater-support-for-first-time-home-buyers
 * Status: verified-search (loan-rules.md §3).
 */
export const HDB_LOAN_LTV = 0.75;
/** HDB loan maximum repayment period: 25 years (or to age 65, see HDB_LOAN_AGE_LIMIT). Status: verified-secondary (loan-rules.md §3). */
export const HDB_LOAN_MAX_TENURE = 25;
/**
 * HDB loan repayment period ends by age 65 ("25 years or until age 65, whichever is shorter").
 * Status: verified-secondary for the cap; whether "age" is the average or income-weighted average age is UNVERIFIED (§3).
 */
export const HDB_LOAN_AGE_LIMIT = 65;

/* ------------------------------------------------------------------ */
/* Bank loans: tenure and LTV (MAS)                                    */
/* ------------------------------------------------------------------ */

/**
 * Maximum bank loan tenure (MAS): HDB flats 30 years (since Aug 2013), other residential incl. ECs 35 years (since Oct 2012).
 * Status: verified-secondary (loan-rules.md §2.2).
 */
export const BANK_MAX_TENURE = { hdb: 30, private: 35 } as const;

/**
 * MAS LTV limits for bank housing loans to individuals, by number of outstanding housing loans (0, 1, 2+), with the
 * minimum cash down payment as a fraction of value. `standard` applies when the tenure is within the threshold and the
 * loan ends by age 65; otherwise `reduced`. Values set by the 6 Jul 2018 measures (structure from Oct 2012 / Jan 2013).
 * LTV base: the lower of price and valuation. Joint borrowers: the borrower with the most outstanding loans decides the
 * row (UNVERIFIED).
 * Source: https://www.mas.gov.sg/regulation/explainers/new-housing-loans (not read).
 * Status: unverified as a full table; first-loan 75% / 55% verified-secondary (loan-rules.md §2.1).
 */
export const BANK_LTV = [
  { standard: 0.75, reduced: 0.55, minCashStandard: 0.05, minCashReduced: 0.1 },
  { standard: 0.45, reduced: 0.25, minCashStandard: 0.25, minCashReduced: 0.25 },
  { standard: 0.35, reduced: 0.15, minCashStandard: 0.25, minCashReduced: 0.25 },
] as const;
/**
 * LTV for non-individual (company) borrowers: 15% since 6 Jul 2018 (cut from 20%; not changed on 16 Dec 2021).
 * Status: unverified (loan-rules.md §2.1, verification log #13; RULE_META.bankLtvNonIndividual).
 */
export const BANK_LTV_NON_INDIVIDUAL = 0.15;
/**
 * Reduced-LTV tenure triggers: tenure > 25 years for HDB flats, > 30 years for other residential property.
 * Status: verified-secondary (loan-rules.md §2.2; HDB's own page notes restrictions when the repayment period exceeds 25 years).
 */
export const LTV_TENURE_THRESHOLD = { hdb: 25, private: 30 } as const;
/** Reduced-LTV age trigger: borrower (income-weighted average) age + tenure > 65. Status: verified-secondary (§2.2); IWAA convention unverified. */
export const LTV_AGE_LIMIT = 65;

/* ------------------------------------------------------------------ */
/* CPF and lease                                                       */
/* ------------------------------------------------------------------ */

/**
 * CPF (from 10 May 2019): full use of CPF (up to the Valuation Limit) only when the remaining lease covers the youngest
 * buyer to age 95; otherwise pro-rated. The HDB loan LTV is pro-rated on the same basis.
 * Source: https://www.cpf.gov.sg/member/home-ownership/using-your-cpf-to-buy-a-home (URL unverified).
 * Status: unverified (loan-rules.md §4 — everything in that section is unverified; HDB loan pro-rating itself is
 * verified-search in §3, its formula is not).
 */
export const CPF_LEASE_COVER_AGE = 95;
/** CPF cannot be used if the remaining lease is below 20 years (from 10 May 2019). Status: unverified (loan-rules.md §4). */
export const CPF_MIN_REMAINING_LEASE = 20;
/**
 * CPF Withdrawal Limit = 120% of the Valuation Limit (lower of price and valuation); usable beyond the VL only after
 * setting aside the Basic Retirement Sum. Status: unverified (loan-rules.md §4).
 */
export const CPF_WITHDRAWAL_LIMIT_MULTIPLE = 1.2;

/* ------------------------------------------------------------------ */
/* HDB MOP and lease                                                   */
/* ------------------------------------------------------------------ */

/**
 * HDB Minimum Occupation Period: 5 years for Standard flats, flats launched before Oct 2024 and open-market resale flats;
 * counted from key collection (new flats) or resale completion, excluding periods when the whole flat is rented out.
 * Source: https://www.hdb.gov.sg/cs/infoweb/residential/selling-a-flat/eligibility/ ,
 * https://www.hdb.gov.sg/cs/infoweb/residential/buying-a-flat/conditions-after-buying?anchor=mop/
 * Status: verified-search (hdb-rules.md §1.1–1.2).
 */
export const HDB_MOP_YEARS = 5;
/** MOP for Plus and Prime flats (new or resale; launched from the Oct 2024 BTO exercise): 10 years. Status: verified-search (hdb-rules.md §1.1). */
export const HDB_MOP_YEARS_PLUS_PRIME = 10;
/** MOP for PLH flats (Nov 2021 BTO up to the Oct 2024 framework): 10 years. Status: unverified-high-confidence (hdb-rules.md §1.1; RULE_META.hdbMopPlh). */
export const HDB_MOP_YEARS_PLH = 10;
/** MOP for flats bought under the Fresh Start Housing Scheme: 20 years. Status: verified-search (hdb-rules.md §1.1). */
export const HDB_MOP_YEARS_FRESH_START = 20;

/**
 * HDB leases are 99 years from the lease commencement date.
 * Source: https://www.hdb.gov.sg/residential/buying-a-flat/finding-a-flat/types-of-flats (path unverified).
 * Status: unverified-high-confidence (hdb-rules.md §4; every row in the resale data is a 99-year lease).
 */
export const HDB_LEASE_YEARS = 99;

/* ------------------------------------------------------------------ */
/* Status registry for the UI                                          */
/* ------------------------------------------------------------------ */

export type RuleStatus =
  | "verified-search"
  | "verified-secondary"
  | "verified-data"
  | "unverified-high-confidence"
  | "unverified"
  | "unverified-conflict"
  | "unverified-reproduction";

export interface RuleMeta {
  status: RuleStatus;
  /** ISO date the rule took effect (for the current value), null when not applicable */
  effectiveFrom: string | null;
  /** primary page to cite or check */
  source: string;
  /** research file and section */
  research: string;
  note?: string;
}

const IRAS_STAMP_DUTY = "https://iras.gov.sg/quick-links/tax-rates/stamp-duty";
const IRAS_ABSD = "https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/additional-buyer's-stamp-duty-(absd)";
const IRAS_SSD = "https://www.iras.gov.sg/taxes/stamp-duty/for-property/selling-or-disposing-property/seller%27s-stamp-duty-%28ssd%29-for-residential-property";
const MAS_MSR_TDSR = "https://www.mas.gov.sg/regulation/explainers/new-housing-loans/msr-and-tdsr-rules";
const MAS_NEW_HOUSING_LOANS = "https://www.mas.gov.sg/regulation/explainers/new-housing-loans";
const HDB_CREDIT = "https://www.hdb.gov.sg/residential/buying-a-flat/working-out-your-flat-budget/credit-to-finance-a-flat-purchase";
const CPF_HOME = "https://www.cpf.gov.sg/member/home-ownership/using-your-cpf-to-buy-a-home";

/** Source, effective date and verification status of every rule the calculators apply. */
export const RULE_META = {
  bsdResidential: { status: "verified-search", effectiveFrom: "2023-02-15", source: IRAS_STAMP_DUTY, research: "stamp-duty.md §1.2" },
  bsdNonResidential: { status: "unverified-high-confidence", effectiveFrom: "2023-02-15", source: IRAS_STAMP_DUTY, research: "stamp-duty.md §1.3" },
  bsdRounding: { status: "verified-search", effectiveFrom: null, source: IRAS_STAMP_DUTY, research: "stamp-duty.md §1.1", note: "Rounded down to the dollar, $1 minimum." },
  bsdHistorical: { status: "unverified-high-confidence", effectiveFrom: "2018-02-20", source: IRAS_STAMP_DUTY, research: "stamp-duty.md §1.4", note: "Tables before 15 Feb 2023; OTP transitional windows not modelled." },
  absdRates: { status: "unverified-high-confidence", effectiveFrom: "2023-04-27", source: IRAS_ABSD, research: "stamp-duty.md §2.2" },
  absdOtherProfiles: { status: "unverified-high-confidence", effectiveFrom: "2023-04-27", source: IRAS_ABSD, research: "stamp-duty.md §2.2", note: "Trustee 65%; housing developer 35% remittable + 5%." },
  absdHistorical: { status: "unverified-high-confidence", effectiveFrom: "2018-07-06", source: IRAS_ABSD, research: "stamp-duty.md §2.3" },
  absdJointHighestRate: { status: "unverified-high-confidence", effectiveFrom: null, source: IRAS_ABSD, research: "stamp-duty.md §2.1" },
  absdRounding: { status: "unverified", effectiveFrom: null, source: IRAS_ABSD, research: "stamp-duty.md §2.1", note: "Assumed rounded down to the dollar, like BSD." },
  absdFta: { status: "unverified-high-confidence", effectiveFrom: null, source: IRAS_ABSD, research: "stamp-duty.md §2.5" },
  absdMarriedCoupleReliefs: { status: "unverified", effectiveFrom: null, source: IRAS_ABSD, research: "stamp-duty.md §2.4", note: "Remission / refund conditions; shown as a separate line, never applied automatically." },
  ssd2025: { status: "verified-secondary", effectiveFrom: "2025-07-04", source: IRAS_SSD, research: "stamp-duty.md §3.1", note: "Effective date and structure verified-search; tier values verified-secondary." },
  ssd2017: { status: "verified-secondary", effectiveFrom: "2017-03-11", source: IRAS_SSD, research: "stamp-duty.md §3.2" },
  ssd2011: { status: "unverified-high-confidence", effectiveFrom: "2011-01-14", source: IRAS_SSD, research: "stamp-duty.md §3.2" },
  ssdBase: { status: "unverified-high-confidence", effectiveFrom: null, source: IRAS_SSD, research: "stamp-duty.md §3.3", note: "Flat rate on the higher of selling price and market value." },
  ssdRounding: { status: "unverified", effectiveFrom: null, source: IRAS_SSD, research: "stamp-duty.md §3.3" },
  ssdAnniversary: {
    status: "unverified-conflict",
    effectiveFrom: null,
    source: IRAS_SSD,
    research: "stamp-duty.md §3.3",
    note: "A sale exactly on an anniversary is placed in the earlier (higher) band; one practitioner example implies the later band. Flag sales within ±1 day of an anniversary.",
  },
  ssdTransitional: { status: "unverified", effectiveFrom: "2025-07-04", source: IRAS_SSD, research: "stamp-duty.md §3.2", note: "OTPs granted before 4 Jul 2025 and exercised after: check with IRAS." },
  tdsr: { status: "verified-search", effectiveFrom: "2021-12-16", source: "https://www.mas.gov.sg/regulation/explainers/tdsr-for-property-loans/calculating-tdsr-thresholds", research: "loan-rules.md §1.1" },
  msr: { status: "verified-search", effectiveFrom: "2013-12-10", source: MAS_MSR_TDSR, research: "loan-rules.md §1.2", note: "HDB flats (2013) and ECs bought from the developer (OTP from 10 Dec 2013)." },
  bankStressRate: { status: "verified-search", effectiveFrom: "2022-09-30", source: "https://www.mas.gov.sg/regulation/explainers/tdsr-for-property-loans/calculating-tdsr", research: "loan-rules.md §1.3" },
  hdbStressRate: { status: "verified-search", effectiveFrom: "2022-09-30", source: "https://www.hdb.gov.sg/about-us/news-and-publications/press-releases/29092022-propertymeasures2022", research: "loan-rules.md §1.4" },
  bankLtv: { status: "unverified", effectiveFrom: "2018-07-06", source: MAS_NEW_HOUSING_LOANS, research: "loan-rules.md §2.1", note: "Full table unverified; first-loan 75% / 55% verified-secondary." },
  bankLtvNonIndividual: {
    status: "unverified",
    effectiveFrom: "2018-07-06",
    source: MAS_NEW_HOUSING_LOANS,
    research: "loan-rules.md §2.1",
    note: "15% for companies; no reduced column or minimum-cash rule was researched. The affordability solver also assumes a company has no CPF.",
  },
  bankMinCash: { status: "unverified", effectiveFrom: "2018-07-06", source: MAS_NEW_HOUSING_LOANS, research: "loan-rules.md §2.1" },
  bankLtvTriggers: { status: "verified-secondary", effectiveFrom: "2012-10-06", source: MAS_NEW_HOUSING_LOANS, research: "loan-rules.md §2.2" },
  bankMaxTenure: { status: "verified-secondary", effectiveFrom: "2013-08-27", source: MAS_NEW_HOUSING_LOANS, research: "loan-rules.md §2.2" },
  incomeWeightedAge: { status: "unverified", effectiveFrom: null, source: MAS_NEW_HOUSING_LOANS, research: "loan-rules.md §2.2", note: "IWAA convention and rounding unverified." },
  jointBorrowerLoanCount: { status: "unverified", effectiveFrom: null, source: MAS_NEW_HOUSING_LOANS, research: "loan-rules.md §2.1" },
  hdbLoanLtv: { status: "verified-search", effectiveFrom: "2024-08-20", source: HDB_CREDIT, research: "loan-rules.md §3" },
  hdbLoanLtvProration: { status: "unverified", effectiveFrom: "2019-05-10", source: HDB_CREDIT, research: "loan-rules.md §3–4", note: "Pro-rating is confirmed; the formula 75% × remaining lease ÷ (95 − youngest age) is assumed." },
  cpfOaRate: {
    status: "unverified-high-confidence",
    effectiveFrom: "2026-10-01",
    source: "https://www.cpf.gov.sg/member/growing-your-savings/earning-higher-returns/earning-attractive-interest",
    research: "rates-data.md §2",
    note: "2.5% for 1 Oct – 31 Dec 2026 (the legislated floor binds); not re-fetched. Reviewed quarterly.",
  },
  hdbLoanRate: { status: "unverified-high-confidence", effectiveFrom: "2026-10-01", source: "https://www.hdb.gov.sg/managing-my-home/finances/loan-matters/interest-rate", research: "rates-data.md §2", note: "CPF OA rate + 0.1%, reviewed quarterly." },
  hdbLoanMsr: { status: "verified-secondary", effectiveFrom: null, source: HDB_CREDIT, research: "loan-rules.md §3" },
  hdbLoanDownpaymentCpf: {
    status: "unverified",
    effectiveFrom: null,
    source: HDB_CREDIT,
    research: "loan-rules.md §7 Example C, §3",
    note: "With an HDB loan the down payment can be paid from CPF OA and/or cash; the split, staging and the $20,000 OA retention rule are unverified and not modelled.",
  },
  hdbLoanTenure: { status: "verified-secondary", effectiveFrom: null, source: HDB_CREDIT, research: "loan-rules.md §3", note: "25 years or to age 65; which age measure is used is unverified." },
  cpfMinLease: { status: "unverified", effectiveFrom: "2019-05-10", source: CPF_HOME, research: "loan-rules.md §4" },
  cpfFullUse: { status: "unverified", effectiveFrom: "2019-05-10", source: CPF_HOME, research: "loan-rules.md §4" },
  cpfProration: { status: "unverified", effectiveFrom: "2019-05-10", source: CPF_HOME, research: "loan-rules.md §4", note: "Formula remaining lease ÷ (95 − youngest age) is the research's best understanding." },
  cpfWithdrawalLimit: { status: "unverified", effectiveFrom: null, source: CPF_HOME, research: "loan-rules.md §4" },
  hdbMop: { status: "verified-search", effectiveFrom: null, source: "https://www.hdb.gov.sg/cs/infoweb/residential/selling-a-flat/eligibility/", research: "hdb-rules.md §1.1", note: "5 years Standard / pre-Oct-2024 / resale; 10 years Plus, Prime; 20 years Fresh Start. PLH: see hdbMopPlh." },
  hdbMopPlh: {
    status: "unverified-high-confidence",
    // first applied in the Nov 2021 BTO exercise; the exact launch day is not in the research
    effectiveFrom: null,
    source: "https://www.mynicehome.gov.sg/hdb-how-to/buy-your-flat/what-are-standard-prime-and-plus-hdb-flats/",
    research: "hdb-rules.md §1.1, §1.4",
    note: "PLH flats (Nov 2021 BTO exercise to the Oct 2024 framework): 10-year MOP. Not re-confirmed in the research session.",
  },
  propertyTaxOwnerOccupied: { status: "unverified", effectiveFrom: "2025-01-01", source: "https://www.iras.gov.sg/taxes/property-tax/property-owners/property-tax-rates/residential-property", research: "loan-rules.md §5.1", note: "2026 bands unknown; rebates not modelled." },
  propertyTaxNonOwnerOccupied: { status: "unverified", effectiveFrom: "2024-01-01", source: "https://www.iras.gov.sg/taxes/property-tax/property-owners/property-tax-rates/residential-property", research: "loan-rules.md §5.2" },
  remainingLeaseEstimate: {
    status: "verified-data",
    effectiveFrom: null,
    source: "https://data.gov.sg/",
    research: "hdb-rules.md §4",
    note: "Estimate 99.5 − years since the lease commencement year; checked against 146,965 HDB resale rows (within ±0.5 years for 99.6%).",
  },
  hdbLease: { status: "unverified-high-confidence", effectiveFrom: null, source: "https://www.hdb.gov.sg/residential/buying-a-flat/finding-a-flat/types-of-flats", research: "hdb-rules.md §4" },
  bala: {
    status: "unverified-reproduction",
    effectiveFrom: "2022-08-01",
    source: "https://www.ura.gov.sg/-/media/Corporate/Guidelines/Development-control/Circulars/2022/Jul/dc22-08-Appendix2.pdf",
    research: "bala-table.md §0, §2",
    note: "Approximate: based on SLA's Bala's Table; reproduction not yet verified against the official table (rows 57–98 disputed).",
  },
} as const satisfies Record<string, RuleMeta>;

export type RuleKey = keyof typeof RULE_META;

/** Verification status per rule, for UI badges: anything not "verified-*" needs an "indicative" note. */
export const RULE_STATUS = Object.fromEntries(Object.entries(RULE_META).map(([k, v]) => [k, v.status])) as { [K in RuleKey]: (typeof RULE_META)[K]["status"] };

/** True when the UI must show an "indicative / check with the agency" disclaimer next to a result using this rule. */
export function ruleNeedsDisclaimer(key: RuleKey): boolean {
  return !RULE_META[key].status.startsWith("verified");
}
