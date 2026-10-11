# Bala's Table: leasehold land value as a % of freehold value

> Researched 2026-10-10 for the Singapore property-research app.
> Scope: SLA's "Bala's Table" (also called the leasehold relativity table, Bala's Curve or the SLA leasehold table).
> Consumers: engineers building the lease-decay calculator, the remaining-lease charts and the explainer copy.

---

## 0. Verification status (read this first)

| Item | Status |
|---|---|
| Primary source (SLA PDF holding the table) | **Located but NOT read.** The URLs came up in web search (section 6). WebFetch failed with DNS errors on every host, gov.sg and non-gov alike. The container's proxy returns 403 for `www.sla.gov.sg`, and the per-turn web-search budget ran out partway through. |
| What *is* corroborated | 8 anchor points (1, 3, 10, 30, 49, 50, 60 and 99 years). Web-search result excerpts reported each of them, attributed either to the SLA PDF or to several independent reproductions. These excerpts are second-hand: they are search-engine summaries of those pages, not my own reading of them. |
| The other 91 rows | **UNVERIFIED.** They are my best recollection of the SLA table, and they agree **exactly** with all 8 corroborated anchors. They are strictly increasing and **approximately** concave (fact-check 2026-10-10: there are 7 small step reversals; all are 0.1 pp, consistent with one-decimal rounding, except 56→57→58, where the steps go 0.6, 0.4, 0.6). Each row still needs checking against the official table before the app labels it "SLA's official value". |
| **Second reproduction (R1): rows 57–98 DISPUTED** | *Added by fact-check 2026-10-10.* A second, independent reproduction was found: `BALAS_TABLE` in `thejaminator/lease_buyback/app.js` on GitHub (section 6, source R1). It **agrees exactly with rows 1–56, 60 and 99**. It **disagrees on all 41 rows 57–59 and 61–98**, where R1 is higher by 0.1–2.0 pp; the largest gap is at 80 years (89.0 here vs 91.0 in R1). Its provenance is also unclear, and it has an internal glitch at 68 years (84.5, which makes the steps 0.3 then 0.9). Neither version can be preferred without the official table. Section 2 now marks every disputed row `CONFLICT (R1: x)`. **Treat rows 57–98 as the least reliable part of this file.** |
| Interpolated alternative | Section 2 also gives a column built **only** from the corroborated anchors by straight-line interpolation. It is explicitly marked INTERPOLATED and is not a published table. |
| Current official home of the table | *Added by fact-check.* Since **1 August 2022** the table has been used as "the current **Leasehold Table**" to adjust the **Land Betterment Charge** for land with 99 years or less of unexpired tenure. The URA/SLA circular DC22-08 (5 July 2022) attaches a copy as **Appendix 2** (section 6, sources S13 and S14). That appendix is now the **preferred primary source**; the SLA DP-policy PDF (S1) belongs to the Differential Premium regime that LBC replaced. The circular text is CONFIRMED, from a text mirror of the URA page. The appendix itself was **not read**. R1 claims the table is codified in the "7th Schedule of the Land Betterment Charge (Table of Rates and Valuation Method) Regulations 2022"; that claim is **UNVERIFIED**. |
| Changes in 2025 or 2026 | **None found.** The searches turned up nothing showing SLA revised the table in 2025–2026. A 2025 academic paper analyses it (IRER vol. 28 no. 3, section 6) but does not change it. Since no primary source was read, this is also **UNVERIFIED**. |

**Required before launch (engineering TODO):** someone on a normal network should open the official table and diff it against the JSON in section 4. Prefer the URA DC22-08 Appendix 2 PDF (S14); otherwise use *Appendix 1 – leasehold values as a percentage of freehold value* in the SLA PDF (S1). Pay particular attention to the disputed rows 57–98. If every row matches, set `verified: true`. Until then the UI must label the curve **"approximate (based on SLA's Bala's Table; reproduction not yet verified against the official table)"**.

---

## 1. What the table is

| Fact | Value | Source / confidence |
|---|---|---|
| What it measures | The value of a leasehold interest in **land** with *N* years remaining, as a **% of the freehold value of the same land**. | S1 (SLA PDF, Appendix 1 title as reported in search excerpt: "leasehold values as a percentage of freehold value"). Corroborated. |
| Range | Residual lease terms of **1 to 99 years**, one row per whole year. | S1 via search excerpt. Corroborated. |
| Headline points | 99 yrs = **96%**, 60 yrs = **80%**, 30 yrs ≈ **60%**, 10 yrs = **30.0%**. | S1 (10 yrs = 30.0%), S3 (96%, 80%, ~60%), S4 (table rows 1 = 3.8%, 10 = 30.0%), plus S9/S10. Corroborated across several sources. |
| Historical basis | Motha & Yuen are cited as noting that **after 1948** the alienation price of leasehold State land was computed with a 99-yr lease at **96%** of freehold and a 60-yr lease at **80%**. | Reported in search excerpts of consumer explainers (one of S3/S6/S7; the excerpt did not say which). Secondary; UNVERIFIED against the book. |
| Name | Widely believed to have been prepared by a Land Office officer named **Bala**. The exact timing and basis of its adoption are unclear. | S2 (gov.sg-hosted PDF, apparently a Centre for Liveable Cities (CLC) note) via search excerpt. Secondary-of-primary. |
| Made public | Reported as **made public in July 2000**. | Consumer site via search excerpt. **UNVERIFIED.** |
| Methodology | **Hand-crafted, not a single formula.** CLC says the table and its implicit discount rate are "not an exact science". One analysis suggests an implied discount rate of about **3.5%**. | S2 (CLC) via excerpt. The 3.5% figure is a secondary claim, **UNVERIFIED**. My own check: no single-rate annuity `1-(1+r)^-n` reproduces both 96% at 99 yrs and 80% at 60 yrs. r = 3.5% gives about 96.7% and 87.3%; r ≈ 2.7% gives 80% at 60 yrs but only about 93% at 99 yrs. (Fact-check recomputed these: 96.68%, 87.31%, r = 2.72% → 92.97%. CONFIRMED.) A least-squares single-rate fit to the full section-2 column gives r ≈ 2.98%, but it still misses by up to 4.6 pp (at 12 yrs). This uses the unverified rows. **Use the table, not a formula.** |
| Official uses | SLA uses it to compute premiums for State-land leases: differential premium or land betterment charge when use or intensity is upgraded, land-renewal and lease-upgrading premiums, and the downward adjustment of payments for leases of 99 years or less. **Fact-check correction:** Differential Premium no longer exists as a separate charge. Since **1 Aug 2022** it has been replaced by the Land Betterment Charge (next row). Under LBC, "if the land has a residual unexpired tenure of 99 years or less, the amount of LBC payable will be adjusted based on the current Leasehold Table, which expresses the value of the residual unexpired tenure as a percentage of freehold value" (URA/SLA circular DC22-08, para 9). | Search excerpts from the S1 and S3–S9 result sets; the exact page was not identified. Corroborated in substance; wording UNVERIFIED. LBC use: **CONFIRMED** from S13 (text mirror of the URA circular). The other uses are still UNVERIFIED. |
| Lease top-up | SLA's own document reportedly says that the table-based computation **does not apply** to the premium for **topping up lease tenure**. The Chief Valuer assesses that premium **case by case**. | S1 via search excerpt. Corroborated (single source). **Never present a Bala-based number as "the" top-up price.** |
| Legal context | Under the **Land Betterment Charge Act 2021** (Act 11 of 2021; passed 10 May 2021), **with effect from 1 August 2022**, the Development Charge, Differential Premium and Temporary Development Levy were replaced by a single **Land Betterment Charge (LBC)**. **CORRECTED** from "effective 1 April 2022", which was wrong. SLA charges and collects LBC. The initial rate is generally 70% of the increase in land value, and 100% in exceptional cases. It applies to permissions and covenant variations granted on or after 1 Aug 2022. | **CONFIRMED** by S13, a text mirror of URA circular DC22-08 (published 5 Jul 2022; "Effective Date: With effect from 1 August 2022"), and by S15, the Planning Act 1998 legislative history ("Act 11 of 2021 wef 01/08/2022"; first reading 5 Apr 2021; second and third readings 10 May 2021). |

---

## 2. The full table (1 to 99 years)

Read the columns this way:

- **"% of freehold (table value)"**: use this in the app. Rows marked CORROBORATED match values that web sources reported for the SLA table. Rows marked UNVERIFIED are recalled values; every one of them lies on a curve that passes through all the corroborated anchors.
- **Status values:**
  - `CORROBORATED`: value reported by search excerpts of the SLA PDF and/or several reproductions.
  - `APPROX`: a source gives only a rounded figure.
  - `CONFLICT`: a source gives a slightly different rounded figure.
  - `UNVERIFIED`: not confirmed this session.
  - `CONFLICT (R1: x)`: *added by fact-check 2026-10-10.* The second reproduction R1 (section 6) gives `x` for this row instead. Neither value is verified.
- **"Anchor-only linear interpolation"** is **INTERPOLATED**. It joins the corroborated anchors (0→0, 1, 3, 10, 30, 49, 50, 60, 99) with straight lines. Because the table is mostly concave, this column usually **under-states** it. The gap is largest at 19 years (3.1 percentage points) and is at least 2 pp across 14–25 years. *Fact-check correction:* between 50 and 60 years the table is not concave, so there the interpolation **over-states** the table by up to 0.12 pp (rows 51–55 and 57–59). The 55- and 2-year interpolated cells were also corrected for rounding: the exact values are 77.35 and 7.35, now shown half-up as 77.4 and 7.4. The column exists as a fallback for a "verified data only" mode and as a sanity bound. It is not a published table.
- **Disputed rows (fact-check):** rows 57–59 and 61–98 differ from reproduction R1 by 0.1–2.0 pp; see section 0. The "Table minus interp" column compares against this file's values only.
- **Known conflict:** one consumer site describes 20 years as "~49%", while the table value here is 48.0 (21 years = 49.5). R1 also gives 48.0. The official table is the arbiter.
- **Known garble:** one search summary attributed "10.0%" to 3 years. Other excerpts, including one quoting a table row "3 years | 10.9%", give **10.9**, so treat the 10.0 as a summarisation error.

| Years left | % of freehold (table value) | Status | Anchor-only linear interpolation (INTERPOLATED) | Table minus interp |
|---:|---:|---|---:|---:|
| 99 | 96.0 | CORROBORATED | 96.0 (anchor) | +0.0 |
| 98 | 95.8 | UNVERIFIED; CONFLICT (R1: 95.9) | 95.6 | +0.2 |
| 97 | 95.6 | UNVERIFIED; CONFLICT (R1: 95.8) | 95.2 | +0.4 |
| 96 | 95.3 | UNVERIFIED; CONFLICT (R1: 95.7) | 94.8 | +0.5 |
| 95 | 95.0 | UNVERIFIED; CONFLICT (R1: 95.6) | 94.4 | +0.6 |
| 94 | 94.6 | UNVERIFIED; CONFLICT (R1: 95.4) | 93.9 | +0.7 |
| 93 | 94.2 | UNVERIFIED; CONFLICT (R1: 95.2) | 93.5 | +0.7 |
| 92 | 93.8 | UNVERIFIED; CONFLICT (R1: 95.0) | 93.1 | +0.7 |
| 91 | 93.4 | UNVERIFIED; CONFLICT (R1: 94.8) | 92.7 | +0.7 |
| 90 | 93.0 | UNVERIFIED; CONFLICT (R1: 94.6) | 92.3 | +0.7 |
| 89 | 92.6 | UNVERIFIED; CONFLICT (R1: 94.3) | 91.9 | +0.7 |
| 88 | 92.2 | UNVERIFIED; CONFLICT (R1: 94.0) | 91.5 | +0.7 |
| 87 | 91.8 | UNVERIFIED; CONFLICT (R1: 93.6) | 91.1 | +0.7 |
| 86 | 91.4 | UNVERIFIED; CONFLICT (R1: 93.3) | 90.7 | +0.7 |
| 85 | 91.0 | UNVERIFIED; CONFLICT (R1: 92.9) | 90.3 | +0.7 |
| 84 | 90.6 | UNVERIFIED; CONFLICT (R1: 92.6) | 89.8 | +0.8 |
| 83 | 90.2 | UNVERIFIED; CONFLICT (R1: 92.2) | 89.4 | +0.8 |
| 82 | 89.8 | UNVERIFIED; CONFLICT (R1: 91.8) | 89.0 | +0.8 |
| 81 | 89.4 | UNVERIFIED; CONFLICT (R1: 91.4) | 88.6 | +0.8 |
| 80 | 89.0 | UNVERIFIED; CONFLICT (R1: 91.0) | 88.2 | +0.8 |
| 79 | 88.6 | UNVERIFIED; CONFLICT (R1: 90.5) | 87.8 | +0.8 |
| 78 | 88.2 | UNVERIFIED; CONFLICT (R1: 90.0) | 87.4 | +0.8 |
| 77 | 87.8 | UNVERIFIED; CONFLICT (R1: 89.5) | 87.0 | +0.8 |
| 76 | 87.4 | UNVERIFIED; CONFLICT (R1: 89.0) | 86.6 | +0.8 |
| 75 | 87.0 | UNVERIFIED; CONFLICT (R1: 88.5) | 86.2 | +0.8 |
| 74 | 86.6 | UNVERIFIED; CONFLICT (R1: 88.0) | 85.7 | +0.9 |
| 73 | 86.2 | UNVERIFIED; CONFLICT (R1: 87.5) | 85.3 | +0.9 |
| 72 | 85.8 | UNVERIFIED; CONFLICT (R1: 87.0) | 84.9 | +0.9 |
| 71 | 85.4 | UNVERIFIED; CONFLICT (R1: 86.5) | 84.5 | +0.9 |
| 70 | 85.0 | UNVERIFIED; CONFLICT (R1: 86.0) | 84.1 | +0.9 |
| 69 | 84.5 | UNVERIFIED; CONFLICT (R1: 85.4) | 83.7 | +0.8 |
| 68 | 84.0 | UNVERIFIED; CONFLICT (R1: 84.5) | 83.3 | +0.7 |
| 67 | 83.5 | UNVERIFIED; CONFLICT (R1: 84.2) | 82.9 | +0.6 |
| 66 | 83.0 | UNVERIFIED; CONFLICT (R1: 83.6) | 82.5 | +0.5 |
| 65 | 82.5 | UNVERIFIED; CONFLICT (R1: 83.0) | 82.1 | +0.4 |
| 64 | 82.0 | UNVERIFIED; CONFLICT (R1: 82.4) | 81.6 | +0.4 |
| 63 | 81.5 | UNVERIFIED; CONFLICT (R1: 81.8) | 81.2 | +0.3 |
| 62 | 81.0 | UNVERIFIED; CONFLICT (R1: 81.2) | 80.8 | +0.2 |
| 61 | 80.5 | UNVERIFIED; CONFLICT (R1: 80.6) | 80.4 | +0.1 |
| 60 | 80.0 | CORROBORATED | 80.0 (anchor) | +0.0 |
| 59 | 79.4 | UNVERIFIED; CONFLICT (R1: 79.5) | 79.5 | -0.1 |
| 58 | 78.9 | UNVERIFIED; CONFLICT (R1: 79.0) | 78.9 | +0.0 |
| 57 | 78.3 | UNVERIFIED; CONFLICT (R1: 78.5) | 78.4 | -0.1 |
| 56 | 77.9 | UNVERIFIED | 77.9 | +0.0 |
| 55 | 77.3 | UNVERIFIED | 77.4 | -0.1 |
| 54 | 76.7 | UNVERIFIED | 76.8 | -0.1 |
| 53 | 76.2 | UNVERIFIED | 76.3 | -0.1 |
| 52 | 75.7 | UNVERIFIED | 75.8 | -0.1 |
| 51 | 75.2 | UNVERIFIED | 75.2 | +0.0 |
| 50 | 74.7 | CORROBORATED (~74.7%) | 74.7 (anchor) | +0.0 |
| 49 | 74.1 | CORROBORATED | 74.1 (anchor) | +0.0 |
| 48 | 73.6 | UNVERIFIED | 73.4 | +0.2 |
| 47 | 73.0 | UNVERIFIED | 72.6 | +0.4 |
| 46 | 72.4 | UNVERIFIED | 71.9 | +0.5 |
| 45 | 71.8 | UNVERIFIED | 71.1 | +0.7 |
| 44 | 71.2 | UNVERIFIED | 70.4 | +0.8 |
| 43 | 70.5 | UNVERIFIED | 69.6 | +0.9 |
| 42 | 69.8 | UNVERIFIED | 68.9 | +0.9 |
| 41 | 69.2 | UNVERIFIED | 68.2 | +1.0 |
| 40 | 68.5 | UNVERIFIED | 67.4 | +1.1 |
| 39 | 67.7 | UNVERIFIED | 66.7 | +1.0 |
| 38 | 67.0 | UNVERIFIED | 65.9 | +1.1 |
| 37 | 66.2 | UNVERIFIED | 65.2 | +1.0 |
| 36 | 65.4 | UNVERIFIED | 64.5 | +0.9 |
| 35 | 64.6 | UNVERIFIED | 63.7 | +0.9 |
| 34 | 63.7 | UNVERIFIED | 63.0 | +0.7 |
| 33 | 62.8 | UNVERIFIED | 62.2 | +0.6 |
| 32 | 61.9 | UNVERIFIED | 61.5 | +0.4 |
| 31 | 61.0 | UNVERIFIED | 60.7 | +0.3 |
| 30 | 60.0 | CORROBORATED (~60%) | 60.0 (anchor) | +0.0 |
| 29 | 59.0 | UNVERIFIED | 58.5 | +0.5 |
| 28 | 58.0 | UNVERIFIED | 57.0 | +1.0 |
| 27 | 56.9 | UNVERIFIED | 55.5 | +1.4 |
| 26 | 55.8 | UNVERIFIED | 54.0 | +1.8 |
| 25 | 54.6 | UNVERIFIED | 52.5 | +2.1 |
| 24 | 53.4 | UNVERIFIED | 51.0 | +2.4 |
| 23 | 52.1 | UNVERIFIED | 49.5 | +2.6 |
| 22 | 50.8 | UNVERIFIED | 48.0 | +2.8 |
| 21 | 49.5 | UNVERIFIED | 46.5 | +3.0 |
| 20 | 48.0 | CONFLICT (one site: ~49%) | 45.0 | +3.0 |
| 19 | 46.6 | UNVERIFIED | 43.5 | +3.1 |
| 18 | 45.0 | UNVERIFIED | 42.0 | +3.0 |
| 17 | 43.4 | UNVERIFIED | 40.5 | +2.9 |
| 16 | 41.8 | UNVERIFIED | 39.0 | +2.8 |
| 15 | 40.0 | UNVERIFIED | 37.5 | +2.5 |
| 14 | 38.2 | UNVERIFIED | 36.0 | +2.2 |
| 13 | 36.3 | UNVERIFIED | 34.5 | +1.8 |
| 12 | 34.3 | UNVERIFIED | 33.0 | +1.3 |
| 11 | 32.2 | UNVERIFIED | 31.5 | +0.7 |
| 10 | 30.0 | CORROBORATED | 30.0 (anchor) | +0.0 |
| 9 | 27.7 | UNVERIFIED | 27.3 | +0.4 |
| 8 | 25.2 | UNVERIFIED | 24.5 | +0.7 |
| 7 | 22.7 | UNVERIFIED | 21.8 | +0.9 |
| 6 | 19.9 | UNVERIFIED | 19.1 | +0.8 |
| 5 | 17.1 | APPROX (~17% cited) | 16.4 | +0.7 |
| 4 | 14.1 | UNVERIFIED | 13.6 | +0.5 |
| 3 | 10.9 | CORROBORATED | 10.9 (anchor) | +0.0 |
| 2 | 7.5 | UNVERIFIED | 7.4 | +0.1 |
| 1 | 3.8 | CORROBORATED | 3.8 (anchor) | +0.0 |

### 2.1 Quick-reference decade points (from the table above)

| Years left | 99 | 90 | 80 | 70 | 60 | 50 | 40 | 30 | 20 | 10 | 5 | 1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| % of freehold | **96.0** | 93.0 | 89.0 | 85.0 | **80.0** | **74.7** | 68.5 | **60.0** | 48.0 | **30.0** | 17.1 | **3.8** |
| Status | C | U; R1: 94.6 | U; R1: 91.0 | U; R1: 86.0 | C | C | U | C | U (conflict; R1: 48.0) | C | approx | C |

C = corroborated, U = UNVERIFIED (recalled), R1 = the value in the second reproduction (section 0) where it differs or adds evidence. Values at 40, 5 and 20 years match R1.

Shape (recomputed by fact-check from this file's values): the drop is gentle at first (0.2–0.5 percentage points per year from 99 down to 60). It steepens in the middle (**0.4**–1.0 pp/yr from 60 to 30; the 0.4 is the 56→57 step) and is steep at the end (1.0–3.8 pp/yr below 30, where 3.8 is 1→0 under the B(0) = 0 convention). In R1's version the 60–99 band is not concave: the steps are 0.6 pp/yr in the 60s, 0.5 in the 70s, falling to 0.1 at 95–99.

---

## 3. Caveats (show these in the UI)

1. **Land only.** The table values the leasehold interest in **land** relative to freehold land. It is not a valuation of a whole flat or condo. A flat's price also reflects the building (age, condition, upgrading), location, transport, schools, floor level, flat type and demand. Never multiply a flat's price by a Bala ratio and present the result as "the" value.
2. **It is a valuation convention, not market evidence.** It is used to compute State premiums (see section 1). Resale prices of HDB flats and private leaseholds do not follow it exactly. They are often flatter early in the lease and can fall faster near the end. Present it as a **rough lease-decay heuristic**.
3. **Hand-crafted.** CLC (S2) says the table and its implicit discount rate are "not an exact science". Do not fit or extrapolate a formula beyond 99 years.
4. **The top of the scale is 96%, not 100%.** A brand-new 99-year lease is 96% of freehold. To compare two leaseholds, divide one table value by the other (section 5). Do not compare against 100.
5. **Lease top-ups are priced case by case** by SLA's Chief Valuer (S1 via excerpt). Bala differences give only a rough illustration.
6. **HDB-specific policy effects are not in the table.** The following are UNVERIFIED in this file; cross-check them against the CPF and HDB research files. (Fact-check: the 10 May 2019 / age-95 rule matches `hdb-rules.md` and `loan-rules.md`, but no primary CPF or HDB page was read, so it stays UNVERIFIED.)
   - Since **10 May 2019**, CPF usage and the HDB loan amount depend on whether the remaining lease covers the youngest buyer to **age 95**.
   - HDB flats return to the State when the lease expires.
   - SERS and VERS.

   These affect the prices of older flats in ways Bala's Table does not model.
7. **Whole years only.** The table has one row per whole year. Interpolating linearly between whole years for part-years (for example "61 years 04 months") is an **app convention**. It is not a documented SLA method (UNVERIFIED).

---

## 4. Machine-readable table (for `src/data/bala-table.ts`)

```json
{
  "name": "Bala's Table (SLA leasehold table: leasehold value as % of freehold value)",
  "unit": "percent_of_freehold_land_value",
  "verified": false,
  "verifiedAgainst": null,
  "primarySourceUrl": "https://www.ura.gov.sg/-/media/Corporate/Guidelines/Development-control/Circulars/2022/Jul/dc22-08-Appendix2.pdf",
  "legacySourceUrls": ["https://www.sla.gov.sg/qql/slot/u143/State-Land-n-Property/Land%20Sales%20and%20Lease%20Management/DP%20policy.pdf"],
  "corroboratedYears": [1, 3, 10, 30, 49, 50, 60, 99],
  "conflictYears": { "20": "one consumer site says ~49%" },
  "disputedByReproductionR1": {
    "source": "github.com/thejaminator/lease_buyback app.js BALAS_TABLE (commit 96fecdb); provenance unverified",
    "agreesOnYears": "1-56, 60, 99",
    "valuesWhereDifferent": {"57": 78.5, "58": 79.0, "59": 79.5, "61": 80.6, "62": 81.2, "63": 81.8, "64": 82.4, "65": 83.0, "66": 83.6, "67": 84.2, "68": 84.5, "69": 85.4, "70": 86.0, "71": 86.5, "72": 87.0, "73": 87.5, "74": 88.0, "75": 88.5, "76": 89.0, "77": 89.5, "78": 90.0, "79": 90.5, "80": 91.0, "81": 91.4, "82": 91.8, "83": 92.2, "84": 92.6, "85": 92.9, "86": 93.3, "87": 93.6, "88": 94.0, "89": 94.3, "90": 94.6, "91": 94.8, "92": 95.0, "93": 95.2, "94": 95.4, "95": 95.6, "96": 95.7, "97": 95.8, "98": 95.9}
  },
  "values": {"1": 3.8, "2": 7.5, "3": 10.9, "4": 14.1, "5": 17.1, "6": 19.9, "7": 22.7, "8": 25.2, "9": 27.7, "10": 30.0, "11": 32.2, "12": 34.3, "13": 36.3, "14": 38.2, "15": 40.0, "16": 41.8, "17": 43.4, "18": 45.0, "19": 46.6, "20": 48.0, "21": 49.5, "22": 50.8, "23": 52.1, "24": 53.4, "25": 54.6, "26": 55.8, "27": 56.9, "28": 58.0, "29": 59.0, "30": 60.0, "31": 61.0, "32": 61.9, "33": 62.8, "34": 63.7, "35": 64.6, "36": 65.4, "37": 66.2, "38": 67.0, "39": 67.7, "40": 68.5, "41": 69.2, "42": 69.8, "43": 70.5, "44": 71.2, "45": 71.8, "46": 72.4, "47": 73.0, "48": 73.6, "49": 74.1, "50": 74.7, "51": 75.2, "52": 75.7, "53": 76.2, "54": 76.7, "55": 77.3, "56": 77.9, "57": 78.3, "58": 78.9, "59": 79.4, "60": 80.0, "61": 80.5, "62": 81.0, "63": 81.5, "64": 82.0, "65": 82.5, "66": 83.0, "67": 83.5, "68": 84.0, "69": 84.5, "70": 85.0, "71": 85.4, "72": 85.8, "73": 86.2, "74": 86.6, "75": 87.0, "76": 87.4, "77": 87.8, "78": 88.2, "79": 88.6, "80": 89.0, "81": 89.4, "82": 89.8, "83": 90.2, "84": 90.6, "85": 91.0, "86": 91.4, "87": 91.8, "88": 92.2, "89": 92.6, "90": 93.0, "91": 93.4, "92": 93.8, "93": 94.2, "94": 94.6, "95": 95.0, "96": 95.3, "97": 95.6, "98": 95.8, "99": 96.0}
}
```

Self-checks I ran on these values:

- 99 entries (1 to 99) with no gaps.
- Strictly increasing.
- All 8 corroborated anchors match exactly.
- (Fact-check re-ran all three checks and they pass. The table **section 2** matches this JSON row for row.)

Suggested unit tests. *Fact-check correction:* the section-5 reference `balaPct` returns `{ pct, capped } | null`, not a number, so assertions written as `balaPct(99) === 96` would always fail against it. They now use `.pct`. The existing stub in `src/lib/calc/lease.ts` returns `number | null`; choose one signature and keep the tests consistent with it.

- `balaPct(99)?.pct === 96`, `balaPct(60)?.pct === 80`, `balaPct(30)?.pct === 60`, `balaPct(10)?.pct === 30`, `balaPct(1)?.pct === 3.8`.
- The table is strictly increasing.
- `balaPct(0)?.pct === 0`.
- `balaPct(120)` deep-equals `{ pct: 96, capped: true }`, i.e. capped and flagged.

---

## 5. How to use it: relative value of N years left vs M years left

Let `B(n)` be the table value for `n` years remaining.

**Relative land value** of a lease with N years left vs one with M years left:

```
ratio(N, M) = B(N) / B(M)
pctDiff(N, M) = (B(N) / B(M) - 1) × 100
```

**Worked examples.** These use only corroborated anchors.

| Compare | Calculation | Result | Plain-English reading |
|---|---|---|---|
| 60 yrs left vs a fresh 99-yr lease | 80.0 / 96.0 | **0.8333** (−16.7%) | The land component of the 60-yr lease is worth about 83% of a fresh 99-yr lease. |
| 30 yrs vs 60 yrs | 60.0 / 80.0 | **0.75** (−25.0%) | Losing the 30 years from 60 down to 30 removes a quarter of land value. |
| 49 yrs vs 60 yrs | 74.1 / 80.0 | **0.9263** (exactly 0.92625; −7.4%) | Holding a 60-yr-left flat for 11 years cuts its land component by about 7.4% on this heuristic. |
| 10 yrs vs 30 yrs | 30.0 / 60.0 | **0.50** (−50.0%) | Steep end-of-lease decay. |
| Freehold vs 99 yrs | 100 / 96.0 | 1.0417 | Freehold land is worth about 4.2% more than a fresh 99-yr lease. |

**Holding-period decay.** Buy with N years left and hold for h years:

```
remaining fraction of land value = B(N − h) / B(N)
```

Example: N = 60, h = 11 gives 74.1 / 80.0 = 0.926.

**Lease top-up (illustration only).** The SLA top-up premium is assessed case by case (S1), and the 99.co explainer (S3) uses the same logic:

```
illustrative top-up ≈ (B(99) − B(N)) / 100 × freehold land value
```

Example: N = 60 gives (96 − 80) / 100 = **16% of freehold land value**. Label this "illustrative, not SLA's price".

**Whole-property estimate (optional, model choice, UNVERIFIED).** Apply Bala only to the land share `w` of value:

```
propertyRatio ≈ 1 − w × (1 − B(N)/B(M))
```

Expose `w` as a user input; there is no official default. The two properties are also likely to differ in building age, so state that this ignores building depreciation. The default UI should show the **land-only ratio**.

**Reference implementation (TypeScript):**

```ts
import table from '@/data/bala-table.json'; // the section-4 JSON (section 4's heading says src/data/bala-table.ts; pick one path)

const B: number[] = Array.from({ length: 100 }, (_, y) =>
  y === 0 ? 0 : (table.values as Record<string, number>)[String(y)]); // B[0] = 0 is an app convention (lease expired)

/** % of freehold land value for a (possibly fractional) number of years left. */
export function balaPct(yearsLeft: number): { pct: number; capped: boolean } | null {
  if (!Number.isFinite(yearsLeft)) return null;
  if (yearsLeft <= 0) return { pct: 0, capped: false };
  if (yearsLeft >= 99) return { pct: B[99], capped: yearsLeft > 99 }; // table ends at 99; never extrapolate
  const lo = Math.floor(yearsLeft);
  const f = yearsLeft - lo;
  return { pct: B[lo] + (B[lo + 1] - B[lo]) * f, capped: false }; // linear between whole years (app convention)
}

/** Relative land value of N years left vs M years left (e.g. 0.8333 for 60 vs 99). */
export function balaRatio(nYears: number, mYears: number): number | null {
  const a = balaPct(nYears), b = balaPct(mYears);
  if (!a || !b || b.pct === 0) return null;
  return a.pct / b.pct;
}
```

**Inputs from HDB resale data.** Field formats are in `docs/research/datagov-api.md` §5:

- `remaining_lease` is `"61 years 04 months"` from 2017 onwards and a plain integer in 2015–2016. Parse it to decimal years with `parseRemainingLease()` from that file. Example: "61 years 04 months" gives 61.333, so `balaPct` = 80.5 + 0.5 × 0.333 = **80.67** (uses UNVERIFIED rows 61 and 62). Fact-check recomputed this: 80.5 + 0.5 × 4/12 = 80.667. CONFIRMED as arithmetic. With R1's disputed rows 61 = 80.6 and 62 = 81.2 it would be 80.6 + 0.6 × 4/12 = **80.80**.
- Before 2015 the field is missing. Derive it as `99 − (txnYear − lease_commence_date)` and label it as derived.
- Treat freehold as 100%, and do not run it through the table. Treating 999-year leases as freehold-equivalent is a market convention and is UNVERIFIED. Leases between 99 and 999 years, which are rare, should be capped at 96 and flagged.

---

## 6. Sources

**Primary or government.** Located through web search; the documents themselves could not be opened in this session.

| ID | Source | URL | What it supports |
|---|---|---|---|
| S1 | SLA policy circular on the Differential Premium ("DP policy"). Appendix 1 is the leasehold table, "leasehold values as a percentage of freehold value", 1–99 yrs. A search excerpt described it as "2020-updated"; the date is UNVERIFIED. | https://www.sla.gov.sg/qql/slot/u143/State-Land-n-Property/Land%20Sales%20and%20Lease%20Management/DP%20policy.pdf | 10 yrs = 30.0%, 49 yrs = 74.1%. The top-up premium is assessed by the Chief Valuer case by case. **Fact-check:** this is a **legacy** document, because the DP regime was replaced by LBC on 1 Aug 2022 (S13). Prefer S14. |
| S1b | An older SLA version of the same circular. The filename suggests 2006-10 or 2006/10; UNVERIFIED. | https://www.sla.gov.sg/qql/slot/u143/State-Land-n-Property/Land%20Sales%20and%20Lease%20Management/DP%20Policy%20200610.pdf | The same table. Not read. |
| S13 | URA/SLA circular **DC22-08**, "Land Betterment Charge Arising From Planning Applications And / Or Involving Lifting Of Restrictive Covenants", Circular No. URA/PB/2022/08-DCG. Published 5 Jul 2022; effective 1 Aug 2022. *Added by fact-check; read in full via a GitHub text mirror (`drgnfrts/ura-llm-search`, `data/chat-ura/Circulars/dc22-08.md`, commit f33b462) because ura.gov.sg is unreachable from this container.* | https://www.ura.gov.sg/Corporate/Guidelines/Circulars/dc22-08 | LBC replaced DP, DC and TDL with effect from 1 Aug 2022 under the LBC Act 2021, and SLA collects it. The rate is generally 70%. Para 9: for tenure of 99 years or less, LBC is adjusted by the **current Leasehold Table**, a copy of which is in Appendix 2. |
| S14 | Appendix 2 of S13: the **Leasehold Table**, the current official copy. *Added by fact-check.* **NOT read**: the proxy returns 403 and WebFetch gets a DNS error. | https://www.ura.gov.sg/-/media/Corporate/Guidelines/Development-control/Circulars/2022/Jul/dc22-08-Appendix2.pdf | The authoritative per-year values. **Diff section 4 against this first.** |
| S15 | Planning Act 1998 (2020 Rev. Ed., informal consolidation in force from 9 Mar 2025), legislative history entry 14: "Act 11 of 2021 — Land Betterment Charge Act 2021". *Added by fact-check; read via a GitHub text mirror (`nkhllg/Scriptie`, `legislation_data/Singapore/Planning Act 1998.txt`, commit af5a165).* | https://sso.agc.gov.sg/Act/PA1998 (URL pattern UNVERIFIED) | First reading 5 Apr 2021; second and third readings 10 May 2021; amendments "wef 01/08/2022". |
| S2 | gov.sg-hosted note "Bala's Table", apparently by the Centre for Liveable Cities. It opens: "When the Clifford Pier site at Collyer Quay was sold in 2006, developers…" | https://isomer-user-content.by.gov.sg/50/ade6cd16-890b-4a1b-9d1d-d0e189daba03/balas-table.pdf | The Land Office officer "Bala", the unclear origin, and "not an exact science". |

**Secondary or reproductions.** Reached through web-search excerpts only.

| ID | Source | URL |
|---|---|---|
| S3 | 99.co, "What does Bala's Curve tell us about leasehold property value?" | https://www.99.co/singapore/insider/balas-curve-leasehold-property-value/ |
| S4 | Stacked Homes, "Freehold vs leasehold (part 1)", with a full table reproduction | https://stackedhomes.com/freehold-vs-leasehold-part-1/ |
| S5 | International Real Estate Review vol. 28 no. 3 (2025), "Unpacking Singapore's Leasehold Relativity Table" | https://www.gssinst.org/irer/wp-content/uploads/2025/10/vol28_no3_4-MS24070401-Unpacking-Singapores-Leasehold-Ti.pdf |
| S6 | Life Finance, "What's the value of my leasehold condominium? Revisiting Bala's Table" | https://lifefinance.com.sg/whats-the-value-of-my-leasehold-condominium-revisiting-balas-table/ |
| S7 | Anjia SG, "Valuing Leasehold Property: An In-Depth Look at Bala's Table" | https://www.anjiasg.com/en/blog/balas-table-and-curve/ |
| S8 | ShiokNest, "Bala's Table: How Leasehold Values Are Calculated" | https://shioknest.com/blog/glossary-balas-table-leasehold-valuation |
| S9 | YouHome.sg, "Bala's Curve: How Leasehold Value Is Computed" | https://youhome.sg/balas-curve-leasehold-value-singapore/ |
| S10 | PropertyNet, "HDB Lease Decay and Bala's Curve 2026" | https://propertynet.sg/hdb-lease-decay-balas-curve-2026-remaining-lease-resale-value/ |
| S11 | EdgeProp, "Leasehold versus freehold: an argument that will go on until the cows come home" | https://edgeprop.sg/property-news/leasehold-versus-freehold-argument-will-go-until-cows-come-home |
| S12 | Stacked Homes, case study on The Hillford (60-yr leasehold) | https://stackedhomes.com/editorial/case-study-the-hillford-60-year-leasehold/ |
| R1 | *Added by fact-check.* GitHub `thejaminator/lease_buyback`, an HDB Lease Buyback calculator that says it is based on the T&C effective 1 Jan 2026. Its `app.js` constant `BALAS_TABLE` has all 99 rows and claims "Official per-year values from Singapore Land Authority. Codified in the 7th Schedule of the Land Betterment Charge (Table of Rates and Valuation Method) Regulations 2022". That claim is UNVERIFIED and its provenance is unknown. Read in full at commit 96fecdb. | https://github.com/thejaminator/lease_buyback/blob/96fecdbe499073a0351f7730a25610b3e542d98f/app.js |

**Session limitations.** The methods I tried each failed:

- WebFetch returned `getaddrinfo ENOTFOUND` for every host, including en.wikipedia.org.
- Container curl got `403` from the egress proxy on `www.sla.gov.sg`.
- The shared WebSearch budget (200 per turn) ran out after 4 successful searches in this task.

As a result, no page was read in full. All "corroborated" values come from search-engine result excerpts. Re-run the verification step in section 0 when network access allows.

**Fact-check session (2026-10-10) limitations:**

- WebFetch still failed with `ENOTFOUND` on every host tried: sla.gov.sg, ura.gov.sg, sso.agc.gov.sg, isomer-user-content.by.gov.sg and stackedhomes.com.
- Container curl got a proxy 403 for sla.gov.sg, ura.gov.sg, gssinst.org, 99.co, stackedhomes.com and web.archive.org.
- WebSearch was already exhausted for the turn.
- The only reachable sources were GitHub code search and `raw.githubusercontent.com`. Every new finding above therefore comes from GitHub-hosted text, either mirrors of official pages (S13, S15) or a third-party reproduction (R1).
- **No official copy of the per-year table has been read by anyone yet.**

---

## Verification log

Fact-check run 2026-10-10 (adversarial). "Confirmed" means checked against a primary text or a faithful text mirror of one, or recomputed exactly. "UNVERIFIED" means no primary source could be reached; see the limitations above.

| # | Claim (section) | Verdict | Evidence / source |
|---|---|---|---|
| 1 | LBC Act 2021 "effective **1 April 2022**" (§1 Legal context) | **CORRECTED → 1 August 2022** | S13: URA circular DC22-08, "With effect from 1 August 2022, a new Land Betterment Charge (LBC) will replace DP, DC and TDL". S15: Planning Act history, "Act 11 of 2021 wef 01/08/2022". The 1 April 2022 that appears next to the LBC entry in that history belongs to the previous entry (13). |
| 2 | LBC consolidated DC, DP and TDL (§1) | Confirmed | S13 para 2. |
| 3 | LBC Act is Act 11 of 2021, passed 10 May 2021 (added) | Confirmed | S15 legislative history (first reading 5 Apr 2021, Bill No. 7/2021). |
| 4 | Table used to adjust land charges for tenure ≤ 99 yrs (§1 Official uses) | Confirmed for LBC; **corrected** to note that DP ended on 1 Aug 2022 | S13 para 9 ("adjusted based on the current Leasehold Table"). |
| 5 | Primary source = SLA DP-policy PDF (§0, §4 `primarySourceUrl`, §6 S1) | **Corrected**: S1 is now legacy; `primarySourceUrl` → URA DC22-08 Appendix 2 | S13 para 9 links Appendix 2 as the copy of the current table. The appendix itself was not read. |
| 6 | Land-renewal, lease-upgrading and top-up uses; top-up assessed case by case by the Chief Valuer (§1) | UNVERIFIED | Single search excerpt of S1; S1 not reachable. |
| 7 | Anchors 1 = 3.8, 3 = 10.9, 10 = 30.0, 30 = 60.0, 49 = 74.1, 50 = 74.7, 60 = 80.0, 99 = 96.0 (§2) | UNVERIFIED against the official table; consistent with R1 | R1 matches all 8 exactly. |
| 8 | Rows 2–56 (non-anchor) (§2) | UNVERIFIED; consistent with R1 | R1 matches every row 1–56 exactly. |
| 9 | Rows 57–59 and 61–98 (§2) | **DISPUTED**: 41 rows conflict with R1 by 0.1–2.0 pp (max at 80 yrs: 89.0 vs 91.0) | R1. Both are unverified, so the values were kept and every row flagged `CONFLICT (R1: x)`. |
| 10 | 20 yrs = 48.0 vs one site's "~49%" (§2) | UNVERIFIED; R1 agrees with 48.0 | R1. |
| 11 | "Monotonic and concave" (§0) | **Corrected → strictly increasing, approximately concave** | Recomputed: 7 step reversals (at 20, 39, 42, 49, 54, 57 and 59; one of 0.2 pp at 56–58). |
| 12 | Interpolation column, all 99 rows (§2) | **Corrected 2 cells**; 97 confirmed | Recomputed. Row 55: 74.7 + 5.3 × 0.5 = 77.35, so 77.4 not 77.3 (diff −0.1). Row 2: 3.8 + 7.1/2 = 7.35, so 7.4 not 7.3 (diff +0.1). |
| 13 | "Interpolation under-states … up to about 3 pp in the 12–27-yr band" (§2) | **Corrected** | Recomputed: maximum 3.1 pp at 19 yrs; ≥ 2 pp across 14–25 yrs; **over**-states by up to 0.12 pp at 51–55 and 57–59. |
| 14 | Shape: "0.5–1.0 pp/yr from 60 to 30" (§2.1) | **Corrected → 0.4–1.0** | The 56→57 step is 0.4. The 0.2–0.5 (99–60) and 1.0–3.8 (<30) ranges are confirmed. |
| 15 | Decade quick-reference values (§2.1) | Confirmed as consistent with §2; R1 conflicts added for 90, 80 and 70 | Recomputed. |
| 16 | JSON: 99 entries, strictly increasing, anchors match, equal to the §2 table (§4) | Confirmed | Script check. |
| 17 | Unit tests `balaPct(99) === 96` etc. (§4) | **Corrected** | The reference `balaPct` returns `{pct, capped}`, so the tests now use `?.pct`. |
| 18 | Annuity check: r = 3.5% → 96.7% / 87.3%; r ≈ 2.7% → 80% @ 60 and ≈ 93% @ 99 (§1) | Confirmed | Recomputed: 96.68, 87.31; r = 2.719% → 92.97. Added: the least-squares r ≈ 2.98% misses by up to 4.6 pp. |
| 19 | Implied discount rate "about 3.5%" (§1) | UNVERIFIED | Secondary claim; source not reachable. |
| 20 | Worked examples: 0.8333, 0.75, 0.9263, 0.50, 1.0417 / 4.2%; top-up 16%; holding decay 0.926 (§5) | Confirmed | Recomputed: 80/96 = 0.83333; 60/80 = 0.75; 74.1/80 = 0.92625; 30/60 = 0.5; 100/96 = 1.04167; (96 − 80)/100 = 0.16. |
| 21 | "61 years 04 months" → 61.333 → 80.67 (§5) | Confirmed as arithmetic (uses rows that R1 disputes; under R1 → 80.80) | Recomputed. |
| 22 | Whole-property formula `1 − w(1 − B(N)/B(M))` (§5) | Confirmed algebraically | It equals (1 − w) + w·B(N)/B(M). |
| 23 | `remaining_lease` format: "61 years 04 months" from 2017, integer in 2015–16, absent before 2015 (§5) | Consistent with `datagov-api.md` §5; not re-fetched | Internal cross-check only. |
| 24 | CPF / HDB-loan age-95 rule since 10 May 2019 (§3) | UNVERIFIED (consistent with `hdb-rules.md` and `loan-rules.md`) | No CPF or HDB page reachable. |
| 25 | Motha & Yuen: post-1948, 99-yr = 96% and 60-yr = 80% (§1) | UNVERIFIED | Book not reachable. |
| 26 | "Made public in July 2000" (§1) | UNVERIFIED | No source reachable. |
| 27 | CLC note: "Bala" was a Land Office officer; "not an exact science"; Clifford Pier opening line (§1, §6 S2) | UNVERIFIED | S2 host unreachable (DNS). |
| 28 | No revision of the table in 2025–2026 (§0) | UNVERIFIED | No primary source reachable. The 2022 circular calls it the "current Leasehold Table". |
| 29 | R1's claim that the table is codified in the 7th Schedule of the LBC (Table of Rates and Valuation Method) Regulations 2022 (added) | UNVERIFIED | SSO unreachable; recorded only as a lead for S14 verification. |
| 30 | Source URLs S1, S1b, S2, S3–S12 (§6) | UNVERIFIED (unreachable: DNS failure or proxy 403) | Existence not re-checked. S13's URA URL matches the `link:` field in the mirror. |
