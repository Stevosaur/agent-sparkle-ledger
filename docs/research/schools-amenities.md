# Schools, P1 distance rules, amenities, GLS and en-bloc data: research notes for engineers

Research date: **2026-10-10**. Companion docs (read first for API mechanics, keys and rate limits):
`docs/research/datagov-api.md` (data.gov.sg hosts, `x-api-key`, rate limits, initiate/poll download, `datastore_search`) and
`docs/research/onemap-api.md` (OneMap token, search/geocode, themes, routing).

Scope:
1. MOE "General information of schools" dataset: id, columns, real values, gotchas.
2. Primary 1 (P1) registration home-school distance (HSD) rules: 1 km / 1-2 km / >2 km priority, how distance is measured, the 2022 and the **2027** Phase 2C changes.
3. data.gov.sg amenity datasets with coordinates (hawker centres, supermarkets, parks, CHAS clinics, community clubs, libraries, plus useful extras).
4. Government Land Sales (GLS) site data and en-bloc (collective sale) history availability.

---

## 0. How these facts were sourced (read this first)

- **Primary hosts could not be fetched.** The research fetch tool returned `getaddrinfo ENOTFOUND` for `data.gov.sg`, `api-production.data.gov.sg` and `www.moe.gov.sg`; the container's `curl` gets `CONNECT tunnel failed, response 403` for gov.sg hosts. The web-search budget for this run was exhausted after the first query, so no further search-index extracts were possible.
- Facts therefore come from:
  1. **Verbatim archived copies of MOE pages** (HTML page source saved in 2024 by a public GitHub repo: `ISS-IntelligentSystem-GroupProject24PT/Intelligent-Reasoning-System`, folder `Preschool_Recommender/resources/SchoolPages/SchoolPage_Page_Source/`). These are the real moe.gov.sg pages with their own "Last Updated" stamps (2023-2024).
  2. **Mirrored data.gov.sg API responses** committed to GitHub: dataset metadata (`GET /v2/public/api/datasets/{id}/metadata`, captured ~Dec 2025, repo `jmbish04/sgd-hbd-data`, file `datset_scaffolding/sg_dataset_schemas.json`) and collection metadata (`GET /v2/public/api/collections/{id}/metadata`, captured ~Jan 2025, repo `pradyuprasad/ask_sg_data`, folder `data/input/collections_metadata/`).
  3. **Actual dataset files** downloaded from data.gov.sg and committed to GitHub in 2026 (MOE schools CSV, hawker and parks GeoJSON), which I re-parsed to get real column names, enums and counts.
  4. **Independent 2026 codebases** that call these endpoints, and news RSS archives for the Sept 2026 MOE announcement.
- **Confidence labels used below**
  - **[PRIMARY-ARCHIVED]**: verbatim text from an archived copy of the official page (date shown).
  - **[PRIMARY-MIRROR]**: official API response or official data file, read from a GitHub mirror (capture date shown).
  - **[CORROBORATED]**: two or more independent 2026 sources agree.
  - **[SECONDARY]**: one non-government source (news summary, single codebase).
  - **UNVERIFIED**: best understanding; code defensively and re-check against the live primary page.
- **Engineering rule:** every ingest must re-read live dataset metadata (`lastUpdatedAt`, column list / `geoJsonMetadata.properties`) and fail loudly if columns differ from this file.

---

## 1. MOE "General information of schools"

### 1.1 Identity [PRIMARY-MIRROR + CORROBORATED by 10+ codebases]

| Field | Value |
|---|---|
| Dataset ID | `d_688b934f82c1059ed0a6993d2a829089` |
| Title | `General information of schools` |
| Description | "List general information such as address, contact details, nearest public transportation of primary, secondary and pre-university schools." |
| Agency | Ministry of Education (MOE) |
| Collection | `457` "School Directory and Information" (`https://data.gov.sg/collections/457/view`) |
| Format | CSV |
| Rows | **337** (snapshot committed to GitHub, retrieved Dec 2025 to Sep 2026; also "337 rows" on the dataset page per search index) |
| Metadata seen | `createdAt 2017-05-29T19:03:04+08:00`, `lastUpdatedAt 2025-01-13T12:49:40+08:00`, `coverageStart 2025-01-01`, `coverageEnd 2025-12-31` (Jan 2025 capture). Refresh is roughly annual; check `lastUpdatedAt` live. |
| Human page | `https://data.gov.sg/datasets/d_688b934f82c1059ed0a6993d2a829089/view` |
| Licence | Singapore Open Data Licence (`https://data.gov.sg/open-data-licence`) |

Sources: `https://data.gov.sg/datasets/d_688b934f82c1059ed0a6993d2a829089/view`; collection metadata mirror `https://raw.githubusercontent.com/pradyuprasad/ask_sg_data/bc609740239b9aebb6064ca055506f53e9fabbf2/data/input/collections_metadata/School_Directory_and_Information.json`.

### 1.2 How to fetch

Preferred (one file, fewest calls; see datagov-api.md §3.3):
```
GET https://api-open.data.gov.sg/v1/public/api/datasets/d_688b934f82c1059ed0a6993d2a829089/initiate-download
GET https://api-open.data.gov.sg/v1/public/api/datasets/d_688b934f82c1059ed0a6993d2a829089/poll-download
  -> { "code": 0, "data": { "status": "...", "url": "https://<pre-signed S3 URL>" }, "errorMsg": "" }
GET <data.url>   (no x-api-key header) -> CSV text
```
Fallback (small table, 337 rows fits one page):
```
GET https://data.gov.sg/api/action/datastore_search?resource_id=d_688b934f82c1059ed0a6993d2a829089&limit=1000&sort=_id%20asc
  -> { "success": true, "result": { "records": [ { "_id": 1, "school_name": "...", ... } ], "total": 337, ... } }
```
- Both methods are used for this dataset by 2026 codebases (initiate/poll: `ianleonardo/hdb-resale-bot`, `bernardinolintang/Databricks-Hackathon`; `datastore_search`: `seehiong/autonomous-hdb-deepagents`, `chonghaoooi/kaki`). [CORROBORATED]
- Conflict to know about: one 2026 catalogue (`kangcodex/singapore-skills`) claims `datastore_search` returns 404 in 2026; other 2026 code uses it successfully. Use initiate/poll first, `datastore_search` second. UNVERIFIED which is right today.
- In `datastore_search` records every value is a string and an extra `_id` field is present.

### 1.3 Columns (31, in file order) [PRIMARY-MIRROR: real 2026 CSV header + legacy metadata titles]

Missing values are the literal string `"na"` (legacy metadata: `"na" : Data not available or not applicable`).

| # | Column | Official title | Observed content / enum (2026 snapshot, 337 rows) |
|---|---|---|---|
| 1 | `school_name` | School name | UPPERCASE, e.g. `ADMIRALTY PRIMARY SCHOOL`. Join key to the other MOE datasets. |
| 2 | `url_address` | URL address | e.g. `https://admiraltypri.moe.edu.sg/` (mixed http/https) |
| 3 | `address` | Address | e.g. `11 WOODLANDS CIRCLE   ` — **335/337 have trailing spaces**; `.trim()` |
| 4 | `postal_code` | Postal code | 6 digits as text, **but 4 rows lost their leading zero**: `88256` (CANTONMENT PRIMARY), `99757` (CHIJ (KELLOCK)), `99138` (CHIJ ST. THERESA'S CONVENT), `99840` (RADIN MAS PRIMARY). Always `padStart(6,'0')`. |
| 5 | `telephone_no` | Telephone no | 8 digits, `na` possible |
| 6 | `telephone_no_2` | Telephone no 2 | usually `na` |
| 7 | `fax_no` | Fax no | |
| 8 | `fax_no_2` | Fax no 2 | |
| 9 | `email_address` | Email address | |
| 10 | `mrt_desc` | Mrt desc | free text, e.g. `Admiralty Station` |
| 11 | `bus_desc` | Bus desc | free text, e.g. `965, 964, 913` |
| 12 | `principal_name` | Principal name | personal names: do not need to store |
| 13-18 | `first_vp_name` … `sixth_vp_name` | First … Sixth vp name | personal names; mostly `na` |
| 19 | `dgp_code` | Dgp code | Development Guide Plan / planning-area name, 28 values seen: `WOODLANDS, BEDOK, TAMPINES, JURONG WEST, YISHUN, SENG KANG, HOUGANG, TOA PAYOH, PUNGGOL, CHOA CHU KANG, ANG MO KIO, BUKIT PANJANG, BUKIT BATOK, BUKIT MERAH, BUKIT TIMAH, PASIR RIS, SERANGOON, BISHAN, QUEENSTOWN, CLEMENTI, GEYLANG, NOVENA, SEMBAWANG, MARINE PARADE, KALLANG, JURONG EAST, CENTRAL, TENGAH`. Note `SENG KANG` (two words, unlike HDB's `SENGKANG`). |
| 20 | `zone_code` | Zone code | `EAST` 85, `NORTH` 84, `SOUTH` 84, `WEST` 84 (UPPERCASE; no CENTRAL in this snapshot) |
| 21 | `type_code` | Type code | `GOVERNMENT SCHOOL` 243, `GOVERNMENT-AIDED SCH` 78, `INDEPENDENT SCHOOL` 8, `SPECIALISED INDEPENDENT SCHOOL` 4, `SPECIALISED SCHOOL` 4 |
| 22 | `nature_code` | Nature code | `CO-ED SCHOOL` 293, `GIRLS' SCHOOL` 29, `BOYS' SCHOOL` 15 |
| 23 | `session_code` | Session code | `SINGLE SESSION` 319, `FULL DAY` 18 |
| 24 | `mainlevel_code` | Mainlevel code | `PRIMARY` 179, `SECONDARY (S1-S5)` 117, `SECONDARY (S1-S4)` 16, `JUNIOR COLLEGE` 10, `MIXED LEVEL (S1-JC2)` 10, `MIXED LEVEL (P1-S4)` 3, `CENTRALISED INSTITUTE` 1, `MIXED LEVEL (S1-S5, JC1-JC2)` 1 |
| 25 | `sap_ind` | Sap ind | `Yes` 23 / `No` 314 (Special Assistance Plan) |
| 26 | `autonomous_ind` | Autonomous ind | `Yes` 28 / `No` 309 |
| 27 | `gifted_ind` | Gifted ind | `Yes` 16 / `No` 321 |
| 28 | `ip_ind` | Ip ind | `Yes` 19 / `No` 318 (Integrated Programme) |
| 29 | `mothertongue1_code` | Mothertongue1 code | `CHINESE` (all rows) |
| 30 | `mothertongue2_code` | Mothertongue2 code | `MALAY` or `na` |
| 31 | `mothertongue3_code` | Mothertongue3 code | `TAMIL` or `na` |

Example row (2026 snapshot):
```json
{ "school_name": "ADMIRALTY PRIMARY SCHOOL", "url_address": "https://admiraltypri.moe.edu.sg/",
  "address": "11 WOODLANDS CIRCLE   ", "postal_code": "738907", "telephone_no": "63620598",
  "telephone_no_2": "na", "fax_no": "63627512", "fax_no_2": "na", "email_address": "admiralty_ps@moe.edu.sg",
  "mrt_desc": "Admiralty Station", "bus_desc": "965, 964, 913", "dgp_code": "WOODLANDS", "zone_code": "NORTH",
  "type_code": "GOVERNMENT SCHOOL", "nature_code": "CO-ED SCHOOL", "session_code": "FULL DAY",
  "mainlevel_code": "PRIMARY", "sap_ind": "No", "autonomous_ind": "No", "gifted_ind": "No", "ip_ind": "No",
  "mothertongue1_code": "CHINESE", "mothertongue2_code": "MALAY", "mothertongue3_code": "TAMIL" }
```

Sources: real CSV `https://raw.githubusercontent.com/seehiong/autonomous-hdb-deepagents/2a0df19534be15102658cebdda9267a653e79642/db/init/data/sg_schools.csv` (MOE columns + 2 project-added geometry columns, which are **not** part of MOE's file); field titles from legacy metadata `https://raw.githubusercontent.com/wilsonwid/cs3244-pg26/9965012ff816cecfa9879b6356b9b4268af0c21a/data_raw/schools/metadata-school-directory-and-information.txt`.

### 1.4 Rules for code

- **No coordinates in the dataset.** Geocode with OneMap search by the 6-digit postal code (onemap-api.md). Two postal codes are shared by two schools each: `599986` (METHODIST GIRLS' SCHOOL (PRIMARY) and (SECONDARY)) and `309437` (SINGAPORE CHINESE GIRLS' PRIMARY SCHOOL and SINGAPORE CHINESE GIRLS' SCHOOL). Key schools on `school_name`, not postal code.
- **Schools with a P1 intake** = `mainlevel_code === 'PRIMARY' || mainlevel_code.startsWith('MIXED LEVEL (P1')` → **182** in the 2026 snapshot (179 + CATHOLIC HIGH SCHOOL, CHIJ ST. NICHOLAS GIRLS' SCHOOL, MARIS STELLA HIGH SCHOOL). Matches the independent count "182 primary and P1-S4 mixed-level schools" in `zainul1996/btoprojects` (4 Aug 2026). [CORROBORATED]
- A geocoded school point is a building/address point, **not the school land boundary** used for HSD (§2.2). Label it "approximate".

```ts
export const normPostal = (s: string) => { const d = String(s ?? '').trim(); return /^\d{5,6}$/.test(d) ? d.padStart(6, '0') : null; };
export const naToNull = (v: string) => { const t = (v ?? '').trim(); return t === '' || t.toLowerCase() === 'na' ? null : t; };
export const hasP1Intake = (mainlevel: string) => mainlevel === 'PRIMARY' || mainlevel.startsWith('MIXED LEVEL (P1');
```

### 1.5 Other MOE datasets in collection 457 (join on school name) [PRIMARY-MIRROR + CORROBORATED]

| Dataset | ID | Columns |
|---|---|---|
| Co-curricular activities (CCAs) | `d_9aba12b5527843afb0b2e8e4ed6ac6bd` | **`School_name`** (capital S in the API output; 3 codebases fix this explicitly), `school_section`, `cca_grouping_desc`, `cca_generic_name`, `cca_customized_name` |
| Subjects Offered | `d_f1d144e423570c9d84dbc5102c2e664d` | `school_name`, `subject_desc` |
| MOE Programmes | `d_b0697d22a7837a4eddf72efb66a36fc2` | `school_name`, `moe_programme_desc` |
| School Distinctive Programmes | `d_db1faeea02c646fa3abccfa5aba99214` | `school_name`, `alp_domain`, `alp_title`, `llp_domain1`, `llp_title1`, `llp_domain2`, `llp_title2` |

All CSV; last updated June 2024 in the Jan 2025 capture. Example CCA record: `{"_id":3,"School_name":"ADMIRALTY PRIMARY SCHOOL","school_section":"PRIMARY","cca_grouping_desc":"CHOIR","cca_generic_name":"VISUAL AND PERFORMING ARTS","cca_customized_name":"na"}` (test fixture in `qorkjnxdk/Edufinder`). Note that in this sample the grouping and generic fields look swapped versus their names; display both raw.

### 1.6 P1 vacancies and balloting data

MOE publishes per-school vacancies, applicants and balloting results per phase on moe.gov.sg each year (page "P1 Registration Exercise: Vacancies and balloting data"; the 2023 page existed at `https://www.moe.gov.sg/primary/p1-registration/vacancies-and-balloting`). **No data.gov.sg dataset** was found for it. Treat as curated data scraped or keyed per exercise year, with source URL and retrieval date. UNVERIFIED that the URL path is unchanged in 2026.

---

## 2. Primary 1 registration: home-school distance (HSD) rules

### 2.1 Priority order when a phase is oversubscribed [PRIMARY-ARCHIVED, MOE "How distance affects priority admission", Last Updated 01 Feb 2024]

Verbatim:
> If your chosen primary school has more registrants than vacancies, priority admission will be given based on your child's citizenship and the Home-School Distance category, which is in turn based on the address used for registration.
> Priority admission is given in this order:
> 1. Singapore Citizens (SC) living within 1km of the school.
> 2. SCs living between 1km and 2km of the school.
> 3. SCs living outside 2km of the school.
> 4. Permanent Residents (PR) living within 1km of the school.
> 5. PRs living between 1km and 2km of the school.
> 6. PRs living outside 2km of the school.

Same list on "Understand how balloting works" (Last Updated 23 May 2023), which adds: "Balloting is conducted when the number of registrants exceeds the school vacancies, which can happen in any phase from 2A to 2C Supplementary. … Computerised balloting will be conducted centrally by MOE." Within one group, all registrants who ballot have an equal chance.

- Page: `https://www.moe.gov.sg/primary/p1-registration/distance`
- Page: `https://www.moe.gov.sg/primary/p1-registration/understand-balloting`
- Archived copies: `https://raw.githubusercontent.com/ISS-IntelligentSystem-GroupProject24PT/Intelligent-Reasoning-System/1bf28ea1a34178ad7e7510f03deb485ba6a4eca8/Preschool_Recommender/resources/SchoolPages/SchoolPage_Page_Source/https___www_moe_gov_sg_primary_p1_registration_distance.txt` (and `..._understand_balloting.txt`)
- This order is still described as the "standard distance priority" for 2026 by a Sept 2026 codebase that cites the same MOE URL (`hoyeehong/near-school`, `data/demo.ts`). [CORROBORATED]

### 2.2 How the distance is measured

- **Official definition** [PRIMARY-ARCHIVED, MOE "Address used for P1 registration", Last Updated 03 Aug 2023], verbatim:
  > The HSD used will be the shortest distance from a point on the boundary around the school to the registrant's official residential address.
  So the reference is the **school's land boundary**, not a school centre point, and the result is a **category** (within 1 km / 1-2 km / outside 2 km), not a continuous number.
- **Home side.** 2026 property-analysis write-ups paraphrase MOE as "the shortest distance from the home building outline to the school boundary" (`evancjx/housing-estate-framework`, Aug-Sep 2026, citing `https://www.moe.gov.sg/primary/p1-registration/home-address`). Whether the home side is an address point or the building footprint polygon is **UNVERIFIED**. Either way, blocks of one project can fall into different categories.
- **Who computes it.** The MOE distance checker "contains information from the Singapore Land Authority's (SLA) School Query Service. Information is accurate as of May 2023 for the registration of children admitting to Primary 1 in 2024." [PRIMARY-ARCHIVED] ⇒ SLA refreshes the data **once per exercise year** (around May, before the July exercise).
- **Official checker:** OneMap SchoolQuery. Current link used in Aug-Sep 2026: `https://www.onemap.gov.sg/school` [SECONDARY]; older links `https://www.onemap.gov.sg/main/v2/schoolquery` and `https://www.onemap.gov.sg/#/SchoolQueryInfo`.
- **No public API.** The OneMap API docs (see onemap-api.md) list no SchoolQuery endpoint. A Sept 2026 project states "No supported SchoolQuery API has been assumed". Do **not** scrape private OneMap endpoints (OneMap terms). UNVERIFIED that no licensed export exists; ask SLA if exact categories are required.

### 2.3 Address rules that change the category [PRIMARY-ARCHIVED, "Address used for P1 registration", Last Updated 03 Aug 2023; dates in the text are for the 2023 exercise]

- **Address used:** the parents' official residential address as reflected on the NRICs.
- **30-month stay:** a child admitted through HSD priority must live at that address for at least **30 months from the start of the P1 Registration Exercise** (4 July 2023 for the 2023 exercise). Otherwise MOE may transfer the child.
- **Caregiver's address** (both parents working full time; child cared for by a grandparent or a parent's sibling; online declaration needed): "If the caregiver's address is within 2km of the school, your child will be balloted together with those of the same citizenship living **between 1km to 2km** of the school. This is regardless of how close the caregiver's address is to the school." Outside 2 km → balloted with the outside-2km group.
- **Yet-to-be-completed property:** may be used if vacant or delivery possession is **within 2 years of the child's entry into P1**. The 30 months start when the family moves in. Documents: HDB Agreement for Lease, or private Sale and Purchase agreement.
- **Resale property:** may be used if the family moves in **by the start of the child's P1 academic year**. The 30 months start from the start of the P1 academic year. Documents: HDB resale flat status printout, or for private property the exercised OTP and buyer's Stamp Duty Certificate.
- **Phase 2B active community leaders** may only register for schools **within 2km** of their residential address, with the same 30-month stay rule [PRIMARY-ARCHIVED, "Registration phases and key dates", Last Updated 05 Jan 2024].
- Whether any of these address rules changed for 2024-2026 exercises: UNVERIFIED.

### 2.4 Reserved places and Phase 2C: rules by exercise year

| Exercise year (P1 entry year) | Phase 2B reserved | Phase 2C reserved | Distance treatment in Phase 2C | Confidence |
|---|---|---|---|---|
| Up to 2021 | 20 | 20 | Standard order (§2.1) | Phase 2C was "doubled to 40" from 2022 [SECONDARY: `wsgzao.github.io` post]; the 20/20 split itself is UNVERIFIED |
| **2022 → 2026** (2023 → 2027 entry) | **20** | **40** | Standard order | [PRIMARY-ARCHIVED] 2023-2024 pages, verbatim: "we are reserving 20 places in each primary school in Phase 2B and 40 places in each primary school in Phase 2C. This means a total of 60 reserved places will be set aside in all schools at the start of the P1 Registration Exercise." 2026 exercise still had 40 (news summary of 5 Aug 2026: Princess Elizabeth Primary "drew 159 applicants for 40 places") [SECONDARY] |
| **2027 onwards** (2028 entry) | UNVERIFIED (commentators say places move "from Phase 2A and Phase 2B") | **60 at most schools** (up from 40) | Standard order at most schools; **two-track scheme at 12 schools** (below) | Announced **10 Sep 2026** [CORROBORATED: CNA RSS item + CNA follow-up + 2026 codebase + forum discussion] |

Other mechanics that apply in every year above [PRIMARY-ARCHIVED, 2023-2024 pages]:
- "At the end of Phase 2A, one-third of remaining places will be allocated to Phase 2B, and two-thirds to Phase 2C."
- "If there are vacancies left at the end of Phase 2B, the remaining places will be carried forward to Phase 2C."
- A cap on PR intake applies in Phases 2C and 2C Supplementary "in a few schools".
- Phase 2C is "for a child who is not yet registered in a primary school"; unsuccessful after Phase 2C Supplementary → "posted to a school with available vacancy".

**The 2027 change (announced 10 Sep 2026; first applies to the 2027 P1 Registration Exercise, for P1 entry in 2028):**
- CNA headline (10 Sep 2026, 11:04 UTC): "Primary 1 registration: More Phase 2C places from 2027, new two-track scheme at 12 schools". Standfirst: "Most primary schools will set aside 60 places for Phase 2C, an increase from 40." URL: `https://www.channelnewsasia.com/singapore/p1-registration-phase-2c-two-track-schools-6375426`.
- CNA follow-up (11-12 Sep 2026, `https://www.channelnewsasia.com/singapore/p1-registration-parents-alumni-phase-2a-6378766`), as summarised: "At 12 schools, mainly in Bukit Timah and some in Marine Parade, the Phase 2C places will be divided equally between applicants living within 2km and those living farther away. Families in either group will not receive priority based on exact home-to-school distance."
- Two-track details (from `hoyeehong/near-school`, Sept 2026, citing MOE `https://www.moe.gov.sg/primary/p1-registration/changes-to-p1-registration-framework`) [SECONDARY]:
  - "12 designated schools split Phase 2C places between homes within 2 km and beyond 2 km. There is no home-school distance priority within each track. This does not apply to all schools."
  - "Singapore Citizens in both tracks are considered before Permanent Residents. Places left after admitting Citizens in one track flow to Citizens in the other track."
  - The ≤2 km track covers both the official within-1km and 1-2km categories.
  - With 60 places, that is 30 + 30 (forum discussion, 28 Sep 2026) [SECONDARY].
- **The 12 two-track schools** [SECONDARY, single source `hoyeehong/near-school` `data/demo.ts`; consistent with CNA's "mainly Bukit Timah, some Marine Parade". **Verify every name against the MOE page before publishing.**]
  Bukit Timah side: Nanyang Primary School; Raffles Girls' Primary School; Methodist Girls' School (Primary); Pei Hwa Presbyterian Primary School; Singapore Chinese Girls' School (Primary) (MOE directory name: `SINGAPORE CHINESE GIRLS' PRIMARY SCHOOL`); Anglo-Chinese School (Primary); Anglo-Chinese School (Junior); St. Margaret's School (Primary).
  Marine Parade side: Tao Nan School; CHIJ (Katong) Primary; Ngee Ann Primary School; Tanjong Katong Primary School.
- The official MOE page `changes-to-p1-registration-framework` could not be read: exact Phase 2A/2B changes, the PR treatment inside the tracks, and the full list are **UNVERIFIED** beyond the above.

### 2.5 What the app may and may not show (engineering rules)

1. **Never** state that a property is "within 1 km" of a school as an official fact unless the category comes from SLA/OneMap for that exact address and exercise year. Label computed values "approximate straight-line distance; not the official MOE home-school distance". Link users to OneMap SchoolQuery.
2. Approximation that best mimics the rule (still approximate): minimum distance from the **school land parcel polygon** to the home **building footprint** (HDB: `d_16b157c52ed637edd6ba1232e026258d` HDB Existing Building polygons). School parcels can be approximated from URA Master Plan 2025 land-use polygons (`d_a8c3546b26712e35021f3a681d0353ae`, `LU_DESC = 'EDUCATIONAL INSTITUTION'`) that contain the geocoded school point. Point-to-point haversine is the crudest option; show bands only with a ±150 m "near boundary" warning band.
3. Store the rule set by **exercise year**: `{ exerciseYear, phase2bReserved, phase2cReserved, twoTrackSchools[] }`. For 2026: 20 / 40 / []. For 2027+: UNVERIFIED / 60 (most schools) / the 12 schools above once verified.
4. Distance category never guarantees a place; balloting applies within a group.

---

## 3. Amenity datasets on data.gov.sg (with coordinates)

### 3.0 Common mechanics

- **GeoJSON and KML datasets: skip initiate, call poll-download only** (datagov-api.md §3.3). `GET https://api-open.data.gov.sg/v1/public/api/datasets/{id}/poll-download` → `data.url` → fetch the file. A 2026 codebase also gets a URL for a CSV this way; the documented CSV flow is initiate then poll.
- Rate limiting: HTTP 429, or `json.code === 24` in the body (seen handled in `ElsonNg/CribCheck`). Back off ≥ 11 s without a key.
- Geometry is WGS84 `[lng, lat]`. Some files carry a third Z value (`[lng, lat, 0]`): read only `[0]` and `[1]`.
- `LANDXADDRESSPOINT`/`LANDYADDRESSPOINT`, `X`/`Y`, `X_COORDINATE`/`Y_COORDINATE` are **SVY21 (EPSG:3414)** metres, sometimes `0` placeholders. Use the GeoJSON geometry instead.
- `FMEL_UPD_D` = source record timestamp `yyyyMMddHHmmss` (e.g. `20250807100106`). `INC_CRC` = record hash; use with `OBJECTID` for change detection.
- Postal codes appear both as `"069111"` (string, good) and with lost leading zeros (`59295`); always `padStart(6,'0')`.
- **Two GeoJSON property styles exist:**
  - *Flat*: attributes are real properties (`NAME`, `ADDRESSPOSTALCODE`, …).
  - *KML-converted*: properties are only `Name` (a placeholder like `"kml_31"`, **not** the real name) and `Description` (an HTML table `<th>KEY</th> <td>VALUE</td>`). Parse it:

```ts
export function parseKmlDescription(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<th[^>]*>\s*([^<]+?)\s*<\/th>\s*<td[^>]*>([^<]*)<\/td>/gi;
  for (let m; (m = re.exec(html ?? '')); ) out[m[1].trim()] = decodeHtmlEntities(m[2].trim());
  return out; // e.g. { HCI_NAME: 'ACUMED MEDICAL GROUP', POSTAL_CD: '…', … }
}
// Never use props.Name when it matches /^kml[_ -]?\d+$/i.
```
Real Description sample (Gyms@SG): `<center><table><tr><th colspan='2' align='center'><em>Attributes</em></th></tr><tr bgcolor="#E3E3F3"> <th>LANDYADDRESSPOINT</th> <td>0</td> </tr> … <tr bgcolor=""> <th>NAME</th> <td>Pure Fitness - Knightsbridge (Asia Square)</td> </tr></table></center>`.

### 3.1 Master table

"Count" = features in a real 2026 download (source in brackets). "Updated" = `lastUpdatedAt` in the Dec 2025 or Jan 2025 metadata capture. Re-check both live.

| Use | Dataset ID | Official name | Agency (collection) | Format | Count | Updated | Style |
|---|---|---|---|---|---|---|---|
| **Hawker centres** | `d_4a086da0a5553be1d89383cd90d07ecd` | Hawker Centres (GEOJSON) | NEA (1445) | GeoJSON, ~140 KB | **129** (Jul & Aug 2026, 2 codebases) | 2025-12-05 | Flat |
| (twin) | `d_ccca3606c337a5c386b9c88dc0dd08b6` | Hawker Centres (KML) | NEA (1445) | KML | | 2024-06-06 | |
| Hawker legacy list | `d_68a42f09f350881996d83f9cd73ab02f` | List of Government Markets Hawker Centres | NEA (1385) | CSV | | coverage **2016** (stale) | no coords |
| Hawker closures | `d_bda4baa634dd1cc7a6c7cad5f19e2d68` | Dates of Hawker Centres Closure | NEA (1376) | CSV | | 2025-11-12 | no coords |
| Markets & food centres | `d_a57a245b3cf3ec76ad36d55393a16e97` (GeoJSON), `d_b5f8a5a4584b6e537c0ab81a48ca3497` (twin) | NEA Market and Food Centre | NEA (1389) | GeoJSON | | 2024-06-06 | KML-style |
| **Supermarkets (locations)** | `d_cac2c32f01960a3ad7202a99c27268a0` | Supermarkets (GEOJSON) | SFA (1451) | GeoJSON | — | 2024-06-06 | KML-style; **see §3.3: reported deleted Aug 2026** |
| (twin) | `d_8a77ee0446716b2ce475a587004afc73` | Supermarkets (KML) | SFA (1451) | KML | — | | **reported deleted** |
| Supermarket licences | `d_11edd0117280c5776651d7891114c88c` | List of Supermarket Licences | NEA, now SFA (1388) | CSV | | coverage **26 Jun 2016**; re-uploaded 2024-06-06 | no coords |
| **Parks (points)** | `d_0542d48f0991541706b58059381a6eca` | Parks | NParks (1491) | GeoJSON, ~160 KB | **461** (Jul 2026) | 2025-12-05 | Flat |
| Parks (polygons) | `d_77d7ec97be83d44f61b85454f844382f` | NParks Parks and Nature Reserves | NParks (1489) | GeoJSON, ~2.9 MB | 461 (Aug 2026) | 2025-12-05 | Flat |
| Park connectors | `d_a69ef89737379f231d2ae93fd1c5707f` | Park Connector Loop | NParks (1490) | GeoJSON (lines) | 1,177 lines (2026) | 2024-11-25 | Flat (UNVERIFIED) |
| Park facilities | `d_14d807e20158338fd578c2913953516e` | Park Facilities | NParks (1495) | GeoJSON, ~2.2 MB | | 2025-12-05 | Flat |
| **CHAS clinics** | `d_548c33ea2d99e29ec63a7cc9edcccedc` | CHAS Clinics | MOH (2036) | GeoJSON, ~1.6 MB | **1,193** (Sep 2026, 2 codebases) | 2024-06-06 | KML-style |
| (twin) | `d_65d11d02ab0246cec53bfc995c782628` | CHAS Clinics | MOH (2036) | KML | | 2024-06-06 | |
| **Community clubs** | `d_9de02d3fb33d96da1855f4fbef549a0f` | Community Club / PAssion WaVe Outlet | PA (2022) | GeoJSON | **128** (Sep 2026) | 2024-06-06 | Flat [CORROBORATED by 2 codebases] |
| (twin) | `d_58cfdb495b548d96c54ebe411307edf2` | Community Club / PAssion WaVe Outlet | PA (2022) | KML | | | |
| (alt.) | `d_f706de1427279e61fe41e89e24d440fa` / KML `d_f3f3aaa2786488ee335e48f77bfc3426` | Community Clubs | PA (2019) | GeoJSON / KML | | 2024-06-06 | UNVERIFIED |
| **Libraries** | `d_27b8dae65d9ca1539e14d09578b17cbf` | Libraries | NLB (1463) | GeoJSON | ~ (UNVERIFIED) | 2024-06-06 | KML-style [1 codebase] |
| (twin) | `d_cf8500a4a0ca1b7222ebe2a04b34d4b4` | Libraries | NLB (1463) | KML | | | |
| Pre-schools | `d_61eefab99958fd70e6aab17320a71f1c` (GeoJSON), `d_a72bcd23e208d995f3bd4eececeaca43` (KML) | Pre-Schools Location (childcare + kindergartens) | ECDA (2064) | GeoJSON | | 2024-06-06 | KML-style (`CENTRE_NAME`, `CENTRE_CODE`) |
| Pre-school list | `d_696c994c50745b079b3684f0e90ffc53` | Listing of Centres | ECDA (56) | CSV | | 2025-01-14 | no coords |
| Kindergartens | `d_7fe9a72b1afff18e48111772c8d0fd39` (GeoJSON), `d_95aa63998d7de94dd4cb3e8e43a5f6d5` (KML) | Kindergartens | ECDA (2034) | GeoJSON | | 2025-11-08 | Flat |
| Childcare | `d_5d668e3f544335f8028f546827b773b4` (GeoJSON; used by 2 codebases, collection UNVERIFIED), `d_b34f9bdbe99067eecb5d5f3be8187cfb` (KML, collection 2015) | Child Care Services | ECDA | GeoJSON | | KML 2024-06-06 | Flat (UNVERIFIED) |
| Sport facilities | `d_9b87bab59d036a60fad2a91530e10773` | SportSG Sport Facilities (GEOJSON) | SportSG (1631) | GeoJSON | 45 (Sep 2026) | 2025-11-13 | Flat (since late 2025; older copies KML-style) |
| Gyms | `d_b3ae090692ecf632116c9885cfbd3424` (GeoJSON), `d_8166b1ebbba81cd153aee73f8b5ec88b` (KML) | Gyms@SG | HPB (117) | GeoJSON | | 2024-06-06 | KML-style |
| Polyclinic proxy | `d_0cdfbf7e277e8bfa1ef79fadf4b71b56` | Breast Screening Centre (GEOJSON) ("Location of polyclinics offering BSS services") | HPB (115) | GeoJSON | | 2024-06-06 | — not a full polyclinic list |
| RC / RN centres | `d_9ae25d6b3fefdd15983c4e46ecc7fcbd` (GeoJSON), `d_07a27942566ff6bffa8b55fd601ea61d` (KML) | Residents' Committee / Residents' Network Centre | PA (2061) | GeoJSON | | 2024-06-06 | |
| Eldercare | `d_f0fd1b3643ed8bd34bd403dedd7c1533` | Eldercare Services | MOH (714) | GeoJSON | | 2024-06-06 | KML-style |
| MRT/LRT exits | `d_b39d3a0871985372d7e1637193335da5` | LTA MRT Station Exit (GEOJSON) | LTA | GeoJSON | 597 (Jul 2026), 613 (Aug 2026) | | see datagov-api.md §5.6 |
| Bus stops | `d_3f172c6feb3f4f92a2f47d93eed2908a` | LTA Bus Stop | LTA | GeoJSON | 5,166 (Jul 2026), 5,205 (Sep 2026) | | props `BUS_STOP_NUM`, `BUS_ROOF_NUM`, `LOC_DESC` (UNVERIFIED) |

**Not location data (do not use for maps):** `d_e4663ad3f088a46dabd3972dc166402d` "Health Facilities (Primary Care, Dental Clinics and Pharmacies)" is a yearly **count** table, not a list of clinics. `d_34ba4c6d34d95f6bc06244917f62a0d8` is a yearly count of licensed supermarkets (1993-2014).

Sources: Dec 2025 metadata mirror `https://raw.githubusercontent.com/jmbish04/sgd-hbd-data/215eb9971c50694ae461749d454746f07445497c/datset_scaffolding/sg_dataset_schemas.json`; Jan 2025 collection mirrors under `https://github.com/pradyuprasad/ask_sg_data/tree/bc609740239b9aebb6064ca055506f53e9fabbf2/data/input/collections_metadata` (files `Hawker_Centres.json`, `Supermarkets.json`, `List_of_Supermarket_Licences.json`, `Parks.json`, `NParks_Parks_and_Nature_Reserves.json`, `Park_Connector_Loop.json`, `Park_Facilities.json`, `CHAS_Clinics.json`, `Community_Club___PAssion_WaVe_Outlet.json`, `Community_Clubs.json`, `Libraries.json`, `Pre-Schools_Location.json`, `Listing_of_Centres.json`, `Kindergartens.json`, `Gyms@SG.json`, `Breast_Screening_Centre.json`, `Residents'_Committee___Residents'_Network_Centre.json`); counts from `hamburtab/homelens-sg` `artifacts/manifests/official_layers.json` (14 Jul 2026), `zainul1996/btoprojects` `docs/DATA_SOURCES.md` (4 Aug 2026), `minghao51/egg-n-bacon-housing` `docs/plans/2026-09-01-pipeline-refresh-handoff.md` (Sep 2026), `bernardinolintang/Databricks-Hackathon` README, `Bread04/DataBricks-Challenge-` `DATASETS.md` (28 Sep 2026). Dataset pages: `https://data.gov.sg/datasets/<id>/view`.

### 3.2 Hawker centres `d_4a086da0a5553be1d89383cd90d07ecd` [PRIMARY-MIRROR: metadata + real file]

Properties (20, all flat): `OBJECTID` (num), `LANDXADDRESSPOINT`, `LANDYADDRESSPOINT` (SVY21), `ADDRESSBUILDINGNAME`, `ADDRESSPOSTALCODE` (metadata says NUMERIC, file holds a 6-char string), `ADDRESSSTREETNAME`, `DESCRIPTION` (e.g. upgrading programme), `NAME`, `PHOTOURL`, `ADDRESSBLOCKHOUSENUMBER`, `STATUS`, `AWARDED_DATE` (`dd/MM/yyyy` or null), `IMPLEMENTATION_DATE`, `INFO_ON_CO_LOCATORS`, `ADDRESS_MYENV`, `EST_ORIGINAL_COMPLETION_DATE` (e.g. `"1983"`), `HUP_COMPLETION_DATE` (`dd/MM/yyyy` or null), `NUMBER_OF_COOKED_FOOD_STALLS` (int), `INC_CRC`, `FMEL_UPD_D`.

`STATUS` values in the 2026 file (129 features): `Existing` 103, `Existing (new)` 16, `Under Construction` 6, `Existing (replacement)` 3, `Interim Centre` 1. Treat `Under Construction` as planned; everything else as open. Unknown values: skip and log.

Real feature:
```json
{ "type": "Feature", "geometry": { "type": "Point", "coordinates": [103.84661927383159, 1.2792312094873002] },
  "properties": { "OBJECTID": 119091, "LANDXADDRESSPOINT": 29433.14995771, "LANDYADDRESSPOINT": 29089.97730924,
    "ADDRESSBUILDINGNAME": "MND COMPLEX (ANNEXE B)", "ADDRESSPOSTALCODE": "069111", "ADDRESSSTREETNAME": "MAXWELL ROAD",
    "DESCRIPTION": "HUP Standard Upgrading", "NAME": "Amoy Street Food Centre (Telok Ayer Food Centre)",
    "PHOTOURL": "http://www.nea.gov.sg/images/default-source/Hawker-Centres-Division/resize_1265968760190.jpg",
    "ADDRESSBLOCKHOUSENUMBER": "7", "STATUS": "Existing", "AWARDED_DATE": null, "IMPLEMENTATION_DATE": null,
    "INFO_ON_CO_LOCATORS": null, "ADDRESS_MYENV": "National Development Building, Annex B, Telok Ayer Street, Singapore 069111",
    "EST_ORIGINAL_COMPLETION_DATE": "1983", "HUP_COMPLETION_DATE": "17/02/2003", "NUMBER_OF_COOKED_FOOD_STALLS": 134,
    "INC_CRC": "1166A0D172748172", "FMEL_UPD_D": "20250807100106" } }
```
Source file: `https://raw.githubusercontent.com/minghao51/egg-n-bacon-housing/f1c09a09298ea23583ecf669d9ec5d8b2391c154/data/raw/external/datagov/HawkerCentresGEOJSON.geojson` (byte size 140,459 = metadata `datasetSize`).

Legacy CSV `d_68a42f09f350881996d83f9cd73ab02f` columns: `name_of_centre, location_of_centre, type_of_centre (HC|MHC), owner, no_of_stalls, no_of_cooked_food_stalls, no_of_mkt_produce_stalls` (2016 data; no coordinates). Do not use for maps.

### 3.3 Supermarkets: no current official location dataset

- The SFA location datasets `d_cac2c32f01960a3ad7202a99c27268a0` (GeoJSON) and `d_8a77ee0446716b2ce475a587004afc73` (KML) "both returned `DATASET_DOES_NOT_EXIST` from data.gov.sg's current download API" on **4 Aug 2026**, and "collection 1451 also returned an empty `childDatasets` list" (`zainul1996/btoprojects` `docs/DATA_SOURCES.md`) [SECONDARY, consistent with a Sept 2026 codebase that commented out that ID]. Re-test at ingest; treat as gone.
- Remaining official option: **List of Supermarket Licences** `d_11edd0117280c5776651d7891114c88c` (CSV, collection 1388, listed frequency "quarterly" but coverage **26 Jun 2016**). Still downloadable and used by two 2026 projects (`ElsonNg/CribCheck`, `shenghaoc/hdb-resale-qt` manifest dated 4 Oct 2026).
  Columns [CORROBORATED by 10+ copies]: `licence_num, licensee_name, building_name, block_house_num, level_num, unit_num, street_name, postal_code`.
  Example: `S02185J000,COLD STORAGE SINGAPORE (1983) PTE LTD,na,982,1,1,BUANGKOK CRESCENT,530982`.
  No coordinates: geocode `postal_code` with OneMap. **It is a 2016 snapshot**: label it "licensed supermarkets (2016 list)" or do not show it.
- OneMap themes list (2026) has **no supermarket theme**. The only fully current option is OpenStreetMap `shop=supermarket` (non-government; attribute ODbL, disclose coverage).

### 3.4 Parks

`d_0542d48f0991541706b58059381a6eca` "Parks" (points; "indicative Managed Areas of Parks which are under the purview of NParks"). Properties: `OBJECTID, NAME, X, Y, INC_CRC, FMEL_UPD_D` (X/Y = SVY21). 461 features in a July 2026 download, latest `FMEL_UPD_D` 20260703041208. Names are abbreviated and include playgrounds and open spaces: `PK` = park, `PG` = playground (26 names contain "PLAYGROUND"/`PG`), `OS` = open space, e.g. `NOVENA RISE PK`, `CARMICHAEL RD PG`, `HANDY RD OS`, `CONEY ISLAND PARK`. Filter or label by suffix.
Real feature: `{"type":"Feature","geometry":{"type":"Point","coordinates":[103.84285301571919,1.3246275300259491]},"properties":{"OBJECTID":95822,"NAME":"NOVENA RISE PK","X":29061.08694996,"Y":34096.10124219,"INC_CRC":"E0CE377939D35367","FMEL_UPD_D":"20260422000138"}}` (source `hamburtab/homelens-sg/data/raw/official_layers/parks.geojson`).

`d_77d7ec97be83d44f61b85454f844382f` "NParks Parks and Nature Reserves" (Polygon/MultiPolygon). Properties: `OBJECTID_1, L_CODE, NAME, N_RESERVE, INC_CRC, FMEL_UPD_D, SHAPE_1.AREA, SHAPE_1.LEN`. Use for "distance to park edge"; a centroid is not an entrance.

`d_14d807e20158338fd578c2913953516e` "Park Facilities": `OBJECTID, UNIQUEID, NAME, CLASS, ADDITIONAL_INFO, INC_CRC, FMEL_UPD_D`.

### 3.5 CHAS clinics `d_548c33ea2d99e29ec63a7cc9edcccedc` (KML-style)

`properties = { Name: "kml_<n>", Description: "<html table>" }`. Keys inside `Description` [CORROBORATED by 4 codebases + 2020 extract]:
`HCI_CODE, HCI_NAME, LICENCE_TYPE, HCI_TEL, POSTAL_CD, ADDR_TYPE, BLK_HSE_NO, FLOOR_NO, UNIT_NO, STREET_NAME, BUILDING_NAME, CLINIC_PROGRAMME_CODE, X_COORDINATE, Y_COORDINATE, INC_CRC, FMEL_UPD_D`.
- `CLINIC_PROGRAMME_CODE` is comma-separated, e.g. `CDMP,CHAS,ISP`. `LICENCE_TYPE` e.g. `MC`, `MD` (medical / dental; exact meanings UNVERIFIED).
- Example values (2020 extract): `HCI_CODE 9400215`, `HCI_NAME CHEN FAMILY CLINIC`, `POSTAL_CD 550153`, `BLK_HSE_NO 153`, `FLOOR_NO 01`, `UNIT_NO 490`, `STREET_NAME SERANGOON NORTH AVE 1`.
- The dataset was last updated 2024-06-06 (2025 capture). A 2026 note says the data.gov.sg search no longer lists it but poll-download by ID works [SECONDARY]. Label "CHAS clinic list as published by MOH (last updated <date>)".

### 3.6 Community clubs `d_9de02d3fb33d96da1855f4fbef549a0f` (flat)

Properties used by two 2026 codebases: `OBJECTID, NAME, ADDRESSBLOCKHOUSENUMBER, ADDRESSSTREETNAME, ADDRESSBUILDINGNAME, ADDRESSPOSTALCODE` (likely also `ADDRESSFLOORNUMBER, ADDRESSUNITNUMBER, DESCRIPTION, HYPERLINK, PHOTOURL, LANDXADDRESSPOINT, LANDYADDRESSPOINT, INC_CRC, FMEL_UPD_D` like other PA layers; UNVERIFIED). 128 features (Sep 2026). Geometry may carry a Z value.

### 3.7 Libraries `d_27b8dae65d9ca1539e14d09578b17cbf` (KML-style)

`Description` keys (one 2026 codebase): `NAME, ADDRESSBLOCKHOUSENUMBER, ADDRESSSTREETNAME, ADDRESSBUILDINGNAME, ADDRESSPOSTALCODE, ADDRESSFLOORNUMBER, ADDRESSUNITNUMBER, DESCRIPTION` (a library code such as `SRPL`, `OCPL`), `HYPERLINK, PHOTOURL, FMEL_UPD_D`. Catalogue last updated 6 Jun 2024; rows carry older `FMEL_UPD_D` (`chonghaoooi/kaki` notes, 13 Sep 2026). Feature count UNVERIFIED (public libraries are roughly 25-30).

### 3.8 OneMap themes as an alternative source (token required)

`GET https://www.onemap.gov.sg/api/public/themesvc/retrieveTheme?queryName={QUERYNAME}[&extents=minLat,minLng,maxLat,maxLng]` with `Authorization: <token>` (see onemap-api.md §1.6; the first element of `SrchResults` is metadata; points have `LatLng: "lat,lng"`).
Relevant `QUERYNAME`s from a 2026 `getAllThemesInfo` dump (168 themes; `sanjeevr123/HomeCompass/onemap_all_themes_full.json`) with their `EXPIRY_DATE`:
`ssot_hawkercentres` (NEA, 31/12/2028; note: **not** the old `hawkercentre`), `libraries` (NLB, 31/12/2028), `communityclubpassionwave` (PA, 31/12/2027), `communityclubs` (PA, expired 30/12/2022), `residentscommittee` (PA, 31/12/2027), `kindergartens` (ECDA, 31/12/2026), `childcare` (ECDA, 31/12/2026), `nationalparks` (NParks, 31/03/2026), `nparks_parks` (31/03/2026), `park_connector_loop` (31/03/2026), `moh_hospitals` (MOH, 31/12/2026), `vaccination_polyclinics` (MOH, 27/01/2029), `sportsg_sport_facilities` (expired 31/12/2024), `eldercare` (expired 31/12/2020).
- No CHAS-clinic and no supermarket theme in that list.
- Themes past `EXPIRY_DATE` may still return data but should be treated as stale. Prefer data.gov.sg for ingestion; OneMap theme terms of use apply.

---

## 4. Government Land Sales (GLS) and en-bloc history

### 4.1 GLS: what exists

- **How GLS works** [PRIMARY-MIRROR, URA's own text in data.gov.sg collection 1669 description]: "URA acts as agent for the State in carrying out land sales for commercial, hotel and private residential developments… The release of state land is carried out through the Government Land Sales (GLS) programme. Each programme is planned for and announced every 6 months. The GLS sites are released through two main systems - the reserve list and the confirmed list."
- **Sellers:** URA (private residential, commercial, hotel, white sites), HDB (executive condominium and some private residential sites; results published as HDB news releases, e.g. `https://www.hdb.gov.sg/hdb-pulse/news/2026/final-tender-result-for-land-parcel-at-miltonia-close`), JTC (industrial sites, IGLS). [SECONDARY for the HDB part]
- **Machine-readable data on data.gov.sg** [PRIMARY-MIRROR]:

| Dataset | ID | Format | Coverage / freshness | Notes |
|---|---|---|---|---|
| URA Sale Sites (GEOJSON) | `d_0e2b42f98535686282031a42c9c7b05a` | GeoJSON | "sites sold by URA from year 1967. The site boundary and information are based on the time of award of tender." Last updated 2024-06-06 (Jan 2025 capture) | Collection 1855. Property names UNVERIFIED (inspect `geoJsonMetadata` at ingest). Likely misses 2024-2026 awards. |
| URA Sale Sites (KML) | `d_bdd2c54fa27bdce7643ed905b9e173ab` | KML | same | twin |
| Vacant Sites Sold By URA | `d_e225b635fbe3ecf5b378447e4b517939` | CSV | 31 Aug 1992 to 28 Apr 2016 | Collection 1669. Historical only. Columns UNVERIFIED. |
| Conservation Sites Sold By URA | `d_1eefe4d027b4d59437321f25e00be9e7` | CSV | 1987 to 2007 | Collection 1640. |
| Industrial Government Land Sales - Sites | `d_a751490a138b40eb13c48b0eb90e5c64` (GeoJSON), `d_6e178de853ec759f9ef8362b971515c9` (KML) | GeoJSON (KML-style) | frequency "half_year"; last updated 2024-06-06 | JTC, collection 287. |

- **URA web sources for current sites and tender results** (no API; curate):
  - GLS map: `https://www.ura.gov.sg/maps/?service=glsrelease` ("upcoming and sold sites under the GLS programme") [SECONDARY description].
  - Half-yearly programme announcements and tender results are URA media releases at `https://www.ura.gov.sg/news/media/pr{YY}-{NN}/` with annex PDFs of all bids at `https://www.ura.gov.sg/-/media/Corporate/Media-Room/{YYYY}/{Mon}/pr{YY}-{NN}a.pdf` (example: `pr24-40`, annex `pr24-37a.pdf`) [SECONDARY, pattern from a 2026 report].
  - URA Data Service (`https://www.ura.gov.sg/uraDataService/invokeUraDS?service=…`) has no GLS service in any reviewed code; UNVERIFIED that none exists.
- **Recommended data model for curated GLS rows:** `site_name, agency (URA|HDB|JTC), programme_half (e.g. 2H2026), list_type (confirmed|reserve), launch_date, tender_close_date, award_date, site_area_m2, max_gfa_m2, est_units, zoning, lease_years, successful_tenderer, winning_bid_sgd, psf_ppr, bids_count, polygon (from URA Sale Sites when available), source_url, retrieved_at`.

### 4.2 En-bloc (collective sale) history: no public structured dataset

- Searched the full data.gov.sg catalogues for URA (273 collections, 509 datasets) and HDB (52 collections, 104 datasets) as mirrored in `kangcodex/singapore-skills/docs/api/{URA,HDB}.md` (2026): **no collective-sale dataset**. The only related one is HDB's **SERS** count: `d_741b128b977a08537af3350292975127` "Cumulative Number of Sites Under Selective En Bloc Redevelopment Scheme (SERS)" (annual CSV, collection 146). SERS is HDB-initiated redevelopment, not a private en-bloc.
- Private collective sales of strata developments go to the **Strata Titles Boards (STB)** under the Ministry of Law when an order for sale is needed. Whether STB publishes a downloadable list of applications or orders, and its current URL, is **UNVERIFIED** (do not confuse with `stb.gov.sg`, which is the Singapore Tourism Board).
- Whether en-bloc land deals appear in URA's private residential transaction API: UNVERIFIED and unlikely, since that API records unit sales.
- **Conclusion:** en-bloc history must be **curated** (manual research or licensed data), one row per attempt: `development_name, tenure, land_area, plot_ratio, reserve_price, launch_date, outcome (sold|failed|withdrawn), sale_date, sale_price, buyer, land_rate_psf_ppr, source_url, retrieved_at`. Store facts with citations; do not copy third-party trackers verbatim (copyright).

---

## 5. UNVERIFIED items (handle defensively)

1. The 12 two-track school names (single non-government source) and all 2027 changes except "60 Phase 2C places at most schools" and "12 schools split Phase 2C equally ≤2 km / >2 km with no distance priority within a track".
2. Phase 2A and 2B reserved places from the 2027 exercise.
3. Whether the HSD home side is an address point or the building outline; whether 2023 address rules (caregiver, new or resale property, 30 months) changed for 2024-2026.
4. Current OneMap SchoolQuery URL (`/school` seen in 2026) and the absence of any licensed SchoolQuery export.
5. `datastore_search` availability in 2026 (conflicting reports; use initiate/poll first).
6. Supermarket GeoJSON/KML deletion (reported 4 Aug 2026); the licence CSV is a 2016 snapshot.
7. Community-club extra properties, library feature count, bus stop property names, childcare GeoJSON style.
8. URA Sale Sites property names and freshness; Vacant Sites Sold columns; STB publication of collective-sale applications.
9. Meaning of CHAS `LICENCE_TYPE` codes.

## 6. Sources

Official pages (read via archived copies, see §0):
- https://www.moe.gov.sg/primary/p1-registration/distance (Last Updated 01 Feb 2024)
- https://www.moe.gov.sg/primary/p1-registration/home-address (Last Updated 03 Aug 2023)
- https://www.moe.gov.sg/primary/p1-registration/understand-balloting (Last Updated 23 May 2023)
- https://www.moe.gov.sg/primary/p1-registration/registration-phases-key-dates (Last Updated 05 Jan 2024)
- https://www.moe.gov.sg/primary/p1-registration/vacancies-and-balloting
- https://www.moe.gov.sg/primary/p1-registration/changes-to-p1-registration-framework (2027 changes; not readable this run)
- Archive repo: https://github.com/ISS-IntelligentSystem-GroupProject24PT/Intelligent-Reasoning-System/tree/1bf28ea1a34178ad7e7510f03deb485ba6a4eca8/Preschool_Recommender/resources/SchoolPages/SchoolPage_Page_Source

data.gov.sg (dataset pages `https://data.gov.sg/datasets/<id>/view` for every ID above; collections `https://data.gov.sg/collections/<id>/view`):
- Metadata mirror (Dec 2025): https://raw.githubusercontent.com/jmbish04/sgd-hbd-data/215eb9971c50694ae461749d454746f07445497c/datset_scaffolding/sg_dataset_schemas.json
- Collection metadata mirror (Jan 2025): https://github.com/pradyuprasad/ask_sg_data/tree/bc609740239b9aebb6064ca055506f53e9fabbf2/data/input/collections_metadata
- Agency catalogues (2026): https://github.com/kangcodex/singapore-skills/tree/9e175f259088c96d5ffe380695b0c306ef4349a5/docs/api

News (2027 P1 change):
- https://www.channelnewsasia.com/singapore/p1-registration-phase-2c-two-track-schools-6375426 (10 Sep 2026; via RSS archive https://github.com/rumca-js/RSS-Link-Database-2026, file `2026/09/2026-09-10/https...www.channelnewsasia.com.api.v1.rss-outbound-feed._format.xml_entries.json`)
- https://www.channelnewsasia.com/singapore/p1-registration-parents-alumni-phase-2a-6378766 (11 Sep 2026; summary in https://github.com/Joey111a1/Joey111a1.github.io `daily-news/reports/2026/09/2026-09-12.html`)

Codebases (2026) used for corroboration:
- https://github.com/seehiong/autonomous-hdb-deepagents (`db/refresh_geodata.py`, `db/init/data/sg_schools.csv`)
- https://github.com/zainul1996/btoprojects (`docs/DATA_SOURCES.md`, 4 Aug 2026)
- https://github.com/hoyeehong/near-school (`data/demo.ts`, `docs/data.md`, Sept 2026)
- https://github.com/hamburtab/homelens-sg (`artifacts/manifests/official_layers.json`, 14 Jul 2026)
- https://github.com/minghao51/egg-n-bacon-housing (`src/egg_n_bacon_housing/components/ingestion/geojson.py`, `docs/guides/data-ingestion-development.md`)
- https://github.com/geeliette/caregiver-app (`src/lib/data/recommendations.ts`)
- https://github.com/shrujann/MyHDBSense (`amenities_tracker/accounts/services.py`)
- https://github.com/ElsonNg/CribCheck (`scripts/refresh-supermarkets.mjs`)
- https://github.com/shenghaoc/hdb-resale-visualizer (`scripts/lib/schemas.ts`, `scripts/lib/sync/constants.ts`)
- https://github.com/evancjx/housing-estate-framework (`property_analysis/*.md`, Aug-Sep 2026)
- https://github.com/sanjeevr123/HomeCompass (`onemap_all_themes_full.json`)
