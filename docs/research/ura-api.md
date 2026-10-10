# URA Data Service API (private residential property): research notes for engineers

Research date: **2026-10-10**. Scope:

- Access key registration, base URL, the daily token, headers and User-Agent.
- The private-residential services: `PMI_Resi_Transaction`, `PMI_Resi_Rental`, `PMI_Resi_Rental_Median`, `PMI_Resi_Developer_Sales`, `PMI_Resi_Pipeline` and `Planning_Decision`.
- Converting SVY21 coordinates to WGS84.
- Terms of use and attribution.
- Market segments (CCR, RCR, OCR) and the 28 postal districts, including the postal sector to district map.

## 0. How these facts were sourced (read this first)

- **Primary hosts could not be fetched.** The research fetch tool returned `getaddrinfo ENOTFOUND` for `eservice.ura.gov.sg`, `www.ura.gov.sg`, `eco.ura.gov.sg`, `www.developer.tech.gov.sg`, `data.gov.sg` and `epsg.io`. This container's `curl` gets a proxy `403` on `*.ura.gov.sg`. `web.archive.org` is blocked. The web-search budget for this run ran out partway through, so a few items could not be searched a second time. They are marked UNVERIFIED below.
- Facts therefore come from these sources:
  1. **Search-engine extracts of the official URA API docs page** `https://eservice.ura.gov.sg/maps/api/` and the GovTech developer portal page `https://www.developer.tech.gov.sg/products/categories/data-and-apis/ura-apis/getting-started`. The search tool quoted passages from these pages; I did not load the pages myself.
  2. **Working open-source clients that were active in 2026.** I cloned them and read the code:
     - `ong6/sgprop`, last commit **2026-09-24**: https://github.com/ong6/sgprop (files `src/sgprop/ura.py`, `schema.py`, `svy21.py`, `sync.py`, `tests/test_sgprop.py`).
     - `samucospace/property-intelligence-SG`, last commit **2026-10-08**: https://github.com/samucospace/property-intelligence-SG (`server/ingestion.js`, `server/scripts/capture-ura-source.js`).
     - `chengguan/ura_api`, 2020–2023. It is on PyPI as `ura-api` 0.0.6. Its docstrings copy text from the URA docs: https://github.com/chengguan/ura_api (`src/ura_api/ura_api.py`).
     - `Caisho/ura-transactions`. It uses the legacy URL and ships a postal-district dataset: https://github.com/Caisho/ura-transactions.
     - `cgcai/SVY21`, the de-facto reference implementation of the SVY21 conversion: https://github.com/cgcai/SVY21.
  3. **Numerical verification that I ran myself.** I checked the SVY21 maths against `proj4@2.12.1` (see §3).
- Confidence labels:
  - **[OFFICIAL-SNIPPET]**: the wording was quoted from the official URA or GovTech page by the search tool.
  - **[LIVE-2026]**: used by a client that pulled live data in Sept–Oct 2026 (sgprop and/or property-intelligence-SG).
  - **[CORROBORATED]**: two or more independent implementations agree.
  - **[VERIFIED-BY-TEST]**: I computed or checked it myself.
  - **UNVERIFIED**: my best understanding from memory of the URA docs. Before relying on these items, confirm them against one live response.

---

## 1. Access, base URL, token, headers

### 1.1 Registration / AccessKey

| Item | Value | Confidence / source |
|---|---|---|
| Docs + sign-up page (current) | `https://eservice.ura.gov.sg/maps/api/` | [OFFICIAL-SNIPPET] [LIVE-2026] (sgprop `config.py`: "A URA key is free: https://eservice.ura.gov.sg/maps/api/") |
| Registration form | Legacy form: `https://www.ura.gov.sg/maps/api/reg.html` (Caisho README, ura_api). The current form is reached from the docs page above. The exact new path, possibly `https://eservice.ura.gov.sg/maps/api/reg.html`, is **UNVERIFIED**. | [CORROBORATED] for the legacy path |
| Flow | Sign up for an account. After registering, you get an **email with an Access Key**. The Access Key is used to **generate a daily Token**. | [OFFICIAL-SNIPPET] GovTech portal: "After registering, you will receive an email with an access key that allows you to generate tokens for accessing URA's data services." |
| Cost | Free | Single secondary source: sgprop (README: "Get a free URA access key"; `ura.py`: "a permanent AccessKey (free signup)"). Official wording UNVERIFIED. |
| Access key expiry or quota | Not documented in anything I could see. | UNVERIFIED |

### 1.2 Base URL in use in 2026, and the migration

| | URL | Status in Oct 2026 |
|---|---|---|
| **Token (current)** | `https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1` | **Use this.** [OFFICIAL-SNIPPET] [LIVE-2026]. sgprop `TOKEN_URL`; property-intelligence-SG `ingestion.js` line 101. |
| **Services (current)** | `https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1?service={SERVICE}&{params}` | **Use this.** [OFFICIAL-SNIPPET] (the official example is `curl "https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1?service=PMI_Resi_Transaction&batch=1"`) [LIVE-2026] |
| Token (legacy) | `https://www.ura.gov.sg/uraDataService/insertNewToken.action` | Legacy. It appears in the old "URA Data Service API User Manual" and in pre-2023 code (Caisho, ura_api). Treat it as retired. |
| Services (legacy) | `https://www.ura.gov.sg/uraDataService/invokeUraDS?service=...` | Legacy, as above. |
| `eco.ura.gov.sg/uraDataService` | **No evidence found.** No official snippet and no 2026 client uses this host. **Do not use it.** | UNVERIFIED / not observed |

- **Migration date:** the docs and the endpoints moved from `www.ura.gov.sg` to `eservice.ura.gov.sg`, with the `/v1` path suffix. I could not confirm the official cut-over date. My best understanding is around 2023–2024 (**UNVERIFIED**). Nothing published in 2025 or 2026 that changes the endpoints was found, and both 2026 clients use the `eservice…/v1` URLs.
- **Base constant to use in code:** `const URA_BASE = "https://eservice.ura.gov.sg/uraDataService";`

### 1.3 Token request

```
GET https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1
Headers:
  AccessKey: <your access key>
  User-Agent: <non-default UA, see 1.5>
```

Response [LIVE-2026] (sgprop checks `Status == "Success"` and reads `Result`; property-intelligence-SG checks `typeof Result === 'string'`):

```json
{ "Status": "Success", "Message": "", "Result": "<token string>" }
```

- `Result` is the token itself, a plain string. [CORROBORATED]
- **HTTP method:** use `GET`. Both 2026 clients use GET. The 2020 `ura_api` wrapper used POST, which also worked at the time. [CORROBORATED]
- **Lifetime:** valid for **one day**. The legacy manual calls it the token "valid for the day's access"; sgprop describes "a Token that lasts one day". [CORROBORATED] Whether "a day" means 24 hours from issue or a calendar day in SGT is **UNVERIFIED**.
- **Recommended handling:**
  - Request a fresh token at the start of each ingestion run. A full run needs about 27 calls: 1 token, 4 transaction batches, about 21 rental quarters, the rental median and the pipeline. Optional developer sales add 36 more.
  - Never ship the token or the key to the browser.
  - If a service call returns `Status != "Success"` and `Message` mentions the token, request a new token once and retry. sgprop does exactly this.
- Whether there is a limit on how many tokens a key can request per day is **UNVERIFIED**.

### 1.4 Service request headers

```
GET https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1?service=PMI_Resi_Transaction&batch=1
Headers:
  AccessKey: <access key>
  Token: <token from insertNewToken/v1>
  User-Agent: Mozilla/5.0 (compatible; <YourApp>/1.0; +https://<your-site>)
```

- The header names are `AccessKey` and `Token`. [OFFICIAL-SNIPPET] [LIVE-2026] Send them with the casing shown. (HTTP header names are case-insensitive, and the `ura_api` wrapper sent a lower-case `token` header. Casing is therefore not a known failure cause, but keep the documented form.)
- Query parameters: `service` (required), plus `batch` or `refPeriod` depending on the service (see §2).

### 1.5 User-Agent requirement

- **You must send a non-default `User-Agent`.**
  - sgprop `ura.py` (2026): `# URA's gateway rejects urllib's default agent.` It sends `User-Agent: "Mozilla/5.0 (sgprop; +https://github.com/ong6/sgprop)"`.
  - `ura_api` (2020) sends `User-Agent: Mozilla/5.0`.
  - property-intelligence-SG (2026) sends `SingaporeHomeIntel/1.0 (URA Data Sync Service)`.
  - [CORROBORATED] that a custom UA works. The official docs do not state a rule; this comes from observed gateway behaviour.
- Node's built-in `fetch` (undici) sends `User-Agent: node` by default. Whether URA blocks that is **UNVERIFIED**, so always set the header explicitly.

### 1.6 Response envelope and error handling

```json
{ "Status": "Success", "Message": "", "Result": [ /* array of project objects */ ] }
```

- Treat **anything other than `Status === "Success"`** as failure, and surface `Message`. [LIVE-2026]
- The exact error strings and whether errors use HTTP 200 or 4xx are **UNVERIFIED**. sgprop treats HTTP 4xx as non-retryable and HTTP 5xx or timeouts as retryable, with 3 attempts and backoff.
- **Empty `Result`** is normal for a `refPeriod` outside the data window or not yet published. Do not treat it as an error for rentals. For transactions, treat an empty or sharply shrunken batch as a bad response and keep the previous snapshot. sgprop aborts the replace if a batch has fewer than 50% of its previous rows.
- **Character encoding quirk [LIVE-2026]:** sgprop: "Accented project names (ENCHANTÉ) arrive as Windows-1252." In Node:
  1. Read `arrayBuffer()`.
  2. Try `new TextDecoder("utf-8", { fatal: true })`.
  3. On a throw, fall back to `new TextDecoder("windows-1252")`.
  4. Then `JSON.parse`.
- **Numbers arrive as strings** in transactions, for example `"area": "143"`, `"price": "2268888"`, `"x": "40560.2"`. In sgprop's test fixture, rental `rent` is a JSON number. Parse every numeric field with a tolerant `Number(String(v).replace(/,/g, ""))`. Treat `""`, `"-"`, `"NA"` and `null` as missing (sgprop `_num` also treats lower-case `"na"` as missing). [FIXTURE + PARSER] These example values come from sgprop's **test fixture** (`tests/test_sgprop.py`), not from a captured live response. Both 2026 parsers accept either strings or numbers, so the exact JSON type of each field is UNVERIFIED.
- **Timeouts:** responses are large. sgprop uses a 120 s timeout per call, and a full sync of 4 transaction batches plus 12 rental quarters takes about 40 s. Run ingestion **offline (cron or GitHub Actions)**, not inside a Vercel request. Payload sizes in bytes are **UNVERIFIED**. Record counts from a live capture on **2026-10-05** [LIVE-2026] (property-intelligence-SG `audit/2026-10-05/phase2-source-reconciliation.json`):
  - Transactions: **132,246** rows in total. Batch 1: 292 projects, 19,889 rows. Batch 2: 1,524 projects, 29,178 rows. Batch 3: 1,642 projects, 53,974 rows. Batch 4: 387 projects, 29,205 rows.
  - Rentals: **451,165** contracts across `21q3`–`26q3`. Each full quarter has about 19,000–28,000 contracts.
- **Where to call from:** URA asks that calls come from your own server, not from your app's end users. sgprop: "URA asks that calls come from your own machine or server, not from an app's end users, so don't ship a key inside a client-side product." [Single secondary source: sgprop `ura.py` and README. Official wording UNVERIFIED]
- Whether `eservice.ura.gov.sg` is reachable from GitHub-hosted runners or Vercel (non-Singapore IPs) is **UNVERIFIED**. The 2026 clients ran from a laptop and a droplet. Add a clear failure message and keep the last good snapshot.

---

## 2. Services and parameters

### 2.0 Summary table

| `service` | Params | What it returns | Data window | Update schedule | Confidence |
|---|---|---|---|---|---|
| `PMI_Resi_Transaction` | `batch=1..4` (required) | Private residential sale transactions (incl. ECs), grouped by project | **Past 5 years** | **Every Tuesday and Friday**, end of day (next working day if public holiday) | Window: [OFFICIAL-SNIPPET] "To get a list of private property transactions for the past 5 years". Schedule: single secondary source, sgprop ("Tue & Fri"). The public-holiday rule and the official wording are UNVERIFIED. |
| `PMI_Resi_Rental` | `refPeriod=YYqN`, e.g. `24q1` (required) | Private residential rental contracts for one quarter, grouped by project | **About the past 5 years (~60 months)**. Live capture on 2026-10-05: `21q1` and `21q2` were empty, `21q3` was partial (3,942 contracts, against about 20,000 for a full quarter; the audit's sample rows from it are dated 2021-09), and `21q4`–`26q3` were full. sgprop's 12-quarter default is that tool's own choice, not the API limit. | **15th of each month**, end of day | Format [CORROBORATED]. Window [LIVE-2026] (property-intelligence-SG audit, see §2.2). Schedule: single secondary source (sgprop); official wording UNVERIFIED. |
| `PMI_Resi_Rental_Median` | none | Median rental $psf per month for private **non-landed** projects (with ≥ 10 contracts), by quarter | About the past 3 years | Quarterly (UNVERIFIED: 4th Friday of Jan/Apr/Jul/Oct) | Service name [CORROBORATED]. Fields and schedule UNVERIFIED. |
| `PMI_Resi_Developer_Sales` | `refPeriod=MMYY`, e.g. `0926` = Sep 2026 (required) | Developer (new launch) sales by project for one month | "past 3 years" (2020-era docstring; may have changed, UNVERIFIED for 2026) | "End of day of every 15th of the month. If it is a public holiday, the data will be updated on the following working day." | Format [CORROBORATED] (ura_api docstring copied from the URA docs; sgprop: `'0926' (MMYY)`). Window and schedule: single source (the ura_api docstring, copied from the URA docs around 2020). Fields UNVERIFIED. |
| `PMI_Resi_Pipeline` | none | Private residential projects in the pipeline, latest quarter | Latest quarter only | "End of day of every 4th Friday of January, April, July and October. If it is a public holiday, the data will be updated on the following working day." | Schedule: single source (ura_api docstring, around 2020). Fields UNVERIFIED. |
| `Planning_Decision` | `year=YYYY` **or** `last_dnload_date=dd/mm/yyyy` (not both) | Written planning decisions | n/a | n/a | Params: single source (ura_api code and tests). Fields UNVERIFIED. Not needed for this app. |

Other services on the same gateway, listed for completeness. Single source (ura_api, 2020–2023); current availability is UNVERIFIED.

- `Car_Park_Availability`
- `Car_Park_Details`
- `Season_Car_Park_Details`
- `EAU_Appr_Resi_Use`. Params: `blkHouseNo`, `street`, optional `storeyNo` and `unitNo`. It returns `isResiUse` rather than `Result`.

### 2.1 `PMI_Resi_Transaction` (private residential sale transactions)

```
GET {URA_BASE}/invokeUraDS/v1?service=PMI_Resi_Transaction&batch=1
```

**Batches.** Data is split into 4 batches by **postal district** of the transaction:

| batch | Postal districts | Confidence |
|---|---|---|
| 1 | D01–D07 | [OFFICIAL-SNIPPET] "Batch 1 covers postal districts 01 to 07, batch 2 covers 08 to 14, and so on." ura_api README: "batch 1 is for postal district 01 to 07, batch 2 is for postal district 08 to 14 etc." |
| 2 | D08–D14 | same |
| 3 | D15–D20 | UNVERIFIED (my memory of the official doc; the 2026-10-10 reviewer remembers the same split but could not reach a primary source). Each row carries `district`, so code must not depend on the boundaries. |
| 4 | D21–D28 | UNVERIFIED (as above) |

All 4 batches returned data in a live capture on 2026-10-05: 19,889, 29,178, 53,974 and 29,205 rows, totalling 132,246 [LIVE-2026]. Those counts do not reveal which districts each batch holds.

- Always fetch **all 4 batches** and replace the whole snapshot.
- URA **revises older records**. sgprop: "URA revises older records, so each sync replaces what it fetched instead of appending."
- **Data window:** past 5 years, rolling. The public PMI e-service describes its own scope as "transactions with caveats lodged or Options to Purchase issued within the last 60 months" ([OFFICIAL-SNIPPET], `https://eservice.ura.gov.sg/property-market-information/pmiResidentialTransactionSearch`).

**Response shape** [LIVE-2026: field names from sgprop `schema.py` and fixtures, and property-intelligence-SG `ingestion.js`]. The example is illustrative; its values come from sgprop's test fixture.

```json
{
  "Status": "Success",
  "Message": "",
  "Result": [
    {
      "project": "LIVIA",
      "street": "PASIR RIS GROVE",
      "marketSegment": "OCR",
      "x": "40560.2",
      "y": "39055.1",
      "transaction": [
        {
          "area": "143",
          "floorRange": "11-15",
          "noOfUnits": "1",
          "contractDate": "0726",
          "typeOfSale": "3",
          "price": "2268888",
          "propertyType": "Condominium",
          "district": "18",
          "typeOfArea": "Strata",
          "tenure": "99 yrs lease commencing from 2008"
        }
      ]
    },
    {
      "project": "LANDED HOUSING DEVELOPMENT",
      "street": "NEO PEE TECK LANE",
      "marketSegment": "RCR",
      "transaction": [
        { "area": "257", "floorRange": "-", "noOfUnits": "1", "contractDate": "0522",
          "typeOfSale": "1", "price": "4600000", "propertyType": "Terrace",
          "district": "05", "typeOfArea": "Land", "tenure": "Freehold" }
      ]
    }
  ]
}
```

**Project-level fields:**

| Field | Type (as sent) | Meaning | Notes |
|---|---|---|---|
| `project` | string | Project name, upper case | Landed rows without a named project appear as e.g. `"LANDED HOUSING DEVELOPMENT"`. Names differ from portal spellings. |
| `street` | string | Street name | Abbreviations such as `ST.` occur (Caisho expands `ST.` to `SAINT`). |
| `x` | string (number) | **SVY21 Easting**, metres | Can be **absent**. sgprop: about 20% of transactions have no coordinates, mostly new launches. |
| `y` | string (number) | **SVY21 Northing**, metres | Same as `x`. Convert with §3: `svy21ToWgs84(northing = y, easting = x)`. |
| `marketSegment` | string | `"CCR"`, `"RCR"` or `"OCR"` | Given per project. **Use this rather than deriving it from district.** |
| `transaction` | array | Transactions for this project | |

**Transaction fields (`transaction[]`):**

| Field | Type (as sent) | Meaning / values | Confidence |
|---|---|---|---|
| `area` | string (number) | Floor or land area in **square metres** | [LIVE-2026] |
| `floorRange` | string | 5-storey band, e.g. `"01-05"`, `"06-10"`, `"11-15"`. `"-"` for landed or none. Basement bands such as `"B1-B5"` may exist (UNVERIFIED). | [LIVE-2026] |
| `noOfUnits` | string (int) | Number of units in the transaction. If greater than 1 (bulk purchase), `price` and `area` are **totals**. | [LIVE-2026] (sgprop comment) |
| `contractDate` | string `MMYY` | Month and year of the sale contract, e.g. `"0726"` = Jul 2026. **Not** the caveat date. Convert with `20${s.slice(2)}-${s.slice(0, 2)}`; the 5-year window means the century is always 20xx. The precise definition for new sale vs resale (OTP issued vs exercised) is UNVERIFIED. | [LIVE-2026] |
| `typeOfSale` | string code | `"1"` = **New Sale** (from developer). `"2"` = **Sub Sale** (resale before the project's completion or CSC). `"3"` = **Resale**. | [CORROBORATED] (sgprop, property-intelligence-SG, Caisho) |
| `price` | string (number) | Transacted price, S$ | [LIVE-2026] |
| `nettPrice` | string (number), **optional** | Nett price, present only for some transactions (my understanding: new sales where the developer reported a nett price after discounts or rebates). Usually absent. | Field name [LIVE-2026] (sgprop reads it). Semantics UNVERIFIED. |
| `propertyType` | string | Values seen: `Apartment`, `Condominium`, `Executive Condominium`, `Detached`, `Semi-detached`, `Terrace`, `Strata Detached`, `Strata Semi-detached`, `Strata Terrace` | [CORROBORATED] (property-intelligence-SG filters, sgprop fixture). Treat as an open set. |
| `district` | string, 2 digits | Postal district, `"01"`–`"28"` | [LIVE-2026] |
| `typeOfArea` | string | `"Strata"` or `"Land"` (also possibly `"Unknown"`, UNVERIFIED) | [LIVE-2026] |
| `tenure` | string | Free text: `"Freehold"`, `"99 yrs lease commencing from 2008"`, `"999 yrs lease commencing from 1885"`, `"NA"`… | [LIVE-2026]. Parse with `/(\d+)\s*y/` for years and `/(?:from\|commencing from)\s*(\d{4})/` for the start year. `freehold = /freehold/i`. |

**Derived values (to match URA's own e-service figures):**

- **sqft = sqm × 10.764.** URA's eservice uses **10.764**, not the exact 10.7639104 (1 sqft = 0.09290304 m²). sgprop `schema.py`: "checked on 3,000 D19 rows, every 'Area (SQFT)' and 'Unit Price ($ PSF)' matches 10.764 exactly". The sgprop README separately says its export matched URA's eservice download for D19 (**9,997 single-unit sales**) on every row for price, sqft, psf, psm, date, floor and sale type. [LIVE-2026, single source: sgprop]
- **psf = price / (sqm × 10.764)**, computed from the unrounded area and rounded half-up only for display. sgprop: this "matches all 9,997 single-unit D19 eservice rows (dividing by the 2-dp sqft matched 9,946)". [LIVE-2026, single source: sgprop] Worked example from the fixture: 2,268,888 / (143 × 10.764 = 1,539.252 sqft) = **$1,474.02 psf**, displayed as $1,474.
- **psm = price / sqm.**

**Typescript types:**

```ts
export type UraEnvelope<T> = { Status: "Success" | string; Message?: string; Result: T };
export type UraTxProject = {
  project: string; street: string; marketSegment?: "CCR" | "RCR" | "OCR";
  x?: string; y?: string; transaction?: UraTx[];
};
export type UraTx = {
  area: string; floorRange?: string; noOfUnits?: string; contractDate: string; // MMYY
  typeOfSale: "1" | "2" | "3" | string; price: string; nettPrice?: string;
  propertyType: string; district: string; typeOfArea?: string; tenure?: string;
};
```

### 2.2 `PMI_Resi_Rental` (private residential rental contracts)

```
GET {URA_BASE}/invokeUraDS/v1?service=PMI_Resi_Rental&refPeriod=26q2
```

- **`refPeriod` format:** `YYqN`. Two-digit year, lower-case `q`, and quarter 1–4. Examples: `24q1` = 2024 Q1, `14q1` = 2014 Q1.
  - ura_api docstring, copied from the URA docs: "Period field is in format of yyqq e.g. 14q1 represents 2014 1st quarter."
  - sgprop builds `f"{y % 100:02d}q{q}"`.
  - property-intelligence-SG validates `/^(\d{2})q([1-4])$/i`.
  - [CORROBORATED]
- One call per quarter. The current, partly published quarter can return partial or empty data.
- **Window: about the last 5 years, not 3 (corrected 2026-10-10).** A live capture on 2026-10-05 (property-intelligence-SG, `audit/2026-10-05/phase2-source-reconciliation.json`) requested `21q1`–`26q3`:
  - `21q1` and `21q2` returned an empty `Result`.
  - `21q3` was partial, with 3,942 contracts.
  - `21q4`–`26q3` were full, with 19,460–27,881 contracts each and 451,165 contracts in total.
  - sgprop fetches only 12 quarters (3 years) by its own default.
  - Quarters outside the window return an empty `Result` with `Status: "Success"`.
  - The exact rule (60 rolling months, or something else) is UNVERIFIED. To get full coverage, request about 21 quarters and tolerate empty ones.

**Response shape** [LIVE-2026: sgprop fixture and parser, property-intelligence-SG parser]:

```json
{
  "Status": "Success",
  "Message": "",
  "Result": [
    {
      "project": "LIVIA",
      "street": "PASIR RIS GROVE",
      "x": "40560.2",
      "y": "39055.1",
      "rental": [
        { "areaSqm": "140-150", "leaseDate": "0726", "propertyType": "Non-landed Properties",
          "district": "18", "areaSqft": "1500-1600", "noOfBedRoom": "4", "rent": 5500 }
      ]
    }
  ]
}
```

| Field | Type | Meaning | Notes |
|---|---|---|---|
| `project`, `street`, `x`, `y` | as in §2.1 | | **Do not expect `marketSegment` on rental projects.** Whether it is present is UNVERIFIED. sgprop's rental parser does not read it. property-intelligence-SG uses one project upsert for both payloads, and it reads `marketSegment` but **defaults to `'OCR'` when the field is absent**. Do not copy that default. Join to transaction projects by `project` + `street` to get the segment. |
| `rental[]` | array | Contracts for the quarter | |
| `leaseDate` | string `MMYY` | Lease commencement month | |
| `rent` | number or numeric string | Monthly rent, S$ | Parse tolerantly. |
| `areaSqm` | string band | Floor-area band in sqm, e.g. `"140-150"` | **Band, not an exact area.** |
| `areaSqft` | string band | Floor-area band in sqft, e.g. `"1500-1600"` | sgprop: the API and eservice sometimes disagree on the **sqm** band at boundaries (700–800 sqft shows as 60–70 sqm in the API but 70–80 on eservice). The **sqft band always matches**, so prefer `areaSqft`. Open-ended bands such as `"<400"` or `">3000"` may occur (property-intelligence-SG guards for them; UNVERIFIED). |
| `noOfBedRoom` | string | Bedroom count, e.g. `"4"`. `"NA"` for landed. | **The field is `noOfBedRoom`.** There is **no** `bedrooms` field. |
| `propertyType` | string | Values seen: `Non-landed Properties`, `Executive Condominium`, `Terrace House`, `Semi-Detached House`, `Detached House`. property-intelligence-SG's rental filter also accepts `Landed Properties`. | Single secondary source: property-intelligence-SG filters and tests (`Non-landed Properties` also appears in the sgprop fixture). Treat as an open set. |
| `district` | string, 2 digits | Postal district | |

- **Rent psf is approximate** because area is a band. Use the band midpoint, e.g. `(1500 + 1600) / 2`, and label it "approx."

### 2.3 `PMI_Resi_Rental_Median` (median rentals by project)

```
GET {URA_BASE}/invokeUraDS/v1?service=PMI_Resi_Rental_Median
```

- No parameters. The service name and the absence of parameters are [CORROBORATED] (ura_api).
- Covers private **non-landed** projects with enough contracts (my understanding: at least 10 in the quarter), by quarter, for about the past 3 years. **UNVERIFIED.**
- **Response shape: UNVERIFIED (from memory of the official doc). Confirm against a live call before coding.**

```json
{
  "Status": "Success",
  "Result": [
    {
      "project": "…", "street": "…", "x": "…", "y": "…",
      "rentalMedian": [
        { "median": 3.65, "psf25": 3.42, "psf75": 3.86, "district": "09", "refPeriod": "2013Q4" }
      ]
    }
  ]
}
```

- `median`, `psf25`, `psf75`: the median, 25th-percentile and 75th-percentile **monthly rent in S$ psf**.
- `refPeriod`: here **`YYYYQn`** (e.g. `2013Q4`), unlike the `YYqN` request format of §2.2.
- All UNVERIFIED.

### 2.4 `PMI_Resi_Developer_Sales` (units sold by developers)

```
GET {URA_BASE}/invokeUraDS/v1?service=PMI_Resi_Developer_Sales&refPeriod=0926
```

- **`refPeriod` format: `MMYY`.** ura_api: "Period field is in format of mmyy e.g. 0913 represents Sep 2013." sgprop: "New-launch sales by project for one month, e.g. '0926' (MMYY)". [CORROBORATED]
- **Note the three formats:**
  - Rental: `YYqN`.
  - Developer sales: `MMYY`.
  - Transaction `contractDate`: also `MMYY`.
- Scope, per the URA docs as copied into the ura_api docstring: "past 3 years of prices of completed and uncompleted private residential units and executive condominiums with pre-requisite for sale sold by developers". Updated "End of day of every 15th of the month. If it is a public holiday, the data will be updated on the following working day." [CORROBORATED]
- **Response shape: UNVERIFIED (from memory of the official doc). Confirm against a live call.**

```json
{
  "Status": "Success",
  "Result": [
    {
      "project": "…", "street": "…", "district": "…", "marketSegment": "OCR",
      "developer": "…", "x": "…", "y": "…",
      "developerSales": [
        { "refPeriod": "0926", "launchedToDate": 0, "soldToDate": 0, "unitsAvail": 0,
          "launchedInMonth": 0, "soldInMonth": 0,
          "medianPrice": 0, "lowestPrice": 0, "highestPrice": 0 }
      ]
    }
  ]
}
```

- `unitsAvail` is the total units in the project.
- `*Price` fields are **S$ psf**.
- All UNVERIFIED.

### 2.5 `PMI_Resi_Pipeline` (projects in the pipeline)

```
GET {URA_BASE}/invokeUraDS/v1?service=PMI_Resi_Pipeline
```

- No parameters. The latest quarter only. Updated on the 4th Friday of Jan, Apr, Jul and Oct ([CORROBORATED], ura_api docstring).
- **Fields: UNVERIFIED (from memory).** `project`, `street`, `district`, `developerName`, `totalUnits`, `noOfDetachedHouse`, `noOfSemiDetached`, `noOfTerrace`, `noOfApartment`, `noOfCondo`, `expectedTOPYear`.
- Note that this service is flat: no nested array, and no `x`/`y`. UNVERIFIED.

### 2.6 `Planning_Decision`

- `?service=Planning_Decision&year=2018` **or** `?service=Planning_Decision&last_dnload_date=01/01/2018` (`dd/mm/yyyy`). Calling it with no parameter returns nothing useful. ([CORROBORATED], ura_api code and tests.)
- Field list **UNVERIFIED**. This is not a property-price dataset, and the app does not need it.

### 2.7 Publish-time caveat

URA does not state the hour of day it publishes. sgprop treats a publish day's data as landing at **18:00 SGT** and re-fetches on any run after that. Schedule the cron for **after 18:00 SGT on Tue and Fri** (e.g. 22:00 SGT = 14:00 UTC) for transactions, and after the **15th** for rentals and developer sales. Both times are heuristics: UNVERIFIED.

---

## 3. SVY21 (EPSG:3414) to WGS84

URA `x` = **Easting**, `y` = **Northing**, both in **SVY21 metres**. [VERIFIED-BY-TEST] sgprop's LIVIA fixture `x=40560.2, y=39055.1` converts to 1.36947 N, 103.94618 E, which is in the Pasir Ris area. The conversion maths is re-checked against PROJ 9.8.1. Whether the fixture coordinates are LIVIA's real URA coordinates is UNVERIFIED, because the fixture may be hand-made.

### 3.1 Parameters

| Parameter | Value |
|---|---|
| Projection | Transverse Mercator |
| Datum / ellipsoid | **Datum: SVY21** (EPSG datum 6757, geographic CRS EPSG:4757). **Ellipsoid: WGS 84**, a = 6378137 m, 1/f = 298.257223563. EPSG's "SVY21 to WGS 84 (1)" is a **null (zero-shift) transformation with a stated accuracy of 1 m**, so `towgs84=0,0,0,0,0,0,0` is the standard practice. The datums are not identical; they are treated as coincident to about 1 m. [VERIFIED: PROJ 9.8.1 EPSG database via pyproj 3.8.0] |
| Latitude of origin | **1°22′00″ N = 1.366666666…°** (code commonly uses `1.366666`) |
| Central meridian (longitude of origin) | **103°50′00″ E = 103.833333333…°** (code commonly uses `103.833333`) |
| Scale factor | **1.0** |
| False Easting | **28001.642 m** |
| False Northing | **38744.572 m** |
| EPSG | **3414** ("SVY21 / Singapore TM"). EPSG area of use: lat 1.13–1.47, lng 103.59–104.07, "Singapore - onshore and offshore". |

proj4 definition (EPSG:3414):

```
+proj=tmerc +lat_0=1.36666666666667 +lon_0=103.833333333333 +k=1 +x_0=28001.642 +y_0=38744.572 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs
```

Sources:

- SLA publishes the SVY21 projection parameters. The SLA page could not be fetched (**UNVERIFIED URL**), so the parameters are cited by reference.
- **Confirmed against the EPSG registry, 2026-10-10.** PROJ 9.8.1 (`pyproj` 3.8.0) `CRS.from_epsg(3414)` gives:
  - Latitude of natural origin 1.36666666666667.
  - Longitude of natural origin 103.833333333333.
  - Scale factor 1.
  - False easting 28001.642.
  - False northing 38744.572.
  - Ellipsoid WGS 84.
  - PROJ string `+proj=tmerc +lat_0=1.36666666666667 +lon_0=103.833333333333 +k=1 +x_0=28001.642 +y_0=38744.572 +ellps=WGS84 +units=m +no_defs`.
- The reference implementation is https://github.com/cgcai/SVY21 (`Javascript/svy21.js`), which uses `oLat=1.366666`, `oLon=103.833333`, `oN=38744.572`, `oE=28001.642`, `k=1`, WGS84 a and f, and the LINZ TM formulae.
  - **Licence: the cgcai/SVY21 repository has no LICENSE file.** I checked a clone of its last commit, 2020-07-21. Its README only says "Feel free to port the code to other languages".
  - Its README also argues that the truncated origin "give[s] accurate results" when compared with a Google Maps satellite image. The difference is about 7 cm (see below), which is below what satellite imagery can resolve, so this does not contradict using the exact EPSG values.
- sgprop `svy21.py` (2026) uses the same constants.

**[VERIFIED-BY-TEST]** checks against `proj4@2.12.1` with the definition above:

- The TypeScript below, with the exact origin (1+22/60, 103+50/60), agrees with proj4 to **< 0.2 mm** over a grid covering all of Singapore (E 2,000–56,000; N 21,000–51,000).
- Using the truncated `1.366666 / 103.833333` (cgcai and sgprop) shifts results by about 7 cm in latitude and 4 cm in longitude. This is negligible, but the exact values are preferred.
- Test vectors (exact origin):
  - `N=38744.572, E=28001.642` → `lat 1.3666666667, lng 103.8333333333`
  - `N=39105.269, E=30629.967` (570 Ang Mo Kio Ave 10, from cgcai's README) → `lat 1.3699285644, lng 103.8569506831`. cgcai's truncated-origin value is `1.3699278978, 103.8569503498`.
  - `N=39055.1, E=40560.2` → `lat 1.3694722980, lng 103.9461807233`. The TypeScript below returns `103.94618072325`; proj4 and PROJ return `103.94618072338`, which rounds to `…7234`. The two agree to about 0.01 mm. **Unit tests should use a tolerance of about 1e-9° (0.1 mm), not 10-decimal equality.** A `toBeCloseTo(103.9461807234, 10)` test fails against this code.

### 3.2 Drop-in TypeScript (no dependency; tested)

```ts
// SVY21 (EPSG:3414) -> WGS84. LINZ Transverse Mercator inverse formulae (same structure as cgcai/SVY21,
// which has NO licence file), exact EPSG origin 1°22'N 103°50'E. Verified against PROJ/proj4 to < 0.2 mm.
const a = 6378137, f = 1 / 298.257223563;
const ORIGIN_LAT = 1 + 22 / 60, ORIGIN_LON = 103 + 50 / 60;
const FALSE_N = 38744.572, FALSE_E = 28001.642, K = 1;
const b = a * (1 - f), e2 = 2 * f - f * f, e4 = e2 * e2, e6 = e4 * e2;
const A0 = 1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256;
const A2 = (3 / 8) * (e2 + e4 / 4 + (15 * e6) / 128);
const A4 = (15 / 256) * (e4 + (3 * e6) / 4);
const A6 = (35 * e6) / 3072;
const n = (a - b) / (a + b), n2 = n * n, n3 = n2 * n, n4 = n2 * n2;
const G = a * (1 - n) * (1 - n2) * (1 + (9 * n2) / 4 + (225 * n4) / 64) * (Math.PI / 180);
const meridian = (latDeg: number) => {
  const r = (latDeg * Math.PI) / 180;
  return a * (A0 * r - A2 * Math.sin(2 * r) + A4 * Math.sin(4 * r) - A6 * Math.sin(6 * r));
};
const M0 = meridian(ORIGIN_LAT);

/** URA: northing = y, easting = x. */
export function svy21ToWgs84(northing: number, easting: number): { lat: number; lng: number } {
  const Mp = M0 + (northing - FALSE_N) / K;
  const sigma = (Mp * Math.PI) / (180 * G);
  const latP = sigma + (3 * n / 2 - 27 * n3 / 32) * Math.sin(2 * sigma)
    + (21 * n2 / 16 - 55 * n4 / 32) * Math.sin(4 * sigma)
    + (151 * n3 / 96) * Math.sin(6 * sigma) + (1097 * n4 / 512) * Math.sin(8 * sigma);
  const s2 = Math.sin(latP) ** 2;
  const rho = (a * (1 - e2)) / Math.pow(1 - e2 * s2, 1.5);
  const v = a / Math.sqrt(1 - e2 * s2);
  const psi = v / rho, psi2 = psi * psi, psi3 = psi2 * psi, psi4 = psi3 * psi;
  const t = Math.tan(latP), t2 = t * t, t4 = t2 * t2, t6 = t4 * t2;
  const Ep = easting - FALSE_E, x = Ep / (K * v), x3 = x ** 3, x5 = x ** 5, x7 = x ** 7;
  const lf = t / (K * rho);
  const lat = latP - lf * (Ep * x / 2)
    + lf * (Ep * x3 / 24) * (-4 * psi2 + 9 * psi * (1 - t2) + 12 * t2)
    - lf * (Ep * x5 / 720) * (8 * psi4 * (11 - 24 * t2) - 12 * psi3 * (21 - 71 * t2)
        + 15 * psi2 * (15 - 98 * t2 + 15 * t4) + 180 * psi * (5 * t2 - 3 * t4) + 360 * t4)
    + lf * (Ep * x7 / 40320) * (1385 - 3633 * t2 + 4095 * t4 + 1575 * t6);
  const sec = 1 / Math.cos(lat);
  const lon = (ORIGIN_LON * Math.PI) / 180 + x * sec - (x3 * sec / 6) * (psi + 2 * t2)
    + (x5 * sec / 120) * (-4 * psi3 * (1 - 6 * t2) + psi2 * (9 - 68 * t2) + 72 * psi * t2 + 24 * t4)
    - (x7 * sec / 5040) * (61 + 662 * t2 + 1320 * t4 + 720 * t6);
  return { lat: (lat * 180) / Math.PI, lng: (lon * 180) / Math.PI };
}
```

Alternative: `npm i proj4@2.12.1`, published 2024-09-06; the npm `latest` tag pointed to 2.22.0 on 2026-10-10. Register the definition above with `proj4.defs("EPSG:3414", …)` and call `proj4("EPSG:3414", "EPSG:4326", [x, y])`. Note that **proj4 takes `[easting, northing]`** and returns `[lng, lat]`. Sanity-check every result against the Singapore bounding box (lat 1.15–1.48, lng 103.59–104.10), and drop coordinates outside it. This box is a heuristic; EPSG's area of use for 3414 is lat 1.13–1.47, lng 103.59–104.07.

**Licensing note for the drop-in code.** cgcai/SVY21 has no licence file, so do not label code derived from it "MIT". The maths is the published LINZ TM formulae. If licence provenance matters, use `proj4` (MIT) instead.

---

## 4. Terms of use, redistribution, attribution

| Item | Value | Confidence |
|---|---|---|
| URA API Terms of Service page | `https://www.ura.gov.sg/eservices-info/maps/api-terms-of-service/`, titled "Acceptance of API Terms of Service". Older path: `https://www.ura.gov.sg/ms/eservices/Maps/API-terms-of-service`. | [OFFICIAL-SNIPPET] (both URLs appear in search results). The current URL is also linked from the sgprop README (2026). Full text not fetched. |
| Licence | Use of URA APIs is governed by the **Singapore Open Data Licence (SODL) version 1.0**, `https://data.gov.sg/open-data-licence`. **Using the API means you accept the Terms of Service.** | [OFFICIAL-SNIPPET] (search extract of the URA ToS page). sgprop README: "made available under the Singapore Open Data Licence and URA API terms". |
| Redistribution or display on a public website | SODL v1.0 permits use, copying, distribution, adaptation and creation of derived works, **commercial or non-commercial**, worldwide and royalty-free, subject to its conditions: attribution, **no implied endorsement or official status**, and not misrepresenting the data. | Use, copying, modification and redistribution with attribution: corroborated by a third-party capture (sgSHIOK2026 P1 A3). The **commercial-use, endorsement and misrepresentation details remain UNVERIFIED**, because the verbatim SODL text was not fetched. |
| Calls must originate server-side | Do not call the API from end users' browsers or devices, and do not ship the AccessKey in client code. | Single secondary source (sgprop). Official wording UNVERIFIED. It is good practice regardless. |

**Required attribution.** The SODL v1.0 attribution template, **corrected 2026-10-10** to follow a third-party capture of the licence page: sgSHIOK2026 `qa/verification/P1-research.md` row A3, which cites https://data.gov.sg/open-data-licence and the LTA DataMall copy. Our own sibling note `onemap-api.md` §3 uses the same text. **Still UNVERIFIED verbatim**, because the primary page could not be fetched:

> Contains information from {name of dataset} accessed on {date of access of dataset} from {source of data} which is made available under the terms of the Singapore Open Data Licence version 1.0 {URL link to licence}

The earlier from-memory version of this note said "{name of Website}" instead of "{source of data}", and added a comma before "which". Use the captured form above. The same capture summarises SODL v1.0 as allowing "use, copying, modification, redistribution, analyses, and applications, with a conspicuous notice acknowledging the source and linking to the licence".

**Recommended footer or data-source text for the app.** It follows the template's order: dataset, then date, then source.

> Contains information from Private Residential Property Transactions and Rental Contracts accessed on {YYYY-MM-DD} from the Urban Redevelopment Authority (URA) Data Service which is made available under the terms of the Singapore Open Data Licence version 1.0 (https://data.gov.sg/open-data-licence). URA does not endorse this site. Data may be revised by URA; figures are indicative.

**Do not:**

- Use the URA logo or name in a way that implies endorsement.
- Present derived numbers as URA's own statistics. For example, label "median psf (computed)" rather than "URA median".
- Expose the key or token.

---

## 5. Market segments and postal districts

### 5.1 CCR / RCR / OCR definitions (URA)

- **Core Central Region (CCR):** Postal Districts **9, 10, 11**, plus the **Downtown Core Planning Area** and **Sentosa**.
- **Rest of Central Region (RCR):** the area **within the Central Region that is outside the CCR**.
- **Outside Central Region (OCR):** the area **outside the Central Region**.
- Source: URA's standard footnote in its quarterly private-residential releases and PMI technical notes. **UNVERIFIED verbatim** (pages not fetched), but this is the long-standing URA definition, high confidence.
- The **Central Region** (URA Master Plan) consists of **22 planning areas**. [VERIFIED-BY-TEST against Master Plan 2014 boundaries] A spatial join of the 55 MP2014 planning-area polygons to the 5 region polygons (https://github.com/yinshanyang/singapore `maps/2-planning-area.geojson`, `maps/1-region.geojson`) gives exactly these 22 Central Region areas. It also puts Ang Mo Kio in North-East, Clementi in West, and Queenstown and Bishan in Central. That MP2019 and MP2025 kept the same set is UNVERIFIED but expected.
  - The 11 Central Area planning areas: Downtown Core, Marina East, Marina South, Museum, Newton, Orchard, Outram, River Valley, Rochor, Singapore River, Straits View.
  - The other 11: Bishan, Bukit Merah, Bukit Timah, Geylang, Kallang, Marine Parade, Novena, Queenstown, Southern Islands, Tanglin, Toa Payoh.

**Engineering rule:** market segment is defined by **planning-area boundaries, not postal districts**, so some districts straddle two segments. Illustrative examples. The region of each planning area was checked against the MP2014 join above. Which postal sectors fall in which planning area is UNVERIFIED, For example, Sentosa postcodes are believed to start with 098 or 099, which would put them in sector 09 and so in D04 (UNVERIFIED).

- D04: Sentosa is CCR; Telok Blangah and Harbourfront (Bukit Merah planning area) are RCR.
- D20: Bishan is RCR; Ang Mo Kio is OCR.
- D05: the Queenstown planning-area parts are RCR; Clementi is OCR.

Do not hard-code a district-to-segment table. The rules are:

1. **Always use the API's per-project `marketSegment`** for transactions (and for developer sales).
2. For rentals, which have no segment, **join on `project` + `street`** to a transaction project.
3. Only if there is no match, fall back to the district-level approximation:
   - D09, D10, D11 → CCR.
   - Otherwise, take the most common segment among that district's transaction projects.
   - Label it "approx."

### 5.2 The 28 postal districts

Source: URA "List of Postal Districts". The primary URL could not be fetched; it is believed to be `https://www.ura.gov.sg/realEstateIIWeb/resources/misc/list_of_postal_districts.htm` (UNVERIFIED URL). The table below matches the dataset shipped in https://github.com/Caisho/ura-transactions (`data/ura-postal-districts/ura-postal-districts-point.geojson`) exactly, and also matches my recollection of URA's table [CORROBORATED].

| District | Postal sectors (first 2 digits of the 6-digit postal code) | General location |
|---|---|---|
| 01 | 01, 02, 03, 04, 05, 06 | Raffles Place, Cecil, Marina, People's Park |
| 02 | 07, 08 | Anson, Tanjong Pagar |
| 03 | 14, 15, 16 | Queenstown, Tiong Bahru |
| 04 | 09, 10 | Telok Blangah, Harbourfront |
| 05 | 11, 12, 13 | Pasir Panjang, Hong Leong Garden, Clementi New Town |
| 06 | 17 | High Street, Beach Road (part) |
| 07 | 18, 19 | Middle Road, Golden Mile |
| 08 | 20, 21 | Little India |
| 09 | 22, 23 | Orchard, Cairnhill, River Valley |
| 10 | 24, 25, 26, 27 | Ardmore, Bukit Timah, Holland Road, Tanglin |
| 11 | 28, 29, 30 | Watten Estate, Novena, Thomson |
| 12 | 31, 32, 33 | Balestier, Toa Payoh, Serangoon |
| 13 | 34, 35, 36, 37 | Macpherson, Braddell |
| 14 | 38, 39, 40, 41 | Geylang, Eunos |
| 15 | 42, 43, 44, 45 | Katong, Joo Chiat, Amber Road |
| 16 | 46, 47, 48 | Bedok, Upper East Coast, Eastwood, Kew Drive |
| 17 | 49, 50, 81 | Loyang, Changi |
| 18 | 51, 52 | Tampines, Pasir Ris |
| 19 | 53, 54, 55, 82 | Serangoon Garden, Hougang, Punggol (Caisho's dataset spells it "Ponggol") |
| 20 | 56, 57 | Bishan, Ang Mo Kio |
| 21 | 58, 59 | Upper Bukit Timah, Clementi Park, Ulu Pandan |
| 22 | 60, 61, 62, 63, 64 | Jurong |
| 23 | 65, 66, 67, 68 | Hillview, Dairy Farm, Bukit Panjang, Choa Chu Kang |
| 24 | 69, 70, 71 | Lim Chu Kang, Tengah |
| 25 | 72, 73 | Kranji, Woodgrove |
| 26 | 77, 78 | Upper Thomson, Springleaf |
| 27 | 75, 76 | Yishun, Sembawang |
| 28 | 79, 80 | Seletar |

**Gotchas:**

- District numbers are **not** in postal-sector order. For example, D03 is sectors 14–16 and D04 is 09–10; D26 is 77–78 and D27 is 75–76.
- Sector **74** is not assigned to any district. Sectors 81 and 82 belong to D17 and D19.
- Postal codes are **6 digits**, and the sector is `postal.slice(0, 2)`. Keep postal codes as strings, because leading zeros matter.

**Sector to district map.** I generated it programmatically from the table above (81 sectors, 01–82 except 74):

```ts
export const SECTOR_TO_DISTRICT: Record<string, string> = {
  "01": "01", "02": "01", "03": "01", "04": "01", "05": "01", "06": "01", "07": "02", "08": "02",
  "09": "04", "10": "04", "11": "05", "12": "05", "13": "05", "14": "03", "15": "03", "16": "03",
  "17": "06", "18": "07", "19": "07", "20": "08", "21": "08", "22": "09", "23": "09", "24": "10",
  "25": "10", "26": "10", "27": "10", "28": "11", "29": "11", "30": "11", "31": "12", "32": "12",
  "33": "12", "34": "13", "35": "13", "36": "13", "37": "13", "38": "14", "39": "14", "40": "14",
  "41": "14", "42": "15", "43": "15", "44": "15", "45": "15", "46": "16", "47": "16", "48": "16",
  "49": "17", "50": "17", "51": "18", "52": "18", "53": "19", "54": "19", "55": "19", "56": "20",
  "57": "20", "58": "21", "59": "21", "60": "22", "61": "22", "62": "22", "63": "22", "64": "22",
  "65": "23", "66": "23", "67": "23", "68": "23", "69": "24", "70": "24", "71": "24", "72": "25",
  "73": "25", "75": "27", "76": "27", "77": "26", "78": "26", "79": "28", "80": "28", "81": "17",
  "82": "19",
};
export const postalToDistrict = (postal: string): string | null =>
  /^\d{6}$/.test(postal) ? SECTOR_TO_DISTRICT[postal.slice(0, 2)] ?? null : null;
```

---

## 6. Implementation checklist (Next.js on Vercel)

1. **Ingest offline.** Use a scheduled GitHub Action or cron with `URA_ACCESS_KEY` as a secret.
   - Run order: token → 4 transaction batches → N rental quarters → (optional) developer sales for the last 36 months → pipeline → rental median.
   - For rentals, N is about 21 quarters to cover the observed ~5-year window (§2.2). Empty quarters at the old end are normal.
   - Write normalised JSON to the repo or blob storage. The site reads only the snapshot and never calls URA at request time.
2. Use the headers `AccessKey`, `Token` and an explicit `User-Agent`. Set a 120 s timeout, retry 5xx and network errors 3 times with backoff, and do not retry 4xx.
3. Decode the body as UTF-8 with a Windows-1252 fallback, then `JSON.parse`.
4. Accept the response only if `Status === "Success"`, and validate the shape.
   - For transactions: all 4 batches must be non-empty, and each must have at least 50% of its previous row count. Otherwise keep the old snapshot.
5. Normalise:
   - `contractDate`/`leaseDate` `MMYY` → `YYYY-MM`.
   - `typeOfSale` `1/2/3` → New Sale / Sub Sale / Resale.
   - sqft = sqm × 10.764; psf = price / sqft.
   - `floorRange "-"` → null.
   - Parse tenure.
   - Convert `x`/`y` with §3. Coordinates are missing for about 20% of rows: keep the row and set `lat`/`lng` to null.
6. Treat `marketSegment` as authoritative per project. Rentals inherit it by joining on `project` + `street`.
7. Show the attribution text from §4, plus "data as at {snapshot date}", on every page that shows URA data.

## 7. Open items (UNVERIFIED): check with one live call when the key is available

- The exact field lists for `PMI_Resi_Rental_Median`, `PMI_Resi_Developer_Sales`, `PMI_Resi_Pipeline` and `Planning_Decision`.
- The district boundaries of batches 3 and 4 (believed to be D15–20 and D21–28).
- The official cut-over date of the `www.ura.gov.sg` → `eservice.ura.gov.sg …/v1` migration.
- The exact registration-form URL.
- The token lifetime semantics (24 h vs calendar day), and any per-day token or call limits.
- The exact data window for developer sales (about 3 years per the 2020-era docstring). Rentals were **observed live at about 5 years** (2026-10-05), not 3; the exact rule is still open.
- Whether rental projects carry `marketSegment`.
- The error-response strings and HTTP codes.
- The full verbatim URA API ToS and SODL attribution wording.
- Whether URA's gateway accepts requests from non-Singapore cloud IPs (GitHub Actions or Vercel).
