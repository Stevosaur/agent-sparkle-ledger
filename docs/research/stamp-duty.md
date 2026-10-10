# Singapore Stamp Duties on Property (BSD, ABSD, SSD): Research Notes, as of 10 Oct 2026

> Engineers will build the stamp-duty calculators from this file. Read the verification legend first.

## 0. How this was researched, and the verification legend

**Research limits in this session (please read):**

- `WebFetch` failed for every host with `getaddrinfo ENOTFOUND`. That includes iras.gov.sg, mof.gov.sg and wikipedia.org, so **no primary-source page could be opened and read in full.**
- `WebSearch` worked for 3 queries. After that, the shared per-turn search budget (200 calls across all agents) ran out. The search results did include summaries of primary sources: IRAS's stamp duty rates page, the MOF BSD press release and the MND/MAS SSD press release.
- Everything else in this file comes from the author's prior knowledge, which runs to about mid-2026. Those items are marked accordingly.
- **Before launch, someone should open the IRAS pages listed in §7 and check every row marked `UNVERIFIED`.** The rate tables below are the long-standing, well-publicised ones, and confidence in them is high. Remission conditions and transitional details are the most likely places for small errors.

**Adversarial fact-check pass, 10 Oct 2026 (see "Verification log" at the end):**

- This pass also could **not** open any primary page. `WebFetch` still fails with `getaddrinfo ENOTFOUND` for iras.gov.sg and mnd.gov.sg. The egress proxy refuses mof.gov.sg, mnd.gov.sg, mas.gov.sg, iras.gov.sg, sso.agc.gov.sg, gov.sg and all the law-firm hosts. The `WebSearch` budget was already used up. Only GitHub was reachable.
- What it **could** do: (a) recompute every worked example and unit-test vector, including running the §5 reference code against the closed forms on 200,000 random prices (no mismatch); (b) read the **verbatim Budget 2024, 2025 and 2026 speech texts** through public GitHub mirrors; (c) compare against dated practitioner pages (secondary).
- Result: **no rate, date or arithmetic error was found.** Corrections are limited to: a 2024 developer-ABSD change that was missing (§2.2), the SSD anniversary convention (§3.3), the SSD exemptions list (§3.3), and the 2025/2026 "no change" status (§0, §4, §6).

| Tag | Meaning |
|---|---|
| **VERIFIED (search)** | Confirmed this session by a web-search result that quotes or summarises a primary government source (IRAS / MOF / MND / MAS). |
| **VERIFIED (secondary)** | Confirmed this session only through law-firm or industry summaries, and consistent with the primary press release. |
| **UNVERIFIED (high confidence)** | Not re-confirmed this session. Comes from well-established prior knowledge of IRAS rules that have been stable since the stated date. Safe to code, but re-check against IRAS. |
| **UNVERIFIED** | Best understanding only. It is a real risk. Show a disclaimer and/or link to IRAS in the UI. |

**Known 2025/2026 changes (summary):**

1. **SSD on residential property was tightened from 4 Jul 2025, 12:00 am.** The holding period went from 3 to 4 years, and the rates rose to 16/12/8/4%. Announced 3 Jul 2025. **VERIFIED (search)** for the effective date and the "+4 percentage points per tier, 3 to 4 years" rule. The rates are **VERIFIED (secondary)**.
2. **ACDS (Additional Conveyance Duties for Sellers) on residential property-holding entities was revised in parallel**, also for acquisitions on or after 4 Jul 2025. **VERIFIED (secondary)**, Rajah & Tann summary.
3. **No change to BSD or ABSD rates in 2025 or 2026 is known.** The latest BSD change took effect on 15 Feb 2023, and the latest ABSD **rate** change on 27 Apr 2023.
   - *Fact-check, 10 Oct 2026:* the Budget 2025 and Budget 2026 speeches (verbatim text, read through public GitHub mirrors) announce **no** BSD, ABSD or SSD change. The "Tax Changes" section of Budget 2026 covers only the PARF rebate on cars and a 20% rise in tobacco excise. A practitioner page dated 20 Aug 2026 (secondary) also says ABSD and SSD are unchanged. **20 Aug 2026 – 10 Oct 2026: UNVERIFIED.**
   - *Missing 2024 item, now added:* **Budget 2024 (16 Feb 2024)** lowered the ABSD **clawback** rate for housing developers that sell at least 90% of each development within the prescribed sale timeline. This changes the developer remission rules only, not the rates in the table. See §2.2.

---

## 1. Buyer's Stamp Duty (BSD)

### 1.1 General rules

| Rule | Value | Status / Source |
|---|---|---|
| Base for duty | The **higher of purchase price and market value** | VERIFIED (search). https://iras.gov.sg/quick-links/tax-rates/stamp-duty |
| Rounding | Duty is **rounded down to the nearest dollar**, with a **minimum duty of $1** | VERIFIED (search). Same IRAS page. |
| Method | **Marginal (tiered)** rates, like income tax. Each slice of value is taxed at its own rate. | VERIFIED (search) |
| Who pays | Buyer | UNVERIFIED (high confidence) |
| Due date | Within **14 days** after the date of the document if it is signed in Singapore; within **30 days** after the document is received in Singapore if it is signed overseas. Document = the exercised Option to Purchase (OTP) or the Sale & Purchase Agreement (S&P). | UNVERIFIED (high confidence). https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/buyer's-stamp-duty-(bsd) |
| Mixed-use property (residential and non-residential parts) | Residential BSD rates apply to the residential part's value. Non-residential rates apply to the rest. | UNVERIFIED (high confidence) |
| Which table applies | Decided by the **date of acquisition**, meaning the date the OTP is exercised or the S&P is signed, subject to the transitional rules below | UNVERIFIED (high confidence) |

### 1.2 Residential BSD: in force since 15 Feb 2023 (current as of Oct 2026)

**Status: VERIFIED (search).** IRAS rates page https://iras.gov.sg/quick-links/tax-rates/stamp-duty and MOF release https://www.mof.gov.sg/news-resources/newsroom/buyer-s-stamp-duty-bsd-rates-to-be-raised-for-higher-value-properties/ (Budget 2023).

| Slice of purchase price or market value (higher) | Cumulative band | Rate | Max duty in slice | Cumulative duty at top of band |
|---|---|---|---|---|
| First $180,000 | $0 – $180,000 | 1% | $1,800 | $1,800 |
| Next $180,000 | $180,000.01 – $360,000 | 2% | $3,600 | $5,400 |
| Next $640,000 | $360,000.01 – $1,000,000 | 3% | $19,200 | $24,600 |
| Next $500,000 | $1,000,000.01 – $1,500,000 | 4% | $20,000 | $44,600 |
| Next $1,500,000 | $1,500,000.01 – $3,000,000 | 5% | $75,000 | $119,600 |
| Remaining amount | above $3,000,000 | 6% | n/a | n/a |

**Closed-form version.** P is the higher of price and market value. Apply `floor()` to the result, then `max(1, ·)`. Each formula is continuous at the boundaries.

| Band | BSD (residential, from 15 Feb 2023) |
|---|---|
| P ≤ 180,000 | 0.01·P |
| 180,000 < P ≤ 360,000 | 0.02·P − 1,800 |
| 360,000 < P ≤ 1,000,000 | 0.03·P − 5,400 |
| 1,000,000 < P ≤ 1,500,000 | 0.04·P − 15,400 |
| 1,500,000 < P ≤ 3,000,000 | 0.05·P − 30,400 |
| P > 3,000,000 | 0.06·P − 60,400 |

**Transitional rule for the 15 Feb 2023 change (VERIFIED, search, MOF release).** The old (2018) rates still apply if the OTP was granted on or before 14 Feb 2023 and exercised on or before 7 Mar 2023, or within the OTP validity period if that ends earlier. Before this change, the top residential rate was 4%.

### 1.3 Non-residential BSD: in force since 15 Feb 2023 (current)

**Status: UNVERIFIED (high confidence).** Budget 2023, same MOF release as above. The search result confirmed the residential table only.

| Slice | Rate |
|---|---|
| First $180,000 | 1% |
| Next $180,000 | 2% |
| Next $640,000 | 3% |
| Next $500,000 | 4% |
| Remaining amount (above $1,500,000) | 5% |

Closed form: identical to residential up to $1.5m. For P > 1,500,000, BSD = 0.05·P − 30,400. There is no 6% tier.

### 1.4 Historical BSD tables (for back-dated calculations)

| Period (date of acquisition) | Residential | Non-residential | Status |
|---|---|---|---|
| 20 Feb 2018 – 14 Feb 2023 | 1% first $180k; 2% next $180k; 3% next $640k; **4% remaining (above $1m)** | 1% first $180k; 2% next $180k; **3% remaining** | Residential top rate of 4%: VERIFIED (search, MOF). The rest is UNVERIFIED (high confidence). |
| Before 20 Feb 2018 | 1% first $180k; 2% next $180k; 3% remaining | Same as residential | UNVERIFIED (high confidence) |

### 1.5 BSD worked examples (residential, current table)

**Example 1: P = $1,000,000**

```
1% x 180,000 =  1,800
2% x 180,000 =  3,600
3% x 640,000 = 19,200
-----------------------
BSD          = 24,600
```

Check with the closed form: 0.03 × 1,000,000 − 5,400 = 30,000 − 5,400 = **$24,600**.

**Example 2: P = $2,500,000**

```
1% x   180,000 =  1,800
2% x   180,000 =  3,600
3% x   640,000 = 19,200
4% x   500,000 = 20,000
5% x 1,000,000 = 50,000   (2,500,000 - 1,500,000)
-------------------------
BSD            = 94,600
```

Check: 0.05 × 2,500,000 − 30,400 = 125,000 − 30,400 = **$94,600**.

**Example 3: P = $1,500,000.** 1,800 + 3,600 + 19,200 + 20,000 = **$44,600**. Check: 0.04 × 1,500,000 − 15,400 = **$44,600**.

**Example 4: P = $4,000,000**

```
up to $3m   = 119,600
6% x 1,000,000 = 60,000
---------------------------
BSD         = 179,600
```

Check: 0.06 × 4,000,000 − 60,400 = **$179,600**. The same price as a non-residential property gives 0.05 × 4,000,000 − 30,400 = **$169,600**.

**Example 5 (rounding): P = $1,234,567.** 24,600 + 4% × 234,567 = 24,600 + 9,382.68 = 33,982.68, so **BSD = $33,982** after rounding down.

**Unit-test vectors (residential, from 15 Feb 2023):**

| P | BSD |
|---|---|
| 99 | 1 (the $1 minimum applies; the raw value 0.99 floors to 0) |
| 180,000 | 1,800 |
| 360,000 | 5,400 |
| 500,000 | 9,600 |
| 800,000 | 18,600 |
| 1,000,000 | 24,600 |
| 1,234,567 | 33,982 |
| 1,500,000 | 44,600 |
| 2,500,000 | 94,600 |
| 3,000,000 | 119,600 |
| 3,500,000 | 149,600 |
| 4,000,000 | 179,600 |

Same prices under the 2018–2023 residential table: 1,000,000 gives 24,600; 2,500,000 gives 24,600 + 4% × 1,500,000 = **84,600**.

---

## 2. Additional Buyer's Stamp Duty (ABSD)

### 2.1 General rules

| Rule | Value | Status |
|---|---|---|
| Applies to | **Residential** property only (including land zoned residential), on top of BSD. HDB flats and ECs count as residential. | UNVERIFIED (high confidence) |
| Base | Higher of purchase price and market value, **full value, flat rate (not tiered)**. With joint buyers, the rate is applied to the whole value, not to each share. | UNVERIFIED (high confidence) |
| Rounding | Rounded down to the nearest dollar, as for BSD | UNVERIFIED |
| Due | Same deadline as BSD: 14 days, or 30 days if the document is signed overseas | UNVERIFIED (high confidence) |
| Property count | Counts the **residential properties in Singapore** the buyer owns or partly owns (including HDB flats and jointly held properties) at the date of acquisition, plus the one being bought. "2nd property" means the buyer already owns 1. | UNVERIFIED (high confidence) |
| Joint purchase rule | When two or more parties buy together, the **highest ABSD rate among the buyers applies to the whole purchase price or market value** | UNVERIFIED (high confidence). https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/additional-buyer's-stamp-duty-(absd) |

### 2.2 ABSD rates: in force since 27 Apr 2023 (current as of Oct 2026)

**Status: UNVERIFIED (high confidence).** The rates were announced on 26 Apr 2023 by MOF, MND and MAS ("Additional Buyer's Stamp Duty rates to be raised to promote a sustainable property market"). The page could not be fetched this session. IRAS ABSD page: https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/additional-buyer's-stamp-duty-(absd)

| Buyer profile | 1st residential property | 2nd | 3rd and subsequent |
|---|---|---|---|
| Singapore Citizen (SC) | 0% | **20%** | **30%** |
| Singapore Permanent Resident (SPR) | **5%** | **30%** | **35%** |
| Foreigner (any foreign individual) | **60%** | 60% | 60% |
| Entity (company, partnership, association, etc.) | **65%** | 65% | 65% |
| Trustee (residential property transferred into a trust; "ABSD (Trust)") | **65%** | 65% | 65% |
| Housing developer (licensed) | **35% remittable + 5% non-remittable = 40%** | 40% | 40% |

- **Housing developers:** the 35% part can be remitted if the developer meets the remission conditions, mainly completing and selling all units within the prescribed period, usually 5 years. The 5% is payable upfront and is never remitted. **UNVERIFIED (high confidence).**
  - **Correction (added 10 Oct 2026):** this is no longer all-or-nothing. In the **Budget 2024 speech (16 Feb 2024)** the Finance Minister said developers who miss the sale timeline used to face "a full clawback of the ABSD", and announced: "I will lower the ABSD clawback rate, should developers sell at least 90% of each development within the prescribed sale timeline." **The quote is confirmed** from the verbatim speech text. The clawback rate and how it is computed were set out in a separate MOF statement that could not be read: **UNVERIFIED**. The exact remission timelines (start, complete and sell by when) are also **UNVERIFIED**. A buyer-facing calculator does not need this. Do not model developer clawbacks.
- **Trustees:** ABSD (Trust) started on **9 May 2022** at 35% and rose to 65% from 27 Apr 2023. A refund down to the beneficial owner's own ABSD profile can be applied for when conditions are met, for example an identifiable individual beneficial owner. **UNVERIFIED.**
- **Transitional rule for 27 Apr 2023:** the previous (16 Dec 2021) rates still apply if the OTP was granted on or before 26 Apr 2023 and exercised on or before **17 May 2023**, or within the OTP validity period if that ends earlier. **UNVERIFIED (high confidence).**

### 2.3 Historical ABSD tables

| Profile | 6 Jul 2018 – 15 Dec 2021 | 16 Dec 2021 – 26 Apr 2023 | From 27 Apr 2023 (current) |
|---|---|---|---|
| SC 1st / 2nd / 3rd+ | 0% / 12% / 15% | 0% / 17% / 25% | 0% / 20% / 30% |
| SPR 1st / 2nd / 3rd+ | 5% / 15% / 15% | 5% / 25% / 30% | 5% / 30% / 35% |
| Foreigner | 20% | 30% | 60% |
| Entity | 25% | 35% | 65% |
| Trustee (ABSD (Trust)) | n/a (started 9 May 2022) | 35% (from 9 May 2022) | 65% |
| Housing developer | 25% + 5% | 35% + 5% | 35% + 5% (unchanged) |

Status: **UNVERIFIED (high confidence)** for all rows. Transitional rule for 16 Dec 2021: OTP granted on or before 15 Dec 2021 and exercised on or before 5 Jan 2022, or within the OTP validity period if earlier. **UNVERIFIED.**

### 2.4 Remissions and refunds for married couples

All rows here are **UNVERIFIED**: the conditions are the most likely source of error, so link to IRAS in the UI. IRAS page: https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/additional-buyer's-stamp-duty-(absd) (sub-section "Remission of ABSD" / "Refund of ABSD for married couples").

| Case | Treatment (best understanding) |
|---|---|
| **SC + SC** couple, jointly buying their **first** residential property | 0% ABSD. Both are SCs buying a first property, so no remission is needed. |
| **SC + SPR** married couple, jointly buying their **first** residential property (neither owns any) | The highest rate would be SPR 1st property at 5%. **ABSD remission brings it to 0%**, the same as SC-SC. A secondary source (practitioner page, 2026) adds that the remission can be claimed **upfront at e-Stamping**, so the 5% is never paid. Otherwise the 5% is paid and then claimed back. **UNVERIFIED.** |
| **SC + foreigner** married couple, jointly buying their **first** residential property | Remission so that they are treated like an SC-SC couple (0%). Best understanding is that this exists. Must be confirmed. |
| Married couple with **at least one SC**, jointly buying a **second** residential property, who then sell their first (and only other) property | They pay ABSD (SC 2nd property, 20%) up front. They can then **apply for a refund** if they sell the first property **within 6 months** after either (a) the date of purchase of the new property, if it is completed, or (b) the date of TOP/CSC of the new property, whichever is earlier, if it is uncompleted. They must own no residential property other than these two. The application deadline is within 6 months after the sale of the first property. *Fact-check note:* one 2026 practitioner page says married SC couples replacing their only home "can have remission applied upfront at e-Stamping". That conflicts with the pay-first, refund-later mechanism described here and was not corroborated. **Keep the refund model** (pay 20% upfront, refund later) until IRAS confirms. |
| **SPR + SPR** couple | No general remission is known. They pay SPR rates (5% for a first property). |
| Spouse added later or decoupling transfers | Not covered here. Treat as out of scope or link to IRAS. |

Suggested implementation: model these as flags (`marriedCouple`, `spouseProfiles`), and show the remission or refund as a **separate line with an "eligibility subject to IRAS conditions" note**. Do not silently change the rate to 0.

### 2.5 Free Trade Agreement (FTA) nationals

**Status: UNVERIFIED (high confidence).**

- Under the **US–Singapore FTA**, **nationals of the United States** get the same ABSD treatment as **Singapore Citizens**: 0% / 20% / 30%. US permanent residents do not qualify.
- Under the **EFTA–Singapore FTA**, the same treatment applies to **nationals and permanent residents of Iceland, Liechtenstein, Norway and Switzerland**.
- The SC-equivalent treatment is given by **remission**. It applies to individuals only, not to entities or trusts they own.
- If an FTA national buys jointly with others, the joint purchase rule still applies: the highest rate among the buyers is used. For this purpose the FTA national's rate is the SC-equivalent rate.

### 2.6 ABSD worked examples (current rates)

| # | Scenario | ABSD | BSD | Total BSD + ABSD |
|---|---|---|---|---|
| A | **SPR, first property, $1,500,000** | 5% × 1,500,000 = **75,000** | 44,600 | **119,600** |
| B | SC, 2nd property, $1,500,000 | 20% × 1,500,000 = 300,000 | 44,600 | 344,600 |
| C | SC, 3rd property, $1,500,000 | 30% × 1,500,000 = 450,000 | 44,600 | 494,600 |
| D | Foreigner, $2,500,000 | 60% × 2,500,000 = 1,500,000 | 94,600 | 1,594,600 |
| E | US national (FTA), first property, $2,500,000 | 0 (SC-equivalent) | 94,600 | 94,600 |
| F | Entity, $3,500,000 | 65% × 3,500,000 = 2,275,000 | 149,600 | 2,424,600 |
| G | Joint purchase, $1,500,000: SC who owns 1 property + SPR who owns none (not married) | max(SC 2nd = 20%, SPR 1st = 5%) = 20% → 300,000 | 44,600 | 344,600 |
| H | SC + SPR married couple, neither owns property, $1,500,000 | 5% would apply → remitted → **0** | 44,600 | 44,600 (remission is UNVERIFIED) |

Arithmetic for A: BSD = 1,800 + 3,600 + 19,200 + 20,000 = 44,600. ABSD = 0.05 × 1,500,000 = 75,000. Total = 119,600.

---

## 3. Seller's Stamp Duty (SSD): residential

### 3.1 Current rules (property acquired on or after 4 Jul 2025)

**Status: VERIFIED (search)** for the effective date and structure. Source: joint MND/MAS press release of **3 Jul 2025**, "Extension of the Holding Period of Seller's Stamp Duty (SSD) and Higher SSD Rates for Residential Properties". *Fact-check note:* one secondary source says MOF also issued the release. Which agencies issued it, and its exact title, are **UNVERIFIED**. Do not print the issuing agencies in the UI; cite IRAS. Release URLs:

- https://www.mnd.gov.sg/newsroom/press-releases/view/extension-of-the-holding-period-of-seller's-stamp-duty-(ssd)-and-higher-ssd-rates-for-residential-properties
- https://www.mas.gov.sg/news/media-releases/2025/extension-of-the-holding-period-of-sellers-stamp-duty-and-higher-ssd-rates

What the release says:

- The holding period rises **from 3 years to 4 years**.
- SSD rates rise **by 4 percentage points for each tier**.
- The changes apply to **all residential properties purchased on or after 4 July 2025, 12:00 am**.
- HDB flat owners are effectively unaffected because of the Minimum Occupation Period (MOP).

The tier values are **VERIFIED (secondary)** from Yuen Law, Allen & Gledhill and DollarsAndSense, and are consistent with the "+4 percentage points" rule.

| Holding period (date of acquisition → date of disposal) | SSD rate (acquired on or after 4 Jul 2025) |
|---|---|
| Up to 1 year | **16%** |
| More than 1 year and up to 2 years | **12%** |
| More than 2 years and up to 3 years | **8%** |
| More than 3 years and up to 4 years | **4%** |
| More than 4 years | No SSD |

### 3.2 What applies to earlier purchases

The SSD regime is chosen by the **date of acquisition**. A property bought before 4 Jul 2025 keeps its old SSD schedule, even when it is sold after 4 Jul 2025. **VERIFIED (search)**: the release applies the new rules to purchases on or after 4 Jul 2025.

| Date of acquisition | Holding period | Rates (≤1 / 1–2 / 2–3 / 3–4 yrs) | Status |
|---|---|---|---|
| **On or after 4 Jul 2025** (current) | 4 years | 16% / 12% / 8% / 4% | VERIFIED (search + secondary) |
| 11 Mar 2017 – 3 Jul 2025 | 3 years | 12% / 8% / 4% / – | Previous rates: VERIFIED (secondary, Yuen Law table "old" column). Start date 11 Mar 2017: UNVERIFIED (high confidence). |
| 14 Jan 2011 – 10 Mar 2017 | 4 years | 16% / 12% / 8% / 4% | UNVERIFIED (high confidence) |
| 30 Aug 2010 – 13 Jan 2011 | 3 years | Calculated at BSD rates (1%/2%/3% tiers), scaled down by holding year | UNVERIFIED. Probably out of scope. |
| 20 Feb 2010 – 29 Aug 2010 | 1 year | BSD rates | UNVERIFIED. Probably out of scope. |

**Transitional rule for options granted before 4 Jul 2025: UNVERIFIED.** This could not be checked: the search budget ran out while querying it.

- Best understanding: the release did **not** set a BSD/ABSD-style "OTP granted on or before date X and exercised by date Y" window for SSD. It simply keys on whether the property was "purchased on or after 4 July 2025".
- Engineers should treat the acquisition date as the **date the OTP is exercised or the S&P is signed**, and flag acquisitions dated **4 Jul 2025 – 31 Jul 2025** whose OTP was granted before 4 Jul 2025 as "check with IRAS".
- *Fact-check, 10 Oct 2026 (secondary only):* a 2026 practitioner explainer gives IRAS's order for fixing the SSD date of acquisition: (1) the date the OTP is accepted or exercised, unless the OTP is subject to signing an S&P; (2) otherwise the S&P date; (3) the agreement-for-lease date; (4) the date of transfer. It does not mention any OTP-granted-before-4-July window. This fits the treatment above. The transitional rule is still **UNVERIFIED**.

### 3.3 SSD computation rules

| Rule | Value | Status |
|---|---|---|
| Base | Higher of **selling price and market value**, at a **flat rate on the full amount** (not tiered) | UNVERIFIED (high confidence) |
| Who pays | Seller | VERIFIED (by definition) |
| Holding period | Measured from the **date of acquisition** (OTP exercised or S&P signed) to the **date of disposal** (the seller's OTP exercised by the buyer, or S&P signed). "Up to 1 year" means disposal on or before the first anniversary of acquisition. | UNVERIFIED. The exact anniversary convention must be confirmed on the IRAS SSD page: https://www.iras.gov.sg/taxes/stamp-duty/for-property/selling-or-disposing-property/seller's-stamp-duty-(ssd)-for-residential-property |
| Rounding | Rounded down to the nearest dollar | UNVERIFIED |
| Due | 14 days after the date of the document (30 days if signed overseas) | UNVERIFIED (high confidence) |
| Common exemptions | HDB flats; disposals because of bankruptcy, compulsory acquisition, mortgagee sale (foreclosure), and some court-ordered or matrimonial transfers. Inherited property ~~is generally exempt~~ **may be** exempt. | UNVERIFIED. Show as "may be exempt, see IRAS". **Fact-check notes (10 Oct 2026, secondary only):** **(a) HDB flats.** MND's own wording (3 Jul 2025) is that HDB owners are "not affected" because of the MOP. That is not necessarily a formal statutory exemption. Do not call it an exemption in the UI; say "HDB flats: SSD does not bite because of the MOP". **(b) Mortgagee sale.** This is **not** in the exemption list of the one 2026 practitioner source checked. Treat it as **not exempt** unless IRAS confirms. **(c)** That source lists these instead (all UNVERIFIED): licensed housing developers selling units they developed; public authorities such as HDB and JTC; compulsory land acquisition; bankruptcy disposals by the Official Assignee; involuntary winding-up of a company; foreigners required to dispose of property under the Residential Property Act; some HDB-administered transactions. It also says gifts, family transfers, en-bloc sales and decoupling **do** attract SSD. |

Suggested anniversary convention, flagged UNVERIFIED: if `disposalDate <= addYears(acquisitionDate, n)`, the holding period is "up to n years". Use calendar `addYears`, so 29 Feb plus 1 year becomes 28 Feb.

**Fact-check warning (10 Oct 2026): conflicting secondary evidence on the exact anniversary.** One 2026 practitioner page works an example with a purchase on 1 Sep 2025. It puts "within 1 year" as "sold by Aug 2026" and "Year 2" as starting in Sep 2026. That implies a sale **on** the anniversary (1 Sep 2026) is already "more than 1 year", i.e. counting both dates inclusive, so "up to 1 year" ends the day before the anniversary. Another source says "No SSD applies after the exact fourth anniversary", which does not settle the anniversary day itself. **Until IRAS confirms:** compute with the convention above, but if `disposalDate` is within **±1 day of any anniversary**, show both tiers and a "check with IRAS; the tier depends on the exact day-count convention" banner. None of the worked examples in §3.4 falls on an anniversary, so they are unaffected.

### 3.4 SSD worked examples

| # | Acquired | Disposed | Holding period | Regime | Price / MV (higher) | SSD |
|---|---|---|---|---|---|---|
| 1 | 1 Aug 2025 | 1 Jun 2027 | about 1 yr 10 mths (more than 1, up to 2) | from 4 Jul 2025 | $1,400,000 | 12% × 1,400,000 = **$168,000** |
| 2 | 10 Jul 2025 | 1 Jun 2026 | under 1 yr | from 4 Jul 2025 | $1,300,000 | 16% × 1,300,000 = **$208,000** |
| 3 | 1 Sep 2025 | 1 Oct 2028 | about 3 yrs 1 mth (more than 3, up to 4) | from 4 Jul 2025 | $2,000,000 | 4% × 2,000,000 = **$80,000** |
| 4 | 1 Mar 2024 | 1 Jun 2026 | about 2 yrs 3 mths | 11 Mar 2017 – 3 Jul 2025 (3-yr) | $2,000,000 | 4% × 2,000,000 = **$80,000** |
| 5 | 1 Mar 2023 | 1 Jun 2026 | about 3 yrs 3 mths | 3-yr regime | any | **$0** (outside the 3-year window) |
| 6 | 1 Mar 2026 | 1 Jun 2029 | about 3 yrs 3 mths | 4-yr regime | $2,000,000 | 4% × 2,000,000 = **$80,000** (under the old regime this would have been $0) |

### 3.5 Industrial SSD (for completeness; not residential)

Industrial property acquired on or after **12 Jan 2013**:

| Holding period | Rate |
|---|---|
| Up to 1 year | 15% |
| More than 1 and up to 2 years | 10% |
| More than 2 and up to 3 years | 5% |

Status: **UNVERIFIED (high confidence).** Commercial (non-industrial, non-residential) property has **no SSD**.

---

## 4. Other cooling measures in 2025/2026

| Measure | Effective | Detail | Status / Source |
|---|---|---|---|
| SSD holding period 3 → 4 years; rates +4 percentage points (16/12/8/4) | Residential purchases **on or after 4 Jul 2025, 12:00 am** (announced 3 Jul 2025) | See §3 | VERIFIED (search). MND/MAS URLs in §3.1 |
| ACDS (Additional Conveyance Duties for Sellers) on transfers of equity in **residential property-holding entities** | Acquisitions **on or after 4 Jul 2025** | Aligned to the new SSD. The seller's ACDS is **16% on disposals within 4 years** of acquisition, flat. It was 12% within 3 years before. Reflected in the IRAS e-Tax Guide on ACDS (Eighth Edition). | VERIFIED (secondary, Rajah & Tann). The old 12%/3-year figure is UNVERIFIED (high confidence). The edition number ("Eighth Edition") is **UNVERIFIED**. Niche, so the app probably does not need it. |
| ABSD clawback for housing developers lowered | Announced in Budget 2024, 16 Feb 2024 | Lower clawback rate if the developer sells at least 90% of each development within the prescribed sale timeline. Previously the clawback was full. | Announcement **confirmed** from the verbatim Budget 2024 speech text. The rate and mechanics are UNVERIFIED. Not needed for buyer calculators. |
| BSD / ABSD rate changes | none known | Last BSD change was 15 Feb 2023; last ABSD **rate** change was 27 Apr 2023 | Budget 2025 and Budget 2026: **confirmed no stamp-duty change**, from the verbatim speech texts. The Budget 2026 tax changes were only the car PARF rebate cut and the tobacco excise rise. Through 20 Aug 2026: no change per a secondary source. **20 Aug – 10 Oct 2026: UNVERIFIED.** **Check https://www.iras.gov.sg/quick-links/tax-rates/stamp-duty before launch.** |

---

## 5. Suggested data model and reference implementation (TypeScript)

```ts
// src/lib/stamp-duty.ts  (suggested)
export type Tier = { upTo: number | null; rate: number }; // upTo = width of slice; null = remainder

export const BSD_TABLES = {
  residential: [
    { from: '2023-02-15', to: null, tiers: [
      { upTo: 180_000, rate: 0.01 }, { upTo: 180_000, rate: 0.02 }, { upTo: 640_000, rate: 0.03 },
      { upTo: 500_000, rate: 0.04 }, { upTo: 1_500_000, rate: 0.05 }, { upTo: null, rate: 0.06 } ] },
    { from: '2018-02-20', to: '2023-02-14', tiers: [
      { upTo: 180_000, rate: 0.01 }, { upTo: 180_000, rate: 0.02 }, { upTo: 640_000, rate: 0.03 },
      { upTo: null, rate: 0.04 } ] },
  ],
  nonResidential: [
    { from: '2023-02-15', to: null, tiers: [
      { upTo: 180_000, rate: 0.01 }, { upTo: 180_000, rate: 0.02 }, { upTo: 640_000, rate: 0.03 },
      { upTo: 500_000, rate: 0.04 }, { upTo: null, rate: 0.05 } ] },
    { from: '2018-02-20', to: '2023-02-14', tiers: [
      { upTo: 180_000, rate: 0.01 }, { upTo: 180_000, rate: 0.02 }, { upTo: null, rate: 0.03 } ] },
  ],
} as const;

export type BuyerProfile = 'SC' | 'SPR' | 'FOREIGNER' | 'ENTITY' | 'TRUSTEE' | 'HOUSING_DEVELOPER';
// rates effective 27 Apr 2023 (current). index 0 = 1st property, 1 = 2nd, 2 = 3rd+
export const ABSD_2023_04_27: Record<BuyerProfile, [number, number, number]> = {
  SC: [0, 0.20, 0.30],
  SPR: [0.05, 0.30, 0.35],
  FOREIGNER: [0.60, 0.60, 0.60],
  ENTITY: [0.65, 0.65, 0.65],
  TRUSTEE: [0.65, 0.65, 0.65],
  HOUSING_DEVELOPER: [0.40, 0.40, 0.40], // 35% remittable + 5% non-remittable
};
export const FTA_SC_EQUIVALENT_NATIONALITIES = ['US']; // nationals only
export const FTA_SC_EQUIVALENT_NATIONALS_OR_PR = ['IS', 'LI', 'NO', 'CH']; // nationals AND PRs

export const SSD_RESIDENTIAL = [
  { acquiredFrom: '2025-07-04', acquiredTo: null,         rates: [0.16, 0.12, 0.08, 0.04] }, // years 1..4
  { acquiredFrom: '2017-03-11', acquiredTo: '2025-07-03', rates: [0.12, 0.08, 0.04] },       // years 1..3
  { acquiredFrom: '2011-01-14', acquiredTo: '2017-03-10', rates: [0.16, 0.12, 0.08, 0.04] },
];

/** Integer-cent maths avoids float drift. Result is floored to whole dollars, minimum $1. */
export function tieredDuty(amount: number, tiers: readonly Tier[]): number {
  let remainingCents = Math.round(amount * 100);
  let dutyCentsTimes100 = 0; // rate stored as basis points to stay integral
  for (const t of tiers) {
    if (remainingCents <= 0) break;
    const slice = t.upTo === null ? remainingCents : Math.min(remainingCents, t.upTo * 100);
    dutyCentsTimes100 += slice * Math.round(t.rate * 10_000); // cents * bp
    remainingCents -= slice;
  }
  const dollars = Math.floor(dutyCentsTimes100 / 10_000 / 100);
  return amount > 0 ? Math.max(1, dollars) : 0;
}

export function absd(amount: number, rate: number): number {
  return Math.floor((Math.round(amount * 100) * Math.round(rate * 10_000)) / 10_000 / 100);
}
// Joint purchase: rate = Math.max(...buyers.map(b => rateFor(b)))
```

Note: `cents × basis points` stays below 2^53 for any realistic property price. At $10bn, 1e12 × 600 = 6e14 < 9e15.

**Required UI disclaimer:** "Estimates only, based on IRAS rates in force from 15 Feb 2023 (BSD), 27 Apr 2023 (ABSD) and 4 Jul 2025 (SSD). Remissions and refunds are subject to IRAS conditions. Verify with IRAS."

---

## 6. Open items: what to verify on IRAS before launch

1. **ABSD tables, §2.2–2.3.** Confirm every cell on the IRAS ABSD page. Confidence is high, but they were not re-fetched this session.
2. **Married-couple remissions, §2.4.** Confirm in particular whether SC + foreigner first-home remission exists, and the exact wording of the 6-month refund conditions for second properties.
3. **SSD transitional treatment, §3.2,** for OTPs granted on or before 3 Jul 2025 and exercised on or after 4 Jul 2025.
4. **SSD anniversary convention, §3.3**: whether disposal exactly on the anniversary counts as "up to 1 year".
5. **Rounding of ABSD and SSD**: assumed to round down to the dollar, like BSD.
6. **Changes after mid-2026.** Budget 2026 itself is now checked: the speech text contains no stamp-duty change. Measures announced outside the Budget, especially **20 Aug – 10 Oct 2026**, are still unchecked.
7. **SSD exemptions list, §3.3,** especially mortgagee sales, inheritance and HDB flats.
8. **Developer ABSD clawback mechanics, from Budget 2024.** This only matters if the app ever models developers.

## 7. Source URLs

- IRAS stamp duty rates (quick links). **Seen via search**: https://iras.gov.sg/quick-links/tax-rates/stamp-duty
- IRAS BSD: https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/buyer's-stamp-duty-(bsd)
- IRAS ABSD: https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/additional-buyer's-stamp-duty-(absd)
- IRAS SSD (residential): https://www.iras.gov.sg/taxes/stamp-duty/for-property/selling-or-disposing-property/seller's-stamp-duty-(ssd)-for-residential-property. URL pattern: an independent third-party repository dated Sep 2026 cites the same path, percent-encoded as `seller%27s-stamp-duty-%28ssd%29-for-residential-property`. It has not been opened. In code, use the percent-encoded form.
- MOF, BSD rates raised for higher-value properties (Budget 2023, effective 15 Feb 2023). **Seen via search**: https://www.mof.gov.sg/news-resources/newsroom/buyer-s-stamp-duty-bsd-rates-to-be-raised-for-higher-value-properties/
- MND, SSD extension (3 Jul 2025). **Seen via search**: https://www.mnd.gov.sg/newsroom/press-releases/view/extension-of-the-holding-period-of-seller's-stamp-duty-(ssd)-and-higher-ssd-rates-for-residential-properties
- MAS, same release. **Seen via search**: https://www.mas.gov.sg/news/media-releases/2025/extension-of-the-holding-period-of-sellers-stamp-duty-and-higher-ssd-rates
- Secondary sources for the SSD tiers and ACDS:
  - Allen & Gledhill: https://www.allenandgledhill.com/publication/articles/30981/holding-period-for-seller-s-stamp-duty-extended-for-residential-properties-and-seller-s-stamp-duty-rates-raised
  - Rajah & Tann: https://www.rajahtannasia.com/viewpoints/changes-to-stamp-duty-additional-conveyance-duties-for-sellers-of-residential-properties/
  - Yuen Law: https://yuenlaw.com.sg/singapore-law/real-estate/seller-stamp-duty-ssd/

## Verification log

Adversarial fact-check run on **10 Oct 2026**.

**Access limits.** No primary government page could be opened in this pass. `WebFetch` fails with ENOTFOUND, the egress proxy returns 403 for every `*.gov.sg` host and for the law-firm hosts, and the WebSearch budget was already used up. "Confirmed" therefore means one of three things, and each row says which:

- recomputed here;
- checked against **verbatim primary text** reached through a public GitHub mirror;
- consistent across independent secondary sources. Rows confirmed this way are labelled "secondary".

Anything else is **UNVERIFIED**.

**Sources used in this pass:**

- **[A]** Recomputation here. A Node script re-ran every worked example and test vector. It also ran the §5 `tieredDuty` code against the §1.2 closed forms on 200,000 random prices from $1 to $8m: 0 mismatches.
- **[B]** Budget 2024 speech, verbatim text, 16 Feb 2024: https://raw.githubusercontent.com/parleh-mate/singapore-budget-speeches/main/output_markdown/2024.md, section on ABSD for housing developers.
- **[C]** Budget 2025 speech, verbatim text: https://raw.githubusercontent.com/parleh-mate/singapore-budget-speeches/main/output_markdown/2025.md and https://raw.githubusercontent.com/isafzh/asksg/main/data/interim/extracted_text/budget/budget_2025_speech.txt
- **[D]** Budget 2026 speech, verbatim text: https://raw.githubusercontent.com/isafzh/asksg/main/data/interim/extracted_text/budget/budget_2026_speech.txt. The "Tax Changes" section, paras 203–205, covers PARF and tobacco only.
- **[E]** Nexus Mortgage SG, "Singapore Property Cooling Measures in 2026", dated 20 Aug 2026. Source: github.com/zetoroz/nexusmortgage.sg, `blog/singapore-property-cooling-measures-2026/index.html`. Secondary: broker marketing content, low weight.
- **[F]** Nexus Mortgage SG, "SSD Singapore 2026: The 4 July 2025 Reset Explained", dated 16 May 2026. Same repo, `blog/ssd-singapore-2025-reset/index.html`. Secondary.
- **[G]** github.com/kitfunso/boring-maths, `src/pages/calculators/singapore-seller-stamp-duty-calculator.astro`. Tertiary.
- **[H]** github.com/evancjx/housing-estate-framework, `property_analysis/2026-09-20-*.md`. Tertiary: cites the IRAS URLs and says "No SSD applies after the exact fourth anniversary".
- **[I]** Nexus Mortgage SG, `blog/singapore-pr-buy-hdb-loan-guide-2026/index.html`. Secondary.

| # | Claim (section) | Verdict | Source / note |
|---|---|---|---|
| 1 | Residential BSD tiers from 15 Feb 2023: 1/2/3/4/5/6% on $180k / $180k / $640k / $500k / $1.5m / remainder (§1.2) | confirmed (internal consistency); primary not re-opened | [A]. The prior session's VERIFIED (search) status is kept. Cumulative duty at the top of each band (1,800 / 5,400 / 24,600 / 44,600 / 119,600) recomputed. |
| 2 | Closed-form offsets −1,800 / −5,400 / −15,400 / −30,400 / −60,400 (§1.2) | confirmed | [A]. Continuous at every boundary. Matches the tiered code on 200k random prices. |
| 3 | BSD Examples 1–5 and all 12 unit-test vectors, including P=99 → $1 (§1.5) | confirmed | [A] |
| 4 | 2018–2023 residential table: $1m → 24,600 and $2.5m → 84,600 (§1.5) | confirmed | [A] |
| 5 | Non-residential BSD from 15 Feb 2023 (top 5%, no 6% tier); $4m → 169,600 (§1.3, §1.5) | arithmetic confirmed; rates **UNVERIFIED** | [A]. No primary access. |
| 6 | BSD transitional rule: OTP granted ≤ 14 Feb 2023 and exercised ≤ 7 Mar 2023 (§1.2) | **UNVERIFIED** this pass | The prior session's search verification is kept. |
| 7 | Rounded down to the dollar, $1 minimum (§1.1) | **UNVERIFIED** this pass | The prior session's search verification is kept. |
| 8 | Duty due within 14 days, or 30 days if signed overseas (§1.1, §2.1, §3.3) | consistent with secondary | [F] states 14/30 days for SSD. |
| 9 | ABSD rates from 27 Apr 2023: SC 0/20/30, SPR 5/30/35, foreigner 60, entity 65, trustee 65, developer 35+5 (§2.2, §5) | consistent with secondary; primary **UNVERIFIED** | [E] gives SC 0/20/30, PR 5/30/35 and foreigner 60, "at the rates set on 27 April 2023". [E] does not cover entity, trustee or developer rates. |
| 10 | ABSD history 2018 / 2021 / 2022 and transitional dates 5 Jan 2022 and 17 May 2023 (§2.2, §2.3) | **UNVERIFIED** | No source reachable. |
| 11 | Housing-developer remission is all-or-nothing on selling every unit (§2.2) | **corrected** | [B]: Budget 2024 lowered the clawback rate where at least 90% of each development is sold in time. The rate and mechanics are UNVERIFIED. |
| 12 | ABSD Examples A–H, including totals 119,600 / 344,600 / 494,600 / 1,594,600 / 94,600 / 2,424,600 (§2.6) | confirmed | [A] |
| 13 | SC + SPR first-home remission (§2.4) | consistent with secondary; **UNVERIFIED** | [I]. Same treatment as SC-SC. Can be claimed upfront at e-Stamping. Two-SPR couples are not eligible (consistent with the "SPR + SPR" row). |
| 14 | SC + foreigner remission; second-property 6-month refund (§2.4) | **UNVERIFIED** | [E] claims an "upfront at e-Stamping" remission for married SC couples replacing their home. This conflicts with the refund model and was not adopted; a note was added. |
| 15 | FTA treatment: US nationals; nationals and PRs of Iceland, Liechtenstein, Norway, Switzerland (§2.5) | consistent with secondary; primary **UNVERIFIED** | [E] lists the same five countries (it does not mention PRs). The ISO codes in §5 (US, IS, LI, NO, CH) are correct. |
| 16 | SSD from 4 Jul 2025: 4-year holding, 16/12/8/4%, announced 3 Jul 2025, keyed on acquisition date (§3.1, §3.2) | confirmed (secondary, 3 independent) | [E], [F], [G]. The prior session's search verification is kept. |
| 17 | Previous SSD 12/8/4% over 3 years for acquisitions 11 Mar 2017 – 3 Jul 2025 (§3.2) | confirmed (secondary) | [F] and [G] give the identical date range and rates. |
| 18 | SSD 16/12/8/4% for 14 Jan 2011 – 10 Mar 2017; the 2010 regimes (§3.2) | **UNVERIFIED** | [F] says only that in 2017 the holding period was cut from 4 to 3 years and the rates trimmed, which is consistent. |
| 19 | Issuing agencies and title of the 3 Jul 2025 SSD release (§3.1) | **UNVERIFIED** | [F] names MOF as well as MND and MAS. A note was added. |
| 20 | SSD transitional treatment for OTPs granted before 4 Jul 2025 (§3.2) | **UNVERIFIED** | [F] gives IRAS's acquisition-date order (OTP acceptance → S&P → agreement for lease → transfer) and no OTP window, which is consistent with the doc's approach. |
| 21 | SSD base: higher of price and market value, flat rate (§3.3) | consistent with secondary | [F] |
| 22 | Anniversary convention `disposal <= addYears(acq, n)` → "up to n years" (§3.3) | **corrected** (now flagged as conflicting) | [F]'s worked example implies a sale on the anniversary falls in the next tier. A ±1-day UI flag was added. |
| 23 | SSD exemptions: HDB flats, mortgagee sale, inheritance (§3.3) | **corrected** (wording softened, mortgagee sale flagged) | [F]'s exemption list does not include mortgagee sales or inheritance. MND wording on HDB is "not affected", not "exempt". All still UNVERIFIED. |
| 24 | SSD Examples 1–6: holding spans and amounts 168,000 / 208,000 / 80,000 / 80,000 / 0 / 80,000 (§3.4) | confirmed | [A]. No example falls on an anniversary. |
| 25 | Industrial SSD 15/10/5% from 12 Jan 2013; no SSD on commercial property (§3.5) | **UNVERIFIED** | [E] says SSD's residential schedule does not apply to commercial or industrial property. That is consistent but does not cover the industrial schedule. |
| 26 | ACDS for sellers: 16% within 4 years (was 12% within 3 years); e-Tax Guide "Eighth Edition" (§4) | **UNVERIFIED** | Edition number flagged. |
| 27 | No BSD or ABSD change in 2025 or 2026 (§0, §4) | confirmed for Budget 2025 and Budget 2026; secondary to 20 Aug 2026; **UNVERIFIED** after that | [C], [D], [E] |
| 28 | IRAS SSD URL pattern (§7) | confirmed as a pattern (tertiary) | [H] cites the same path, percent-encoded. The page itself was not opened. Other gov.sg URLs: **UNVERIFIED** (hosts blocked). |
| 29 | §5 integer-cent maths stays below 2^53 ($10bn → 1e12 × 600 = 6e14 < 9.007e15) | confirmed | [A]. Both divisions are exact for integer results, and the fractional part is a multiple of 1e-6, so `floor` cannot be pushed across an integer. |
