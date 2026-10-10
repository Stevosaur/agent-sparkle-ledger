import "server-only";
import { site } from "@/lib/config/site";
import {
  ABSD_RATES,
  BANK_LTV,
  BANK_MAX_TENURE,
  BANK_STRESS_RATE_PCT,
  BSD_RESIDENTIAL,
  CPF_LEASE_COVER_AGE,
  CPF_MIN_REMAINING_LEASE,
  HDB_LEASE_YEARS,
  HDB_LOAN_LTV,
  HDB_LOAN_MAX_TENURE,
  HDB_LOAN_RATE_PCT,
  HDB_LOAN_STRESS_RATE_PCT,
  HDB_MOP_YEARS,
  HDB_MOP_YEARS_PLUS_PRIME,
  LTV_AGE_LIMIT,
  LTV_TENURE_THRESHOLD,
  MSR_LIMIT,
  SSD_FROM_2017_03_11,
  SSD_FROM_2025_07_04,
  TDSR_LIMIT,
  type BuyerProfile,
} from "@/lib/calc/rules";
import { absdRate, additionalBuyerStampDuty, buyerStampDuty, jointAbsdRate, sellerStampDuty } from "@/lib/calc/stamp-duty";
import { bankLtv, maxServiceableLoan } from "@/lib/calc/loan";
import { monthlyPayment, totalInterest } from "@/lib/calc/mortgage";
import { BALA_TABLE_STATUS, balaLookup, balaPct, balaRatio, cpfUsage, remainingLeaseYears } from "@/lib/calc/lease";
import { enblocTier } from "@/lib/calc/enbloc";
import { affordability } from "@/lib/calc/affordability";
import { formatPct, formatSgd, sqmToSqft } from "@/lib/format";
import type { Article, ArticleBlock } from "./types";

/**
 * Evergreen explainers. Facts come from src/lib/calc/rules.ts and docs/research/*.md; every worked
 * example is computed with the same calculator functions the tools use, so the text can never drift
 * from the rules in code. Hypothetical inputs are labelled as examples.
 */

export const WRITTEN = "2026-10-10";
export const AUTHOR = `${site.name} Research`;

const p = (text: string): ArticleBlock => ({ type: "paragraph", text });
const h = (text: string): ArticleBlock => ({ type: "heading", text });
const ul = (items: string[]): ArticleBlock => ({ type: "list", items });
const ol = (items: string[]): ArticleBlock => ({ type: "list", items, ordered: true });
const table = (head: string[], rows: string[][], caption?: string, note?: string): ArticleBlock => ({ type: "table", head, rows, caption, note });

const pct = (rate: number, digits = 0) => formatPct(rate, digits);
const years = (n: number) => `${n} year${n === 1 ? "" : "s"}`;
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

const IRAS_RATES = { label: "IRAS: stamp duty rates", url: "https://www.iras.gov.sg/quick-links/tax-rates/stamp-duty" };
const MAS_TDSR = { label: "MAS: calculating TDSR", url: "https://www.mas.gov.sg/regulation/explainers/tdsr-for-property-loans/calculating-tdsr" };
const MAS_MSR = { label: "MAS: MSR and TDSR rules", url: "https://www.mas.gov.sg/regulation/explainers/new-housing-loans/msr-and-tdsr-rules" };
const HDB_CREDIT = { label: "HDB: credit to finance a flat purchase", url: "https://www.hdb.gov.sg/residential/buying-a-flat/working-out-your-flat-budget/credit-to-finance-a-flat-purchase" };

/* ------------------------------------------------------------------ */
/* 1. Stamp duties                                                     */
/* ------------------------------------------------------------------ */

function bsdBandRows(): string[][] {
  const rows: string[][] = [];
  let lower = 0;
  for (const t of BSD_RESIDENTIAL) {
    const band = t.upTo == null ? `Above ${formatSgd(lower)}` : lower === 0 ? `First ${formatSgd(t.upTo)}` : `Next ${formatSgd(t.upTo - lower)} (to ${formatSgd(t.upTo)})`;
    rows.push([band, pct(t.rate)]);
    if (t.upTo != null) lower = t.upTo;
  }
  return rows;
}

function stampDuties(): Article {
  const bsd1m = buyerStampDuty(1_000_000);
  const bsd15 = buyerStampDuty(1_500_000);
  const bsd25 = buyerStampDuty(2_500_000);
  const absdSc2 = additionalBuyerStampDuty(1_500_000, "SC", 2);
  const absdSpr1 = additionalBuyerStampDuty(1_500_000, "SPR", 1);
  const joint = jointAbsdRate([
    { profile: "SC", propertyCount: 2 },
    { profile: "SPR", propertyCount: 1 },
  ]);
  const ssdNew = sellerStampDuty(1_400_000, utc(2025, 8, 1), utc(2027, 6, 1));
  const ssdOld = sellerStampDuty(2_000_000, utc(2024, 3, 1), utc(2026, 6, 1));
  const profiles: [BuyerProfile, string][] = [
    ["SC", "Singapore citizen"],
    ["SPR", "Singapore permanent resident"],
    ["FOREIGNER", "Foreigner"],
    ["ENTITY", "Entity (company, partnership and similar)"],
  ];
  const newRates = SSD_FROM_2025_07_04.rates;
  const oldRates = SSD_FROM_2017_03_11.rates;
  return {
    slug: "stamp-duties-bsd-absd-ssd",
    title: "Stamp duties on Singapore homes: BSD, ABSD and SSD with worked examples",
    description: "How Buyer's Stamp Duty, Additional Buyer's Stamp Duty and Seller's Stamp Duty are calculated, with examples computed from the current IRAS rates.",
    date: WRITTEN,
    author: AUTHOR,
    tags: ["Stamp duty", "Buying", "Selling"],
    plusOnly: false,
    teaserBlocks: 0,
    dataDriven: false,
    body: [
      p("Buying a home in Singapore comes with stamp duty, and selling one soon after buying can too. Three duties matter: Buyer's Stamp Duty (BSD), paid by the buyer; Additional Buyer's Stamp Duty (ABSD), which depends on who is buying and how many homes they own; and Seller's Stamp Duty (SSD), which applies when a home is sold within a few years of purchase."),
      h("Buyer's Stamp Duty"),
      p("BSD is charged on the higher of the purchase price and the market value. Like income tax, it is tiered: each slice of the value is taxed at its own rate. The residential rates below apply to documents executed on or after 15 Feb 2023, and IRAS rounds the duty down to the nearest dollar."),
      table(["Slice of price or value", "Rate"], bsdBandRows(), "Residential BSD rates"),
      p(`Worked example: on a ${formatSgd(1_000_000)} home, the slices add up to ${formatSgd(bsd1m.total)} of BSD.`),
      table(
        ["Slice", "Rate", "Duty"],
        bsd1m.tiers.map((t) => [`${formatSgd(t.from)} to ${formatSgd(t.from + t.taxable)}`, pct(t.rate), formatSgd(t.amount)]),
        `BSD on ${formatSgd(1_000_000)}`,
      ),
      p(`The same method gives ${formatSgd(bsd15.total)} on ${formatSgd(1_500_000)} and ${formatSgd(bsd25.total)} on ${formatSgd(2_500_000)}.`),
      h("Additional Buyer's Stamp Duty"),
      p("ABSD is a flat percentage of the full price (or market value, if higher), charged on top of BSD. The rate depends on the buyer's profile and on how many residential properties in Singapore they will own including this one; HDB flats count. These rates apply to acquisitions on or after 27 Apr 2023."),
      table(
        ["Buyer", "1st home", "2nd home", "3rd and later"],
        profiles.map(([key, label]) => [label, ...ABSD_RATES[key].map((r) => pct(r))]),
        "ABSD rates",
      ),
      p(`Worked examples at ${formatSgd(1_500_000)}: a Singapore citizen buying a second home pays ABSD of ${formatSgd(absdSc2.total)} (${pct(absdSc2.rate)}) on top of ${formatSgd(bsd15.total)} of BSD. A permanent resident buying a first home pays ${formatSgd(absdSpr1.total)} (${pct(absdSpr1.rate)}).`),
      p(`When two or more people buy together, the highest rate among them applies to the whole price. A citizen who already owns a home, buying with a permanent resident who owns none, pays ${pct(joint)} on the full price, not ${pct(absdRate("SPR", 1))}.`),
      p("IRAS grants remissions or refunds in some cases, for example for some married couples. These come with conditions, so check IRAS before relying on one."),
      h("Seller's Stamp Duty"),
      p(`SSD applies when a residential property is sold within a set holding period, at a flat rate on the higher of the selling price and market value. For properties acquired on or after 4 Jul 2025 the holding period is ${years(newRates.length)}; properties acquired from 11 Mar 2017 to 3 Jul 2025 keep the earlier ${oldRates.length}-year schedule.`),
      table(
        ["Sold within", "Acquired on or after 4 Jul 2025", "Acquired 11 Mar 2017 to 3 Jul 2025"],
        newRates.map((r, i) => [i === 0 ? "1 year" : `${i} to ${i + 1} years`, pct(r), oldRates[i] != null ? pct(oldRates[i]) : "No SSD"]),
        "SSD rates by holding period",
      ),
      p(`Worked example: bought on 1 Aug 2025 and sold on 1 Jun 2027 for ${formatSgd(1_400_000)}. That is more than one year but not more than two, so SSD is ${pct(ssdNew.rate)}, or ${formatSgd(ssdNew.total)}.`),
      p(`A home bought on 1 Mar 2024 and sold on 1 Jun 2026 for ${formatSgd(2_000_000)} falls under the earlier schedule; in its third year SSD is ${pct(ssdOld.rate)}, or ${formatSgd(ssdOld.total)}. Sold after 1 Mar 2027, it would pay none.`),
      p("HDB flat owners are effectively unaffected by SSD because of the Minimum Occupation Period, which keeps them from selling within the SSD window."),
      p("These are estimates based on IRAS rates in force from 15 Feb 2023 (BSD), 27 Apr 2023 (ABSD) and 4 Jul 2025 (SSD). Check IRAS for your own case."),
    ],
    sources: [
      IRAS_RATES,
      { label: "IRAS: Additional Buyer's Stamp Duty", url: "https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/additional-buyer's-stamp-duty-(absd)" },
      { label: "MND: SSD holding period extended (3 Jul 2025)", url: "https://www.mnd.gov.sg/newsroom/press-releases/view/extension-of-the-holding-period-of-seller's-stamp-duty-(ssd)-and-higher-ssd-rates-for-residential-properties" },
    ],
    related: [
      { label: "Affordability calculator (includes stamp duties)", href: "/affordability/" },
      { label: "Valuation", href: "/valuation/" },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* 2. HDB Minimum Occupation Period                                    */
/* ------------------------------------------------------------------ */

function mop(): Article {
  const exampleCompleted = 2021;
  return {
    slug: "hdb-minimum-occupation-period",
    title: "The HDB Minimum Occupation Period (MOP), explained",
    description: "How long you must live in an HDB flat before selling it, renting it out whole or buying private property, and why MOP dates drive upgrader demand.",
    date: WRITTEN,
    author: AUTHOR,
    tags: ["HDB", "MOP", "Upgrading"],
    plusOnly: false,
    teaserBlocks: 0,
    dataDriven: false,
    body: [
      p(`The Minimum Occupation Period (MOP) is how long HDB flat owners must live in their flat before they can sell it or buy a private home. For most flats it is ${years(HDB_MOP_YEARS)}; the newer Plus and Prime flats carry ${years(HDB_MOP_YEARS_PLUS_PRIME)}.`),
      h("How long the MOP is"),
      table(
        ["Flat", "MOP"],
        [
          ["Standard flats (BTO from the October 2024 sales exercise)", years(HDB_MOP_YEARS)],
          ["Flats launched before October 2024", years(HDB_MOP_YEARS)],
          ["Resale flats bought on the open market, with or without CPF housing grants", years(HDB_MOP_YEARS)],
          ["Plus and Prime flats, new or resale", years(HDB_MOP_YEARS_PLUS_PRIME)],
          ["Flats bought under the Fresh Start Housing Scheme", years(20)],
          ["1-room flats", "No MOP"],
        ],
        "MOP by type of flat",
      ),
      p("HDB counts the MOP from the date you collect the keys, and leaves out any period when you do not live in the flat. If the whole flat is rented out, that time does not count towards the MOP either."),
      h("What changes after the MOP"),
      ul([
        "You may sell the flat.",
        "Owners of Standard flats may rent out the whole flat. Plus and Prime flats can never be rented out whole; owners of 3-room or larger flats, Plus and Prime included, may rent out bedrooms with HDB approval.",
        "You may buy private residential property, in Singapore or overseas.",
      ]),
      p(`Buying a private home while keeping the flat makes it your second residential property for ABSD. For a Singapore citizen, the ABSD rate on a second property is ${pct(absdRate("SC", 2))} under the rates in force from 27 Apr 2023.`),
      p("Plus and Prime flats also have a subsidy recovery: when the flat is sold, the owner pays HDB a percentage of the resale price or valuation, whichever is higher. HDB fixes that percentage for each project at launch, and these flats can only be sold to Singaporean households that meet the eligibility conditions."),
      h("Why MOP dates matter for prices"),
      p(`Owners who reach their MOP become free to sell or to buy private property, so the number of flats reaching MOP in an area is a rough gauge of potential buyers for nearby private homes. Public resale records don't show when a particular flat's MOP ends, so we estimate it at block level as the completion year plus ${years(HDB_MOP_YEARS)}: a block completed in ${exampleCompleted} reaches its MOP around ${exampleCompleted + HDB_MOP_YEARS}. Treat these dates as estimates; check your own MOP date on My HDBPage.`),
      p("Our demand-vs-supply ranking compares, for each HDB town, the flats reaching MOP in the next three years with the new-launch units nearby."),
    ],
    sources: [
      { label: "HDB: conditions after buying (MOP)", url: "https://www.hdb.gov.sg/cs/infoweb/residential/buying-a-flat/conditions-after-buying?anchor=mop/" },
      { label: "HDB: eligibility to sell a flat", url: "https://www.hdb.gov.sg/cs/infoweb/residential/selling-a-flat/eligibility/" },
      { label: "HDB: Standard, Plus and Prime flats", url: "https://www.mynicehome.gov.sg/hdb-how-to/buy-your-flat/what-are-standard-prime-and-plus-hdb-flats/" },
      { label: "HDB: fulfilling the MOP to acquire private property", url: "https://www.hdb.gov.sg/business-partners/estate-agents-and-salespersons/letters-to-keos/fulfilling-the-minimum-occupation-period-to-acquire-private-residential-property" },
    ],
    related: [
      { label: "Upgrader demand vs new-launch supply ranking", href: "/lists/demand-supply/" },
      { label: "Stamp duties explained", href: "/news/stamp-duties-bsd-absd-ssd/" },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* 3. SORA loans                                                       */
/* ------------------------------------------------------------------ */

function sora(): Article {
  const principal = 500_000;
  const tenure = 25;
  const rates = [
    { rate: HDB_LOAN_RATE_PCT, label: "HDB concessionary rate" },
    { rate: HDB_LOAN_STRESS_RATE_PCT, label: "HDB eligibility floor" },
    { rate: BANK_STRESS_RATE_PCT, label: "MAS stress-test floor for bank loans" },
  ];
  return {
    slug: "sora-home-loans-explained",
    title: "SORA home loans explained",
    description: "What SORA is, how SORA-pegged mortgage packages reprice, and why banks test what you can borrow at a higher rate than you pay.",
    date: WRITTEN,
    author: AUTHOR,
    tags: ["Mortgage", "SORA", "Interest rates"],
    plusOnly: false,
    teaserBlocks: 0,
    dataDriven: false,
    body: [
      p("SORA, the Singapore Overnight Rate Average, is the benchmark for floating-rate home loans in Singapore; it has replaced SIBOR and SOR. It is the volume-weighted average rate of borrowing transactions in the unsecured overnight interbank SGD cash market between 8:00am and 6:15pm, and MAS publishes it free on its website by 9:00am the next business day."),
      h("Compounded SORA"),
      p("Loans don't use the overnight figure directly. They use compounded SORA over one, three or six months, which MAS publishes at 9am every business day. The 3-month rate compounds each day's published SORA over the previous three months, so it looks back rather than forward."),
      h("How SORA packages work"),
      ul([
        "Rate = compounded SORA (1-month or 3-month) plus a fixed spread.",
        "The spread is often set by loan year, for example year 1, year 2, year 3 and 'thereafter'.",
        "A 3-month SORA package reprices every three months; a 1-month package reprices every month.",
        "Fixed-rate packages fix the rate for an initial period, then switch to a floating rate.",
        "Many packages have a lock-in period with a penalty for early repayment or repricing. Terms vary by bank, so compare the full package, not just the headline rate.",
      ]),
      h("Stress tests: why approval uses a higher rate"),
      p(`Banks don't assess what you can borrow at today's rate. Under MAS rules, TDSR and MSR are calculated with a medium-term rate of at least ${BANK_STRESS_RATE_PCT}% a year for residential property loans (for options granted from 30 Sep 2022), or the loan's own rate if that is higher.`),
      p(`The HDB concessionary loan is not pegged to SORA. Its rate is 0.1 percentage point above the CPF Ordinary Account rate, which puts it at ${HDB_LOAN_RATE_PCT}% a year with the OA rate at 2.5%, and HDB assesses loan eligibility at a floor of ${HDB_LOAN_STRESS_RATE_PCT}%.`),
      h("What a rate difference costs"),
      p(`Example: a ${formatSgd(principal)} loan repaid over ${tenure} years at each of the rates above.`),
      table(
        ["Rate", "Monthly instalment", "Total interest"],
        rates.map((r) => [`${r.rate}% (${r.label})`, formatSgd(monthlyPayment(principal, r.rate, tenure)), formatSgd(totalInterest(principal, r.rate, tenure))]),
        `${formatSgd(principal)} over ${tenure} years`,
        "Monthly compounding, equal instalments; bank rounding may differ slightly.",
      ),
      p("For the latest published SORA rates, see our mortgage rates page."),
    ],
    sources: [
      { label: "MAS: SORA", url: "https://www.mas.gov.sg/monetary-policy/sora" },
      { label: "MAS: user guide to SORA Index and Compounded SORA", url: "https://www.mas.gov.sg/-/media/mas/frn/user-guide-for-sora-index-compounded-sora-and-mas-frn.pdf" },
      { label: "ABS: about SORA", url: "https://abs.org.sg/benchmark-rates/about-sora" },
      MAS_TDSR,
    ],
    related: [
      { label: "Mortgage rates", href: "/mortgage-rates/" },
      { label: "TDSR, MSR and LTV explained", href: "/news/tdsr-msr-ltv-explained/" },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* 4. Lease decay and Bala's Table (Plus)                              */
/* ------------------------------------------------------------------ */

function leaseDecay(): Article {
  const exampleLeaseStart = 1985;
  const exampleYear = 2026;
  const left = remainingLeaseYears(exampleLeaseStart, exampleYear);
  const youngest = 50;
  const lease = 40;
  const cpf = cpfUsage(lease, youngest);
  // Only rows that several independent reproductions agree on are quoted, always with the table's status label.
  const balaRows = [...BALA_TABLE_STATUS.corroboratedYears]
    .sort((a, b) => b - a)
    .map((y) => ({ y, row: balaLookup(y) }))
    .filter((r): r is { y: number; row: NonNullable<ReturnType<typeof balaLookup>> } => r.row != null && r.row.rowStatus === "corroborated");
  const ratio60 = balaRatio(60, 99);
  const balaBlocks: ArticleBlock[] =
    balaRows.length >= 3
      ? [
          table(
            ["Years left", "% of freehold land value"],
            balaRows.map(({ y, row }) => [String(y), `${row.pct.toFixed(1)}%`]),
            "Bala's Table: the rows that independent reproductions agree on",
            `${BALA_TABLE_STATUS.label}. Land only; not a valuation of a flat.`,
          ),
          ...(ratio60 != null
            ? [p(`Reading it: with 60 years left, the land is worth about ${formatPct(ratio60)} of the value with a fresh 99-year lease (${balaPct(60)!.toFixed(1)} ÷ ${balaPct(99)!.toFixed(1)}). The top of the scale is ${balaPct(99)!.toFixed(1)}%, not 100%, because even a new 99-year lease is worth less than freehold.`)]
            : []),
        ]
      : [p("We will show Bala's Table values here once our copy of the table has been checked against the official version; until then this guide describes its shape without numbers.")];
  return {
    slug: "lease-decay-balas-table",
    title: "Lease decay, remaining lease and Bala's Table",
    description: "How a shrinking lease affects what you can borrow and use from CPF, what Bala's Table measures, and what it does not.",
    date: WRITTEN,
    author: AUTHOR,
    tags: ["HDB", "Lease", "CPF"],
    plusOnly: true,
    teaserBlocks: 2,
    dataDriven: false,
    body: [
      p(`Every HDB flat sits on a ${HDB_LEASE_YEARS}-year lease counted from the lease commencement date, which all flats in a block share. Once the remaining lease gets short enough, it starts to limit how much CPF buyers can use and how much they can borrow.`),
      p("This guide covers how remaining lease is measured, the CPF and loan rules tied to it, and what SLA's Bala's Table can and cannot tell you."),
      h("Measuring remaining lease"),
      p(`HDB's resale records publish the remaining lease at the time of sale from 2015 onwards. For older records we estimate it from the lease commencement year, which can be out by up to a year because only the year is published. Example: a block whose lease began in ${exampleLeaseStart} has about ${Math.round(left)} years left in ${exampleYear}.`),
      h("CPF and loan rules"),
      ul([
        `CPF savings cannot be used for a flat with less than ${CPF_MIN_REMAINING_LEASE} years of lease left.`,
        `Full CPF use (up to the Valuation Limit) needs the remaining lease to cover the youngest buyer to age ${CPF_LEASE_COVER_AGE}.`,
        "If it does not, CPF use is pro-rated, and HDB pro-rates its housing loan on the same basis.",
      ]),
      p(`Example: the youngest buyer is ${youngest} and the flat has ${lease} years left, so the lease runs out at age ${youngest + lease}, ${CPF_LEASE_COVER_AGE - youngest - lease} years short of ${CPF_LEASE_COVER_AGE}. CPF use is pro-rated to about ${formatPct(cpf.shareOfValuationLimit)} of the Valuation Limit (${lease} ÷ ${CPF_LEASE_COVER_AGE - youngest}). Check the exact figure with the CPF Board for your case.`),
      h("Bala's Table"),
      p("Bala's Table is the table the Singapore Land Authority uses to value a leasehold interest in land as a percentage of the freehold value, for 1 to 99 years remaining. SLA uses it to work out premiums on State land leases. Its curve falls slowly while the lease is long, steepens in the middle years and drops fastest in the final decades."),
      ...balaBlocks,
      p("Read it with care:"),
      ul([
        "It values land only. A flat's price also reflects the building, location, transport, flat size and demand, so multiplying a price by a Bala percentage does not give a valuation.",
        "It is a valuation convention, not market evidence. The Centre for Liveable Cities has said the table and its implied discount rate are 'not an exact science'.",
        "Lease top-up premiums are assessed case by case by SLA's Chief Valuer, so the table is not a top-up price.",
      ]),
      p("To see how remaining lease and price per square foot line up in recent resales, open the remaining-lease module on our insights page."),
    ],
    sources: [
      { label: "SLA: differential premium policy (Appendix 1, leasehold values as a percentage of freehold)", url: "https://www.sla.gov.sg/qql/slot/u143/State-Land-n-Property/Land%20Sales%20and%20Lease%20Management/DP%20policy.pdf" },
      { label: "Centre for Liveable Cities: Bala's Table", url: "https://isomer-user-content.by.gov.sg/50/ade6cd16-890b-4a1b-9d1d-d0e189daba03/balas-table.pdf" },
      { label: "CPF: using your CPF to buy a home", url: "https://www.cpf.gov.sg/member/home-ownership/using-your-cpf-to-buy-a-home" },
      HDB_CREDIT,
    ],
    related: [
      { label: "Remaining lease and price psf (insights)", href: "/insights/#m-lease-vs-psf" },
      { label: "HDB MOP explained", href: "/news/hdb-minimum-occupation-period/" },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* 5. Reading a transaction record                                     */
/* ------------------------------------------------------------------ */

function readingRecords(): Article {
  const sqm = 93;
  const price = 600_000;
  const sqft = sqmToSqft(sqm);
  const psf = price / sqft;
  return {
    slug: "reading-a-transaction-record",
    title: "How to read an HDB or condo transaction record",
    description: "What each field in HDB resale and URA private transaction records means, and how we turn them into price per square foot.",
    date: WRITTEN,
    author: AUTHOR,
    tags: ["Data", "HDB", "Condo"],
    plusOnly: false,
    teaserBlocks: 0,
    dataDriven: false,
    body: [
      p("Every price on this site comes from a government transaction record. Knowing what the fields mean, and what they leave out, helps you compare sales fairly."),
      h("HDB resale records (data.gov.sg)"),
      table(
        ["Field", "What it means"],
        [
          ["Month", "The approval month for sales up to Feb 2012, and the registration month from Mar 2012."],
          ["Town, block, street", "Where the flat is. Our block pages group sales by block and street."],
          ["Flat type", "1 ROOM to EXECUTIVE and MULTI-GENERATION."],
          ["Storey range", "A band such as '04 TO 06', never the exact floor. Records from Mar 2012 to Dec 2014 also use five-storey bands."],
          ["Floor area", "Square metres, including any recess area purchased, space added under HDB upgrading programmes and roof terraces."],
          ["Flat model", "The flat's model, such as Improved, New Generation, Model A or DBSS."],
          ["Lease commence date", "The year the 99-year lease began (year only)."],
          ["Remaining lease", "Published from 2015 onwards, at the time of sale."],
          ["Resale price", "The price in Singapore dollars."],
        ],
      ),
      h("Price per square foot"),
      p(`We convert floor area at 10.7639 sq ft per square metre and divide the price by it. An example record of ${sqm} square metres sold for ${formatSgd(price)} is ${Math.round(sqft).toLocaleString("en-SG")} sq ft, or ${formatSgd(psf)} psf. When we group sales by height, we use the middle of the storey band, for example 5 for '04 TO 06'.`),
      h("Private records (URA)"),
      table(
        ["Field", "What it means"],
        [
          ["Contract date", "The month and year of the sale contract (not the caveat date)."],
          ["Type of sale", "New Sale (from the developer), Sub Sale (a resale before the project is completed) or Resale."],
          ["Floor range", "A five-storey band such as '06-10'; '-' for landed homes."],
          ["Area and type of area", "Strata area for apartments, land area for landed homes."],
          ["Number of units", "More than 1 means a bulk purchase: price and area are totals, so we leave these out of medians."],
          ["Market segment", "CCR, RCR or OCR, as assigned by URA for each project."],
          ["Tenure", "Freehold, or the lease length and start year."],
        ],
      ),
      p("URA's free data service covers the last five years of private transactions and does not include unit numbers, so our private pages show floor ranges rather than exact units."),
      h("Rental records"),
      ul([
        "HDB rental approvals give the approval month, block, flat type and monthly rent. The rents are declared by flat owners and are not verified by HDB.",
        "URA rental contracts give the lease start month, monthly rent, number of bedrooms and a floor-area band, so rent per square foot is approximate: we use the middle of the band.",
      ]),
    ],
    sources: [
      { label: "data.gov.sg: HDB resale flat prices", url: "https://data.gov.sg/collections/189/view" },
      { label: "data.gov.sg: HDB renting out of flats", url: "https://data.gov.sg/datasets/d_c9f57187485a850908655db0e8cfe651/view" },
      { label: "URA: property market information", url: "https://eservice.ura.gov.sg/property-market-information/pmiResidentialTransactionSearch" },
    ],
    related: [
      { label: "Insights", href: "/insights/" },
      { label: "Property analysis", href: "/property-analysis/" },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* 6. TDSR, MSR and LTV                                                */
/* ------------------------------------------------------------------ */

function tdsr(): Article {
  // Example A: HDB flat with a bank loan
  const incomeA = 10_000;
  const priceA = 700_000;
  const servA = maxServiceableLoan({ monthlyIncome: incomeA, monthlyDebts: 0, propertyClass: "hdb", tenureYears: 25 });
  const ltvA = bankLtv("hdb", 0, 25, 35);
  const ltvA30 = bankLtv("hdb", 0, 30, 35);
  const loanA = Math.min(servA.maxLoan, ltvA.ltv * priceA);
  // Example B: private condo with a car loan
  const incomeB = 10_000;
  const debtsB = 800;
  const priceB = 1_500_000;
  const servB = maxServiceableLoan({ monthlyIncome: incomeB, monthlyDebts: debtsB, propertyClass: "private", tenureYears: 30 });
  const ltvB = bankLtv("private", 0, 30, 30);
  const loanB = Math.min(servB.maxLoan, ltvB.ltv * priceB);
  // Example C: HDB loan
  const incomeC = 8_000;
  const priceC = 600_000;
  const servC = maxServiceableLoan({ monthlyIncome: incomeC, monthlyDebts: 0, propertyClass: "hdb", tenureYears: HDB_LOAN_MAX_TENURE }, "hdb");
  const loanC = Math.min(servC.maxLoan, HDB_LOAN_LTV * priceC);
  const loanLabels = ["No outstanding housing loan", "One outstanding housing loan", "Two or more"];
  return {
    slug: "tdsr-msr-ltv-explained",
    title: "TDSR, MSR and LTV: how much can you borrow?",
    description: "The three limits on a Singapore home loan, how the stress-test rate works, and worked examples for HDB flats and private homes.",
    date: WRITTEN,
    author: AUTHOR,
    tags: ["Mortgage", "Loans", "Buying"],
    plusOnly: false,
    teaserBlocks: 0,
    dataDriven: false,
    body: [
      p("Three rules decide the largest home loan you can take in Singapore: the Total Debt Servicing Ratio (TDSR), the Mortgage Servicing Ratio (MSR) and the loan-to-value (LTV) limit. The smallest of the loans they allow is the one you get."),
      h("TDSR and MSR"),
      ul([
        `TDSR: all your monthly debt repayments, including the new home loan, car loans, other property loans and card minimums, may not exceed ${pct(TDSR_LIMIT)} of gross monthly income (options granted from 16 Dec 2021).`,
        `MSR: repayments on property loans may not exceed ${pct(MSR_LIMIT)} of gross monthly income. It applies to HDB flats and to executive condominiums bought from the developer, on top of TDSR.`,
        `Both are tested at a stress rate, not your actual rate: at least ${BANK_STRESS_RATE_PCT}% a year for bank loans on residential property, or the loan's own rate if higher. HDB assesses its own loans at a floor of ${HDB_LOAN_STRESS_RATE_PCT}%.`,
      ]),
      h("Loan-to-value limits for bank loans"),
      table(
        ["Outstanding housing loans", "Standard LTV", "Reduced LTV", "Minimum cash down payment"],
        BANK_LTV.map((row, i) => [loanLabels[i], pct(row.standard), pct(row.reduced), row.minCashStandard === row.minCashReduced ? pct(row.minCashStandard) : `${pct(row.minCashStandard)} (${pct(row.minCashReduced)} if reduced)`]),
        "MAS LTV limits",
        `The reduced limit applies if the tenure is over ${LTV_TENURE_THRESHOLD.hdb} years for an HDB flat (${LTV_TENURE_THRESHOLD.private} years for other homes), or if the loan runs past age ${LTV_AGE_LIMIT}. Maximum bank tenure is ${BANK_MAX_TENURE.hdb} years for HDB flats and ${BANK_MAX_TENURE.private} years for other homes.`,
      ),
      p(`An HDB concessionary loan has its own limit: ${pct(HDB_LOAN_LTV)} of the lower of price and value (for applications from 20 Aug 2024), over at most ${HDB_LOAN_MAX_TENURE} years, with the ${pct(MSR_LIMIT)} MSR.`),
      h("Example 1: resale HDB flat with a bank loan"),
      p(`A couple earning ${formatSgd(incomeA)} a month with no other debts, average age 35, buys a ${formatSgd(priceA)} flat over 25 years. MSR caps the instalment at ${formatSgd(servA.maxInstalment)}, which at the ${servA.stressRatePct}% stress rate supports ${formatSgd(servA.maxLoan)}. The ${pct(ltvA.ltv)} LTV limit allows ${formatSgd(ltvA.ltv * priceA)}, so the loan is ${formatSgd(loanA)}. Stretching to 30 years would cut the LTV to ${pct(ltvA30.ltv)}, or ${formatSgd(ltvA30.ltv * priceA)}, because it exceeds ${LTV_TENURE_THRESHOLD.hdb} years for an HDB flat.`),
      h("Example 2: private condo with a car loan"),
      p(`A buyer aged 30 earning ${formatSgd(incomeB)} with a ${formatSgd(debtsB)} monthly car loan buys a ${formatSgd(priceB)} condo over 30 years. TDSR leaves ${formatSgd(servB.maxInstalment)} a month for the mortgage, which supports ${formatSgd(servB.maxLoan)} at ${servB.stressRatePct}%. LTV would allow ${formatSgd(ltvB.ltv * priceB)}, so TDSR binds and the loan is ${formatSgd(loanB)}.`),
      h("Example 3: HDB concessionary loan"),
      p(`A household earning ${formatSgd(incomeC)} buys a ${formatSgd(priceC)} resale flat with an HDB loan over ${HDB_LOAN_MAX_TENURE} years. MSR allows ${formatSgd(servC.maxInstalment)} a month, which supports ${formatSgd(servC.maxLoan)} at the ${servC.stressRatePct}% floor; LTV caps it at ${formatSgd(HDB_LOAN_LTV * priceC)}. At the ${HDB_LOAN_RATE_PCT}% rate actually charged, the instalment on ${formatSgd(loanC)} is ${formatSgd(monthlyPayment(loanC, HDB_LOAN_RATE_PCT, HDB_LOAN_MAX_TENURE))} a month.`),
      p("These examples assume fixed salaries counted in full and no other debts unless stated. Banks may round differently; your bank or HDB gives the final figure."),
    ],
    sources: [MAS_TDSR, MAS_MSR, HDB_CREDIT, { label: "HDB: measures of 19 Aug 2024 (HDB loan LTV)", url: "https://www.hdb.gov.sg/business-partners/estate-agents-and-salespersons/letters-to-keos/measures-to-cool-the-hdb-resale-market-and-provide-greater-support-for-first-time-home-buyers" }],
    related: [
      { label: "Affordability calculator", href: "/affordability/" },
      { label: "SORA home loans explained", href: "/news/sora-home-loans-explained/" },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* 7. Executive condominiums                                           */
/* ------------------------------------------------------------------ */

function ecs(): Article {
  const income = 12_000;
  const debts = 1_000;
  const tenure = 30;
  const fromDeveloper = maxServiceableLoan({ monthlyIncome: income, monthlyDebts: debts, propertyClass: "ec-new", tenureYears: tenure });
  const resale = maxServiceableLoan({ monthlyIncome: income, monthlyDebts: debts, propertyClass: "ec-resale", tenureYears: tenure });
  const ec = enblocTier({ tenureKind: "leasehold", leaseYears: 99, startYear: 1995, currentYear: 2026, propertyTypes: ["Executive Condominium"] });
  return {
    slug: "executive-condominiums-loans-and-data",
    title: "Executive condominiums: loan rules and how to read the data",
    description: "How bank loan limits differ for ECs bought from a developer and on the resale market, and how EC prices compare with condos in the data.",
    date: WRITTEN,
    author: AUTHOR,
    tags: ["EC", "Mortgage", "Data"],
    plusOnly: false,
    teaserBlocks: 0,
    dataDriven: false,
    body: [
      p("Executive condominiums (ECs) look like condos, but loan rules and the data treat them as their own category. In URA's transaction records they carry the property type 'Executive Condominium', and on this site they are tracked separately from condos and apartments."),
      h("Loan limits depend on how you buy"),
      ul([
        `Buying an EC from the developer: bank loans are subject to the ${pct(MSR_LIMIT)} Mortgage Servicing Ratio as well as the ${pct(TDSR_LIMIT)} TDSR (for options granted from 10 Dec 2013).`,
        "Buying an EC on the resale market after its Minimum Occupation Period: only TDSR applies, as for a private condo.",
        `The maximum bank loan tenure is ${BANK_MAX_TENURE.private} years, as for other non-HDB homes.`,
      ]),
      p(`Example: a household earning ${formatSgd(income)} a month with ${formatSgd(debts)} of other monthly debts, borrowing over ${tenure} years. Buying from the developer, the binding limit is ${fromDeveloper.binding.toUpperCase()} at ${formatSgd(fromDeveloper.maxInstalment)} a month, which supports about ${formatSgd(fromDeveloper.maxLoan)} at the ${fromDeveloper.stressRatePct}% stress rate. On the resale market, TDSR allows ${formatSgd(resale.maxInstalment)} a month, or about ${formatSgd(resale.maxLoan)}.`),
      h("EC prices against condos"),
      p("The charts below show monthly median price per square foot for ECs and for condos and apartments, from URA records (bulk deals excluded)."),
      { type: "chart", title: "Median price psf: executive condominiums vs condos", seriesKey: "private:ALL:EC", compareKeys: ["private:ALL:Condo"], metric: "psf" },
      h("En bloc"),
      p(`Our en-bloc tiers rate ECs as ${ec.tier.toLowerCase()} candidates. ${ec.reasons[0]}`),
    ],
    sources: [MAS_MSR, { label: "MAS: refining the EC housing scheme (9 Dec 2013)", url: "https://www.mas.gov.sg/-/media/mas-media-library/publications/macroprudential-policies-in-singapore/press-release--refining-the-ec-housing-scheme-9-dec-2013.pdf" }],
    related: [
      { label: "New launches", href: "/listings/" },
      { label: "TDSR, MSR and LTV explained", href: "/news/tdsr-msr-ltv-explained/" },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* 8. En-bloc basics (Plus)                                            */
/* ------------------------------------------------------------------ */

function enbloc(): Article {
  const year = 2026;
  const cases: { label: string; kind: "freehold" | "leasehold"; leaseYears: number | null; age: number }[] = [
    { label: "Freehold, 32 years old", kind: "freehold", leaseYears: null, age: 32 },
    { label: "Freehold, 22 years old", kind: "freehold", leaseYears: null, age: 22 },
    { label: "99-year lease, 45 years old", kind: "leasehold", leaseYears: 99, age: 45 },
    { label: "99-year lease, 28 years old", kind: "leasehold", leaseYears: 99, age: 28 },
    { label: "99-year lease, 15 years old", kind: "leasehold", leaseYears: 99, age: 15 },
  ];
  const rows = cases.map((c) => {
    const r = enblocTier({ tenureKind: c.kind, leaseYears: c.leaseYears, startYear: year - c.age, currentYear: year, propertyTypes: ["Condominium"] });
    return [c.label, r.tier === "Unlikely" ? "Unlikely" : `Tier ${r.tier}`, r.label];
  });
  return {
    slug: "en-bloc-basics",
    title: "En-bloc basics: what makes a development a collective-sale candidate",
    description: "Why tenure and age matter for collective sales, how our en-bloc tiers work, and how HDB redevelopment schemes differ.",
    date: WRITTEN,
    author: AUTHOR,
    tags: ["En bloc", "Condo", "Lease"],
    plusOnly: true,
    teaserBlocks: 2,
    dataDriven: false,
    body: [
      p("In a collective sale, often called an en bloc, the owners of a development sell the whole property together. Whether a development is a realistic candidate depends heavily on two things you can check from public records: its tenure and its age."),
      p("This guide explains why, shows how our en-bloc tiers turn those two facts into a rating, and covers how HDB redevelopment differs."),
      h("Why tenure matters"),
      p("Redeveloping a 99-year leasehold site usually needs a lease top-up, which raises the land cost. Freehold and 999-year sites need no top-up. SLA's Chief Valuer assesses lease top-up premiums case by case."),
      p("Collective sales have typically involved older freehold or 999-year developments, or 99-year developments where a lease top-up made sense."),
      h("How our en-bloc tiers work"),
      ul([
        "Tier A: freehold or 999-year, about 30 years or older.",
        "Tier B: freehold or 999-year and 20 years or older, or a 99-year lease that is 40 years or older.",
        "Tier C: a 99-year lease that is 25 years or older.",
        "Executive condominiums are rated unlikely while EC resale restrictions apply.",
      ]),
      table(["Example development", "Tier", "Reading"], rows, "Tiers computed with our en-bloc rule"),
      p("The tier is a transparent heuristic, not a prediction. A sale also depends on owners agreeing to sell, the value of the land and planning rules, none of which the tier models. For freehold projects we measure age from the earliest recorded sale, which understates age when the sales history is short."),
      h("HDB flats are different"),
      p("HDB owners don't sell their blocks collectively. Under the Selective En bloc Redevelopment Scheme (SERS), which is still active, the government selects HDB blocks for redevelopment and HDB publishes rehousing options for affected owners. The Voluntary Early Redevelopment Scheme (VERS) has been announced, but no flats have been offered under it as at Oct 2026; check HDB for updates."),
    ],
    sources: [
      { label: "SLA: differential premium policy", url: "https://www.sla.gov.sg/qql/slot/u143/State-Land-n-Property/Land%20Sales%20and%20Lease%20Management/DP%20policy.pdf" },
      { label: "HDB: SERS rehousing options", url: "https://www.hdb.gov.sg/residential/living-in-an-hdb-flat/sers-and-upgrading-programmes/sers/sers-flat-owners/rehousing-options" },
    ],
    related: [
      { label: "En-bloc potential ranking", href: "/lists/enbloc/" },
      { label: "Lease decay and Bala's Table", href: "/news/lease-decay-balas-table/" },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* 9. Affordability worked example                                     */
/* ------------------------------------------------------------------ */

function affordabilityArticle(): Article {
  const base = { cash: 150_000, cpfOa: 100_000, monthlyIncome: 10_000, monthlyDebts: 0, age: 35, buyerProfile: "SC" as const, propertyCount: 1, outstandingLoans: 0 };
  const privateBank = affordability({ ...base, propertyClass: "private", lender: "bank", tenureYears: 30, interestRatePct: BANK_STRESS_RATE_PCT });
  const hdbLoan = affordability({ ...base, propertyClass: "hdb", lender: "hdb", tenureYears: HDB_LOAN_MAX_TENURE, interestRatePct: HDB_LOAN_RATE_PCT });
  const limit = (b: "ltv-funds" | "servicing") => (b === "servicing" ? "Income (TDSR/MSR)" : "Cash, CPF and LTV");
  return {
    slug: "how-much-home-can-you-afford",
    title: "How much home can you afford? A worked example",
    description: "The four limits that cap your budget, cash and CPF, stamp duty, loan-to-value and debt servicing, worked through for one household.",
    date: WRITTEN,
    author: AUTHOR,
    tags: ["Affordability", "Buying", "Mortgage"],
    plusOnly: false,
    teaserBlocks: 0,
    dataDriven: false,
    body: [
      p("Your budget is the highest price that passes every limit at once. Four things decide it:"),
      ol([
        "Cash and CPF Ordinary Account savings must cover the down payment and stamp duties.",
        `For a bank loan, part of the down payment must be in cash (${pct(BANK_LTV[0].minCashStandard)} of the price for a first loan at the standard LTV).`,
        `The loan cannot exceed the LTV limit: ${pct(BANK_LTV[0].standard)} of the price for a first bank loan within the tenure and age limits, or ${pct(HDB_LOAN_LTV)} for an HDB loan.`,
        "The instalment at the stress-test rate must fit within TDSR, and MSR for HDB flats and new ECs.",
      ]),
      p(`Example household: Singapore citizens buying their first home, ${formatSgd(base.cash)} in cash, ${formatSgd(base.cpfOa)} in CPF Ordinary Accounts, ${formatSgd(base.monthlyIncome)} a month of fixed income, no other debts, average age ${base.age}.`),
      table(
        ["", "Private home, bank loan (30 years)", `HDB flat, HDB loan (${HDB_LOAN_MAX_TENURE} years)`],
        [
          ["Highest price", formatSgd(privateBank.maxPrice), formatSgd(hdbLoan.maxPrice)],
          ["Loan", formatSgd(privateBank.loan), formatSgd(hdbLoan.loan)],
          ["Down payment", formatSgd(privateBank.downpayment), formatSgd(hdbLoan.downpayment)],
          ["Buyer's Stamp Duty", formatSgd(privateBank.bsd), formatSgd(hdbLoan.bsd)],
          ["Monthly instalment", `${formatSgd(privateBank.monthlyPayment)} at ${BANK_STRESS_RATE_PCT}%`, `${formatSgd(hdbLoan.monthlyPayment)} at ${HDB_LOAN_RATE_PCT}%`],
          ["What limits the price", limit(privateBank.binding), limit(hdbLoan.binding)],
        ],
        "Worked example",
        "Computed with the same affordability calculator as our tool. Prices are rounded down to the nearest S$1,000.",
      ),
      p(`The private-home instalment is shown at the ${BANK_STRESS_RATE_PCT}% stress-test rate; your actual rate will usually differ. The HDB loan uses the ${HDB_LOAN_RATE_PCT}% concessionary rate. ABSD is nil here because both are citizens buying a first home.`),
      p("Try your own numbers in the affordability calculator."),
    ],
    sources: [MAS_TDSR, MAS_MSR, HDB_CREDIT, IRAS_RATES],
    related: [
      { label: "Affordability calculator", href: "/affordability/" },
      { label: "TDSR, MSR and LTV explained", href: "/news/tdsr-msr-ltv-explained/" },
      { label: "Stamp duties explained", href: "/news/stamp-duties-bsd-absd-ssd/" },
    ],
  };
}

/* ------------------------------------------------------------------ */

let cached: Article[] | null = null;

/** All written explainers (computed once per process). */
export function getExplainers(): Article[] {
  if (!cached) cached = [stampDuties(), mop(), sora(), leaseDecay(), readingRecords(), tdsr(), ecs(), enbloc(), affordabilityArticle()];
  return cached;
}
