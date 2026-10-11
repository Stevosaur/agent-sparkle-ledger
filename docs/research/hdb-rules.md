# HDB rules for resale and upgrading: research notes for engineers

Research date: **2026-10-10**. Scope:

1. Minimum Occupation Period (MOP): Standard, Plus, Prime and PLH flats, and when the MOP starts.
2. Buying private property after MOP. The private-property-owner wait-out, which **changed in July 2026**. Resale levy.
3. `flat_type` and `flat_model` values in the HDB resale dataset.
4. The 99-year lease and the `remaining_lease` field.
5. Town names and region mapping.
6. Typical floor areas, for sanity checks.
7. SERS and VERS status.

Related files:
- `docs/research/datagov-api.md`: dataset IDs, column order, API calls and parsing code. That file is the source of truth for **column names and ingest**; this file covers **policy rules**.
- `docs/research/onemap-api.md`: geocoding.

---

## 0. How these facts were sourced (read this first)

- **No primary page could be fetched directly.**
  - The fetch tool returned `getaddrinfo ENOTFOUND` for `www.hdb.gov.sg`, `hdb.gov.sg`, `www.mnd.gov.sg`, `data.gov.sg` and `en.wikipedia.org`.
  - This container's `curl` got `CONNECT tunnel failed, response 403` for `data.gov.sg`.
  - Facts marked **[PRIMARY]** were therefore read from **search-index extracts of the official page** at the cited URL, not from a full-page fetch.
- **The web-search budget ran out partway through this research.** It is shared across agents. Several items below could not be checked against a source in this session.
- **Confidence labels.** Each label applies to the bullet or table it is attached to.
  - **[PRIMARY]**: seen in an extract of an official page (hdb.gov.sg, mnd.gov.sg, mas.gov.sg, gov.sg).
  - **[SECONDARY]**: seen in two or more non-government sources (property blogs, agencies) and consistent with the primary extract. Not confirmed verbatim on a gov page.
  - **UNVERIFIED**: my best understanding from prior knowledge (cut-off mid-2026). It was not confirmed this session. **Do not present it as fact in the UI without a hedge or a link to the HDB page.**
- **Fact-check pass, 10 Oct 2026** (see "## Verification log" at the end).
  - Web access was again unavailable: the fetch tool returned `getaddrinfo ENOTFOUND` for every host tried (hdb.gov.sg, gov.sg, mas.gov.sg, propseller.com, even example.com), and the shared web-search budget was already used up. **No policy claim could be re-checked against a live primary page in this pass.**
  - Dataset claims (§1.2, §3, §4, §5.1, §6) **were** checked against HDB's own data.gov.sg export of the resale collection (metadata `Last Updated: 2023-02-17`, coverage 1990-01 to 2023-02, 893,168 rows across the 5 era files), mirrored in the public repo https://github.com/JosiahMendes/HDB-Resale-Price-Prediction (`data/`). Those checks are labelled **[DATA, Feb 2023 export]**. Anything after Feb 2023 is not covered by them.
- **Engineering rule.**
  - Every rule shown in the UI must cite its source URL and an "as at" date.
  - Rules that matter for a user's money (wait-outs, MOP, levy amounts) should say "check HDB's website for your case" and link to the HDB page.

---

## 1. Minimum Occupation Period (MOP)

### 1.1 MOP values by flat category

| Flat category | MOP | Applies to | Confidence / source |
|---|---|---|---|
| **Standard** flat (new from HDB) | **5 years** | BTO flats launched from the **October 2024** BTO exercise and classified Standard | [PRIMARY] HDB resale-eligibility and conditions-after-buying pages, and mynicehome.gov.sg (see list below) |
| Pre-Oct-2024 BTO/SBF flats (no Standard/Plus/Prime label) | **5 years** | All non-PLH flats launched before Oct 2024 | [PRIMARY] same pages ("flats launched before the October 2024 sales exercise are not affected") |
| **Resale** flat bought on the open market, with or without CPF housing grants | **5 years** | Standard / pre-2024 resale flats | [PRIMARY] HDB selling-a-flat eligibility page: "5 years for a resale flat bought on the open market, with or without CPF housing grants" |
| **Plus** flat (new or resale) | **10 years** | Flats launched from Oct 2024 and classified Plus | [PRIMARY] HDB resale page: "For new and resale Plus and Prime flats, the MOP is 10 years" |
| **Prime** flat (new or resale) | **10 years** | Flats launched from Oct 2024 and classified Prime | [PRIMARY] same |
| **PLH** (Prime Location Public Housing) flat | **10 years** | PLH projects launched from the Nov 2021 BTO exercise (first: Rochor Riverfront) up to the last exercise before the Oct 2024 framework. *Corrected 10 Oct 2026:* the earlier text said "to Aug 2024", but HDB ran its 2024 BTO exercises in **Feb, Jun and Oct** (no Aug 2024 exercise), so the last possible pre-framework PLH launch is **Jun 2024**. Which exercise actually had the last PLH project is UNVERIFIED. | UNVERIFIED this session (well established: PLH MOP is 10 years; the 2024 exercise months are prior knowledge) |
| **Fresh Start Housing Scheme** flat | **20 years** | Flats bought under Fresh Start | [PRIMARY] HDB resale page: "For flats purchased under the Fresh Start Housing Scheme, the MOP is 20 years" |
| **1-room** flat | **No MOP** | 1-room flat owners | [PRIMARY] HDB T&C extract: "1-Room Flat: No occupation period for owners of 1-room flat" |
| DBSS flat | 5 years | Design, Build and Sell Scheme flats | UNVERIFIED |
| Executive Condominium (not HDB resale data) | 5 years | ECs | UNVERIFIED |

Primary sources for §1.1:
- https://www.hdb.gov.sg/cs/infoweb/residential/buying-a-flat/conditions-after-buying?anchor=mop/
- https://www.hdb.gov.sg/cs/infoweb/residential/selling-a-flat/eligibility/
- https://www.hdb.gov.sg/cs/infoweb/e-resale/resale-purchase-of-an-hdb-resale-flat
- https://www.mynicehome.gov.sg/hdb-how-to/buy-your-flat/what-are-standard-prime-and-plus-hdb-flats/ (an HDB-run site)
- https://www.hdb.gov.sg/-/media/managing-my-home/selling-a-flat/process-for-selling-a-flat/option-to-purchase/Resale-Terms--Conditions.pdf

Historical MOP before 30 Aug 2010 (UNVERIFIED):
- Resale flats bought **without** a CPF grant had a shorter MOP: 1 year, later 3 years.
- From **30 Aug 2010** it became 5 years for all resale flats, per the 2010 MAS/MND measures.
- Source to check: https://www.mas.gov.sg/news/media-releases/2010/measures-to-ensure-a-stable-and-sustainable-property-market
- Not needed for current-rule calculators.

### 1.2 When the MOP starts and what is excluded

- **[PRIMARY]**, HDB selling-a-flat eligibility page: *"The MOP is calculated from the date you collect the keys to your flat and excludes any period where you do not occupy the flat."*
  - Source: https://www.hdb.gov.sg/cs/infoweb/residential/selling-a-flat/eligibility/
- **[PRIMARY]**, HDB resale T&Cs and conditions-after-buying wording: the MOP for a resale purchase starts from the date the purchase is **legally completed** (resale completion).
  - For a resale flat, keys are handed over at the completion appointment, so the two dates are normally the **same day**.
  - For a BTO flat, the start is the **key collection** date.
- **Exclusion.** Any period during which the **whole flat is rented out** does not count toward the MOP.
  - [PRIMARY] resale T&Cs: *"If the seller has rented out his whole flat, the rental period of the flat will NOT be included in computing the Minimum Occupation Period of the flat."*
- **Self-check.** Owners can check their MOP date via My HDBPage (Singpass). [PRIMARY]

**Engineering implications**

1. **Public data cannot give a unit's MOP date.**
   - The resale dataset has no key-collection or completion date.
   - `lease_commence_date` is a **year only**.
2. **Block-level heuristic** (label it "estimate"). *Corrected 10 Oct 2026 from the data; the earlier `lease_commence_date + 5` rule was wrong.*
   - **`lease_commence_date` is usually 1 to 2 years *after* the first buyers' key collection, not "close to" it.** [DATA, Feb 2023 export] For blocks with `lease_commence_date` 2008–2017, the first resale in the data falls in calendar year **lcd+4 for 627 of 1,065 blocks (59%)** and **lcd+3 for 283 (27%)**. The rest are lcd+5 (71 blocks), lcd+2 (52), lcd+6 (16), lcd+1 (14), and one block each at lcd+0 and lcd−1. Measured from the month-exact lease start implied by `remaining_lease`, first resales typically come **3.2 to 4.2 years** after lease start. A 5-year MOP counted from key collection therefore implies keys were collected about 1 to 2 years before the recorded lease start. Example: The Pinnacle@Duxton (`Type S1`/`Type S2`, blocks 1A–1G CANTONMENT RD) has `lease_commence_date = 2011`, and its first resale is registered in **2014-12**.
   - Use **earliest open-market resale ≈ `lease_commence_date + 3` to `+ 4` years** as the estimate, and never present it as an exact MOP date.
   - Outliers exist. Blocks 440A–C CLEMENTI AVE 3 (lcd 2018) and 95A–96C HENDERSON RD (lcd 2019) resold from **2020-07 / 2020-08**, under 2 years after lcd. These are probably SERS replacement blocks; the reason is UNVERIFIED.
   - Example: a block with lease commencement 2019 should first appear in resale data around **2022–2023**, not 2024.
3. **A resale flat bought in month M:**
   - Earliest month the new owner can sell or buy private ≈ M + 60 months (Standard).
   - For Plus/Prime/PLH it is M + 120 months.
   - The dataset `month` is the **registration** month (from Mar 2012) [DATA, Feb 2023 export: dataset metadata says "For March 2012 onwards, the data is based on date of registration for the resale transactions"]. The completion date is usually about 8 weeks or more after registration (UNVERIFIED), so treat this as approximate.

### 1.3 Standard / Plus / Prime classification (from October 2024 BTO)

| Item | Value | Confidence / source |
|---|---|---|
| Effective from | **BTO sales exercise of October 2024** (launched 15 Oct 2024; the exact launch day is UNVERIFIED) | [PRIMARY] "Flats launched before the October 2024 sales exercise are not affected, and prevailing resale eligibility conditions will apply" (mynicehome.gov.sg / HDB) |
| What it replaces | The mature / non-mature estate classification for **new** flats. PLH is subsumed into "Prime". | UNVERIFIED this session (announced at National Day Rally Aug 2023) |
| Standard | Normal subsidies. **MOP 5 years**. May rent out the **whole flat** after MOP. Usual resale rules. | [PRIMARY] (MOP, whole-flat rental) |
| Plus | Extra subsidies. **MOP 10 years**. **No whole-flat rental ever.** **Subsidy recovery on resale.** Tighter resale-buyer eligibility. | [PRIMARY] (MOP, no whole-flat rental, subsidy recovery, resale only to eligible Singaporean households) |
| Prime | Most extra subsidies. **MOP 10 years**. **No whole-flat rental ever.** **Subsidy recovery on resale**, at a rate generally higher than Plus. Tighter resale-buyer eligibility. | [PRIMARY] for MOP, rental and recovery. "Generally higher than Plus" is UNVERIFIED. |
| Whole-flat rental (Plus/Prime) | *"Flat owners of Plus and Prime flats are not allowed to rent out their whole flat, regardless of how long they have owned or occupied their flat."* Owners of 3-room or larger flats, Plus and Prime included, may still rent out **bedrooms** with HDB approval. *Fact-check flag, 10 Oct 2026:* prior knowledge says bedroom rental is **registered with HDB (within 7 days of the tenancy starting)** rather than approved in advance; only whole-flat rental needs approval. Confirm the wording on HDB before the UI says "approval". UNVERIFIED. | [PRIMARY] https://www.gov.sg/explainers/renting-out-your-hdb-flat/ and mynicehome.gov.sg (whole-flat ban). Bedroom-rental mechanism: UNVERIFIED |
| Subsidy recovery (Plus/Prime) | On resale, owners *"are required to return a percentage of the resale or valuation price, whichever is higher, to HDB"*. **The percentage is fixed per project at launch.** | [PRIMARY] wording. Per-project rates: UNVERIFIED. Do **not** hard-code a single rate; make it per project. |
| Resale buyer eligibility (Plus/Prime) | *"They can also only sell to Singaporean households that meet eligibility conditions."* | [PRIMARY] |

Further detail on resale buyers of Plus/Prime/PLH flats (UNVERIFIED, mirrors the PLH rules; confirm on HDB before showing):
- At least one buyer must be a Singapore Citizen.
- The household must meet the BTO income ceiling. This was $14,000/month for families from Sep 2019; whether it was revised in 2024–2026 is unconfirmed. `loan-rules.md` §3.4 records a **conflicting 2026 claim** (one third-party site: $16,000 families / $24,000 extended / $8,000 singles). Keep the ceiling configurable.
- Whether the July 2026 PPO change (§2.2) altered the 30-month rule below for Plus/Prime/PLH resale buyers is UNVERIFIED.
- Buyers must not have owned private residential property in the **30 months** before the resale application.
- The MOP for the resale buyer is again 10 years.

Is any of this in the resale dataset yet?
- **No.** As of Oct 2026, no Plus or Prime flat has reached its MOP. The earliest Oct-2024 BTO completions are around 2028–2029 (UNVERIFIED; a shorter-waiting-time project could complete earlier), so MOP ends in the late 2030s (completion + 10 years: 2028 + 10 = 2038). Either way, none can appear in the data before the mid-2030s.
- No PLH flat has reached its MOP either. Rochor Riverfront was launched Nov 2021; its MOP ends around 2036 or later. These dates are inferences.
- **The resale dataset has no Standard/Plus/Prime/PLH column.** Do not try to derive one.

### 1.4 PLH model (Prime Location Public Housing), summary

All of the following is UNVERIFIED this session but well established:
- Announced in **Oct 2021** (27 Oct 2021, UNVERIFIED) and first applied in the **Nov 2021** BTO exercise. First project: **Rochor Riverfront**.
- Conditions:
  - MOP 10 years.
  - No whole-flat rental for the whole lease.
  - Subsidy recovery on first resale: a % of the resale price or valuation, whichever is higher, set per project. Rochor Riverfront was 6%.
  - Resale buyers must be SC households within the income ceiling, with a 30-month private-property wait-out.
- From the **Oct 2024** BTO exercise, PLH is folded into the **Prime** classification. Existing PLH flats keep their PLH conditions.
- Source to cite: https://www.hdb.gov.sg/residential/buying-a-flat/understanding-your-eligibility-and-housing-loan-options/flat-and-grant-eligibility (path UNVERIFIED), or the mynicehome.gov.sg page in §1.1.

---

## 2. Upgrading: buying private property, private owners buying resale, resale levy

### 2.1 HDB owners buying private property

- **Rule:** an HDB flat owner may buy a **private residential property (local or overseas)** only **after fulfilling the MOP** of the flat.
  - [PRIMARY], HDB letter to estate agents: *"Fulfilling the Minimum Occupation Period to Acquire Private Residential Property"*: https://www.hdb.gov.sg/business-partners/estate-agents-and-salespersons/letters-to-keos/fulfilling-the-minimum-occupation-period-to-acquire-private-residential-property
  - Also stated on the conditions-after-buying page (§1.1).
- **Effective:** applies to flats bought from **30 Aug 2010** (UNVERIFIED date, from the 2010 MAS/MND measures: https://www.mas.gov.sg/news/media-releases/2010/measures-to-ensure-a-stable-and-sustainable-property-market).
- **Plus/Prime/PLH:** the MOP is 10 years, so private purchase is possible only after **10 years**. This follows from §1.1.
- **After MOP the owner may keep the HDB flat** and own the private property as well. UNVERIFIED this session; this is the standard rule.
  - Buying private while still owning the HDB flat makes the private purchase a **second residential property** for ABSD.
  - **Calculators must not compute ABSD from this file.** Use the IRAS research file.
  - (UNVERIFIED) SC second-property ABSD has been 20% since 27 Apr 2023.

### 2.2 Private property owners (PPOs) buying an HDB resale flat: the wait-out

**History, then the July 2026 change. This is the current rule.**

1. **30 Sep 2022 to 27 Jul 2026: 15-month wait-out** [PRIMARY]
   - PPOs and ex-PPOs had to wait **15 months** after disposing of their private property before buying a **non-subsidised** HDB resale flat.
   - It was introduced as *"a temporary measure which will be reviewed in future depending on overall market conditions and housing demand"*.
   - Source: joint MAS/MND/HDB release, 29 Sep 2022, effective 30 Sep 2022:
     - https://www.hdb.gov.sg/about-us/news-and-publications/press-releases/29092022-propertymeasures2022
     - https://www.hdb.gov.sg/hdb-pulse/news/2022/property-measures2022
     - https://www.mas.gov.sg/news/media-releases/2022/measures-to-promote-sustainable-conditions-in-the-property-market-by-ensuring-prudent-borrowing-and-moderating-demand
   - The 30 Sep 2022 effective date is UNVERIFIED verbatim, but the release is dated 29 Sep 2022 and stated next-day effect.
   - **Senior exemption** [PRIMARY]: *"the 15-month wait-out period will not apply to seniors aged 55 and above (and their spouses) who are moving from their private property to a 4-room or smaller resale flat."*
     - Sources: the same release; HDB OTP Important Notes (30 Sep 2022) https://www.hdb.gov.sg/-/media/doc/EAPG-CSC/OTP-Important-Notes-30-Sep-2022.ashx ; MND written answer https://www.mnd.gov.sg/newsroom/parliament-matters/q-as/view/written-answer-by-ministry-of-national-development-on-allowing-seniors-above-55-years-old-who-are-moving-from-a-private-property-to-a-4-room-or-smaller-resale-hdb-flat-to-be-exempted-from-the-15-month-wait-out-period
     - The exemption still appeared in HDB's *Terms and Conditions for Temporary Extension of Stay* dated 19 Feb 2026.
2. **From 28 Jul 2026: 15-month wait-out REMOVED** (a 2026 change)
   - [PRIMARY] HDB Pulse news, *"Removal of the 15-month Wait-out Period for Private Residential Property Owners Purchasing Non-Subsidised HDB Resale Flats"*: https://www.hdb.gov.sg/hdb-pulse/news/2026/removal-of-the-15-month-wait-out-period-for-private-residential-property-owners
     - Extract: *"With immediate effect, private residential property owners (PPOs) and ex-PPOs who purchase a non-subsidised HDB resale flat **without an HDB housing loan** will no longer be subject to a 15-month wait-out period."*
     - Reason given: *"several quarters of price moderation in the HDB resale market, which is showing signs of stabilisation."*
   - **Effective date 28 July 2026.** [SECONDARY] Several agency blogs state "removed on 28 July 2026", for example:
     - https://propseller.com/blog/housing-news/15-month-hdb-wait-out-period-removed/
     - https://darrenong.sg/blog/15-month-hdb-wait-out-period-removed/
     - https://youhome.sg/hdb-15-month-wait-out-period/
     - The search index dated the HDB page about 75 days before 2026-10-10. Recomputed: 10 Oct 2026 − 75 days = **27 Jul 2026**. The page date and the 28 Jul 2026 effective date are therefore one day apart. Whether "immediate effect" means 27 Jul or 28 Jul is UNVERIFIED; the code below uses 28 Jul as the first day without the wait-out.
   - **Conditions that remain** [SECONDARY; confirm on HDB]:
     - The purchase must be **without an HDB housing loan**. Bank loan or cash only.
     - A buyer who **still owns** private property must **dispose of it within 6 months** of buying the resale flat. This was the pre-2022 rule.
     - The **30-month** wait-out is **unchanged** for: subsidised flats (BTO/SBF), CPF housing grants for resale flats, an HDB housing loan, and (per secondary sources) new ECs.
       - The 2022 release said the 30-month wait-out for first-timer PPOs applying for the CPF Housing Grant / Enhanced CPF Housing Grant "remains unchanged" [PRIMARY 2022].
   - **Age scope:** secondary sources disagree on whether the removal is for all ages. The HDB extract quoted above has **no age or flat-size condition**, so the senior/4-room exemption is now moot for non-subsidised, no-HDB-loan purchases.
   - Market note: HDB later said it has not seen a significant rise in prices or numbers of resale flats bought by PPOs since 28 Jul 2026 [SECONDARY].

**Code rule:**

```ts
// src/lib/calc/rules.ts (suggested)
export const PPO_WAIT_OUT = {
  nonSubsidisedResaleNoHdbLoan: [
    { from: '2022-09-30', to: '2026-07-27', months: 15,
      exemption: 'Seniors 55+ (and spouse) moving to 4-room or smaller resale flat' },
    { from: '2026-07-28', to: null, months: 0,
      note: 'Must dispose of private property within 6 months of resale purchase (UNVERIFIED wording)' },
  ],
  subsidisedOrGrantOrHdbLoan: { months: 30 }, // unchanged
  source: 'https://www.hdb.gov.sg/hdb-pulse/news/2026/removal-of-the-15-month-wait-out-period-for-private-residential-property-owners',
} as const;
```

### 2.3 Resale levy, basics

All of §2.3 is UNVERIFIED this session; search budget ran out. Show it as "indicative" and link to the HDB resale levy page.

- **Who pays:** second-timer households who **previously bought a subsidised flat** and now buy **another subsidised flat**.
  - A subsidised flat here means a BTO/SBF/open-booking flat from HDB, a resale flat bought with a CPF housing grant, or an EC from a developer.
  - They pay the levy to reduce the subsidy on the second flat.
  - Fact-check flag (prior knowledge, UNVERIFIED): the levy is normally triggered by a second-timer buying a **new** flat from HDB (BTO/SBF) or a new EC. Whether a resale purchase with a second-timer grant (e.g. the Proximity or Step-Up grant) triggers it is unconfirmed. Do not charge a levy on resale purchases in calculators without confirming on HDB's page.
- **Who does not pay:** buyers of a **non-subsidised** resale flat on the open market without grants.
- **First subsidised flat sold on or after 3 Mar 2006:** a fixed amount by type of the first flat.

  | First flat type | Family levy (SGD) |
  |---|---|
  | 2-room | 15,000 |
  | 3-room | 30,000 |
  | 4-room | 40,000 |
  | 5-room | 45,000 |
  | Executive | 50,000 |
  | Multi-Generation | 50,000 (UNVERIFIED) |
  | Executive Condominium | 55,000 (UNVERIFIED) |

  Singles pay half (UNVERIFIED).
- **First flat sold before 3 Mar 2006:** the levy is a percentage of the resale price or market value. The rate depends on flat type (about 15–25%), with a discount for some cases (UNVERIFIED).
- Source to cite: https://www.hdb.gov.sg/residential/buying-a-flat/understanding-your-eligibility-and-housing-loan-options/flat-and-grant-eligibility/resale-levy (path UNVERIFIED).

### 2.4 Other current resale rules worth surfacing

All UNVERIFIED this session; well-known rules.

- **HDB Flat Eligibility (HFE) letter:**
  - A resale buyer must have a valid HFE letter **before** the seller can grant the Option to Purchase (OTP).
  - Effective **9 May 2023**.
  - Sellers must register an Intent to Sell and wait 7 days before granting the OTP.
- **Loan-to-value:**
  - HDB housing loan LTV is **75%**, lowered from 80% on **20 Aug 2024**. This is [PRIMARY] in `loan-rules.md` §3: it applies to complete resale applications received on or after 20 Aug 2024 and to new-flat applications from the Oct 2024 BTO/SBF exercise. That file found no 2025–2026 change.
  - Bank loan LTV for a first housing loan is 75%.
  - MSR is 30% and TDSR 55%. Use the MAS research file for these.
- **Lease and CPF/loan usage** (from **10 May 2019**):
  - Full CPF usage up to the Valuation Limit if the remaining lease covers the youngest buyer to **age 95**. Otherwise usage is pro-rated.
  - CPF cannot be used if the remaining lease is under 20 years.
  - The HDB loan amount is pro-rated on the same "to age 95" basis.
  - Source to cite: https://www.cpf.gov.sg/member/home-ownership/using-your-cpf-to-buy-a-home

---

## 3. `flat_type` and `flat_model` values in the resale dataset

Exact column names (from `datagov-api.md` §5.1, [PRIMARY/CORROBORATED] there): `month, town, flat_type, block, street_name, storey_range, floor_area_sqm, flat_model, lease_commence_date, remaining_lease, resale_price`. **Confirmed [DATA, Feb 2023 export]**: this is the exact header of the 2015–2016 and 2017+ files. The three earlier files have the same header without `remaining_lease`.

### 3.1 `flat_type` (exact strings)

All seven values confirmed [DATA, Feb 2023 export]; no other `flat_type` value occurs in any era.

| Raw value | Notes |
|---|---|
| `1 ROOM` | Only lcd 1969, 1975 and 1977 [DATA]. Since Mar 2012, every `1 ROOM` row is in BUKIT MERAH and is 31 sqm [DATA] |
| `2 ROOM` | Includes 2-room Flexi flats. Short-lease 2-room Flexi flats cannot be sold on the open market (they go back to HDB), so resale rows are 99-year flats. The policy is UNVERIFIED, but the data is consistent with it [DATA]: every 2017+ `2 ROOM` row with lcd ≥ 2010 has a remaining lease of 87.7–96.8 years (1,351 rows). |
| `3 ROOM` | Includes **Terrace** model rows with large areas (see §6) |
| `4 ROOM` | Also includes **Terrace** rows (68 rows) [DATA] |
| `5 ROOM` | **3Gen flats are recorded as `5 ROOM` with `flat_model = 3Gen`**: confirmed [DATA], 7 rows from 2022-06, all 120 sqm, lcd 2018 |
| `EXECUTIVE` | Executive Apartment / Maisonette. `flat_model` is exactly one of `Apartment`, `Maisonette`, `Premium Apartment`, `Premium Maisonette`, `Adjoined flat` [DATA] |
| `MULTI-GENERATION` | Hyphenated spelling, used in **every file from 2000 onward** (2000–Feb 2012, Mar 2012–2014, 2015–2016, 2017+) [DATA] |
| `MULTI GENERATION` | Unhyphenated spelling, found **only in the 1990–1999 file** (279 rows) [DATA]. **Normalise to `MULTI-GENERATION`.** |

- Corroborated by `datagov-api.md` §5.1. The `MULTI GENERATION` / `MULTI-GENERATION` split is corroborated by two open-source codebases there and by the data itself.
- Other HDB datasets (rental, Property Information) use **hyphens** (`4-ROOM`). Normalise to one enum.

### 3.2 `flat_model` (exact strings as they appear in the 2017+ file)

**Confirmed [DATA, Feb 2023 export]:** the 2017+ file has exactly these **21** distinct values. Across all five era files there are **34** raw values, which collapse to the same **21** after case-folding. **Compare case-insensitively.**

*Corrected 10 Oct 2026:* only the **1990–1999** file is UPPERCASE (13 values: `IMPROVED`, `NEW GENERATION`, `MODEL A`, `STANDARD`, `SIMPLIFIED`, `MODEL A-MAISONETTE`, `APARTMENT`, `MAISONETTE`, `TERRACE`, `2-ROOM`, `IMPROVED-MAISONETTE`, `MULTI GENERATION`, `PREMIUM APARTMENT`). The earlier text said "1990–Feb 2012", but the **2000–Feb 2012 file is already Title case** (`Improved`, `Model A2`, `Adjoined flat`, …). There is **no `3GEN`** in any file: `3Gen` exists only in the 2017+ file, from 2022-06.

In the table below, the flat types and lease years come from the data (all eras, Feb 2023 export) unless marked otherwise. "lcd" means `lease_commence_date`.

| Raw value (2017+) | Meaning / flat types seen in data | Notes |
|---|---|---|
| `Improved` | `1 ROOM` to `5 ROOM`. lcd 1966–2019 (median 1986), so this is a broad label, not only a 1970s–80s design. | *Corrected* (was "1970s–80s") |
| `New Generation` | `3 ROOM`, `4 ROOM`. lcd 1976–1999 (99% ≤ 1988). | Confirmed |
| `Model A` | **`2 ROOM`** to `5 ROOM`. lcd 1978–2019 (median 1990). | *Corrected* (was "1980s–2000s, 3- to 5-room") |
| `Model A2` | `4 ROOM` only. **85–100 sqm** (p5–p95; median 90). lcd 1997–2004. | *Corrected* (was "about 85–90 sqm") |
| `Simplified` | `3 ROOM`, `4 ROOM`. lcd 1984–2000. | Confirmed |
| `Standard` | **`2 ROOM`, `3 ROOM`, `4 ROOM`, `5 ROOM`**; no `1 ROOM` rows. lcd 1967–1986. | *Corrected* (was "1-, 2-, 3- and 5-room"). Unrelated to the 2024 "Standard" classification. Do not confuse them. |
| `Apartment` | `EXECUTIVE` only (Executive Apartment). lcd 1984–2003. | Confirmed |
| `Maisonette` | `EXECUTIVE` only (Executive Maisonette). lcd 1984–2000. | Confirmed |
| `Model A-Maisonette` | **`5 ROOM` only**. lcd 1983–1985. | *Corrected* (was "5-room / Executive") |
| `Improved-Maisonette` | **`5 ROOM` only**. lcd 1983–1997. | *Corrected* (was "5-room / Executive") |
| `Premium Apartment` | **`2 ROOM`** to `EXECUTIVE`. lcd 1996–2018. | *Corrected* (was "1990s–2000s, 3-room to Executive") |
| `Premium Maisonette` | `EXECUTIVE` only. lcd 1997–1998. | Confirmed |
| `Premium Apartment Loft` | **`4 ROOM`, `5 ROOM`**. lcd 2012–2016. | *Corrected* (was "5-room / Executive") |
| `DBSS` | `3 ROOM` to `5 ROOM`, plus 1 `2 ROOM` row. lcd 2008–2015. | Confirmed, with the one exception noted |
| `Type S1` | `4 ROOM` only, blocks 1A–1G CANTONMENT RD (CENTRAL AREA), lcd 2011. That address is The Pinnacle@Duxton (prior knowledge). | Confirmed by data |
| `Type S2` | `5 ROOM` only, same blocks and lcd. | Confirmed by data |
| `Adjoined flat` | Two flats combined. `3 ROOM`, `4 ROOM`, `5 ROOM`, `EXECUTIVE`. lcd 1967–1989. 107–164 sqm (p5–p95). | |
| `Terrace` | HDB terrace units with lcd **1968 or 1972**, only in QUEENSTOWN and KALLANG/WHAMPOA. Recorded as `3 ROOM` (615 rows) or `4 ROOM` (68). Area 78–307 sqm. **Median is only ~100 sqm**; only some `3 ROOM` rows are very large (p95 241). | *Refined* |
| `Multi Generation` | Pairs with `flat_type` `MULTI-GENERATION` / `MULTI GENERATION`. lcd 1987–1988. | Confirmed |
| `3Gen` | `5 ROOM`, 120 sqm, lcd 2018 (7 rows). The scheme's 2013 start is UNVERIFIED. | Confirmed flat type |
| `2-room` | `2 ROOM` only. lcd 1967–2018. | Lowercase "room" |

These values are as of the Feb 2023 export. Values added after that are UNVERIFIED, so keep the "unknown: keep, log" branch below.

```ts
// Canonical keys: case-fold and trim; keep the raw string for display.
export const FLAT_MODELS = [
  'Improved','New Generation','Model A','Model A2','Simplified','Standard','Apartment','Maisonette',
  'Model A-Maisonette','Improved-Maisonette','Premium Apartment','Premium Maisonette',
  'Premium Apartment Loft','DBSS','Type S1','Type S2','Adjoined flat','Terrace',
  'Multi Generation','3Gen','2-room',
] as const;
export const canonFlatModel = (s: string) =>
  FLAT_MODELS.find(m => m.toLowerCase() === s.trim().toLowerCase()) ?? s.trim(); // unknown: keep, log
export const canonFlatType = (s: string) =>
  s.trim().toUpperCase().replace(/^MULTI[ -]GENERATION$/, 'MULTI-GENERATION').replace(/^(\d)-ROOM$/, '$1 ROOM');
```

---

## 4. Lease and `remaining_lease`

- **HDB flats are sold on 99-year leases**, counted from the **lease commencement date**.
  - All flats in a block share one lease commencement date, normally around the block's completion or first key collection (UNVERIFIED that it is exactly key collection).
  - Exceptions not in the resale data: short-lease 2-room Flexi (15–45 years, seniors 55+, cannot be resold on the open market), and Community Care Apartments (UNVERIFIED).
  - Lease length is UNVERIFIED this session but is the well-known HDB rule. Cite https://www.hdb.gov.sg/residential/buying-a-flat/finding-a-flat/types-of-flats (path UNVERIFIED).
- **`lease_commence_date`** is a 4-digit **year** (e.g. `"1979"`). There is no month. [CORROBORATED, datagov-api.md]
- **`remaining_lease` format by era** [CORROBORATED, datagov-api.md §5.1; checked against DATA, Feb 2023 export]:

  | Era | Format | Example |
  |---|---|---|
  | Before 2015 | Column absent | n/a |
  | Jan 2015–Dec 2016 | Integer years as text (all 37,153 rows) | `"70"` |
  | Jan 2017 onwards | Mostly `"NN years MM months"` with zero-padded months. *Corrected:* there are three other forms. **`"NN years 01 month"`** (singular "month") appears in 11,973 rows. **`"NN years"`** with no month part appears in 12,061 rows. Three rows from 2019 have an unpadded zero, e.g. `"95 years 0 months"`. | `"61 years 04 months"`, `"95 years 01 month"`, `"62 years"`, `"66 years 0 months"` |

  Parse with `/(\d+)\s*years?/` and `/(\d+)\s*months?/`. The `parseRemainingLease` function in `datagov-api.md` §5.1 already handles all four forms.

- **How HDB computes it:** (exact lease start + 99 years) − the reference date.
  - **The reference date is the resale application date, not the registration month.** *Corrected; was UNVERIFIED.* The HDB note on the data.gov.sg 2015–2016 resource reads: *"'Remaining lease' is the number of years left before the lease ends. This information is computed as at the resale flat application."* [PRIMARY, dataset metadata in the Feb 2023 export]. The 2017+ resource carried no note in that export, so assume the same basis. The application date falls on or before the registration `month`.
  - Worked check: the first 2017 row is `2017-01, ANG MO KIO, 2 ROOM, 406, ANG MO KIO AVE 10, 10 TO 12, 44, Improved, 1979, "61 years 04 months", 232000`. It was confirmed verbatim [DATA, Feb 2023 export]. Recomputed: Jan 2017 + 61 y 4 m = **May 2078** lease end, so the lease start is ≈ **May 1979**. Because the reference date is the application date, which can be slightly before Jan 2017, both dates are upper bounds. This is consistent with `lease_commence_date = 1979`.
- **Derived remaining lease** (pre-2015 rows, or projections):
  - `remainingYears ≈ 99 − (txnYear + (txnMonth−1)/12 − lease_commence_date)`
  - *Corrected error statement* [DATA, Jan 2017–Feb 2023, 146,965 rows]: the formula is **biased low**, not ±1 year symmetric. The actual value minus the formula has a mean of **+0.49 years**. 99.6% of rows fall in **[0, +1.0]** years, and the full range is −0.92 to +1.50 years. The bias is expected: the lease starts somewhere inside the commencement year, and the reference date is before the registration month.
  - Better estimate: **`99.5 − (txnYear + (txnMonth−1)/12 − lease_commence_date)`**, with an error of about ±0.5 years for 99.6% of rows.
  - For the 2015–2016 integer values, `remaining_lease − (99 − (txnYear − lcd))` is −1 (48.6% of rows), 0 (51.3%) or +1 (20 rows).
  - Label it **"estimated"** in the UI. Prefer the dataset value when present.
- **Projecting "remaining lease today"** from a dataset row: `parsed_remaining − months elapsed since row.month`. This slightly *overstates* the result, by the gap between the application date and the registration month (UNVERIFIED size, probably 0–2 months).
- Lease is 99 years for every row. **Do not** assume any other length.

---

## 5. Towns and regions

### 5.1 `town` values

[CORROBORATED in datagov-api.md §6.1]

- **26 towns in the 2017+ data:**
  `ANG MO KIO, BEDOK, BISHAN, BUKIT BATOK, BUKIT MERAH, BUKIT PANJANG, BUKIT TIMAH, CENTRAL AREA, CHOA CHU KANG, CLEMENTI, GEYLANG, HOUGANG, JURONG EAST, JURONG WEST, KALLANG/WHAMPOA, MARINE PARADE, PASIR RIS, PUNGGOL, QUEENSTOWN, SEMBAWANG, SENGKANG, SERANGOON, TAMPINES, TOA PAYOH, WOODLANDS, YISHUN`
- **Confirmed [DATA, Feb 2023 export]:** the 2017+ file has exactly these 26 strings. The 2000–Feb 2012, Mar 2012–2014 and 2015–2016 files have the same 26.
- **`TENGAH`**: HDB's newest town.
  - It is in HDB Property Information (code `TG`) but **not yet in resale data**. Confirmed absent up to Feb 2023 [DATA]; Feb 2023 to Oct 2026 is UNVERIFIED. The first flats were completed around 2023, so the earliest MOP is around 2028. The key-collection date is UNVERIFIED.
  - Add it to the enum now.
- **`LIM CHU KANG`**: appears only in the **1990–1999** file. Confirmed [DATA]: it is the 27th all-era value and is absent from every later file. Accept it, but do not list it as a current town.
  - The 1990–1999 file also has **no `PUNGGOL`** rows; Punggol first appears in the 2000–Feb 2012 file [DATA]. So that file also has 26 towns, but a different set.
- **Count note.** HDB describes its estates as **24 towns + 3 estates** (UNVERIFIED wording).
  - The 3 estates are **Bukit Timah, Central Area, Marine Parade**.
  - So with Tengah there are 27 current values. 26 appear in resale data today.
  - The task brief's "26 towns" list includes TENGAH and LIM CHU KANG, which is 28 strings. Treat the enum as **26 current-in-data + TENGAH + LIM CHU KANG (historic)**.

### 5.2 Region mapping

Based on URA Master Plan planning regions (UNVERIFIED this session). HDB town boundaries are not identical to URA planning areas, but every HDB town falls within one region. Cite https://www.ura.gov.sg/Corporate/Planning/Master-Plan (path UNVERIFIED).

| Region | Towns (resale `town` strings) |
|---|---|
| **Central** | BISHAN, BUKIT MERAH, BUKIT TIMAH, CENTRAL AREA, GEYLANG, KALLANG/WHAMPOA, MARINE PARADE, QUEENSTOWN, TOA PAYOH |
| **East** | BEDOK, PASIR RIS, TAMPINES |
| **North** | SEMBAWANG, WOODLANDS, YISHUN, LIM CHU KANG (historic; URA puts the Lim Chu Kang planning area in the North Region) |
| **North-East** | ANG MO KIO, HOUGANG, PUNGGOL, SENGKANG, SERANGOON |
| **West** | BUKIT BATOK, BUKIT PANJANG, CHOA CHU KANG, CLEMENTI, JURONG EAST, JURONG WEST, TENGAH |

Traps:
- **Ang Mo Kio is North-East**, not North or Central.
- **Marine Parade is Central**, not East.
- **Bukit Timah is Central**, not West.
- **Clementi is West.**

```ts
export const TOWN_REGION: Record<string, 'Central'|'East'|'North'|'North-East'|'West'> = {
  'BISHAN':'Central','BUKIT MERAH':'Central','BUKIT TIMAH':'Central','CENTRAL AREA':'Central','GEYLANG':'Central',
  'KALLANG/WHAMPOA':'Central','MARINE PARADE':'Central','QUEENSTOWN':'Central','TOA PAYOH':'Central',
  'BEDOK':'East','PASIR RIS':'East','TAMPINES':'East',
  'SEMBAWANG':'North','WOODLANDS':'North','YISHUN':'North','LIM CHU KANG':'North',
  'ANG MO KIO':'North-East','HOUGANG':'North-East','PUNGGOL':'North-East','SENGKANG':'North-East','SERANGOON':'North-East',
  'BUKIT BATOK':'West','BUKIT PANJANG':'West','CHOA CHU KANG':'West','CLEMENTI':'West','JURONG EAST':'West',
  'JURONG WEST':'West','TENGAH':'West',
};
```

### 5.3 Mature / non-mature estates

This classification applied to BTO flats **before Oct 2024** and still appears in HDB grant and statistics contexts. UNVERIFIED this session.

- **Mature (15):** ANG MO KIO, BEDOK, BISHAN, BUKIT MERAH, BUKIT TIMAH, CENTRAL AREA, CLEMENTI, GEYLANG, KALLANG/WHAMPOA, MARINE PARADE, PASIR RIS, QUEENSTOWN, SERANGOON, TAMPINES, TOA PAYOH
- **Non-mature (12):** BUKIT BATOK, BUKIT PANJANG, CHOA CHU KANG, HOUGANG, JURONG EAST, JURONG WEST, PUNGGOL, SEMBAWANG, SENGKANG, TENGAH, WOODLANDS, YISHUN
- Label it "former BTO classification (pre-Oct 2024)" if shown.

---

## 6. Typical floor areas (`floor_area_sqm`), for sanity checks

*Revised 10 Oct 2026.* The "observed" columns are **[DATA, Feb 2023 export]**: p5–p95 and min–max for Mar 2012–Feb 2023, plus the all-era min–max. The "current design" column is still UNVERIFIED prior knowledge. **Still compute real per-type percentiles at ingest and use those.** Per the dataset notes, `floor_area_sqm` *"includes any recess area purchased, space adding item under HDB's upgrading programmes, roof terrace, etc."* [PRIMARY, dataset metadata], so values can exceed the original design.

| flat_type | Current design (approx., UNVERIFIED) | Observed p5–p95 (median), 2012-03 to 2023-02 | Observed min–max, all eras | Soft bounds (warn outside) |
|---|---|---|---|---|
| 1 ROOM | Not sold new by HDB today (1-room flats are rental), UNVERIFIED. The earlier "~31–33 BTO design" was misleading. | 31–31 (31) | 28–31 | 20–45 |
| 2 ROOM | 2-room Flexi ~36–47 | 40–51 (46) | 34–67 (`Standard` up to 67; `Premium Apartment` up to 60) | 30–75 |
| 3 ROOM | ~60–68 | 59–81 (67) | 46–307 | **45–140**, exempt `Terrace`. *Corrected* from 45–100: non-Terrace rows legitimately reach 137 (`Improved` 137, `Model A` 104/115, `New Generation` 103/107). |
| 4 ROOM | ~90–93 | 84–107 (93) | 70–149 | 65–150 (exempt Terrace / Adjoined) |
| 5 ROOM | ~110–113; 3Gen rows are **120** in the data (not ~115) | 110–133 (118) | 99–210 (only `Adjoined flat` exceeds 167) | 95–170 (exempt Adjoined) |
| EXECUTIVE | None in the data with lcd after **2004** | 128–163 (146) | 124–243 | 115–260 |
| MULTI-GENERATION | None in the data with lcd after **1988** (was "1990s") | 132–179 (164) | 132–179 | **125–200**. *Corrected* from 140–200, which flagged the real 132/134 sqm rows. |

- *Corrected:* "New Generation up to ~82" was wrong. `New Generation` `3 ROOM` rows reach **103–107** sqm [DATA].
- **Hard reject:** `floor_area_sqm <= 0`, or `> 400`. Log and skip. The all-era maximum is 307 (a `3 ROOM` Terrace), so 400 is safe [DATA].
- **Soft-out-of-range rows:** keep, and log them.

---

## 7. SERS and VERS status (as of Oct 2026)

### 7.1 SERS: Selective En bloc Redevelopment Scheme

- **Status: active.** HDB still runs SERS and publishes rehousing options for affected owners.
  - [PRIMARY] HDB SERS rehousing-options page: https://www.hdb.gov.sg/residential/living-in-an-hdb-flat/sers-and-upgrading-programmes/sers/sers-flat-owners/rehousing-options
- **2022 change** [PRIMARY]: HDB added **two more rehousing options** for SERS flat owners.
  - Source: HDB release embargoed to 3 pm, 2 Jul 2022, Annex B: https://www.hdb.gov.sg/-/media/hdb-pulse/news/2022/hdb-offers-two-additional-rehousing-options-for-flat-owners-under-ser/Annex_B.pdf
  - The detail of the two options is UNVERIFIED. My understanding: a replacement flat at another SERS replacement site, or a BTO/other new-flat route with SERS benefits.
- **How SERS works** (UNVERIFIED this session):
  - Started in **1995**.
  - The government selects old blocks on under-used land.
  - Owners receive **compensation at market value**, plus stamp duty and legal fee reimbursement.
  - Owners get a **new 99-year-lease replacement flat** at a nearby site, at subsidised prices.
  - Only about **5%** of HDB flats have been selected since 1995 (figure UNVERIFIED).
  - The scheme is **not** a general en-bloc right.
- **Announced SERS sites:** the list of recent sites is UNVERIFIED. Do not hard-code it. If the app shows "SERS block" badges, source them from HDB's SERS page and keep the list manually maintained with a date.
- **Data impact:** SERS blocks keep transacting until acquisition. The app should not infer SERS status from data.

### 7.2 VERS: Voluntary Early Redevelopment Scheme

- **Status: announced, not yet implemented**, as far as known (UNVERIFIED this session).
  - Announced by PM Lee Hsien Loong at **National Day Rally, 19 Aug 2018**.
  - **How it would work:** when a precinct's flats reach **about 70 years** of lease age, owners may **vote** on whether the government buys back their flats before the lease expires.
  - **Compensation** would reflect the remaining lease. It would **not** be the full market value of a new lease as under SERS.
  - **Start date:** it was said to start **about 20 years after 2018**, i.e. late 2030s.
  - Expected rollout: 2030s.
- **HIP II** (Home Improvement Programme II, for flats around 60–70 years old) was announced in the same 2018 speech. Also UNVERIFIED status.
- **No 2025/2026 VERS launch was confirmed in this session.** If shown in the UI, phrase it as: "VERS has been announced but no flats have been offered under it as at Oct 2026 (check HDB)."
- Source to cite: https://www.hdb.gov.sg/residential/living-in-an-hdb-flat/sers-and-upgrading-programmes (path UNVERIFIED), or the 2018 NDR speech on pmo.gov.sg.
- **Calculators:** an "en-bloc" calculator for HDB **must not** assume SERS-style compensation for an arbitrary block. Show SERS as selective (government-chosen) and VERS as not yet launched.

---

## 8. Summary of UNVERIFIED / changed items (handle defensively)

1. **CHANGED 2026:** the 15-month PPO wait-out for non-subsidised resale without an HDB loan was **removed on 28 Jul 2026**.
   - The effective date is [SECONDARY]; the "immediate effect" wording is [PRIMARY].
   - The remaining conditions (no HDB loan; dispose of private property within 6 months; 30-month rules unchanged) are SECONDARY/UNVERIFIED.
   - The 10 Oct 2026 fact-check could not re-open any source for this; it is still UNVERIFIED against a full primary page.
2. Plus/Prime subsidy-recovery rates are **per project**. None are confirmed here.
3. Plus/Prime/PLH resale-buyer criteria (SC, income ceiling, 30-month wait-out) are UNVERIFIED.
4. Resale levy amounts (§2.3) are UNVERIFIED.
5. ~~The exact reference date of `remaining_lease` is UNVERIFIED.~~ **Resolved:** it is computed as at the resale application date (HDB dataset note, §4).
6. ~~`flat_model` verbatim list and casing by era.~~ **Resolved [DATA]:** 21 values; only the 1990–1999 file is UPPERCASE (§3.2).
7. ~~Whether 3Gen is recorded as `5 ROOM`.~~ **Resolved [DATA]:** yes, at 120 sqm.
8. Region mapping per URA (UNVERIFIED this session, but standard).
9. Recent SERS site list, and VERS launch status.
10. The HDB income ceiling as of Oct 2026 (conflicting claims, see `loan-rules.md` §3.4).
11. **New:** `lease_commence_date` usually lags key collection by about 1–2 years (§1.2). Do not derive MOP dates from it.
12. **New:** the bedroom-rental mechanism (approval vs registration) is UNVERIFIED (§1.3).

---

## 9. Sources

Primary, read via search-index extracts:
- https://www.hdb.gov.sg/cs/infoweb/residential/buying-a-flat/conditions-after-buying?anchor=mop/
- https://www.hdb.gov.sg/cs/infoweb/residential/selling-a-flat/eligibility/
- https://www.hdb.gov.sg/cs/infoweb/e-resale/resale-purchase-of-an-hdb-resale-flat
- https://www.hdb.gov.sg/-/media/managing-my-home/selling-a-flat/process-for-selling-a-flat/option-to-purchase/Resale-Terms--Conditions.pdf
- https://www.hdb.gov.sg/business-partners/estate-agents-and-salespersons/letters-to-keos/fulfilling-the-minimum-occupation-period-to-acquire-private-residential-property
- https://www.mynicehome.gov.sg/hdb-how-to/buy-your-flat/what-are-standard-prime-and-plus-hdb-flats/
- https://www.gov.sg/explainers/renting-out-your-hdb-flat/
- https://www.hdb.gov.sg/hdb-pulse/news/2026/removal-of-the-15-month-wait-out-period-for-private-residential-property-owners
- https://www.hdb.gov.sg/about-us/news-and-publications/press-releases/29092022-propertymeasures2022
- https://www.hdb.gov.sg/hdb-pulse/news/2022/property-measures2022
- https://www.mas.gov.sg/news/media-releases/2022/measures-to-promote-sustainable-conditions-in-the-property-market-by-ensuring-prudent-borrowing-and-moderating-demand
- https://www.hdb.gov.sg/-/media/doc/EAPG-CSC/OTP-Important-Notes-30-Sep-2022.ashx
- https://www.mnd.gov.sg/newsroom/parliament-matters/q-as/view/written-answer-by-ministry-of-national-development-on-allowing-seniors-above-55-years-old-who-are-moving-from-a-private-property-to-a-4-room-or-smaller-resale-hdb-flat-to-be-exempted-from-the-15-month-wait-out-period
- https://www.hdb.gov.sg/-/media/managing-my-home/selling-a-flat/process-for-selling-a-flat/resale-flat-application/request-for-temporary-extension-of-stay/Terms--Conditions-for-Temporary-Extension-of-Stay-19-Feb-2026.pdf
- https://www.hdb.gov.sg/residential/living-in-an-hdb-flat/sers-and-upgrading-programmes/sers/sers-flat-owners/rehousing-options
- https://www.hdb.gov.sg/-/media/hdb-pulse/news/2022/hdb-offers-two-additional-rehousing-options-for-flat-owners-under-ser/Annex_B.pdf
- https://www.mas.gov.sg/news/media-releases/2010/measures-to-ensure-a-stable-and-sustainable-property-market

Primary data, HDB's own data.gov.sg export (collection metadata `Last Updated: 2023-02-17`), read from a public GitHub mirror on 10 Oct 2026. These are the sources for all [DATA] labels:
- https://github.com/JosiahMendes/HDB-Resale-Price-Prediction/tree/main/data (commit 45472e2, 16 Jun 2023): the 5 era CSVs plus `metadata-resale-flat-prices.txt`
- The original resource URLs named in that metadata, e.g. `https://storage.data.gov.sg/resale-flat-prices/resources/resale-flat-prices-based-on-registration-date-from-jan-2017-onwards-2023-02-17T05-33-07Z.csv` (legacy host; current dataset ID `d_8b84c4ee58e3cfc0ece0d773c8ca6abc` per `datagov-api.md`)

Secondary (used only for the 28 Jul 2026 effective date and the remaining conditions):
- https://propseller.com/blog/housing-news/15-month-hdb-wait-out-period-removed/
- https://darrenong.sg/blog/15-month-hdb-wait-out-period-removed/
- https://youhome.sg/hdb-15-month-wait-out-period/
- https://www.thefinancialcoconut.com/blog/hdb-15-month-wait-out-period-removed-2026
- https://tribesg.com/insights/wait-out-removal-price-held-volume-moved

---

## Verification log

Adversarial fact-check, **10 Oct 2026**.

**Method.**
- **Live web was unavailable.** WebFetch returned `getaddrinfo ENOTFOUND` for hdb.gov.sg, gov.sg, mas.gov.sg, propseller.com and example.com. The shared WebSearch budget was already exhausted. `curl` to data.gov.sg got proxy 403.
- **Policy claims** therefore could not be re-checked against primary pages. They are marked *unverifiable*, and their existing labels are kept.
- **Dataset claims** were tested against HDB's own data.gov.sg export (Feb 2023, 893,168 rows; see §9), using local Python over the 5 CSVs. "PK" means prior knowledge.

| # | Claim (section) | Verdict | Source / evidence |
|---|---|---|---|
| 1 | Column list `month … resale_price` (§3) | confirmed | CSV headers, Feb 2023 export |
| 2 | `month` = approval month to Feb 2012, registration month from Mar 2012 (§1.2) | confirmed | dataset metadata Description |
| 3 | 7 `flat_type` values (§3.1) | confirmed | all 5 files |
| 4 | `MULTI GENERATION` in "older files", hyphen in "2017+" (§3.1) | corrected: no hyphen **only in 1990–1999**; hyphen from 2000 on | per-file counts |
| 5 | 3Gen recorded as `5 ROOM` (§3.1) | confirmed (was UNVERIFIED): 7 rows, 120 sqm, lcd 2018 | 2017+ file |
| 6 | Resale `2 ROOM` rows are 99-year flats (§3.1) | consistent with data: lcd ≥ 2010 rows have 87.7–96.8 years remaining; policy itself unverifiable | 2017+ file |
| 7 | 21 `flat_model` values; 34 raw values → 21 case-folded (§3.2) | confirmed | all files |
| 8 | UPPERCASE `flat_model` in 1990–Feb 2012; `3GEN` exists (§3.2) | corrected: only 1990–1999 is UPPERCASE; no `3GEN` anywhere | per-file values |
| 9 | Per-model flat types and eras: Model A, Standard, Model A-Maisonette, Improved-Maisonette, Premium Apartment, Premium Apartment Loft, Model A2 area, Improved era (§3.2) | corrected (8 rows of the table) | model × flat_type cross-tab; lcd and area percentiles |
| 10 | Type S1 = Pinnacle@Duxton 4-room, Type S2 = 5-room (§3.2) | confirmed by data (blocks 1A–1G CANTONMENT RD, lcd 2011); the "Pinnacle" name is PK | 2012+ files |
| 11 | Terrace: 1960s–70s, `3 ROOM`/`4 ROOM`, very large area (§3.2, §6) | refined: lcd 1968/1972, Queenstown and Kallang/Whampoa only, 78–307 sqm, median ~100 | all files |
| 12 | `remaining_lease` 2015–16 integer; 2017+ zero-padded "NN years MM months" or "NN years" (§4) | corrected: also `"NN years 01 month"` (11,973 rows) and unpadded `"0 months"` (3 rows) | 2015–16 and 2017+ files |
| 13 | `remaining_lease` reference date (§4) | corrected (was UNVERIFIED): "computed as at the resale flat application" | HDB note on the 2015–2016 resource, dataset metadata |
| 14 | Worked check: first 2017 row → lease end May 2078, start ≈ May 1979 (§4) | confirmed: row verbatim, arithmetic recomputed (Jan 2017 + 61 y 4 m = May 2078; − 99 y = May 1979) | 2017+ file, first row |
| 15 | Derived-lease formula error "up to ±1 year" (§4) | corrected: biased low, mean +0.49 y, 99.6% within [0, +1.0], range −0.92 to +1.50. Use 99.5 − … (±0.5) | 146,965 rows, 2017-01 to 2023-02 |
| 16 | Earliest resale ≈ `lease_commence_date + 5`; key collection ≈ lcd; "lcd 2019 → resale ~2024" (§1.2) | **corrected**: in the 1,065 blocks with lcd 2008–17, the first resale's calendar year is lcd+4 for 59% and lcd+3 for 27%; that is 3.2–4.2 y after the implied lease start; lcd lags key collection by ~1–2 y; lcd 2019 blocks resold from 2020-08 | first-resale month per block |
| 17 | 26 towns in the 2017+ data (§5.1) | confirmed (to Feb 2023) | 2017+ file |
| 18 | `LIM CHU KANG` only in 1990s, 27th historic value (§5.1) | confirmed (was UNVERIFIED); also noted no PUNGGOL in the 1990s file | all files |
| 19 | `TENGAH` not in resale data (§5.1) | confirmed to Feb 2023; Feb 2023–Oct 2026 unverifiable | all files |
| 20 | Floor-area ranges and soft bounds (§6) | corrected: 3 ROOM soft upper 100 → 140; MULTI-GEN lower 140 → 125; New Generation 3 ROOM up to 107 (not ~82); 3Gen 120 (not ~115); 1 ROOM "BTO design" removed; MULTI-GEN latest lcd 1988; EXECUTIVE latest lcd 2004 | area percentiles by type and model |
| 21 | Hard reject `> 400` sqm (§6) | confirmed safe: all-era max 307 | all files |
| 22 | PLH launched "Nov 2021 to Aug 2024" (§1.1) | corrected (PK, UNVERIFIED): 2024 BTO exercises were Feb/Jun/Oct, so the last pre-framework exercise is Jun 2024 | PK |
| 23 | "No Plus/Prime MOP before 2038" (§1.3) | arithmetic confirmed (2028 + 10 = 2038); reworded to "late 2030s", completion year UNVERIFIED | recomputed |
| 24 | HDB page "about 75 days before 2026-10-10" matches 28 Jul 2026 (§2.2) | corrected precision: 10 Oct 2026 − 75 d = 27 Jul 2026, one day before the coded effective date | recomputed |
| 25 | Bedroom rental "with HDB approval" (§1.3) | flagged, unverifiable: PK says bedroom rental is registered within 7 days, not pre-approved | PK |
| 26 | Resale levy "who pays" includes resale-with-grant (§2.3) | flagged, unverifiable: PK says the levy is triggered by buying a new HDB flat or EC | PK |
| 27 | HDB LTV 75% from 20 Aug 2024 (§2.4) | confirmed by cross-reference (PRIMARY in `loan-rules.md` §3) | loan-rules.md |
| 28 | BTO income ceiling $14,000 (§1.3) | unverifiable; conflicting 2026 claim of $16,000 noted from `loan-rules.md` §3.4 | loan-rules.md |
| 29 | SC 2nd-property ABSD 20% since 27 Apr 2023 (§2.1) | consistent with `stamp-duty.md` §2.2 (no 2025–26 ABSD rate change found there) | stamp-duty.md |
| 30 | MOP values: Standard/pre-2024/resale 5 y; Plus/Prime/PLH 10 y; Fresh Start 20 y; 1-room none; DBSS/EC 5 y (§1.1) | unverifiable this pass; consistent with PK. Labels unchanged | none reachable |
| 31 | MOP from key collection or resale completion; whole-flat rental periods excluded (§1.2) | unverifiable; consistent with PK | none reachable |
| 32 | Oct 2024 framework start; NDR Aug 2023 announcement; Plus/Prime no whole-flat rental; subsidy recovery per project (§1.3) | unverifiable; consistent with PK | none reachable |
| 33 | PLH: Rochor Riverfront first, 6% recovery (§1.4) | unverifiable; consistent with PK | none reachable |
| 34 | No private purchase during MOP, for flats bought from 30 Aug 2010 (§2.1); historical 1 y / 3 y resale MOP (§1.1) | unverifiable; consistent with PK | none reachable |
| 35 | 15-month wait-out from 30 Sep 2022 with senior 55+ / ≤4-room exemption (§2.2) | unverifiable this pass; consistent with PK | none reachable |
| 36 | 15-month wait-out removed 28 Jul 2026; no-HDB-loan and 6-month disposal conditions (§2.2) | **UNVERIFIED**: after the PK cutoff, no source reachable; labels unchanged | none reachable |
| 37 | Resale levy table $15k / $30k / $40k / $45k / $50k / $50k / $55k; singles half (§2.3) | unverifiable; amounts consistent with PK | none reachable |
| 38 | HFE letter from 9 May 2023; 7-day Intent to Sell (§2.4) | unverifiable; consistent with PK and `loan-rules.md` §3.5 | loan-rules.md |
| 39 | CPF and lease-to-95 rules from 10 May 2019; no CPF under 20 years remaining (§2.4) | unverifiable; consistent with PK and `loan-rules.md` §4 | loan-rules.md |
| 40 | 24 towns + 3 estates; region mapping; 15 mature / 12 non-mature (§5) | unverifiable; consistent with PK; arithmetic 24 + 3 = 27 = 15 + 12 confirmed | PK |
| 41 | SERS from 1995, ~5% of flats, 2022 two extra rehousing options (§7.1) | unverifiable; consistent with PK | none reachable |
| 42 | VERS at NDR 19 Aug 2018, ~70 years, ~20 years later; HIP II (§7.2) | unverifiable; consistent with PK. Any 2025–26 VERS update is unknown | none reachable |
