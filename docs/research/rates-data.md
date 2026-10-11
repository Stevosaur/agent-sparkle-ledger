# Mortgage interest-rate data (Singapore): research notes for engineers

Research date: **2026-10-10**.

Scope:
1. SORA. Where MAS publishes daily SORA and compounded SORA (1M / 3M / 6M); the API, auth and response format; recent dated values for a fallback.
2. HDB concessionary loan rate (2.6%) and CPF OA rate (2.5%) for Q4 2026.
3. How bank home-loan packages are structured. No bank rates are given here.
4. Free public sources for the HDB Resale Price Index and the URA private residential Price Index, with dataset IDs.

Maps onto `RatesSnapshot` in `src/lib/data/types.ts` (see §6).

---

## 0. How these facts were sourced (read first)

- **No primary host could be fetched directly in this session.**
  - The research fetch tool returned `getaddrinfo ENOTFOUND` for every host tried: `www.mas.gov.sg`, `eservices.mas.gov.sg`, `www.developer.tech.gov.sg`, `v2.developer.tech.gov.sg`, `data.gov.sg`, `www.hdb.gov.sg` and even `en.wikipedia.org`.
  - The container's egress proxy answers **403 to CONNECT** for `eservices.mas.gov.sg:443` and `www.ura.gov.sg:443`, per `/__agentproxy/status` `recentRelayFailures`.
  - The session's shared **web-search budget ran out partway through** this research. Some open questions in §7 could not be closed. A follow-up session can continue.
  - **Verification pass (2026-10-10):** an adversarial fact-check re-ran every check it could. The web-search budget was already exhausted, and every gov / bank / mirror host (cpf.gov.sg, hdb.gov.sg, mas.gov.sg, eservices.mas.gov.sg, data.gov.sg, ura.gov.sg, singstat, abs.org.sg, uob.com.sg, cashew.sg, propoagroup.co, housingloansg.com, straitsdata.com, developer.tech.gov.sg) returned proxy `403` / `ENOTFOUND`. Code claims were re-checked against the locally cloned repos; arithmetic was recomputed; cross-references were checked against `loan-rules.md`, `hdb-rules.md`, `datagov-api.md` and a third-party data.gov.sg catalog snapshot. Results are in the **Verification log** at the end.
- **What the facts rest on:**
  1. **Search-index extracts of primary pages**, chiefly mas.gov.sg / eservices.mas.gov.sg and the MAS user guide PDF. The primary URL is cited, though it was read via the search index rather than fetched.
  2. **Open-source code read in full via `git clone`.** Two repos:
     - `ashblack24/SMU-interest-calculator`: last commit 2026-10-05. It calls the current MAS API gateway in production.
     - `laisee/pymasapi`: last commit 2026-01-08. It wraps the legacy MAS API.
  3. **Third-party rate mirrors** for recent values: Cashew, HousingLoanSG, Propoa, StraitsData.
  4. **Prior knowledge** (training data to mid-2026). This is always labelled **UNVERIFIED**.
- **Confidence labels:**
  - **[PRIMARY]**: seen in MAS / gov text, via the search index.
  - **[CODE]**: seen in working 2026 open-source code that calls the endpoint.
  - **[3RD-PARTY]**: from a non-government site.
  - **UNVERIFIED**: best understanding only. Code defensively and verify at ingest.
- **Engineering rule.** The ingest job must validate everything it fetches (§1.8) and fail loudly. It must not write a guess. It must never ship invented numbers. If a live fetch fails, use the dated fallback in §1.7, labelled with its date and source.

---

## 1. SORA (Singapore Overnight Rate Average)

### 1.1 Definitions and publication schedule [PRIMARY]

| Fact | Value | Source |
|---|---|---|
| What SORA is | Volume-weighted average rate of borrowing transactions in the unsecured overnight interbank SGD cash market in Singapore, between **8:00am and 6:15pm** | https://abs.org.sg/benchmark-rates/about-sora ; https://www.mas.gov.sg/monetary-policy/sora |
| When daily SORA is published | **By 9:00am the next Singapore business day**, on the MAS website and through third-party redistributors | same as above |
| Compounded SORA tenors | **1-month, 3-month and 6-month** Compounded SORA, plus the **SORA Index** | https://www.mas.gov.sg/-/media/mas/frn/user-guide-for-sora-index-compounded-sora-and-mas-frn.pdf |
| When compounded SORA is published | "MAS will publish Compounded SORA of 1-month, 3-month and 6-month tenors at **9am on every business day** in Singapore" | same PDF |
| Cost | Free. "SORA is accessible at no charge on the MAS website." | https://abs.org.sg/benchmark-rates/about-sora |
| Market convention | Overnight rates such as SORA are referenced through their **compounded average** | https://www.citibank.com.sg/global_docs/pdf/sora.pdf (bank explainer) |

**Background (UNVERIFIED, prior knowledge, not re-checked this session):**
- SOR was discontinued after **30 Jun 2023**.
- SIBOR was fully discontinued after **31 Dec 2024** (that was the last tenor, 3M SIBOR; 1M and 6M SIBOR ended after 31 Mar 2022, also prior knowledge).
- SORA is now the SGD floating-rate benchmark for new home loans.
- For UI copy, phrase this as "SORA has replaced SIBOR/SOR" without dates unless they are verified.

### 1.2 Human-readable official pages (use as citation links in the UI)

| Page | URL | Notes |
|---|---|---|
| MAS Domestic Interest Rates (daily table) | `https://eservices.mas.gov.sg/statistics/dir/domesticinterestrates.aspx` | [PRIMARY] Shows SORA, SORA Index and 1M / 3M / 6M Compounded SORA. It is an ASP.NET page with a form-based date-range download. **Do not scrape it.** Use the API (§1.3). |
| MAS SORA overview | `https://www.mas.gov.sg/monetary-policy/sora` | [PRIMARY] |
| MAS Statistics hub | `https://www.mas.gov.sg/statistics` | [PRIMARY] Says MAS "offers APIs for exchange rates, interest rates, loans and more" via the **APIMG portal**. |
| MAS user guide: SORA Index / Compounded SORA | `https://www.mas.gov.sg/-/media/mas/frn/user-guide-for-sora-index-compounded-sora-and-mas-frn.pdf` | [PRIMARY] Formulae (§1.6) |
| MAS API on the GovTech developer portal | `https://www.developer.tech.gov.sg/products/categories/data-and-apis/mas-api/overview` | [PRIMARY] Pricing page: "datasets available in MAS API are currently **free to use**" (page last updated **07 Mar 2025**). Source: `https://www.developer.tech.gov.sg/products/categories/data-and-apis/mas-api/pricing` |

Recommended UI attribution string: `Source: Monetary Authority of Singapore (MAS), Domestic Interest Rates`, linking to the first URL above.

### 1.3 Current MAS API: APIMG gateway (daily domestic interest rates, which include SORA)

**Endpoint** [CODE; consistent with the PRIMARY statement that MAS APIs are served via the "APIMG portal"]:

```
GET https://eservices.mas.gov.sg/apimg-gw/server/monthly_statistical_bulletin_non610mssql/domestic_interest_rates_daily/views/domestic_interest_rates_daily
```

**Auth** [CODE]:
- Request header **`KeyId: <your MAS API key>`**. The working code labels it "Mandatory MAS header". Without it the code returns 401 before calling. **Treat the key as required.**
- **How to get a key** (UNVERIFIED steps): register on the MAS **APIMG portal**, `https://eservices.mas.gov.sg/apimg-portal/`, and subscribe to the "Monthly Statistical Bulletin" / domestic interest rates API. The key is then shown in the portal. One third-party aggregator claims some MAS endpoints work without a key, but it contradicts itself. **Assume a key is needed.**
- Store the key server-side only, e.g. env var `MAS_API_KEY_ID`. Never use a `NEXT_PUBLIC_` variable.
- **CORS:** the reference code (`src/components/MasConfigModal.tsx`) notes that browser calls to `eservices.mas.gov.sg` "may be blocked by CORS unless proxied by a server". Call only from the ingest script or a server route.
- Naming: the reference code reads `process.env.MAS_KEY_ID` (or `KEY_ID`). This project uses `MAS_API_KEY_ID` (§5); do not mix them up.

**Query parameters**: OData-style. [CODE] for `$orderby` and `$top`. UNVERIFIED for `$filter`.

| Param | Example | Meaning |
|---|---|---|
| `$orderby` | `end_of_day desc` | Sort newest first. URL-encode the space: `%20`. |
| `$top` | `30` | Max rows. The reference code fetches 2× the rows it needs (minimum 10, capped at 100), because some rows have null SORA (see below). **The largest `$top` the gateway accepts is UNVERIFIED**: no code seen requests more than 100. |
| `$filter` | `end_of_day ge '2026-01-01'` | **UNVERIFIED.** It is not used in any code seen. To get a history window, page with `$top` / `$skip` (also UNVERIFIED), or request a large `$top`, then filter client-side. |

Example request [CODE]:
```bash
curl -sS "https://eservices.mas.gov.sg/apimg-gw/server/monthly_statistical_bulletin_non610mssql/domestic_interest_rates_daily/views/domestic_interest_rates_daily?\$orderby=end_of_day%20desc&\$top=30" \
  -H "Accept: application/json" \
  -H "KeyId: $MAS_API_KEY_ID"
```

**Response envelope** [CODE, one codebase]:
- Rows are in **`elements`**: an array of objects.
- The reference code also falls back to `result.records` (the legacy CKAN shape, §1.4). Do the same.
- Other top-level keys are unknown.

```ts
const rows: any[] = Array.isArray(json?.elements) ? json.elements
                  : Array.isArray(json?.result?.records) ? json.result.records : [];
```

**Row fields used for SORA** [CODE, one codebase]. Exact names as read by the code:

| Field | Meaning | Type / format |
|---|---|---|
| `end_of_day` | SORA **value date** (the business day the rate is for) | date string; the example shows `"2026-10-02"`. Take `slice(0,10)`. |
| `published_date` | Date MAS published that value | example `"2026-10-05T00:00:00"`. The value date was Fri 2 Oct; publication was Mon 5 Oct, the next business day. |
| `sora` | Overnight SORA, % p.a. | number **or string**; `parseFloat` it |
| `comp_sora_1m` | 1-month Compounded SORA, % p.a. | number or string |
| `comp_sora_3m` | 3-month Compounded SORA, % p.a. | number or string |
| `comp_sora_6m` | 6-month Compounded SORA, % p.a. | number or string |
| `sora_index` | SORA Index (dimensionless, about 1.12 in Oct 2026) | number or string |
| `aggregate_volume` | Aggregate volume of transactions (S$ million: UNVERIFIED unit) | number or string |
| `highest_transaction` / `lowest_transaction` | Highest / lowest transacted rate, % | number or string |

**Quirks:**
- **Rows can exist with `sora == null`** [CODE]. These are non-business days or not-yet-published days. The reference code skips any row where both `sora` and `comp_sora_3m` are null. **Skip them**; never coerce null to 0.
  - **The reference code has a bug: do not copy it.** It does `parseFloat(raw) || soraVal`, which turns a missing compounded value into the overnight value. Treat a missing field as `null`.
- The dataset is "domestic interest rates daily", so rows have other columns too: interbank, SGS repo, standing facility and so on. Names were not seen. Ignore unknown columns.
- **A `preliminary` flag existed in the legacy API** (UNVERIFIED for APIMG). If a `preliminary` field is present and truthy, do not treat the row as final.

**Example of one normalised row.** These values come from the reference repo's README example response, commit 2026-10-05. That README shows the **repo's own `/api/sora` output**, not a raw MAS response. The JSON below re-maps it to the raw MAS field names, using the mapping in `api/sora.ts` (`date` ← `end_of_day`, `sora_compound_*` ← `comp_sora_*`). The values agree with independent third-party mirrors (§1.7), so they are plausibly derived from a real MAS response. Still **[3RD-PARTY-relayed] / UNVERIFIED**:
```json
{
  "end_of_day": "2026-10-02",
  "published_date": "2026-10-05T00:00:00",
  "sora": 1.3724,
  "comp_sora_1m": 1.2672,
  "comp_sora_3m": 1.2332,
  "comp_sora_6m": 1.1689,
  "sora_index": 1.1248399542,
  "aggregate_volume": 2089,
  "highest_transaction": 1.45,
  "lowest_transaction": 0.80
}
```
(The field names above are the **raw MAS names** as read by `api/sora.ts`. The README itself prints `date` / `sora_compound_1m` / `sora_compound_3m` / `sora_compound_6m`, and `highest_transaction` / `lowest_transaction` as `1.4500` / `0.8000`.)

**Warning about that repo.** Its `src/services/masApi.ts` hard-codes a `FALLBACK_MAS_RECORDS` table: 30 rows dated **31 Jul – 2 Oct 2026** with overnight SORA of **3.04%–3.14%** (3M about 3.07%–3.17%). Those numbers contradict every other source, which put 3M SORA at about 1.23%. They are evidently fabricated. **Do not reuse them.**

Sources:
- https://github.com/ashblack24/SMU-interest-calculator: files `api/sora.ts`, `src/components/BackendGuideModal.tsx`, `README.md`
- https://www.mas.gov.sg/statistics (APIMG portal reference)

### 1.4 Legacy MAS API (`eservices.mas.gov.sg/api/action/datastore/search.json`): do not depend on it

[CODE: `laisee/pymasapi`, last commit 2026-01-08]

The pattern is CKAN-style:
```
GET https://eservices.mas.gov.sg/api/action/datastore/search.json?resource_id={uuid}&limit=N
```
- The response is expected to be `{ success, result: { records: [...] } }`. **UNVERIFIED:** this is the standard CKAN envelope. pymasapi's code never reads it; the only code evidence is the SMU repo's `result.records` fallback (§1.3).
- The pymasapi README points to the docs page `https://secure.mas.gov.sg/api/Search.aspx`.
- pymasapi passes paging as `&limit=N` (default 5).

Resource IDs found in code:

| Dataset | resource_id |
|---|---|
| Domestic interest rates, daily (from `scripts/sample_api_call.py`) | `9a51d255-fec1-4aca-9818-b7a47490243c` |
| Domestic interest rates, weekly (from `src/settings.py`) | `9a0bf149-308c-4bd2-832d-76c8e6cb47ed` |
| Domestic interest rates, monthly (from `src/settings.py`) | `b5adb5c2-4604-49f3-b924-b69691252380` |
| Domestic interest rates, annual (from `src/settings.py`) | `ea5e28f0-fdcd-4408-be63-4cd7b2471113` |

- **Status: UNVERIFIED.** MAS moved its statistics APIs to the APIMG portal (§1.3). The legacy datastore endpoint is very likely retired or keyed. A RapidAPI listing of "MAS Domestic Interest Rates, Yearly" on the old host is marked not available.
- The ingest may *try* it as a last resort behind the APIMG call. It must not be the primary path.

### 1.5 Network / deployment notes

- **This container cannot reach `eservices.mas.gov.sg`** (proxy 403).
- Run the SORA fetch in the **ingest job**, e.g. GitHub Actions, which has normal internet access. Write the result into the JSON snapshot.
- The site (Vercel) then serves the snapshot with ISR. Do not call MAS on every page request.
- Cadence: SORA updates once per business day, by about 9am SGT. A daily ingest at about **10:00 SGT (02:00 UTC)** is enough.
- If `MAS_API_KEY_ID` is unset, the ingest must:
  - skip the live fetch;
  - keep the **previous snapshot's** SORA values, or the §1.7 fallback;
  - set the source status to `"stale"` / `"missing-key"`.

### 1.6 Compounded SORA formulae [PRIMARY: MAS user guide PDF]

From daily SORA, with the ACT/365 convention:

```
Compounded SORA (% p.a.) = [ Π_{i=1..d_b} (1 + SORA_i × n_i / 365) − 1 ] × 365 / d × 100
```
- `d_b` = number of business days in the period.
- `SORA_i` = SORA on business day *i*, as a decimal.
- `n_i` = calendar days that SORA_i applies for, e.g. 3 over a weekend.
- `d` = calendar days in the period.

From the SORA Index, for any start/end pair:

```
Compounded SORA (% p.a.) = (SORA_Index_end / SORA_Index_start − 1) × 365 / d × 100
```

- Published compounded SORA is shown to **4 decimal places**. The example shows `1.2332`.
- The SORA Index is shown to **10 decimal places**. The example shows `1.1248399542`.
- Rounding conventions beyond what the examples show are UNVERIFIED.
- **Use the MAS-published `comp_sora_*` values directly.** Do not recompute them. The formula is only for explanatory copy or a custom-period tool.
- **UNVERIFIED:** the exact observation window behind the 3M value on a given row (whether it ends at `end_of_day` or the day before). In the UI, label it "3M Compounded SORA, as published by MAS on {published_date}". If `published_date` is missing, use "for {end_of_day}".

### 1.7 Recent values and dated fallback

All values below are **[3RD-PARTY] mirrors of MAS data, UNVERIFIED against MAS directly**.
- **Agreement (recomputed):** across the 2, 5 and 8 Oct rows, 3M agrees to within **0.002** points (1.2310–1.2332) and 6M to within **0.006** points (1.1689–1.1752). 1M moved **0.023** points (1.2672 → 1.2902) between 2 and 8 Oct. That is expected day-to-day drift with overnight SORA at about 1.35–1.37%, not a disagreement. The earlier blanket claim of "within about 0.01 point" was too strong for 1M.
- **Cross-tenor check (recomputed, simple-average approximation):** from the 2 Oct row, the implied Jul–Aug average is (3 × 1.2332 − 1.2672) / 2 ≈ **1.216%**, and the implied Apr–Jun average is (6 × 1.1689 − 3 × 1.2332) / 3 ≈ **1.105%**. The latter matches StraitsData's 1M of 1.0992 on 4 Jun. The rows are internally consistent.

| As at | Overnight SORA | 1M comp. | 3M comp. | 6M comp. | Source |
|---|---|---|---|---|---|
| 2026-10-08 (as-at date; value vs publication date not stated) | n/a | **1.2902** | **1.2310** | **1.1752** | Cashew https://www.cashew.sg/interest-rates/sora ; HousingLoanSG https://housingloansg.com/hl/charts/sibor-sor-daily-chart |
| 2026-10-05 | 1.35 | 1.28 | 1.23 | 1.17 | Propoa https://propoagroup.co/market/sora (same 3M on 1 and 2 Oct) |
| value date 2026-10-02 (published 2026-10-05) | 1.3724 | 1.2672 | 1.2332 | 1.1689 | MAS API response quoted in the SMU-interest-calculator README (§1.3) |
| late Jun 2026 (date UNVERIFIED: the cited URL slug `…-202603020001` suggests a 2 Mar 2026 post, so the reading may be older or the post was updated) | n/a | n/a | ≈1.07 | n/a | Homejourney blog (about 1.07%) |
| 2026-06-04 | 0.9381 | 1.0992 | n/a | n/a | StraitsData https://straitsdata.com/finance/mas |

**Fallback to ship in the snapshot** (only if the live MAS fetch fails). Label it in the UI as *"as at 8 Oct 2026, source: MAS (via third-party mirror), may be out of date"*. **Correction:** the overnight value is for **2 Oct 2026**, not 8 Oct. Show each value with its own `date` field, or word the label "as at 2–8 Oct 2026".

```json
{
  "overnight":    { "value": 1.3724, "date": "2026-10-02" },
  "compounded1m": { "value": 1.2902, "date": "2026-10-08" },
  "compounded3m": { "value": 1.2310, "date": "2026-10-08" },
  "compounded6m": { "value": 1.1752, "date": "2026-10-08" },
  "series3m": [],
  "source": "MAS Domestic Interest Rates (fallback values relayed via third-party mirrors, not fetched live)"
}
```

- **Do not invent a monthly `series3m`.** Leave it empty unless it was fetched from MAS.
  - To build it from the API, take the last business-day row of each month from `$orderby=end_of_day desc&$top=400`. Recomputed coverage: about **13 months** if the view has one row per calendar day (400 / 30.4), and about **19 months** if it has business days only (400 / ~251 per year × 12 ≈ 19.1). The earlier "13–18 months" understated the upper bound.
  - **UNVERIFIED:** whether the gateway honours `$top=400`. The reference code never asks for more than 100. If fewer rows come back than requested, do not assume the history is complete. Build `series3m` from what was returned, and check whether `$skip` paging works (§7).
- **Ignore the discrepant Homejourney claim** that 3M SORA is "around 1%–1.1% in October 2026". It appears to restate a June 2026 reading.

### 1.8 Ingest algorithm and validation (recommended)

1. GET the endpoint with `$orderby=end_of_day%20desc&$top=400` and header `KeyId`, with a 15 s timeout. Retry up to 3 times with backoff on 429 or 5xx.
2. Read `rows = json.elements ?? json.result?.records ?? []`. If `rows.length === 0`, **fail**.
3. For each row:
   - `date = String(row.end_of_day).slice(0,10)`.
   - Parse each of `sora`, `comp_sora_1m`, `comp_sora_3m`, `comp_sora_6m` with `toNum(x)`, which returns `x == null || x === '' ? null : Number(x)`, and `Number.isFinite` else `null`.
   - Drop rows where all four are null.
4. `latest` = the first remaining row that has a non-null `comp_sora_3m`. Use each field's own latest non-null row for `overnight`, `1m` and `6m`.
5. **Sanity checks (fail the SORA source if any fails):**
   - `0 ≤ value ≤ 10` (% p.a.).
   - `latest.date` is within **10 calendar days** of the run date.
   - |3M − 1M| < 1.5 percentage points.
   - Dates are strictly descending and unique.
   - At least 15 non-null rows in the last 30 calendar days.
6. On failure, keep the previous snapshot's SORA block and mark the source `status: "stale"`. **Never write zeros.**
   - Note: `RatesSnapshot` in `src/lib/data/types.ts` has **no `status` field** (checked 2026-10-10). Either record staleness in `sora.source`, or put it in the ingest run's source-status record, or extend the type.
   - Step 1's `$top=400` is subject to the unverified gateway cap noted in §1.3 and §1.7.

---

## 2. HDB concessionary loan rate and CPF OA rate (Q4 2026)

| Item | Value | Effective | Confidence / source |
|---|---|---|---|
| CPF Ordinary Account (OA) interest rate | **2.5% p.a.** | Expected for **1 Oct – 31 Dec 2026** | **UNVERIFIED for Q4 2026.** The Q4 2026 CPF announcement could not be fetched. Basis: the OA rate is the higher of **the legislated minimum 2.5%** and the 3-month average of major local banks' interest rates. That bank average has long been far below 2.5%, so the floor binds. Check https://www.cpf.gov.sg/member/growing-your-savings/earning-higher-returns/earning-attractive-interest |
| HDB concessionary housing loan rate | **2.6% p.a.** | Expected for **1 Oct – 31 Dec 2026** | **UNVERIFIED for Q4 2026** (not fetched). Basis: the HDB loan rate is pegged at **0.1 percentage point above the prevailing CPF OA rate** and is revised quarterly with it. 2.5% + 0.1% = 2.6%. Check https://www.hdb.gov.sg/residential/buying-a-flat/financing-a-flat-purchase/housing-loan-options/housing-loan-from-hdb |
| Quarterly review cycle | Rates are set for each calendar quarter (Jan / Apr / Jul / Oct). CPF announces them in the preceding quarter. | n/a | UNVERIFIED (prior knowledge) |
| No 2025/2026 change to the OA floor or the HDB +0.1% peg found | n/a | n/a | No announcement surfaced in the searches run. Not exhaustively checked: budget exhausted. |
| **Cross-check (verification pass)** | 2.5% / 2.6% for 1 Oct – 31 Dec 2026 | Q4 2026 | **Corroborated, not independently re-fetched.** `docs/research/loan-rules.md` §3 and §6 records Q4 2026 OA = 2.5% and HDB = 2.6% from a cpf.gov.sg search extract plus an AsiaOne article (https://www.asiaone.com/singapore/cpf-interest-rates-2026-october-december). The pegging rule (OA + 0.1 point) and the 2.5% legislated floor agree with prior knowledge. |

- **The extra-interest rules don't affect the 2.6% HDB rate.** For members **below 55**, CPF pays +1% on the first S$60k of combined balances, with up to S$20k of that from the OA. Members aged 55 and above get further extra interest on top. These are member-side rules. UNVERIFIED and not needed here.
- **Already in `src/lib/calc/rules.ts`** (rules confirmed by the rules research, not re-checked here):
  - HDB loan LTV is **75%** (down from 80%). It applies to **complete resale applications received on or after 20 Aug 2024**, and to **new-flat applications from the October 2024 BTO/SBF exercise onwards**. This wording is corrected to match `loan-rules.md` §3 [PRIMARY there]; the earlier "flat applications from 20 Aug 2024" was imprecise for new flats.
  - HDB loan maximum tenure is **25 years**.
  - HDB uses a **3%** interest floor to assess loan eligibility (max(3.0%, concessionary rate)), for HLE/HFE applications **received on or after 30 Sep 2022**.
  - Banks use MAS's **4%** medium-term rate floor for TDSR/MSR (or the loan's "thereafter" rate if higher; 5% for non-residential) where the **OTP is granted on or after 30 Sep 2022**. A third-party guide dated 20 Aug 2026 (Nexus Mortgage SG) still quotes the 4% floor.
  - This topic found **no 2025/2026 change** to the 4% / 3% floors, but they were **not re-verified** here.
- **Snapshot values:**
  - `hdbConcessionaryRate: { value: 2.6, date: "2026-10-01", source: "HDB (pegged at CPF OA rate + 0.1%)" }`
  - `cpfOaRate: { value: 2.5, date: "2026-10-01", source: "CPF Board" }`
  - In UI copy say "2.6% p.a. (CPF OA rate + 0.1%), reviewed quarterly".
  - These are **constants in code with a `verifiedOn` date**, not fetched values. No free machine-readable API for them was found. Add a quarterly reminder to re-check them.

---

## 3. How Singapore bank home-loan packages are structured (no specific rates)

Describe these structures in UI copy. **Do not show any bank rate unless it comes from the package data source** (the spec names Cashew) with its date.

- **Floating, SORA-pegged:**
  - Rate = **compounded SORA (1M or 3M) + a fixed spread**.
  - The spread is often **tiered by loan year**, e.g. Y1, Y2, Y3, then "thereafter".
  - 3M-SORA packages **reprice every 3 months**; 1M-SORA packages reprice every month.
  - The reference rate is backward-looking. UOB: *"The 3-Month Compounded SORA (3M SORA) is computed by compounding the daily published SORA rate over the historical 3-month period. For home loans referencing 3M SORA, interest rate is reviewed on 3-monthly basis."* Source: https://www.uob.com.sg/personal/borrow/property-loans/about-sora.page [PRIMARY for UOB's own product]
- **Fixed:**
  - The rate is fixed for an initial period, typically **1–5 years**, most often **2–3 years**.
  - After that it reverts to a floating rate, usually SORA + spread or a bank board / FD-linked rate.
  - UNVERIFIED typical ranges (industry practice, prior knowledge).
- **Other floating types:**
  - Board rates: the bank sets and can change them at its discretion.
  - Fixed-deposit-linked rates: pegged to a bank's own FD rate.
  - Less transparent than SORA. UNVERIFIED that every major bank still offers these in Oct 2026.
- **Lock-in:**
  - Commonly **0–3 years**, often **2 years**.
  - Redeeming or repricing during lock-in typically costs a **prepayment / redemption penalty of about 1.5%** of the amount redeemed. UNVERIFIED typical figure: it varies by bank and package.
  - Many packages offer **legal / valuation subsidies** that are **clawed back** if the loan is redeemed within about 3 years. UNVERIFIED typical.
- **Typical package fields** for the package-compare schema:
  - bank, package name
  - rate type (`fixed` / `sora1m` / `sora3m` / `board` / `fd`)
  - fixed-period years
  - spread per year (Y1, Y2, Y3, thereafter)
  - lock-in years and penalty %
  - minimum loan quantum
  - property types (HDB / private, completed / under construction)
  - new purchase vs refinance
  - subsidies and clawback
  - `as_of` date
- **Effective rate shown to users** for a SORA package in year *k* = latest published compounded SORA (the matching tenor) + spread_k. Label it as an **indicative** rate that changes at each reset. Never present it as a quote.
- **Regulatory overlay** (cross-reference the rules research): these all apply regardless of package, and are already in `rules.ts`:
  - TDSR 55%.
  - MSR 30%. It applies to HDB flats and to **ECs bought directly from the developer**. Resale ECs and private property are TDSR-only.
  - Stress-test rate floor 4% for bank loans.
  - Maximum **bank-loan** tenure: 30 years for HDB flats, 35 years for private property / EC. Do not confuse this with the **HDB concessionary loan's 25-year** maximum (§2).
  - Bank LTV limits. For a first loan, LTV falls from 75% to 55% if the tenure exceeds 25 years (HDB) or 30 years (private), or if the loan runs past age 65; see `loan-rules.md` §2.

---

## 4. Free public price-index sources

### 4.1 HDB Resale Price Index (1Q2009 = 100), quarterly [PRIMARY]

Fully documented in `docs/research/datagov-api.md` §5.4. Summary:
- data.gov.sg dataset **`d_14f63e595975691e7c24a27ae4c07c79`**, "HDB Resale Price Index (1Q2009 = 100), Quarterly", published by HDB.
- Columns:
  - `quarter`: `"YYYY-Qn"`, e.g. `"2026-Q2"`.
  - `index`: numeric; base 1Q2009 = 100.
- 146 rows, 1990-Q1 to 2026-Q2.
- Download: `GET https://api-open.data.gov.sg/v1/public/api/datasets/d_14f63e595975691e7c24a27ae4c07c79/initiate-download`, then `/poll-download`.
- Alternative: `GET https://data.gov.sg/api/action/datastore_search?resource_id=d_14f63e595975691e7c24a27ae4c07c79&limit=500`.
- Optional `x-api-key` header.
- Human page (cite this): https://data.gov.sg/datasets/d_14f63e595975691e7c24a27ae4c07c79/view
- **Do not use** the SingStat-sourced wide-format duplicate `d_f0c768860912d66940efdac9435dc046`.
- The `quarter` / `index` column names are corroborated by a third-party snapshot of the dataset's `columnMetadata`, taken from a data.gov.sg metadata response: `quarter` is "Quarter (Q)", `index` is "Numeric", and `managedBy` is "Housing & Development Board".
- Release cadence:
  - HDB publishes a **flash** estimate at the start of the month after quarter end and **final** figures about 4 weeks later. UNVERIFIED exact cadence.
  - Corroboration: the same metadata snapshot shows `lastUpdatedAt` = 2025-10-30 with `coverageEnd` = 2025-09-30. So the dataset received Q3 2025 at about the end of October, consistent with "final figures late in the month after quarter end".
  - The Q3 2026 final figure is expected around late Oct 2026. Until then the dataset's latest row is likely 2026-Q2.

### 4.2 URA Private Residential Property Price Index (1Q2009 = 100), quarterly

- **The URA Data Service API has no price-index endpoint.** Its endpoints cover transactions, rentals, developer sales, pipeline, car parks and so on. UNVERIFIED as of Oct 2026, but no PPI service has been documented.
  - [CODE] corroboration: a third-party URA API wrapper (`ura_api`) lists these services: `PMI_Resi_Transaction`, `PMI_Resi_Rental`, `PMI_Resi_Rental_Median`, `PMI_Resi_Developer_Sales`, `PMI_Resi_Pipeline`, `Car_Park_Availability`, `Car_Park_Details`, `Season_Car_Park_Details`, `Planning_Decision`, `EAU_Appr_Resi_Use`. None is a price index.
  - The PPI is published in URA's quarterly real-estate statistics releases: **flash** at the start of the month after quarter end, **final** about 4 weeks later.
  - Releases: https://www.ura.gov.sg/Corporate/Media-Room/Media-Releases
- **data.gov.sg: dataset ID NOT CONFIRMED in this session** (search budget exhausted).
  - URA publishes the PPI series on data.gov.sg. The likely title is "Private Residential Property Price Index (Base Quarter 2009-Q1 = 100), Quarterly", possibly with a variant broken down by property type / market segment.
  - A candidate ID from prior memory is **`d_97f8a2e995022d311c6c68cfda6d034c`**. It is still **UNVERIFIED against data.gov.sg**, which was unreachable. Use it only behind the metadata check below.
  - **Upgraded evidence (verification pass), [CODE] + [3RD-PARTY]:**
    - Two independent third-party codebases fetch this ID as "URA Private Residential PPI". One says it covers "1975-Q1+". The other reads `quarter` ("1975-Q1" style), `property_type` ("All Residential", "Landed", "Non-Landed") and `index`, and says base 2009-Q1 = 100.
    - It is a **long-format by-type table**. That code uses `offset=418&limit=200`, which equals 206 quarters (1975-Q1 to 2026-Q2) × 3 types = 618 rows. That is consistent, but not proof.
    - A third-party data.gov.sg catalog snapshot places this ID in collection **1676, "Private Property Price Index by Type, Quarterly"** (with sibling `d_f333bf427c827efb484cf57a73ff700a`).
    - The same catalog lists another URA collection, **1818 "Private Residential Property Price Index"** (`d_c0c26484c655113b0ab5abaa0a49952b`, `d_f76411aa34d98559b6194419d796ce59`), and collection 1654, `d_f65e490a8ad430f60a9a3d9df2bff2a0` "Private Property Price Index of Non-landed Residential Properties by Locality". All UNVERIFIED.
- **Resolve the ID at ingest time; do not trust a hard-coded ID:**
  1. **First, try the pinned candidate.** `GET https://api-production.data.gov.sg/v2/public/api/datasets/d_97f8a2e995022d311c6c68cfda6d034c/metadata`. Accept it only if all of these hold:
     - `managedBy` is the Urban Redevelopment Authority;
     - `name` matches `/price index/i`;
     - `columnMetadata.map` contains `quarter` and `index`, plus `property_type` for the by-type table;
     - an "All Residential" series exists.
  2. Otherwise, page through `GET https://api-production.data.gov.sg/v2/public/api/datasets?page={n}`, with results in `data.datasets[]` (see `datagov-api.md` §3.2).
  3. Select URA datasets (`managedBy`) whose `name` matches `/private (residential )?property price index/i`. **Correction:** the earlier regex `/private residential.*price index/i` would miss "Private **Property** Price Index …" titles such as collection 1676's.
  4. Prefer the long-format table with `quarter` + `index` (+ `property_type`), and exclude the "Non-landed … by Locality" table. UNVERIFIED column names: inspect `columnMetadata` from `GET https://api-production.data.gov.sg/v2/public/api/datasets/{id}/metadata`.
  5. Log the resolved ID. Fail the PPI source (not the whole ingest) if zero candidates match. **Correction:** several URA PPI datasets exist (at least collections 1654, 1676 and 1818 per the catalog), so "more than one match" is the expected case, not an error. Disambiguate with step 4's column test, and fail only if the ambiguity remains.
- **SingStat Table Builder alternative.** It carries both indices: API `https://tablebuilder.singstat.gov.sg/api/table/tabledata/{resourceId}`. The table IDs for the HDB RPI and the URA PPI are **UNVERIFIED** (not found this session), and the response format is wide (one column per quarter). Use it only if the data.gov.sg route fails.
- **UI rule.** If no PPI dataset is resolved, show an honest empty state: "Private price index unavailable: source URA via data.gov.sg." Do not show estimated index values.

---

## 5. Environment variables (suggested)

| Name | Where | Purpose |
|---|---|---|
| `MAS_API_KEY_ID` | ingest job / server only | Sent as the `KeyId` header to the MAS APIMG gateway |
| `DATA_GOV_SG_API_KEY` | ingest job / server only | Optional `x-api-key` for data.gov.sg (see `datagov-api.md` §2.1) |

---

## 6. Mapping to `RatesSnapshot` (`src/lib/data/types.ts`)

| Snapshot field | Filled from |
|---|---|
| `sora.overnight` | latest non-null `sora`, with date `end_of_day` |
| `sora.compounded1m` / `compounded3m` / `compounded6m` | latest non-null `comp_sora_1m` / `comp_sora_3m` / `comp_sora_6m`, with date `end_of_day` |
| `sora.series3m` | last business-day `comp_sora_3m` of each month; empty if not fetched |
| `sora.source` | `"MAS Domestic Interest Rates (daily), eservices.mas.gov.sg"` on a live fetch; the fallback string in §1.7 otherwise |
| `hdbConcessionaryRate` | constant 2.6, date `"2026-10-01"` (§2) |
| `cpfOaRate` | constant 2.5, date `"2026-10-01"` (§2) |
| `asOf` | ingest run date |

---

## 7. Open questions / UNVERIFIED items (verify before or at launch)

1. **MAS APIMG:** exact key-registration flow, rate limits, full response envelope beyond `elements`, all column names in the daily view, and whether `$filter` / `$skip` work. Verify once with a real key in the ingest job and log one raw row.
2. **Observation window of the published compounded SORA:** whether the 3M window ends on the value date or the day before. Copy-only impact.
3. **Q4 2026 CPF OA = 2.5% and HDB = 2.6%:** re-confirm on cpf.gov.sg / hdb.gov.sg. These are high-confidence because of the legislated floor, but were not fetched.
4. **URA PPI data.gov.sg dataset ID and columns:** resolve at runtime (§4.2). Pinned candidate `d_97f8a2e995022d311c6c68cfda6d034c` is now corroborated by two codebases and a catalog snapshot, but not by data.gov.sg itself.
4a. **MAS APIMG `$top` cap:** whether `$top=400` (as used by `scripts/ingest/sources/rates.ts`) is honoured. The reference code never asks for more than 100.
5. **SingStat table IDs** for the RPI / PPI.
6. **Latest SORA values:** the §1.7 numbers come from third-party mirrors. The first successful live MAS fetch supersedes them.
7. **Background dates** (SOR end 30 Jun 2023; SIBOR end 31 Dec 2024): prior knowledge only.

---

## 8. Sources

**Primary (read via search-index extracts):**
- MAS Domestic Interest Rates: https://eservices.mas.gov.sg/statistics/dir/domesticinterestrates.aspx
- MAS Statistics (APIMG portal reference): https://www.mas.gov.sg/statistics
- MAS SORA page: https://www.mas.gov.sg/monetary-policy/sora
- MAS user guide, SORA Index / Compounded SORA: https://www.mas.gov.sg/-/media/mas/frn/user-guide-for-sora-index-compounded-sora-and-mas-frn.pdf
- MAS 2016 media release, "MAS Launches First Set of Data APIs": https://www.mas.gov.sg/news/media-releases/2016/mas-launches-first-set-of-data-apis
- GovTech developer portal, MAS API pricing ("free to use", updated 07 Mar 2025): https://www.developer.tech.gov.sg/products/categories/data-and-apis/mas-api/pricing
- ABS, About SORA: https://abs.org.sg/benchmark-rates/about-sora
- UOB, About SORA: https://www.uob.com.sg/personal/borrow/property-loans/about-sora.page
- data.gov.sg HDB RPI: https://data.gov.sg/datasets/d_14f63e595975691e7c24a27ae4c07c79/view

**Code (cloned and read in full):**
- https://github.com/ashblack24/SMU-interest-calculator (commit `0c92b225`, 2026-10-05): `api/sora.ts`, `src/components/BackendGuideModal.tsx`, `README.md`
- https://github.com/laisee/pymasapi (2026-01-08): `src/settings.py`, `scripts/sample_api_call.py`

**Third-party rate mirrors:**
- https://www.cashew.sg/interest-rates/sora
- https://housingloansg.com/hl/charts/sibor-sor-daily-chart
- https://propoagroup.co/market/sora
- https://straitsdata.com/finance/mas
- https://www.homejourney.sg/blog/singapore-sora-rate-outlook-2026-what-homeowners-should-know-homejourney-202603020001

**Not fetched, to check:**
- https://www.cpf.gov.sg/member/growing-your-savings/earning-higher-returns/earning-attractive-interest
- https://www.hdb.gov.sg/residential/buying-a-flat/financing-a-flat-purchase/housing-loan-options/housing-loan-from-hdb
- https://www.ura.gov.sg/Corporate/Media-Room/Media-Releases

---

## Verification log

Adversarial fact-check, **2026-10-10**.

**Constraints of this pass:**
- The web-search budget was exhausted before the pass began (0 searches run).
- WebFetch and curl to every primary and mirror host failed: proxy `CONNECT 403` / `ENOTFOUND`.
- So a gov-sourced claim could not be re-fetched, and no claim could be confirmed against a primary page in this pass. Labels used below:
  - **confirmed**: checked against code, arithmetic, or a corroborating local source (named in the row).
  - **corrected**: this file was changed.
  - **UNVERIFIED**: could not be checked; its original label is kept.
- Local corroborating sources:
  - Cloned repos in the session scratchpad: `ashblack24/SMU-interest-calculator` @ `0c92b225` and `laisee/pymasapi` @ `f73984de`.
  - Sibling docs: `loan-rules.md`, `hdb-rules.md`, `datagov-api.md`.
  - A third-party data.gov.sg catalog / metadata snapshot (`ks/URA.md`, `ks/HDB.md`, `sg_dataset_schemas.json`).
  - Two third-party ingest scripts that use URA PPI ID `d_97f8…`.
  - Nexus Mortgage SG blog, 20 Aug 2026.

| # | Claim (section) | Verdict | Source / note |
|---|---|---|---|
| 1 | SORA = volume-weighted avg of unsecured overnight interbank SGD borrowing, 8:00am–6:15pm (§1.1) | UNVERIFIED (agrees with prior knowledge) | abs.org.sg / mas.gov.sg unreachable |
| 2 | Daily SORA published by 9:00am next SG business day (§1.1) | UNVERIFIED (agrees with prior knowledge) | same |
| 3 | 1M/3M/6M Compounded SORA + SORA Index published 9am every business day (§1.1) | UNVERIFIED | MAS user-guide PDF unreachable |
| 4 | SOR ended after 30 Jun 2023; SIBOR fully ended after 31 Dec 2024 (§1.1) | UNVERIFIED (agrees with prior knowledge); added that 1M/6M SIBOR ended after 31 Mar 2022 | prior knowledge only; keep dates out of UI copy |
| 5 | APIMG endpoint URL `…/apimg-gw/server/monthly_statistical_bulletin_non610mssql/domestic_interest_rates_daily/views/domestic_interest_rates_daily` (§1.3) | confirmed [CODE] | identical in SMU `api/sora.ts`, `api/health.ts`, `README.md` and `BackendGuideModal.tsx` |
| 6 | Header `KeyId`, "Mandatory MAS header", 401 before calling if missing (§1.3) | confirmed [CODE] | `api/sora.ts` lines 35–48, 66 |
| 7 | Reference code `$top` = 2× needed, capped at 100 (§1.3) | corrected (added the minimum of 10) | `Math.max(10, Math.min(100, topLimit * 2))` |
| 8 | `$orderby=end_of_day desc` (§1.3) | confirmed [CODE] | `api/sora.ts` line 54 |
| 9 | Envelope `elements`, fallback `result.records` (§1.3) | confirmed [CODE] | `api/sora.ts` lines 82–86 |
| 10 | Rows skipped only when both `sora` and `comp_sora_3m` are null; `parseFloat(raw) \|\| soraVal` bug (§1.3) | confirmed [CODE] | `api/sora.ts` lines 114–119 |
| 11 | Code says browser calls "are blocked by CORS" (§1.3) | corrected → "may be blocked by CORS unless proxied" | `MasConfigModal.tsx` line 244 |
| 12 | Example row values 1.3724 / 1.2672 / 1.2332 / 1.1689 / 1.1248399542 / 2089 / 1.45 / 0.80, published 2026-10-05 (§1.3) | confirmed as quoted (still UNVERIFIED vs MAS) | SMU `README.md` lines 69–79 |
| 13 | README example "shows the raw MAS field names" / "very likely a real MAS response" (§1.3) | corrected | README shows the repo's normalised output (`date`, `sora_compound_*`); this doc re-maps the names |
| 14 | 2 Oct 2026 is a Friday; 5 Oct 2026 is a Monday (§1.3) | confirmed (recomputed) | Python `datetime` |
| 15 | Fabricated `FALLBACK_MAS_RECORDS` ≈3.1% "dated Sep–Oct 2026" (§1.3) | corrected → 30 rows, 31 Jul – 2 Oct 2026, overnight 3.04%–3.14% | `src/services/masApi.ts` |
| 16 | Legacy endpoint `eservices.mas.gov.sg/api/action/datastore/search.json?resource_id=` (§1.4) | confirmed [CODE] | pymasapi `src/settings.py` `BASE_URL`; `scripts/sample_api_call.py` |
| 17 | Legacy resource IDs: daily `9a51d255-…243c`, weekly `9a0bf149-…47ed`, monthly `b5adb5c2-…2380`, annual `ea5e28f0-…1113` (§1.4) | confirmed [CODE] | daily from `scripts/sample_api_call.py`; the others from `src/settings.py` |
| 18 | Legacy envelope `{ success, result: { records } }` (§1.4) | corrected → UNVERIFIED | not read anywhere in pymasapi; CKAN convention only |
| 19 | pymasapi README → `https://secure.mas.gov.sg/api/Search.aspx`; last commit 2026-01-08 (§1.4) | confirmed [CODE] | README line 2; `git log` |
| 20 | SMU repo commit `0c92b225` dated 2026-10-05 (§8) | confirmed | `git log` |
| 21 | Legacy API retired or keyed (§1.4) | UNVERIFIED | unreachable |
| 22 | 10:00 SGT = 02:00 UTC (§1.5) | confirmed (arithmetic, SGT = UTC+8) | n/a |
| 23 | Compounded SORA formula (product form, ACT/365) and SORA Index form (§1.6) | UNVERIFIED vs PDF; mathematically consistent and agrees with prior knowledge of the MAS guide | PDF unreachable |
| 24 | Compounded SORA at 4 dp; SORA Index at 10 dp (§1.6) | confirmed for the example only (1.2332 has 4 dp; 1.1248399542 has 10 dp) | the general rounding rule is UNVERIFIED |
| 25 | SORA Index "about 1.12 in Oct 2026" (§1.3) | plausible | rough recompute from annual average SORA 2020–2026 (assuming a base of ~1 in early 2020) gives ≈1.12 |
| 26 | Mirror values for 2026-10-08 / 10-05 / 10-02 / 06-04 (§1.7) | UNVERIFIED (mirrors unreachable) | values unchanged |
| 27 | "Mirrors agree within about 0.01 point" (§1.7) | corrected | recomputed: 3M Δ0.0022, 6M Δ0.0063, 1M Δ0.023 (the 1M move is drift between 2 and 8 Oct) |
| 28 | Cross-tenor consistency of the 2 Oct row (§1.7) | confirmed (recomputed) | implied Apr–Jun ≈1.105% matches StraitsData's 4 Jun 1M of 1.0992 |
| 29 | Homejourney ≈1.07% "late Jun 2026" (§1.7) | flagged: date UNVERIFIED | URL slug `202603020001` suggests a 2 Mar 2026 post |
| 30 | Fallback UI label "as at 8 Oct 2026" (§1.7) | corrected | the overnight value is dated 2 Oct; label per field |
| 31 | `$top=400` ≈ "13–18 months" (§1.7) | corrected → 13–19 months | 400 / 30.44 = 13.1; 400 / 251 × 12 = 19.1 |
| 32 | `$top=400` honoured by the gateway (§1.7, §1.8; used in `scripts/ingest/sources/rates.ts`) | UNVERIFIED (newly flagged) | no code seen requests more than 100 |
| 33 | `RatesSnapshot` field mapping (§6) | confirmed | `src/lib/data/types.ts` lines 476–489; noted there is no `status` field (§1.8) |
| 34 | CPF OA 2.5% for 1 Oct – 31 Dec 2026 (§2) | UNVERIFIED directly; corroborated | `loan-rules.md` §3/§6 (cpf.gov.sg search extract + AsiaOne); rule = max(2.5% legislated floor, 3-month average of major local banks' rates) per prior knowledge |
| 35 | HDB concessionary rate 2.6% = OA + 0.1 point, revised quarterly (§2) | UNVERIFIED directly; corroborated; 2.5 + 0.1 = 2.6 recomputed | `loan-rules.md` §3 |
| 36 | CPF extra interest: +1% on the first S$60k, up to S$20k from OA (§2) | UNVERIFIED (agrees with prior knowledge); clarified that it applies to members below 55 | prior knowledge |
| 37 | HDB LTV 75% "for flat applications from 20 Aug 2024" (§2) | corrected → resale applications from 20 Aug 2024, and new flats from the Oct 2024 BTO/SBF exercise | `loan-rules.md` §3 [PRIMARY there]; Nexus blog (20 Aug 2026) also says "since 20 August 2024" |
| 38 | HDB loan max tenure 25 years (§2) | UNVERIFIED (agrees with prior knowledge and `loan-rules.md`) | n/a |
| 39 | HDB 3% eligibility floor from 30 Sep 2022 (§2) | confirmed by cross-reference | `loan-rules.md` §1.4 / §3 [PRIMARY there] |
| 40 | MAS 4% medium-term floor from 30 Sep 2022; no 2025/26 change (§2) | confirmed by cross-reference; added "OTP granted on/after" and the 5% non-residential floor | `loan-rules.md` §1.3; Nexus blog (20 Aug 2026) still quotes 4% |
| 41 | Overlay "max tenure HDB 30 / private 35" and "MSR (HDB / EC)" (§3) | corrected (clarified) | these are **bank-loan** tenures (the HDB loan max is 25); MSR covers HDB flats and ECs bought from the developer only (`loan-rules.md` §1.2, §2.2) |
| 42 | TDSR 55%, MSR 30% (§3) | confirmed by cross-reference | `loan-rules.md` §1.1–1.2 [PRIMARY there] |
| 43 | UOB 3M SORA quote; typical lock-in, 1.5% penalty, clawback (§3) | UNVERIFIED | uob.com.sg unreachable; typical figures stay labelled UNVERIFIED |
| 44 | HDB RPI dataset `d_14f63e595975691e7c24a27ae4c07c79`, name, columns `quarter` / `index`, managed by HDB (§4.1) | confirmed (3rd-party metadata snapshot + `datagov-api.md` §4/§5.4 + catalog collection 152) | `sg_dataset_schemas.json` |
| 45 | 146 rows = 1990-Q1 … 2026-Q2 (§4.1) | confirmed (arithmetic) | 36 × 4 + 2 = 146 |
| 46 | RPI final about 4 weeks after quarter end; latest row 2026-Q2 until late Oct (§4.1) | supported | snapshot: `lastUpdatedAt` 2025-10-30 for coverage to 2025-09-30 |
| 47 | data.gov.sg endpoints (initiate/poll-download, `datastore_search`, v2 datasets list, metadata) and optional `x-api-key` (§4) | confirmed by cross-reference | `datagov-api.md` §2.1, §3.1–3.5 [PRIMARY there]. One third-party catalog claims the key is "required" for api-open; `datagov-api.md` cites the official guide saying it is optional (Oct 2025 release notes). |
| 48 | URA Data Service has no PPI endpoint (§4.2) | confirmed [CODE, 3rd-party] | service list in the `ura_api` wrapper |
| 49 | URA PPI candidate `d_97f8a2e995022d311c6c68cfda6d034c` (§4.2) | corrected: upgraded from "prior memory" to "corroborated by two codebases + catalog"; still UNVERIFIED vs data.gov.sg | catalog collection 1676 "Private Property Price Index by Type, Quarterly"; codebases read `quarter` / `property_type` / `index` |
| 50 | Ingest regex `/private residential.*price index/i` and "fail if >1 match" (§4.2) | corrected | the regex misses "Private Property Price Index…" titles; several URA PPI datasets exist, so >1 match is expected |
| 51 | SingStat TableBuilder API path; RPI/PPI table IDs (§4.2) | UNVERIFIED | unreachable; table IDs not found |
| 52 | GovTech MAS API pricing "free to use", page updated 07 Mar 2025; MAS stats hub "APIMG portal"; APIMG portal URL `https://eservices.mas.gov.sg/apimg-portal/`; 2016 "MAS Launches First Set of Data APIs" release (§1.2, §1.3, §8) | UNVERIFIED | unreachable; the SMU code only says "MAS API Developer Portal" |

**Out-of-scope finding passed on:** a 2026 HDB rule change exists. The 15-month private-property-owner wait-out was removed for non-subsidised resale bought without an HDB loan, from 28 Jul 2026. It is already covered in `hdb-rules.md` §2.2 and does not affect any rate in this file.
