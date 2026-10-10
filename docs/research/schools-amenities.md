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
| 2 | `url_address` | URL address | e.g. `https://admiraltypri.moe.edu.sg/`. Mixed: 285 `http://`, 43 `https://`, and **9 with no scheme at all** (e.g. `www.acsj.moe.edu.sg`, `valourpri.moe.edu.sg`). Prefix `https://` when the scheme is missing before rendering a link. |
| 3 | `address` | Address | e.g. `11 WOODLANDS CIRCLE   ` — **335/337 have trailing spaces**; `.trim()` |
| 4 | `postal_code` | Postal code | 6 digits as text, **but 4 rows lost their leading zero**: `88256` (CANTONMENT PRIMARY), `99757` (CHIJ (KELLOCK)), `99138` (CHIJ ST. THERESA'S CONVENT), `99840` (RADIN MAS PRIMARY). Always `padStart(6,'0')`. |
| 5 | `telephone_no` | Telephone no | Free text, **not always 8 digits**: 327 rows are 8 digits, 10 are not (e.g. `6256 6701`, `+65 69296290`, `64582177 (Secondary)`, `62803880 (Sec)`). No `na` in the 2026 snapshot, but the legacy metadata allows it. Display as-is; do not validate as `^\d{8}$`. |
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

MOE publishes per-school vacancies, applicants and balloting results per phase on moe.gov.sg each year. **Two different pages exist** (corrected 2026-10-10 from the archived MOE navigation links):
- Past per-school data, titled "2023 P1 Registration Exercise: Vacancies and balloting data": `https://www.moe.gov.sg/primary/p1-registration/past-vacancies-and-balloting-data`.
- `https://www.moe.gov.sg/primary/p1-registration/vacancies-and-balloting` is a different page, "Vacancies and balloting updates: 2023 P1 Registration Exercise" (Last Updated 04 Sep 2023). It carries live status during the exercise, not the archive table.

**No data.gov.sg dataset** was found for it. Treat as curated data scraped or keyed per exercise year, with source URL and retrieval date. UNVERIFIED that either URL path is unchanged in 2026.

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

- **Official definition** [PRIMARY-ARCHIVED, MOE page titled "Address used for registration" (URL `/primary/p1-registration/home-address`), Last Updated 03 Aug 2023], verbatim:
  > The HSD used will be the shortest distance from a point on the boundary around the school to the registrant's official residential address.
  So the reference is the **school's land boundary**, not a school centre point, and the result is a **category** (within 1 km / 1-2 km / outside 2 km), not a continuous number.
- **Home side.** 2026 property-analysis write-ups paraphrase MOE as "the shortest distance from the home building outline to the school boundary" (`evancjx/housing-estate-framework`, Aug-Sep 2026, citing `https://www.moe.gov.sg/primary/p1-registration/home-address`). Whether the home side is an address point or the building footprint polygon is **UNVERIFIED**. Either way, blocks of one project can fall into different categories.
- **Who computes it.** The MOE distance checker "contains information from the Singapore Land Authority's (SLA) School Query Service. Information is accurate as of May 2023 for the registration of children admitting to Primary 1 in 2024." [PRIMARY-ARCHIVED, `/distance` page, Last Updated 01 Feb 2024] ⇒ *Inference, not stated by MOE:* SLA refreshes the data **once per exercise year** (around May, before the July exercise). The once-a-year cadence is UNVERIFIED; it rests on this one sentence.
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
| Before 2022 (from 2014, UNVERIFIED start year) | 20 | 20 | Standard order (§2.1) | Phase 2C was "doubled to 40" from 2022 [SECONDARY: `wsgzao.github.io` post]. The 20/20 split, and the start year 2014 for reserved places (background knowledge, not re-checked this run), are UNVERIFIED. Do not label this row "up to 2021" without a start year: reserved places did not exist in every earlier year. |
| **2022 → 2026** (2023 → 2027 entry) | **20** | **40** | Standard order | [PRIMARY-ARCHIVED] MOE "Vacancies and balloting updates: 2023 P1 Registration Exercise" (Last Updated 04 Sep 2023), verbatim: "we are reserving 20 places in each primary school in Phase 2B and 40 places in each primary school in Phase 2C. This means a total of 60 reserved places will be set aside in all schools at the start of the P1 Registration Exercise." The same 20/40 figures are on "Understand how balloting works" (23 May 2023) and "Registration phases and key dates" (05 Jan 2024). **2026 exercise still had 40** [CORROBORATED]: the CNA standfirst of 10 Sep 2026 says 60 is "an increase from 40", and CNA reported 2026 Phase 2C results on 5 Aug 2026 ("Nearly half of all primary schools oversubscribed in Phase 2C"). The earlier per-school example (Princess Elizabeth Primary "drew 159 applicants for 40 places") could not be traced to a source: UNVERIFIED, do not reuse. |
| **2027 onwards** (2028 entry) | UNVERIFIED (commentators say places move "from Phase 2A and Phase 2B") | **60 at most schools** (up from 40) | Standard order at most schools; **two-track scheme at 12 schools** (below) | Announced **10 Sep 2026** [CORROBORATED: CNA RSS item + CNA follow-up + 2026 codebase + forum discussion] |

Other mechanics [PRIMARY-ARCHIVED, 2023-2024 pages]. **Corrected scope:** these are verified for the 2023 exercise and assumed for 2022-2026. They do **not** apply to "every year above". Before 2022 the post-2A split was different (background knowledge: half to 2B and half to 2C, with Phase 2A split into 2A(1)/2A(2); UNVERIFIED). Whether they survive the 2027 changes is UNVERIFIED.
- "At the end of Phase 2A, one-third of remaining places will be allocated to Phase 2B, and two-thirds to Phase 2C."
- "If there are vacancies left at the end of Phase 2B, the remaining places will be carried forward to Phase 2C."
- A cap on PR intake applies in Phases 2C and 2C Supplementary "in a few schools".
- Phase 2C is "for a child who is not yet registered in a primary school"; unsuccessful after Phase 2C Supplementary → "posted to a school with available vacancy".

**The 2027 change (announced 10 Sep 2026; first applies to the 2027 P1 Registration Exercise, for P1 entry in 2028):**
- CNA headline (10 Sep 2026; RSS feed item published 11:04 UTC = 19:04 SGT): "Primary 1 registration: More Phase 2C places from 2027, new two-track scheme at 12 schools". Standfirst: "Most primary schools will set aside 60 places for Phase 2C, an increase from 40." URL: `https://www.channelnewsasia.com/singapore/p1-registration-phase-2c-two-track-schools-6375426`. [Re-confirmed 2026-10-10 from the RSS archive JSON.]
- CNA follow-up (**11 Sep 2026**, RSS 13:29 UTC; title "'More than just a privilege': Increase in Phase 2C places draws mixed reactions from alumni parents"; `https://www.channelnewsasia.com/singapore/p1-registration-parents-alumni-phase-2a-6378766`), as summarised in the 12 Sep 2026 digest: "The Ministry of Education (MOE) announced that most primary schools will reserve 60 places for Phase 2C applicants from next year, up from 40. At 12 schools, mainly in Bukit Timah and some in Marine Parade, the Phase 2C places will be divided equally between applicants living within 2km and those living farther away. Families in either group will not receive priority based on exact home-to-school distance." The same digest quotes NUS Assoc Prof Vincent Chua that seats are being reallocated "from Phase 2A and Phase 2B". [Re-confirmed 2026-10-10.]
- Whether the 12 two-track schools also reserve 60 (rather than some other number) is UNVERIFIED: the sources say "most primary schools" reserve 60.
- Two-track details (from `hoyeehong/near-school`, Sept 2026, citing MOE `https://www.moe.gov.sg/primary/p1-registration/changes-to-p1-registration-framework`) [SECONDARY]:
  - "12 designated schools split Phase 2C places between homes within 2 km and beyond 2 km. There is no home-school distance priority within each track. This does not apply to all schools."
  - "Singapore Citizens in both tracks are considered before Permanent Residents. Places left after admitting Citizens in one track flow to Citizens in the other track."
  - The ≤2 km track covers both the official within-1km and 1-2km categories.
  - If such a school reserves 60 places, that is 30 + 30 (forum discussion, 28 Sep 2026) [SECONDARY; the 60 for these 12 schools is UNVERIFIED, see above].
- **The 12 two-track schools** [SECONDARY, single source `hoyeehong/near-school` `data/demo.ts`; consistent with CNA's "mainly Bukit Timah, some Marine Parade". **Verify every name against the MOE page before publishing.**]
  Bukit Timah / central group: Nanyang Primary School; Raffles Girls' Primary School; Methodist Girls' School (Primary); Pei Hwa Presbyterian Primary School; Singapore Chinese Girls' School (Primary) (MOE directory name: `SINGAPORE CHINESE GIRLS' PRIMARY SCHOOL`); Anglo-Chinese School (Primary); Anglo-Chinese School (Junior); St. Margaret's School (Primary).
  Marine Parade / east group: Tao Nan School; CHIJ (Katong) Primary; Ngee Ann Primary School; Tanjong Katong Primary School.
  *Check against the MOE directory (2026 snapshot):* all 12 names exist exactly as `school_name` values (SCGS under its directory name above). CNA's "mainly Bukit Timah, some Marine Parade" is a loose description, **not** the MOE `dgp_code`: the first group is `BUKIT TIMAH` ×4 (Nanyang, RGPS, MGS (Primary), Pei Hwa), `NOVENA` ×2 (SCGPS, ACS (Primary)) and `CENTRAL` ×2 (ACS (Junior), St. Margaret's (Primary)); the second is `MARINE PARADE` ×3 and `BEDOK` ×1 (CHIJ (Katong) Primary). Do not filter two-track schools by planning area; use the explicit list.
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
- Rate limiting: HTTP 429, or `json.code === 24` in the body (seen handled in `ElsonNg/CribCheck`, re-checked 2026-10-10). Back off **≥ 12 s** without a key (corrected from 11 s: the stricter of the two documented figures is the Download Dataset guide's "5 requests per minute", i.e. one call per 12 s; see datagov-api.md §2.2).
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
| Supermarket licences | `d_11edd0117280c5776651d7891114c88c` | List of Supermarket Licences | NEA per Jan 2025 metadata (`managedBy`, `sources`); "now SFA" is UNVERIFIED (1388) | CSV | | coverage **26 Jun 2016**; re-uploaded 2024-06-06 | no coords |
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
| Childcare | `d_5d668e3f544335f8028f546827b773b4` (GeoJSON), `d_b34f9bdbe99067eecb5d5f3be8187cfb` (KML) | Child Care Services | ECDA (2015; both IDs confirmed as children of collection 2015 in the Jan 2025 mirror) | GeoJSON | | both 2024-06-06 | Flat (UNVERIFIED) |
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

Properties (20, all flat): `OBJECTID` (num), `LANDXADDRESSPOINT`, `LANDYADDRESSPOINT` (SVY21), `ADDRESSBUILDINGNAME`, `ADDRESSPOSTALCODE` (metadata says NUMERIC, file holds a 6-char string), `ADDRESSSTREETNAME`, `DESCRIPTION` (e.g. upgrading programme), `NAME`, `PHOTOURL`, `ADDRESSBLOCKHOUSENUMBER`, `STATUS`, `AWARDED_DATE` (`dd/MM/yyyy` or null), `IMPLEMENTATION_DATE`, `INFO_ON_CO_LOCATORS`, `ADDRESS_MYENV`, `EST_ORIGINAL_COMPLETION_DATE` (**mixed formats** in the 2026 file: a year `"1983"`, a future year `"2027"`, or a date `"30/3/2022"` with no zero padding; parse leniently), `HUP_COMPLETION_DATE` (`dd/MM/yyyy` or null), `NUMBER_OF_COOKED_FOOD_STALLS` (int), `INC_CRC`, `FMEL_UPD_D`.

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

`d_0542d48f0991541706b58059381a6eca` "Parks" (points; "indicative Managed Areas of Parks which are under the purview of NParks"). Properties: `OBJECTID, NAME, X, Y, INC_CRC, FMEL_UPD_D` (X/Y = SVY21). 461 features in a July 2026 download, latest `FMEL_UPD_D` 20260703041208. Names are abbreviated and include playgrounds and open spaces: `PK` = park, `PG` = playground, `OS` = open space. **Corrected counts (recomputed from the same July 2026 file):** 26 names contain the word `PLAYGROUND` and a further 136 contain the abbreviation `PG` (134 end in ` PG`), so **162 of 461** are playground-type entries, not 26. 112 contain `PK`, 117 contain `PARK`, 17 end in `OS`. Examples: `NOVENA RISE PK`, `CARMICHAEL RD PG`, `HANDY RD OS`, `CONEY ISLAND PARK`. Filter or label by suffix.
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

`GET https://www.onemap.gov.sg/api/public/themesvc/retrieveTheme?queryName={QUERYNAME}[&extents=…]` with `Authorization: <token>` (see onemap-api.md §1.6 and §2.2; the first element of `SrchResults` is metadata; points have `LatLng: "lat,lng"`).
- The `extents` bbox format (`minLat,minLng,maxLat,maxLng` was stated here before) is **UNVERIFIED**; onemap-api.md also marks it UNVERIFIED. Filter by bbox client-side unless it is tested.
- Auth header: the only official sample with saved output for themes (SLA workshop notebook, May 2025) sends `Authorization: Bearer <token>`. onemap-api.md recommends the raw token. If the raw token gets 401 on `retrieveTheme`, retry once with the `Bearer ` prefix.
Relevant `QUERYNAME`s from a 2026 `getAllThemesInfo` dump (168 themes; `sanjeevr123/HomeCompass/onemap_all_themes_full.json`) with their `EXPIRY_DATE`:
`ssot_hawkercentres` (NEA, 31/12/2028; note: **not** the old `hawkercentre`, which is absent from the dump), `libraries` (NLB, 31/12/2028), `communityclubpassionwave` (PA, 31/12/2027), `communityclubs` (PA, expired 30/12/2022), `residentscommittee` (PA, 31/12/2027), `kindergartens` (ECDA, 31/12/2026), `childcare` (ECDA, 31/12/2026), `nationalparks` (NParks, **expired 31/03/2026**), `nparks_parks` (**expired 31/03/2026**), `park_connector_loop` (**expired 31/03/2026**), `moh_hospitals` (MOH, 31/12/2026), `vaccination_polyclinics` (MOH, 27/01/2029), `sportsg_sport_facilities` (expired 31/12/2024), `eldercare` (expired 31/12/2020).
- **Correction (2026-10-10):** the three NParks themes were listed above without an "expired" label, but 31/03/2026 is already past. Treat them as stale, like the other expired themes. `kindergartens`, `childcare` and `moh_hospitals` expire on 31/12/2026, less than three months from the research date. The dates come from a dump of unknown capture date, so re-read `getAllThemesInfo` live.
- No CHAS-clinic and no supermarket theme in that list.
- Themes past `EXPIRY_DATE` may still return data but should be treated as stale. Prefer data.gov.sg for ingestion; OneMap theme terms of use apply.

---

## 4. Government Land Sales (GLS) and en-bloc history

### 4.1 GLS: what exists

- **How GLS works** [PRIMARY-MIRROR, URA's own text in data.gov.sg collection 1669 description]: "URA acts as agent for the State in carrying out land sales for commercial, hotel and private residential developments… The release of state land is carried out through the Government Land Sales (GLS) programme. Each programme is planned for and announced every 6 months. The GLS sites are released through two main systems - the reserve list and the confirmed list."
- **Sellers:** URA (private residential, commercial, hotel, white sites), HDB (executive condominium and some private residential sites; results published as HDB news releases, e.g. `https://www.hdb.gov.sg/hdb-pulse/news/2026/final-tender-result-for-land-parcel-at-miltonia-close`, URL UNVERIFIED because hdb.gov.sg was not reachable this run), JTC (industrial sites, IGLS; JTC confirmed as `managedBy` of collection 287). [SECONDARY for the HDB part]
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
  - Half-yearly programme announcements and tender results are URA media releases at `https://www.ura.gov.sg/news/media/pr{YY}-{NN}/` with annex PDFs of all bids at `https://www.ura.gov.sg/-/media/Corporate/Media-Room/{YYYY}/{Mon}/pr{YY}-{NN}a.pdf` [SECONDARY, pattern from a 2026 report; UNVERIFIED, ura.gov.sg not reachable this run]. *Fact-check note:* the example given earlier (`pr24-40` with annex `pr24-37a.pdf`) contradicts the pattern, which puts the release number in the annex name. The two numbers must belong to two different releases. Do not derive annex URLs from release numbers; take the annex link from the release page.
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
10. (added 2026-10-10) Pre-2022 reserved-place history (20/20 from 2014; half/half post-2A split), and whether the 1/3 to 2B, 2/3 to 2C split still applies from 2027. Whether the 12 two-track schools reserve 60 Phase 2C places.
11. (added 2026-10-10) OneMap `retrieveTheme` `extents` format and Bearer vs raw token; the URA media-release annex URL pattern; the HDB Miltonia Close news URL; "now SFA" for the supermarket licence dataset; the SLA once-a-year refresh cadence.

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

---

## Verification log

Adversarial fact-check run on **2026-10-10**. The fetch tool could not reach `*.gov.sg`, `data.gov.sg`, `channelnewsasia.com` or `wikipedia.org` (DNS failure or proxy 403), and the web-search budget was already used up. Every check below re-read a **primary file or archived primary page from GitHub raw** and recomputed numbers locally. "Confirmed" means it matched that copy. It does not mean the live page was re-read. Where no copy could be found, the claim is marked unverifiable or UNVERIFIED.

Source keys used below:
- **CSV** = `seehiong/autonomous-hdb-deepagents@2a0df19…/db/init/data/sg_schools.csv`, 337 rows, recomputed with Python.
- **ARCH** = archived MOE page sources in `ISS-IntelligentSystem-GroupProject24PT/Intelligent-Reasoning-System@1bf28ea…` (`distance`, `understand_balloting`, `home_address`, `registration_phases_key_dates`, `vacancies_and_balloting`).
- **COLL** = `pradyuprasad/ask_sg_data@bc60974…/data/input/collections_metadata/*.json` (Jan 2025), 27 collection files.
- **META** = `jmbish04/sgd-hbd-data@215eb99…/datset_scaffolding/sg_dataset_schemas.json` (Dec 2025).
- **RSS** = `rumca-js/RSS-Link-Database-2026` CNA feed JSON for 2026-08-05, 2026-09-10 and 2026-09-11.
- **DIG** = `Joey111a1/Joey111a1.github.io` `daily-news/reports/2026/09/2026-09-12.html`.
- **NS** = `hoyeehong/near-school` `data/demo.ts`.

| # | Claim (section) | Verdict | Source / note |
|---|---|---|---|
| 1 | MOE dataset ID `d_688b934f…`, title, description, collection 457, CSV, created 2017-05-29T19:03:04, lastUpdated 2025-01-13T12:49:40, coverage 2025 (§1.1) | confirmed | COLL `School_Directory_and_Information.json` |
| 2 | 337 rows (§1.1) | confirmed | CSV row count |
| 3 | 31 MOE columns in the stated order; 2 extra project geometry columns (§1.3) | confirmed | CSV header |
| 4 | `"na"` = "Data not available or not applicable" (§1.3) | confirmed | legacy metadata `wilsonwid/cs3244-pg26@9965012…` |
| 5 | 335/337 addresses with trailing spaces (§1.3) | confirmed | CSV |
| 6 | 4 postal codes missing a leading zero, with the named schools (§1.3) | confirmed | CSV |
| 7 | `url_address` "mixed http/https" (§1.3) | **corrected** | CSV: 285 http, 43 https, 9 with no scheme |
| 8 | `telephone_no` "8 digits" (§1.3) | **corrected** | CSV: 10 rows not 8 digits (spaces, `+65`, "(Secondary)"); 0 `na` |
| 9 | 28 `dgp_code` values incl. `SENG KANG`, `TENGAH` (§1.3) | confirmed | CSV |
| 10 | zone/type/nature/session/mainlevel/SAP/autonomous/gifted/IP counts (§1.3) | confirmed | CSV, all sums = 337 |
| 11 | `mothertongue1_code` CHINESE for all; MT2 MALAY or na; MT3 TAMIL or na (§1.3) | confirmed | CSV (MT2: 311/26; MT3: 307/30) |
| 12 | Example row for Admiralty Primary (§1.3) | confirmed | CSV |
| 13 | Shared postal codes 599986 and 309437 (§1.4) | confirmed | CSV |
| 14 | 182 schools with a P1 intake = 179 + 3 named mixed-level (§1.4) | confirmed | CSV; `zainul1996/btoprojects` `docs/DATA_SOURCES.md` ("182 primary and P1-S4 mixed-level schools") |
| 15 | Other collection 457 datasets: IDs and "last updated June 2024" (§1.5) | confirmed | COLL (2024-06-07 / 2024-06-19) |
| 16 | CCA column `School_name` with capital S (§1.5) | unverifiable | no API output reachable; left as CORROBORATED by the original author |
| 17 | initiate/poll endpoints and GET method (§1.2) | confirmed (cross-ref) | consistent with datagov-api.md §3.3; `kangcodex` shows POST, which datagov-api.md already records as a variant |
| 18 | `datastore_search` 404 claim by kangcodex vs other use (§1.2) | confirmed as a conflict | `kangcodex/singapore-skills` `docs/api/HDB.md` says 404; seehiong `db/refresh_geodata.py` uses it for d_688b… |
| 19 | P1 vacancies page URL `/vacancies-and-balloting` = per-school data page (§1.6) | **corrected** | ARCH nav links: the data page is `/past-vacancies-and-balloting-data`; `/vacancies-and-balloting` is "Vacancies and balloting updates" (04 Sep 2023) |
| 20 | 6-tier priority order, verbatim, `/distance` Last Updated 01 Feb 2024 (§2.1) | confirmed | ARCH `distance` |
| 21 | Same order and balloting text on `/understand-balloting`, 23 May 2023 (§2.1) | confirmed | ARCH `understand_balloting` |
| 22 | HSD definition "shortest distance from a point on the boundary around the school…" (§2.2) | confirmed | ARCH `home_address`; page title is "Address used for registration" (title corrected) |
| 23 | SLA School Query Service, "accurate as of May 2023 … Primary 1 in 2024" (§2.2) | confirmed | ARCH `distance`; the "once per year" refresh is now labelled an inference |
| 24 | OneMap SchoolQuery URL `/school`; no public API (§2.2) | unverifiable | onemap.gov.sg not reachable; stays UNVERIFIED |
| 25 | NRIC address, 30 months from exercise start (4 Jul 2023), caregiver rule (balloted with 1-2 km group), new property ≤ 2 years with 30 months from move-in, resale by P1 start with 30 months from P1 start, documents (§2.3) | confirmed | ARCH `home_address` (03 Aug 2023) |
| 26 | Phase 2B community leaders only within 2 km plus 30-month rule (§2.3) | confirmed | ARCH `registration_phases_key_dates` (05 Jan 2024) |
| 27 | 20 (2B) / 40 (2C) / 60 total, verbatim quote (§2.4) | confirmed; attribution **corrected** | quote is from ARCH `vacancies_and_balloting` (04 Sep 2023); figures also on balloting and phases pages |
| 28 | 1/3 to 2B and 2/3 to 2C; carry-forward; PR cap "in a few schools"; posting after 2C Supplementary (§2.4) | confirmed for 2023; scope **corrected** | ARCH; the claim that these apply "in every year above" (incl. pre-2022) was wrong |
| 29 | "Up to 2021: 20/20" (§2.4) | **corrected** (relabelled) | "doubled to 40 from 2022" is consistent with the 2023 pages; the row now says before 2022 (from 2014, UNVERIFIED) |
| 30 | 2026 exercise still had 40 Phase 2C places (§2.4) | confirmed by another source | RSS: CNA 10 Sep 2026 standfirst "an increase from 40"; CNA 5 Aug 2026 2026 Phase 2C results item |
| 31 | Princess Elizabeth Primary "159 applicants for 40 places" (§2.4) | unverifiable | no source located; marked UNVERIFIED, do not reuse |
| 32 | CNA 10 Sep 2026 headline, standfirst and URL (§2.4) | confirmed | RSS 2026-09-10 (`date_published` 11:04:18 UTC) |
| 33 | CNA follow-up URL and date "11-12 Sep" (§2.4) | **corrected** to 11 Sep 2026 (13:29 UTC) with exact title | RSS 2026-09-11 |
| 34 | "12 schools, mainly Bukit Timah, some Marine Parade … divided equally … no priority by exact distance" (§2.4) | confirmed | DIG (summary of the CNA follow-up) |
| 35 | Places move "from Phase 2A and Phase 2B" (§2.4) | confirmed as commentary | DIG quoting NUS Assoc Prof Vincent Chua; not an MOE statement |
| 36 | Applies from the 2027 exercise for 2028 entry (§2.4) | confirmed | NS policy text; CNA headline "from 2027"; DIG "from next year" (written Sep 2026) |
| 37 | Two-track quotes (no HSD priority within a track; SC before PR; leftover SC flow across tracks) (§2.4) | confirmed as quoted | NS `policies[]` text, citing MOE `changes-to-p1-registration-framework` (MOE page itself unreadable) |
| 38 | List of the 12 schools (§2.4) | confirmed as quoted; names exist in the MOE CSV | NS `demoPlaces` with `twoTrackFrom: 2027`; still a single non-government source, so UNVERIFIED against MOE |
| 39 | Grouping "Bukit Timah side / Marine Parade side" (§2.4) | **corrected** (clarified) | CSV `dgp_code`: 4 BUKIT TIMAH, 2 NOVENA, 2 CENTRAL, 3 MARINE PARADE, 1 BEDOK |
| 40 | 30 + 30 split (§2.4) | arithmetic ok; premise UNVERIFIED | 60 / 2 = 30, but 60 for those 12 schools is not confirmed |
| 41 | HDB Existing Building `d_16b157c5…` polygons (§2.5) | confirmed | META (props incl. `SHAPE.AREA`) |
| 42 | MP2025 land use `d_a8c3546b…` with `LU_DESC` (§2.5) | confirmed (cross-ref only) | matches datagov-api.md §5; not independently re-fetched |
| 43 | Poll-only download for GeoJSON/KML (§3.0) | confirmed (cross-ref) | datagov-api.md §3.3 quotes the official guide |
| 44 | Back off ≥ 11 s without a key (§3.0) | **corrected** to ≥ 12 s | datagov-api.md §2.2 ("5 requests per minute") |
| 45 | `code === 24` handling in CribCheck (§3.0) | confirmed | `ElsonNg/CribCheck` `scripts/refresh-supermarkets.mjs` line 40 |
| 46 | Dataset IDs, names, collections, agencies and formats in the §3.1 table | confirmed (except the two IDs in row 76) | COLL (27 files) and META; every ID checked matched its stated collection; MRT exit and bus stop IDs via the homelens manifest |
| 47 | Childcare GeoJSON collection "UNVERIFIED" (§3.1) | **corrected** → collection 2015 | COLL `Child_Care_Services.json` |
| 48 | Supermarket licences "NEA, now SFA" (§3.1) | **corrected** (qualified) | COLL `managedBy`/`sources` = NEA (Jan 2025); "now SFA" UNVERIFIED |
| 49 | lastUpdated dates in §3.1 (2025-12-05, 2025-11-13, 2025-11-12, 2025-11-08, 2025-01-14, 2024-11-25, 2024-06-06) | confirmed | META (Dec 2025) / COLL (Jan 2025) |
| 50 | Hawker 129 features, 20 props, STATUS counts, sample feature, 140,459 bytes = `datasetSize` (§3.1, §3.2) | confirmed | `minghao51/egg-n-bacon-housing@f1c09a0…` file + META; `hamburtab/homelens-sg` manifest (14 Jul 2026); btoprojects (4 Aug 2026) |
| 51 | `EST_ORIGINAL_COMPLETION_DATE` e.g. "1983" (§3.2) | **corrected** (expanded) | same file: mixed formats ("1983", "2027", "30/3/2022") |
| 52 | Parks 461 points, props, latest FMEL 20260703041208, NOVENA RISE PK sample, named examples (§3.4) | confirmed | `hamburtab/homelens-sg` `parks.geojson` + manifest |
| 53 | "26 names contain PLAYGROUND/PG" (§3.4) | **corrected** | recomputed: 26 PLAYGROUND + 136 PG = 162 |
| 54 | Parks polygons 461 (Aug 2026), props `OBJECTID_1 … SHAPE_1.LEN` (§3.1, §3.4) | confirmed | btoprojects (4 Aug 2026); META |
| 55 | Park Facilities props (§3.4) | confirmed | META |
| 56 | MRT exits 597 (Jul) / 613 (Aug 2026); bus stops 5,166 (Jul) / 5,205 (Sep) (§3.1) | confirmed | homelens manifest; btoprojects; `minghao51` `docs/plans/2026-09-01-pipeline-refresh-handoff.md`; bernardinolintang README |
| 57 | CHAS 1,193 (Sep 2026), ~1.6 MB, KML-style `Name`/`Description` (§3.1, §3.5) | confirmed | minghao51 handoff; `Bread04/DataBricks-Challenge-` `DATASETS.md` (28 Sep 2026) |
| 58 | CHAS `Description` key `HCI_NAME` and the `kml_<n>` placeholder (§3.5) | confirmed | minghao51 `geojson.py`; full key list not re-checked |
| 59 | Community clubs 128; SportSG 45; park connector 1,177 lines (§3.1) | confirmed | minghao51 handoff; bernardinolintang README |
| 60 | SportSG flat props since late 2025 (§3.1) | confirmed | META (`VENUE`, `POSTAL_CODE`, …, 2025-11-13) |
| 61 | KML-style for NEA Market & Food Centre, Supermarkets, Eldercare, IGLS; Kindergartens flat (§3.1) | confirmed | META `geoJsonMetadata.properties` |
| 62 | Supermarket GeoJSON/KML `DATASET_DOES_NOT_EXIST` on 4 Aug 2026; collection 1451 empty (§3.3) | confirmed as reported | btoprojects `DATA_SOURCES.md` (secondary; not re-tested live) |
| 63 | Licence CSV used by CribCheck and shenghaoc (§3.3) | confirmed | CribCheck script; `shenghaoc/hdb-resale-visualizer` `constants.ts` (`SFA_SUPERMARKET_DATASET_ID = d_11edd…`) |
| 64 | Licence CSV columns and example row (§3.3) | unverifiable this run | not re-fetched; left as CORROBORATED |
| 65 | 168 OneMap themes; QUERYNAMEs, owners and expiry dates (§3.8) | confirmed | `sanjeevr123/HomeCompass` `onemap_all_themes_full.json` |
| 66 | NParks themes shown as current (§3.8) | **corrected** | expiry 31/03/2026 is before 2026-10-10, so they are expired |
| 67 | No CHAS or supermarket theme (§3.8) | confirmed | same dump (only `vaccination_polyclinics` and `moh_hospitals` match clinic/health) |
| 68 | `retrieveTheme` `extents` format and raw token header (§3.8) | **corrected** to UNVERIFIED and qualified | onemap-api.md §1.6/§2.2 |
| 69 | URA GLS text quote, collection 1669 (§4.1) | confirmed | COLL `Vacant_Sites_Sold_By_URA.json` |
| 70 | URA Sale Sites IDs, collection 1855, "from year 1967" text, 2024-06-06 (§4.1) | confirmed | COLL `URA_Sale_Sites.json` |
| 71 | Vacant Sites coverage 31 Aug 1992 to 28 Apr 2016; Conservation Sites 1987-2007, collection 1640; IGLS collection 287, half_year, JTC (§4.1) | confirmed | COLL |
| 72 | URA media-release and annex URL pattern and example (§4.1) | **corrected** (example inconsistent) and UNVERIFIED | `pr24-40` vs `pr24-37a` contradicts the stated pattern |
| 73 | HDB Miltonia Close news URL; URA GLS map URL (§4.1) | unverifiable | gov.sg hosts unreachable |
| 74 | URA 273 collections / 509 datasets; HDB 52 / 104; no collective-sale dataset; SERS `d_741b128b…`, collection 146 (§4.2) | confirmed | `kangcodex/singapore-skills@9e175f2…` `docs/api/URA.md`, `HDB.md` |
| 75 | Strata Titles Boards under the Ministry of Law; no public list (§4.2) | unverifiable this run | background knowledge only; publication question left UNVERIFIED |
| 76 | `d_e4663ad3…` (health facility counts) and `d_34ba4c6d…` (supermarket counts 1993-2014) are not location data (§3.1) | unverifiable this run | no mirror found |
| 77 | Worked arithmetic: 20 + 40 = 60; 179 + 3 = 182; all enum sums = 337; hawker statuses sum to 129; 60 / 2 = 30 | confirmed | recomputed |
