# Singapore housing loan rules (MAS, HDB, CPF): status at 10 Oct 2026

Research date: **2026-10-10**. Audience: engineers writing the affordability / loan calculators.

## 0. How to read this file

Every fact has one of these status tags:

| Tag | Meaning |
|---|---|
| **[PRIMARY]** | Confirmed in this session from a search result that quoted the primary government page (mas.gov.sg, hdb.gov.sg, cpf.gov.sg, mnd.gov.sg). |
| **[SECONDARY]** | Confirmed in this session only from non-government sources (banks, property portals). Several sources agreed. |
| **UNVERIFIED** | Not confirmed in this session. This is the researcher's best understanding from prior knowledge. **Show it as "indicative" in the UI, or confirm it before shipping.** |

**Research limitations (important):**
- `WebFetch` failed with `getaddrinfo ENOTFOUND` for every host tried: www.mas.gov.sg, mas.gov.sg, www.hdb.gov.sg, www.iras.gov.sg, www.dbs.com.sg. No full page could be read. Container `curl` is also blocked for gov.sg (proxy 403).
- `WebSearch` worked for about 12 queries. After that the shared per-turn search budget (200 calls across all agents) ran out. So [PRIMARY] means "the search engine's extract of the primary page", not a full read of the page.
- Topics that were cut short: the **HDB income ceiling** (conflicting 2026 claims, see §3.4), the **CPF lease and Valuation Limit formulas** (§4), and the **property tax tables** (§5). These are marked UNVERIFIED.
- **No 2025 or 2026 change to TDSR, MSR, the medium-term floors, bank LTV, the HDB 3% floor or the HDB 75% LTV was found.** The only 2025 cooling measure found was the Seller's Stamp Duty change of 4 Jul 2025, which does not affect loan rules (§6).

- **Fact-check pass (2026-10-10, second reviewer):** no web source could be read. WebSearch's budget was already spent, and the egress proxy refused (HTTP 403) every host tried: mas.gov.sg, hdb.gov.sg, cpf.gov.sg, iras.gov.sg, mnd.gov.sg, and also asiaone, wikipedia, straitstimes, dbs, propertyguru, stackedhomes and srx. This pass therefore (a) recomputed all arithmetic, (b) checked internal consistency and consistency with the sibling research files, and (c) checked claims against the reviewer's own knowledge of MAS/HDB/CPF/IRAS releases up to mid-2026. Corrections are marked **[CORRECTED 2026-10-10]**. Anything that depends on a 2026 announcement could not be checked. See the **Verification log** at the end.

**Recommendation:** keep every number below in one config module (see §8) with `effectiveFrom`, `source` and `verified` fields. Then a rule change only needs a config edit.

---

## 1. MAS rules for bank (FI) housing loans: TDSR, MSR and interest-rate floors

### 1.1 Total Debt Servicing Ratio (TDSR)

| Item | Value | Effective | Status | Source |
|---|---|---|---|---|
| TDSR threshold | **55%** of gross monthly income | Property loans where the **OTP is granted on or after 16 Dec 2021**. Before that it was 60%. | [PRIMARY] | https://www.mas.gov.sg/regulation/explainers/tdsr-for-property-loans/calculating-tdsr-thresholds , https://www.mas.gov.sg/regulation/explainers/new-housing-loans/msr-and-tdsr-rules |
| Formula | `TDSR = total monthly debt obligations / gross monthly income × 100%` | n/a | [PRIMARY] | https://www.mas.gov.sg/regulation/explainers/tdsr-for-property-loans/calculating-tdsr |
| Debts included | **All** of the borrower's monthly debt obligations, **including the loan being applied for**. This covers car loans, personal loans, credit card minimums and other property loans. | n/a | [PRIMARY] | as above |
| Above 55% | "Loans above the 55% threshold should only be granted in exceptional cases" | n/a | [PRIMARY] | as above |
| Secured revolving credit | Apply the medium-term rate to the **amount drawn down** | n/a | [PRIMARY] | calculating-tdsr page |
| Unsecured revolving credit (e.g. credit cards) | Use the **minimum sum due** | n/a | [PRIMARY] | calculating-tdsr page |
| Guaranteed loans | Include at least **20%** of the monthly obligation of any property loan the borrower guarantees. The search extract states this for MSR. It applies to TDSR in the same way, but that is UNVERIFIED. | n/a | [PRIMARY] for MSR | msr-and-tdsr-rules page |
| Legal instrument | MAS Notice 645 (TDSR for property loans). The 29 Sep 2022 amendment PDF still shows the older 3.5% and 4.5% floors in places. Treat the explainer pages and the 2022 media release as authoritative for the current floors. **Reviewer note:** "still shows the older floors in places" is UNVERIFIED and may be a misreading. An amendment instrument normally shows the old text (3.5% / 4.5%) being replaced by the new (4% / 5%). The current floors are 4% / 5% either way. | 2013, amended 2021 and 2022 | [PRIMARY] for the existence of the notice. The "older floors" remark is UNVERIFIED. | https://www.mas.gov.sg/-/media/MAS/Regulations-and-Financial-Stability/Regulations-Guidance-and-Licensing/Commercial-Banks/Regulations-Guidance-and-Licensing/Notices/MAS-Notice-645_TDSR_290922-Amendment.pdf |
| Refinancing of owner-occupied property loans | Exempt from TDSR. A 2016 refinement changed related details. | 2013, refined 2016 | UNVERIFIED (only the title "TDSR Rules on Refinancing Fine-tuned" was seen) | https://www.mas.gov.sg/news/media-releases/2016/tdsr-rules-on-refinancing-fine-tuned |

**Income recognition for TDSR. All UNVERIFIED (prior knowledge), so confirm before use:**
- Fixed salary: 100%.
- Variable income (bonus, commission, allowances) and rental income: apply a **30% haircut** (count 70%).
- Eligible financial assets used as "deemed income": divide the value by **48 months**. **[CORRECTED 2026-10-10, still UNVERIFIED]** The haircut depends on whether the assets are **pledged**. *Unpledged* eligible financial assets, **including cash**, take a haircut of at least **30%** before dividing by 48. Assets *pledged* with the lender for at least 48 months are divided by 48, and cash or fixed deposits take no haircut. The earlier text said "cash and FDs take no haircut" without this condition. That would overstate income for unpledged cash ("show funds").
- Joint borrowers: add up the borrowers' incomes and debts.

### 1.2 Mortgage Servicing Ratio (MSR)

| Item | Value | Effective | Status | Source |
|---|---|---|---|---|
| MSR threshold | **30%** of gross monthly income | Has been 30% since 2013 for FI loans | [PRIMARY] | https://www.mas.gov.sg/regulation/explainers/new-housing-loans/msr-and-tdsr-rules , https://www.mas.gov.sg/publications/macroprudential-policies-in-singapore |
| What counts | Instalments on **all property loans**, **including the loan being applied for**, plus at least **20%** of the monthly obligation of any property loan the borrower guarantees | n/a | [PRIMARY] | msr-and-tdsr-rules page |
| Which properties | Housing loans for **HDB flats** (new or resale), and **Executive Condominium (EC) units bought directly from the property developer**. MAS's macroprudential page says the cap applies to "housing loans granted by FIs for HDB flats and executive condominium units purchased directly from property developers". Another MAS extract words it as "an EC where the minimum occupation period has not expired". | HDB: 2013. EC from developer: **OTP granted on or after 10 Dec 2013** | [PRIMARY] | https://www.mas.gov.sg/publications/macroprudential-policies-in-singapore , https://www.mas.gov.sg/-/media/mas-media-library/publications/macroprudential-policies-in-singapore/press-release--refining-the-ec-housing-scheme-9-dec-2013.pdf |
| Not in scope | Private condos, landed homes, and ECs bought on the resale market after MOP are subject to **TDSR only**, not MSR. | n/a | Follows from the scope above [PRIMARY] | n/a |
| HDB loans | HDB applies its own **30% MSR** when deciding HDB concessionary loan eligibility (§3) | n/a | [SECONDARY] (many agreeing sources) | §3 |
| Interaction | A loan on an HDB flat or new EC must pass **both** MSR (30%) **and** TDSR (55%). The lower resulting loan is binding. | n/a | [PRIMARY] (the explainer lists both) | msr-and-tdsr-rules page |

### 1.3 Medium-term interest rate floors (the stress-test rate for TDSR and MSR)

The rate used to compute the monthly instalment for TDSR and MSR is **max(floor, the loan's "thereafter" rate)**. It is applied **only to the loan under application**. Existing loans use their actual instalments.

| Loan type (bank / FI) | Floor | Effective | Before | Status | Source |
|---|---|---|---|---|---|
| Residential property purchase loans and residential mortgage equity withdrawal loans | **4.0% p.a.** (or the thereafter rate if higher) | Purchases where the **OTP is granted on or after 30 Sep 2022**, and new MEW loan applications on or after 30 Sep 2022 | 3.5% (2013 to 29 Sep 2022) | [PRIMARY] | https://www.mas.gov.sg/regulation/explainers/tdsr-for-property-loans/calculating-tdsr , https://www.mas.gov.sg/news/media-releases/2022/measures-to-promote-sustainable-conditions-in-the-property-market-by-ensuring-prudent-borrowing-and-moderating-demand |
| Non-residential property purchase and equity withdrawal loans | **5.0% p.a.** (or the thereafter rate if higher) | Same date, 30 Sep 2022 | 4.5% | [PRIMARY] | same |
| Any 2025 or 2026 change? | **None found.** 2026 secondary guides still quote 4%. | n/a | n/a | [SECONDARY] | e.g. https://aiproperty.sg/blog/how-much-home-loan-can-i-get-singapore |

MAS said the 2022 increase was made because medium-term rates were expected to be higher than during the "exceptionally low rates" period of 2013 to 2021.

### 1.4 HDB's interest-rate floor for HDB loan eligibility

| Item | Value | Effective | Status | Source |
|---|---|---|---|---|
| Rate used to compute the eligible **HDB** loan amount | **max(3.0% p.a., prevailing HDB concessionary rate)**. The concessionary rate is CPF OA rate + 0.1 point, currently 2.6%, so **3.0% binds**. | HLE applications (now HFE, see §3.5) **received on or after 30 Sep 2022** | [PRIMARY] | https://www.hdb.gov.sg/about-us/news-and-publications/press-releases/29092022-propertymeasures2022 , https://www.hdb.gov.sg/residential/buying-a-flat/working-out-your-flat-budget/credit-to-finance-a-flat-purchase |
| Effect on the rate actually charged | **None.** HDB stated: "There is no change to the actual interest rate charged for housing loans provided by HDB." | n/a | [PRIMARY] | 29092022 press release |

---

## 2. MAS loan-to-value (LTV), down payment and tenure rules for bank / FI loans

### 2.1 LTV and minimum cash down payment (individual borrowers)

For a joint loan, **[CORRECTED 2026-10-10: the earlier wording said "total number", which contradicted the next sentence]** count the outstanding housing loans of **each** borrower. The borrower with the **most** outstanding housing loans decides the row. Do not add the borrowers' counts together. This counting rule is UNVERIFIED (reviewer's prior knowledge).

| No. of outstanding housing loans (at application) | LTV limit (standard) | LTV limit if tenure > 30 yrs (> 25 yrs for HDB flats) **or** loan period runs past age 65 | Min. **cash** down payment |
|---|---|---|---|
| 0 (first housing loan) | **75%** | **55%** | **5%** of value (when LTV is 75%). **10%** (when LTV is 55%). |
| 1 | **45%** | **25%** | **25%** |
| 2 or more | **35%** | **15%** | **25%** |
| Non-individual borrowers (companies) | **15%** (since **6 Jul 2018**, cut from 20%. **[CORRECTED 2026-10-10]**: the earlier text said Dec 2021, but the 16 Dec 2021 measures did not change FI LTV limits). UNVERIFIED | n/a | n/a |

- **Status:** UNVERIFIED as a full table. The searches did not return MAS's LTV explainer page. The 75% / 55% figures for the first loan are [SECONDARY] (2026 guides: "Bank loan, 1st property: 75% (or 55% if age/tenure conditions)"). HDB's own page also notes that FIs "may have restrictions ... if the repayment period exceeds 25 years". **[CORRECTED 2026-10-10]** The current values were set by the **6 Jul 2018** measures. These cut every FI LTV tier by 5 points: first loan 80→75% (60→55%), second loan 50→45% (30→25%), third loan 40→35% (20→15%), and non-individuals 20→15%. The **Oct 2012** measures (tenure > 30 years / age-65 trigger) and the **Jan 2013** measures (second/third-loan tiers) set up the structure of the table. The 15% non-individual figure dates from **6 Jul 2018**, not 16 Dec 2021. These dates come from the reviewer's prior knowledge and are UNVERIFIED against the primary page.
- **Primary page to confirm:** https://www.mas.gov.sg/regulation/explainers/new-housing-loans (section "Loan-to-Value Limits").
- **Base for LTV:** the **lower of purchase price and valuation**. [SECONDARY]. HDB states the same for HDB loans.
- **The rest of the down payment** (after the minimum cash) can come from CPF OA and/or cash, subject to CPF rules (§4). UNVERIFIED.

### 2.2 Maximum tenure and the age-65 rule (bank loans)

| Rule | Value | Status | Source / note |
|---|---|---|---|
| Max tenure, **HDB flat**, bank loan | **30 years** | [SECONDARY] (widely quoted) | MAS rule since Aug 2013. Primary page not read. |
| Max tenure, **non-HDB** (private, EC), bank loan | **35 years** | [SECONDARY] | MAS rule since Oct 2012. Primary page not read. |
| Lower LTV trigger (tenure) | Tenure **> 25 years for HDB flats**, **> 30 years for non-HDB** puts the loan in the lower LTV column (55% / 25% / 15%) | [SECONDARY] (supported by HDB's "repayment period exceeds 25 years") | |
| Lower LTV trigger (age) | **Tenure + borrower age > 65** puts the loan in the lower LTV column | [SECONDARY] | |
| Age measure for joint borrowers | **Income-weighted average age (IWAA)**, rounded per bank practice | UNVERIFIED | Example: A is 40 and earns $6,000; B is 30 and earns $4,000. IWAA = (40×6000 + 30×4000)/10000 = **36**. |

**Engineering rule (bank loan):**
```
lowLtv = (isHdbFlat ? tenure > 25 : tenure > 30) || (iwaa + tenure > 65)
maxTenure = isHdbFlat ? 30 : 35
```

---

## 3. HDB concessionary housing loan

| Item | Value | Effective | Status | Source |
|---|---|---|---|---|
| LTV limit | **75%** of the **lower of price or value** | **Complete resale applications received on or after 20 Aug 2024 (00:00)**, and new-flat applications **from the October 2024 BTO/SBF exercise onwards**. Announced 19 Aug 2024 by MND/HDB. | [PRIMARY] | https://www.hdb.gov.sg/business-partners/estate-agents-and-salespersons/letters-to-keos/measures-to-cool-the-hdb-resale-market-and-provide-greater-support-for-first-time-home-buyers , https://www.mnd.gov.sg/newsroom/speeches/view/measures-to-cool-the-hdb-resale-market-and-provide-more-support-for-first-time-home-buyers , https://www.hdb.gov.sg/-/media/hdb-pulse/news/2024/oct-bto-launch/Annex-C.pdf |
| LTV history | 90% → **85%** (16 Dec 2021) → **80%** (HLE applications from 30 Sep 2022) → **75%** (20 Aug 2024) | as listed | 80% and 75%: [PRIMARY]. 85% on 16 Dec 2021: UNVERIFIED | 29092022 press release, Aug 2024 release |
| Short-lease pro-rating | The LTV is **pro-rated** if the flat's remaining lease **cannot cover the youngest applicant to age 95** | Since 10 May 2019 (date UNVERIFIED) | [PRIMARY] (the HDB page says so; the exact formula was not seen) | credit-to-finance-a-flat-purchase page |
| Interest rate charged | **2.6% p.a.** = prevailing CPF OA rate (**2.5%**) + **0.1 point**, reviewed **quarterly** | Q4 2026 (1 Oct to 31 Dec 2026): OA 2.5%, so 2.6% | [PRIMARY] (cpf.gov.sg per search extract) | https://www.hdb.gov.sg/managing-my-home/finances/loan-matters/interest-rate , https://www.cpf.gov.sg/member/growing-your-savings/earning-higher-returns/earning-attractive-interest |
| Rate for eligibility (stress) | **max(3.0%, concessionary rate)**, which is 3.0% today (see §1.4) | HLE/HFE applications from 30 Sep 2022 | [PRIMARY] | §1.4 |
| MSR | **30%** of gross monthly household income | Long-standing | [SECONDARY] (many 2026 sources agree) | e.g. https://www.perfingo.com/calculators/mortgage-calculator/ |
| Max repayment period | **25 years**, or until age **65**, whichever is shorter | Long-standing | [SECONDARY] for 25 years. The age-65 cap is [SECONDARY]. Whether "age" means average or income-weighted average age is UNVERIFIED. | as above |
| Extra tenure cap for old flats | "Remaining lease minus 20 years" is cited by one third-party source | n/a | **UNVERIFIED**. This may be a pre-2019 rule. | perfingo (third-party) |
| Lifetime limit | At most **2** HDB concessionary loans | Long-standing | [SECONDARY] | https://lovelyhomes.com.sg/hdb-concessionary-loan-singapore-2026/ (note: that page wrongly says "80% LTV") |
| Other eligibility | At least one buyer is a Singapore Citizen. Household income within the ceiling. No private property owned or disposed of in the past 30 months. Other conditions apply. | n/a | UNVERIFIED (prior knowledge) | n/a |
| CPF OA retention | When taking an HDB loan, buyers must use their OA savings first but may keep up to **$20,000** in OA | n/a | **UNVERIFIED** | n/a |

### 3.4 HDB loan income ceiling: CONFLICT, show as UNVERIFIED

| Household type | Long-standing ceiling (since **Sep 2019**) | Claimed 2026 ceiling (one third-party site, about Oct 2026) |
|---|---|---|
| Families / couples | **$14,000** / month | $16,000 |
| Extended families | **$21,000** | $24,000 |
| Singles | **$7,000** | $8,000 |

- One secondary source (perfingo.com, about 5 days before the research date) says the ceilings were raised to $16k / $24k / $8k. Another 2026 source says they were last revised in 2019, with no change in 2026. **No primary HDB or MND page was retrieved to settle this.** The search budget ran out.
- **Action:** treat the income ceiling as configurable. Show it with a caveat. Confirm on https://www.hdb.gov.sg/residential/buying-a-flat/understanding-your-eligibility-and-housing-loan-options/housing-loan-options/housing-loan-from-hdb (URL UNVERIFIED) before shipping. Note that `docs/research/rates-data.md` cites a different path for the same page: `.../buying-a-flat/financing-a-flat-purchase/housing-loan-options/housing-loan-from-hdb`. At most one of the two is current, and neither could be checked. Do **not** hard-code it as fact.

### 3.5 HLE letter → HFE letter

- The **HDB Loan Eligibility (HLE) letter was replaced by the HDB Flat Eligibility (HFE) letter on 9 May 2023**. The HFE letter covers, in one application, (a) eligibility to buy a new or resale flat, (b) CPF housing grants, and (c) HDB housing loan eligibility and amount. Buyers taking a **bank** loan also need an HFE letter for flat-eligibility purposes. [SECONDARY] for "since May 2023". The exact date 9 May 2023 and the **9-month validity** are UNVERIFIED (prior knowledge).
- In the UI, call it "HFE letter (formerly HLE)".

---

## 4. CPF usage for buying a flat or property with remaining lease

These rules have applied since **10 May 2019**. **Everything in this section is UNVERIFIED in this session**, because the search budget ran out before CPF pages could be checked. The rules are well established, but confirm them at https://www.cpf.gov.sg/member/home-ownership/using-your-cpf-to-buy-a-home (URL UNVERIFIED).

| Rule | Detail |
|---|---|
| Minimum remaining lease to use any CPF | **20 years** remaining lease. Below 20 years, no CPF OA can be used. |
| Full CPF use | Allowed only if the **remaining lease covers the youngest buyer to age 95** (`youngestAge + remainingLease >= 95`). |
| Pro-rated CPF use | If the lease does not reach age 95, CPF use is pro-rated. Best understanding of the formula: `ratio = remainingLease / (95 − youngestAge)`, and `pro-rated limit = VL (or WL) × ratio`. Example: youngest buyer 50, lease 40 years. 50 + 40 = 90 < 95, so ratio = 40/45 = **88.89%**. With VL $400,000, the CPF cap is $400,000 × 40/45 = **$355,555.56**. |
| HDB loan pro-rating | The HDB loan LTV is pro-rated on the same "cover youngest to 95" basis ([PRIMARY] that it is pro-rated; formula UNVERIFIED, assumed analogous: `75% × ratio`). |
| Valuation Limit (VL) | VL = **lower of purchase price and valuation at the time of purchase**. CPF OA can be used for the down payment, monthly instalments and related costs up to the VL. |
| Withdrawal Limit (WL) | WL = **120% of VL**. After total CPF used reaches the VL, members can use more CPF, up to the WL, only after setting aside the prevailing **Basic Retirement Sum** (in OA/SA/RA, depending on age). This applies to private property and to HDB flats financed by a bank loan. |
| HDB flat with HDB loan | Full CPF use for HDB flats where the lease covers the youngest to 95 is generally **not** capped by VL/WL in the same way. **UNVERIFIED nuance.** Confirm before modelling. |

---

## 5. Property tax: residential (IRAS)

**All UNVERIFIED in this session** (no IRAS page could be read or searched). These are the researcher's best understanding. Verify at https://www.iras.gov.sg/taxes/property-tax/property-owners/property-tax-rates/residential-property before display.

Property tax is progressive on the property's **Annual Value (AV)**, which is set by IRAS. It is calculated tier by tier, like income tax.

### 5.1 Owner-occupied residential: from 1 Jan 2025 (AV bands raised)

| AV band (S$) | Rate |
|---|---|
| First 12,000 | 0% |
| 12,001 – 40,000 (next 28,000) | 4% |
| 40,001 – 50,000 (next 10,000) | 6% |
| 50,001 – 65,000 (next 15,000) | 10% |
| 65,001 – 80,000 (next 15,000) | 14% |
| 80,001 – 95,000 (next 15,000) | 20% |
| 95,001 – 110,000 (next 15,000) | 26% |
| Above 110,000 | 32% |

For comparison, the **2024** owner-occupier bands were: first 8,000 at 0%; next 22,000 at 4% (to 30,000); next 10,000 at 6% (to 40,000); next 15,000 at 10% (to 55,000); next 15,000 at 14% (to 70,000); next 15,000 at 20% (to 85,000); next 15,000 at 26% (to 100,000); above 100,000 at 32%.

**2026:** it is not known whether the bands changed again for 2026. **UNVERIFIED.**

### 5.2 Non-owner-occupied residential: from 1 Jan 2024 (believed unchanged in 2025 and 2026)

| AV band (S$) | Rate |
|---|---|
| First 30,000 | 12% |
| 30,001 – 45,000 (next 15,000) | 20% |
| 45,001 – 60,000 (next 15,000) | 28% |
| Above 60,000 | 36% |

Worked example (owner-occupied, 2025 bands, AV $30,000): 0% × 12,000 + 4% × 18,000 = **$720**. This ignores any one-off rebates.

---

## 6. Changes announced in 2025 and 2026

| Date | Change | Relevant to loans? | Status | Source |
|---|---|---|---|---|
| Announced 3 Jul 2025, effective for residential property bought **on or after 4 Jul 2025** | Seller's Stamp Duty: the holding period went from 3 to **4 years**, and rates went up by 4 points to **16% / 12% / 8% / 4%** (years 1 to 4). HDB flats are excluded because they are governed by MOP. | No (affects transaction costs only) | [SECONDARY] | https://propkaki.sg/guides/singapore-property-cooling-measures , https://www.srx.com.sg/cooling-measures |
| Q4 2026 (1 Oct to 31 Dec 2026) | CPF OA rate stays at the **2.5%** legal minimum, so the HDB concessionary rate stays at **2.6%**. The 4% SMRA floor is extended to 31 Dec 2027. | Yes (HDB loan rate) | [PRIMARY] per cpf.gov.sg search extract (original researcher). **Reviewer note:** this could not be re-checked. `docs/research/rates-data.md` says the Q4 2026 CPF announcement could *not* be fetched, so the two files disagree on provenance. 2.5% / 2.6% is high-confidence because of the legislated 2.5% OA floor. The **"SMRA 4% floor extended to 31 Dec 2027"** claim is **UNVERIFIED** and is not needed by any loan calculator. Do not display it. | https://www.cpf.gov.sg/member/growing-your-savings/earning-higher-returns/earning-attractive-interest , https://www.asiaone.com/singapore/cpf-interest-rates-2026-october-december |
| 2026 (claimed) | HDB income ceilings raised to $16k / $24k / $8k | Yes | **UNVERIFIED / conflicting** (§3.4) | perfingo.com (third-party) |
| None found | TDSR 55%, MSR 30%, 4% / 5% floors, HDB 3% floor, HDB LTV 75%, bank LTV table | n/a | Searched. No change found. | §1 to §3 |

Note: one secondary site says the HDB LTV was cut to 75% "on 20 September 2024". That is **wrong**. The primary MND/HDB sources give **20 Aug 2024**.

---

## 7. Worked examples (exact arithmetic)

**Annuity formula** (monthly compounding, payments in arrears):
```
r = annualRate / 12
n = years × 12
PVfactor(r, n) = (1 − (1 + r)^(−n)) / r
maxLoan  = maxMonthlyInstalment × PVfactor
instalment(P) = P × r / (1 − (1 + r)^(−n))
```
Factors computed with 40-digit Decimal arithmetic:

| Rate p.a. | Years | n | (1+r)^n | PV factor |
|---|---|---|---|---|
| 4.0% | 20 | 240 | 2.222582 | 165.021858 |
| 4.0% | 25 | 300 | 2.713765 | 189.452483 |
| 4.0% | 30 | 360 | 3.313498 | 209.461240 |
| 4.0% | 35 | 420 | 4.045770 | 225.848475 |
| 3.0% | 25 | 300 | 2.115020 | 210.876453 |
| 2.6% | 25 | 300 | 1.914194 | 220.424777 |

Banks and HDB may round differently (for example to the nearest $1,000, or by flooring the instalment). The results below are exact to the cent before any such rounding.

### Example A: resale HDB flat, bank loan (MSR + TDSR + LTV + tenure)
- Couple, combined gross fixed income **$10,000/month**, no other debts, IWAA 35, no outstanding housing loans. Price = valuation = **$700,000**.
- MSR cap: 30% × 10,000 = **$3,000/month**. TDSR cap: 55% × 10,000 = **$5,500/month**. MSR binds because there are no other debts.
- Stress rate: max(4.0%, thereafter rate) = 4.0% (assuming the thereafter rate is below 4%).
- **Option 1: 25-year tenure.** 25 ≤ 25 (HDB) and 35 + 25 = 60 ≤ 65, so the **LTV is 75%**.
  - MSR loan = 3,000 × 189.452483 = **$568,357.45**
  - LTV cap = 75% × 700,000 = **$525,000.00**
  - **Max loan = min(568,357.45, 525,000) = $525,000.00** (LTV binds). Actual instalment at the 4% stress rate = $2,771.14, which is ≤ $3,000.
  - Down payment = $175,000, of which at least 5% × 700,000 = **$35,000 in cash**. The other $140,000 can come from cash or CPF OA (subject to §4).
- **Option 2: 30-year tenure.** 30 > 25 for an HDB flat, so the **LTV is 55%**.
  - MSR loan = 3,000 × 209.461240 = $628,383.72, but the LTV cap = 55% × 700,000 = **$385,000.00**. Min cash = 10% = $70,000.
  - So a longer tenure on an HDB flat **reduces** the maximum bank loan.

### Example B: private condo, bank loan (TDSR only, with an existing debt)
- Single borrower aged 30, gross fixed income **$10,000/month**, car loan **$800/month**, first housing loan. Price = valuation = **$1,500,000**. Tenure 30 years (≤ 30, and 30 + 30 = 60 ≤ 65, so the LTV is 75%).
- TDSR room = 55% × 10,000 − 800 = 5,500 − 800 = **$4,700/month**. MSR does not apply.
- TDSR loan = 4,700 × 209.461240 = **$984,467.83**. Check: instalment(984,467.83, 4%, 30 yrs) = $4,700.00.
- LTV cap = 75% × 1,500,000 = $1,125,000.00.
- **Max loan = min(984,467.83, 1,125,000) = $984,467.83** (TDSR binds).
- Down payment = 1,500,000 − 984,467.83 = **$515,532.17**. Minimum cash = 5% × 1,500,000 = $75,000.

### Example C: HDB concessionary loan (HDB 3% floor + MSR + LTV)
- Household gross income **$8,000/month**, resale 4-room flat, price = valuation = **$600,000**. The lease covers the youngest buyer to age 95. Tenure 25 years, and the age-65 cap does not bind.
- MSR cap: 30% × 8,000 = **$2,400/month**.
- Eligibility rate = max(3.0%, 2.6%) = **3.0%**.
- MSR loan = 2,400 × 210.876453 = **$506,103.49**. Check: instalment at 3%, 25 yrs = $2,400.00.
- LTV cap = 75% × 600,000 = **$450,000.00**.
- **Max HDB loan = $450,000.00** (LTV binds).
- Actual instalment at the charged rate of 2.6% over 25 yrs = **$2,041.51/month**. At the 3% stress rate it would be $2,133.95.
- Down payment 25% = $150,000. With an HDB loan this can be paid from CPF OA and/or cash. The cash/CPF split and staging are UNVERIFIED.

### Example D: age-65 rule
- Borrower IWAA **45**, private property, first loan, income $10,000, no debts (TDSR room $5,500).
- 25-year tenure: 45 + 25 = 70 > 65, so the **LTV is 55%**. TDSR loan = 5,500 × 189.452483 = $1,041,988.66.
- 20-year tenure: 45 + 20 = 65, which is not greater than 65, so the **LTV is 75%**. TDSR loan = 5,500 × 165.021858 = **$907,620.22**.
- On a $1,200,000 property: the 20-year option gives min(907,620.22, 900,000) = **$900,000**. The 25-year option gives min(1,041,988.66, 660,000) = **$660,000**.

### Example E: income-weighted average age
- A: age 40, income $6,000. B: age 30, income $4,000. IWAA = (40 × 6,000 + 30 × 4,000) / 10,000 = 360,000 / 10,000 = **36**. The max tenure that keeps 75% LTV on a private property is min(30, 65 − 36 = 29) = **29 years**. (UNVERIFIED: IWAA convention and rounding.)

---

## 8. Suggested config (TypeScript), one place for every rule

```ts
// src/lib/rules/loanRules.ts — values as researched 2026-10-10; see docs/research/loan-rules.md
export const LOAN_RULES = {
  tdsr: { max: 0.55, effectiveFrom: "2021-12-16", basis: "OTP date", verified: "primary",
          source: "https://www.mas.gov.sg/regulation/explainers/tdsr-for-property-loans/calculating-tdsr-thresholds" },
  msr:  { max: 0.30, appliesTo: ["HDB", "EC_FROM_DEVELOPER"], verified: "primary",
          source: "https://www.mas.gov.sg/regulation/explainers/new-housing-loans/msr-and-tdsr-rules" },
  stressRate: { residential: 0.04, nonResidential: 0.05, effectiveFrom: "2022-09-30", basis: "OTP date",
                rule: "max(floor, thereafterRate)", verified: "primary",
                source: "https://www.mas.gov.sg/regulation/explainers/tdsr-for-property-loans/calculating-tdsr" },
  bankLtv: { // [outstandingLoans] -> { standard, reduced, minCash: [standard, reduced] }
    0: { standard: 0.75, reduced: 0.55, minCash: [0.05, 0.10] },
    1: { standard: 0.45, reduced: 0.25, minCash: [0.25, 0.25] },
    2: { standard: 0.35, reduced: 0.15, minCash: [0.25, 0.25] }, // 2 or more
    nonIndividual: 0.15, // since 2018-07-06 (UNVERIFIED; not Dec 2021)
    jointBorrowers: "row = borrower with the MOST outstanding housing loans (UNVERIFIED)",
    reducedIf: { tenureGtYears: { HDB: 25, OTHER: 30 }, ageAtEndGt: 65 },
    verified: "secondary",
  },
  bankMaxTenure: { HDB: 30, OTHER: 35, verified: "secondary" },
  hdbLoan: {
    ltv: 0.75, effectiveFrom: "2024-08-20", verified: "primary",
    chargedRate: 0.026, // CPF OA 2.5% + 0.1pt, Q4 2026; reviewed quarterly
    eligibilityRateFloor: 0.03, floorEffectiveFrom: "2022-09-30",
    msr: 0.30, maxTenureYears: 25, maxAge: 65,
    incomeCeiling: { family: 14000, extendedFamily: 21000, single: 7000, verified: "UNVERIFIED-conflict" },
    leaseProRateAge: 95,
  },
  cpf: { minLeaseYears: 20, fullUseCoverAge: 95, withdrawalLimitMultiple: 1.2, verified: "UNVERIFIED" },
} as const;
```

---

## 9. Source URL index

- MAS: calculating TDSR: https://www.mas.gov.sg/regulation/explainers/tdsr-for-property-loans/calculating-tdsr
- MAS: TDSR thresholds: https://www.mas.gov.sg/regulation/explainers/tdsr-for-property-loans/calculating-tdsr-thresholds
- MAS: MSR and TDSR rules (new housing loans): https://www.mas.gov.sg/regulation/explainers/new-housing-loans/msr-and-tdsr-rules
- MAS: rules for new housing loans (includes LTV; not read): https://www.mas.gov.sg/regulation/explainers/new-housing-loans
- MAS: macroprudential policies: https://www.mas.gov.sg/publications/macroprudential-policies-in-singapore
- MAS: media release, 29 Sep 2022: https://www.mas.gov.sg/news/media-releases/2022/measures-to-promote-sustainable-conditions-in-the-property-market-by-ensuring-prudent-borrowing-and-moderating-demand
- MAS: EC scheme refinement, 9 Dec 2013 (PDF): https://www.mas.gov.sg/-/media/mas-media-library/publications/macroprudential-policies-in-singapore/press-release--refining-the-ec-housing-scheme-9-dec-2013.pdf
- MAS Notice 645 amendment, 29 Sep 2022 (PDF): see the URL in §1.1
- HDB: Sep 2022 measures press release: https://www.hdb.gov.sg/about-us/news-and-publications/press-releases/29092022-propertymeasures2022
- HDB: credit to finance a flat purchase: https://www.hdb.gov.sg/residential/buying-a-flat/working-out-your-flat-budget/credit-to-finance-a-flat-purchase
- HDB: interest rate for HDB housing loan: https://www.hdb.gov.sg/managing-my-home/finances/loan-matters/interest-rate
- HDB: letter to KEOs, Aug 2024 measures: https://www.hdb.gov.sg/business-partners/estate-agents-and-salespersons/letters-to-keos/measures-to-cool-the-hdb-resale-market-and-provide-greater-support-for-first-time-home-buyers
- MND: Aug 2024 measures: https://www.mnd.gov.sg/newsroom/speeches/view/measures-to-cool-the-hdb-resale-market-and-provide-more-support-for-first-time-home-buyers (path UNVERIFIED: the 19 Aug 2024 item was a press release, and MND press releases are usually under `/newsroom/press-releases/view/`, not `/speeches/view/`. Check before citing it in the UI.)
- HDB: Oct 2024 BTO Annex C: https://www.hdb.gov.sg/-/media/hdb-pulse/news/2024/oct-bto-launch/Annex-C.pdf
- CPF: interest rates: https://www.cpf.gov.sg/member/growing-your-savings/earning-higher-returns/earning-attractive-interest
- IRAS: residential property tax rates (not read): https://www.iras.gov.sg/taxes/property-tax/property-owners/property-tax-rates/residential-property

---

## Verification log

Second-pass fact check, 2026-10-10. **Method limits:** no primary page could be read in this pass. The WebSearch budget was spent, and the proxy returned HTTP 403 for every host, gov.sg and non-gov alike. Verdicts mean the following:
- **confirmed (math):** recomputed independently with 40-digit `decimal` arithmetic.
- **confirmed (PK):** matches the reviewer's own knowledge of the official MAS/HDB/CPF/IRAS releases up to mid-2026. The primary page was *not* re-fetched, and the original status tag is kept.
- **corrected:** changed in this pass (see the **[CORRECTED 2026-10-10]** markers).
- **unverifiable:** cannot be confirmed or refuted without a 2026 primary source. Treat it as UNVERIFIED.

| # | Claim (section) | Verdict | Basis / source |
|---|---|---|---|
| 1 | TDSR 55% for OTP on or after 16 Dec 2021, previously 60% (§1.1) | confirmed (PK) | MAS/MND/MOF joint release, 15 Dec 2021 |
| 2 | TDSR formula, and all debts including the new loan (§1.1) | confirmed (PK) | MAS TDSR explainer |
| 3 | 30% haircut on variable and rental income (§1.1) | confirmed (PK), still UNVERIFIED | MAS TDSR rules (2013) |
| 4 | Financial assets ÷ 48, "cash/FD no haircut" (§1.1) | **corrected** (still UNVERIFIED) | No haircut applies only to *pledged* cash/FDs. Unpledged assets, cash included, take ≥ 30% |
| 5 | Guarantor 20% (§1.1, §1.2) | unverifiable | MAS page not readable |
| 6 | Notice 645 amendment PDF "still shows 3.5%/4.5% in places" (§1.1) | unverifiable | Flagged as a likely misreading of amendment text. The current floors are 4%/5% regardless |
| 7 | Refinancing exemption and the 2016 refinement (§1.1) | unverifiable | Left as UNVERIFIED |
| 8 | MSR 30%, scope HDB + EC from developer, EC OTP on or after 10 Dec 2013 (§1.2) | confirmed (PK) | MAS release, 9 Dec 2013 |
| 9 | Medium-term floors 4% residential / 5% non-residential, OTP on or after 30 Sep 2022, previously 3.5% / 4.5% (§1.3) | confirmed (PK) | Joint release, 29 Sep 2022 |
| 10 | No 2025–26 change to TDSR, MSR or the floors (§1.3, §6) | unverifiable for 2026 | No change known up to mid-2026. A later 2026 change cannot be ruled out |
| 11 | HDB 3% eligibility floor for HLE applications from 30 Sep 2022, with no change to the charged rate (§1.4) | confirmed (PK) | HDB release, 29 Sep 2022 |
| 12 | Bank LTV tiers 75/55, 45/25, 35/15 and min cash 5/10/25/25 (§2.1) | confirmed (PK) | MAS 2018 measures |
| 13 | Non-individual LTV 15% "Dec 2021" (§2.1) | **corrected** to 6 Jul 2018 (20→15%) | MAS/MND/MOF release, 5 Jul 2018. The 16 Dec 2021 measures did not change FI LTV |
| 14 | "Figures unchanged since Jan 2013 / Jul 2018 (tiering)" (§2.1) | **corrected** | Current values were set 6 Jul 2018 (−5 points on every tier). The structure dates from Oct 2012 / Jan 2013 |
| 15 | Joint-borrower loan count ("total number" vs "most") (§2.1) | **corrected** (internal contradiction) | Use the borrower with the most loans. Still UNVERIFIED |
| 16 | Base = lower of price and valuation (§2.1) | confirmed (PK) | n/a |
| 17 | Max tenure 30 years (HDB) / 35 years (non-HDB), lower-LTV triggers > 25 / > 30 years or past age 65 (§2.2) | confirmed (PK) | MAS 6 Oct 2012 and 27 Aug 2013 measures |
| 18 | IWAA for joint borrowers (§2.2) | confirmed (PK), rounding UNVERIFIED | n/a |
| 19 | HDB LTV 75% for resale applications from 20 Aug 2024 and new flats from the Oct 2024 BTO/SBF, announced 19 Aug 2024 (§3) | confirmed (PK) | MND/HDB release, 19 Aug 2024 |
| 20 | HDB LTV history 90→85 (16 Dec 2021)→80 (30 Sep 2022)→75 (§3) | confirmed (PK). The 85% step is still officially UNVERIFIED | n/a |
| 21 | HDB LTV pro-rating for leases short of age 95, since 10 May 2019 (§3) | confirmed (PK) for the rule and date. Formula UNVERIFIED | MND/CPF/HDB changes, 10 May 2019 |
| 22 | HDB rate = OA + 0.1 point, reviewed quarterly, 2.6% (§3) | confirmed (PK) for the peg. Q4 2026 value unverifiable (high confidence because of the 2.5% legal floor) | n/a |
| 23 | HDB MSR 30%, 25 years / age 65, 2 HDB loans max, 30-month private-property wait-out, SC requirement (§3) | confirmed (PK), still UNVERIFIED | n/a |
| 24 | "Remaining lease minus 20 years" tenure cap (§3) | unverifiable | n/a |
| 25 | $20,000 OA retention with an HDB loan (§3) | confirmed (PK), still UNVERIFIED | n/a |
| 26 | Income ceilings $14k / $21k / $7k since Sep 2019 (§3.4) | confirmed (PK) | HDB, 11 Sep 2019 |
| 27 | Claimed 2026 rise to $16k / $24k / $8k (§3.4, §6) | **unverifiable** | Not known up to mid-2026. Keep configurable and do not display as fact |
| 28 | HLE→HFE on 9 May 2023, 9-month validity (§3.5) | confirmed (PK), still UNVERIFIED | Consistent with `hdb-rules.md` |
| 29 | CPF rules from 10 May 2019: 20-year minimum lease, cover to age 95, pro-rating = lease/(95 − youngest age), VL, WL = 120% VL with BRS set aside (§4) | confirmed (PK) for the structure, still UNVERIFIED. Example arithmetic confirmed (math): 40/45 = 88.89%, $355,555.56 | n/a |
| 30 | VL/WL not applying the same way to HDB flats with an HDB loan (§4) | unverifiable | n/a |
| 31 | Owner-occupier property tax bands for 2025 (0% to $12k … 32% above $110k) and for 2024 (§5.1) | confirmed (PK), still UNVERIFIED | MOF/IRAS 2024 announcement for 2025 |
| 32 | Whether the 2026 owner-occupier bands changed (§5.1) | unverifiable | n/a |
| 33 | Non-owner-occupier rates of 12 / 20 / 28 / 36% from 2024 (§5.2) | confirmed (PK), still UNVERIFIED | n/a |
| 34 | Property tax example AV $30,000 → $720 (§5) | confirmed (math) | 0.04 × 18,000 = 720 |
| 35 | SSD 4-year holding period at 16 / 12 / 8 / 4%, announced 3 Jul 2025, effective 4 Jul 2025 (§6) | confirmed (PK) | Consistent with `stamp-duty.md` §4 |
| 36 | SMRA 4% floor extended to 31 Dec 2027 (§6) | **unverifiable**. Downgraded to UNVERIFIED, do not display | Provenance conflicts with `rates-data.md` |
| 37 | PV factors and (1+r)^n for all six rate/term pairs (§7) | confirmed (math). The missing (1+r)^n for 4%/20 years was filled in as 2.222582 | n/a |
| 38 | Example A: $568,357.45, $525,000, $2,771.14, $35,000 / $140,000, $628,383.72, $385,000, $70,000 | confirmed (math) | n/a |
| 39 | Example B: $4,700, $984,467.83 (instalment check gives exactly $4,700.00), $515,532.17, $75,000 | confirmed (math) | n/a |
| 40 | Example C: $2,400, $506,103.49, $450,000, $2,041.51 at 2.6%, $2,133.95 at 3% | confirmed (math) | n/a |
| 41 | Example D: $1,041,988.66, $907,620.22, $900,000, $660,000. A loan ending exactly at age 65 is not "beyond 65" | confirmed (math) | n/a |
| 42 | Example E: IWAA 36, max 29 years | confirmed (math) | n/a |
| 43 | MAS / HDB / CPF / IRAS page URLs (§9) | unverifiable (could not fetch) | n/a |
| 44 | MND Aug 2024 URL under `/speeches/view/` (§9) | unverifiable, flagged as a likely wrong path | n/a |
| 45 | HDB "housing-loan-from-hdb" URL (§3.4) | unverifiable. It conflicts with the path in `rates-data.md` | n/a |
