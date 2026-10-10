# OneMap (Singapore Land Authority) APIs: research notes for engineers

Research date: **2026-10-10**. Scope: Search API, authentication and token flow, basemap tiles and attribution, and how to geocode HDB blocks reliably, including how the abbreviations in HDB `street_name` map to full road names.

## 0. How these facts were sourced (read this first)

- **Primary hosts could not be fetched directly.** This container's `curl` gets a proxy 403 on `www.onemap.gov.sg`. The research fetch tool hit `getaddrinfo ENOTFOUND` on `onemap.gov.sg`, `docs.onemap.sg` and `discuss.onemap.sg`. Every primary URL below is therefore cited *by reference*. The fact itself comes from one of these sources:
  1. **Verbatim extracts of official OneMap material** that third parties captured from the live site in Aug–Oct 2026:
     - text extracted from the official API docs bundle `https://www.onemap.gov.sg/apidocs/static/js/main.4c62b5c1.js`;
     - the official attribution snippet `https://www.onemap.gov.sg/docs/maps/resources/code-attr.txt`;
     - live API responses saved as test fixtures.
  2. **SLA's own workshop material**: the notebook from the SLA OneMap Workshop of 28 May 2025, published by the workshop presenter, and the OneMap workshop deck dated 26 Aug 2025. The deck is hosted on onemap.gov.sg; I saw it through search snippets only.
  3. Corroborating third-party code and blog posts. These are marked as such.
- Confidence labels used below:
  - **[VERIFIED-OFFICIAL-TEXT]**: verbatim official text or official sample, captured by a third party.
  - **[VERIFIED-LIVE]**: a real API response captured in 2026.
  - **[CORROBORATED]**: several independent implementations agree, but no official text was seen.
  - **UNVERIFIED**: my best understanding only.
- Base host for everything: `https://www.onemap.gov.sg`. The legacy hosts `developers.onemap.sg` (`/commonapi/...`, `/privateapi/...`) and `docs.onemap.sg` are the old OneMap 2.0 API and docs. **Do not use them.** The new API docs date from about mid-2023: the official getToken sample's `expiry_timestamp` `1689388144` is 2023-07-15 02:29 UTC. Third-party clients were still migrating in 2024. The old `LONGTITUDE` (sic) field was dropped in the new API. Source: https://github.com/methylDragon/onemapsg-api-client/pull/3 (PR opened 2024-04-19, still unmerged; its README diff replaces the old sample's `'LONGTITUDE'` line with a single `'LONGITUDE'` key and says the `developers.onemap.sg` endpoints "have been deprecated").

---

## 1. Search API (geocoding)

### 1.1 Endpoint and parameters [VERIFIED-OFFICIAL-TEXT]

```
GET https://www.onemap.gov.sg/api/common/elastic/search?searchVal={q}&returnGeom={Y|N}&getAddrDetails={Y|N}&pageNum={n}
```

| Param | Type | Required | Official description (verbatim from docs bundle) |
|---|---|---|---|
| `searchVal` | string | **Required** | "Keywords entered by users to filter the results" (postal code, address, building or street name) |
| `returnGeom` | string | **Required** | "Values: Y, N . Enter Y if user wants the geometry value returned." |
| `getAddrDetails` | string | **Required** | "Values: Y, N . Enter Y if user wants address details returned." |
| `pageNum` | integer | optional (no "Required" label) | Page number. Default 1. |

- Official sample request: `/api/common/elastic/search?searchVal=200640&returnGeom=Y&getAddrDetails=Y&pageNum=1`
- Docs page: https://www.onemap.gov.sg/apidocs/search
- Captured docs-bundle text: https://raw.githubusercontent.com/hongyime/sgSHIOK2026/HEAD/qa/verification/P64-onemap-enumeration-feasibility.md and https://raw.githubusercontent.com/hongyime/sgSHIOK2026/HEAD/qa/verification/P203-onemap-candidate-controls.md (P203 dated 2026-08-21).
- The SLA workshop notebook (28 May 2025) documents the same four params, with `pageNum` optional and default 1: https://github.com/andikasun/onemap-workshop-may-2025

### 1.2 Token requirement (CHANGED in 2025–2026)

- **Official docs banner** [VERIFIED-OFFICIAL-TEXT, present by 2026-08-21 and still shown on 2026-10-02]: "**IMPORTANT: Search API now requires token-based authentication.** Register your token to ensure uninterrupted service." It links to https://www.onemap.gov.sg/apidocs/register.
- **OneMap workshop deck dated 26 Aug 2025**: "token is needed for all endpoints except basemaps and staticmap api". Source (search snippet only): https://www.onemap.gov.sg/apidocs/static/media/OneMap_API_Workshop_Demo_260825.6522ddef4affd370a81a.pdf
- **Actual behaviour as of 2026-10-01 to 2026-10-03** [VERIFIED-LIVE]: a request with **no** token still returns **HTTP 200 with results and CORS `*`**, plus a top-level `error` string:
  `"Authentication token missing. Please create an account and generate or renew your API Token."`
  Fixtures: https://github.com/WeeJC8954/sg-smart-commute/tree/main/test/fixtures/onemap (captured 2026-10-01). See also https://github.com/anselmlong/massgowhere/pull/42 (2026-10-03).
  - The `error` field is not always present on tokenless replies. An earlier tokenless probe (sgSHIOK2026 `P64`, before 2026-08-21) got `searchVal=521400` back with keys `found, pageNum, results, totalNumPages` only, and no `error`. Never use "no `error`" as proof that a token was accepted.
  - massgowhere PR #42 (2026-10-03) found that a token OneMap **rejected** produced an `error` with **no results**, while the same query **without** a token still returned results. A bad token can be worse than no token. Refresh the token; never cache such an answer as "not found".
- **Enforcement date: UNVERIFIED.** No official date was found for when tokenless search stops working. **Build with a token from day one.** Treat the tokenless path as deprecated and liable to break without notice.
- **Expired token on Search** [VERIFIED-OFFICIAL-TEXT, docs sample, "Response (200 OK)"]: you get **no results**:
  ```json
  { "error": "Authentication token expired. Tokens is valid for 3 days. Please implement automatic renewal to ensure your token remains valid.",
    "found": 0, "totalNumPages": 0, "pageNum": 0, "results": [] }
  ```
- **Invalid token**: the docs have a "3. Invalid Token" section. Its exact text was not captured. Third-party tests use `"Invalid authentication token. Please register for an account and provide a valid API token."` (https://github.com/rbrishi15/booking-web-manager, `tests/lib/venues/onemap.test.ts`). **UNVERIFIED** as verbatim.
- ⇒ **An auth failure arrives as HTTP 200 with an `error` field, not as a 401.** Always check `error` before trusting `results`.

### 1.3 Response JSON [VERIFIED-OFFICIAL-TEXT + VERIFIED-LIVE]

This is the official docs sample response. The only change is that `\n` escapes are rendered as line breaks:

```json
{
  "found": 1,
  "totalNumPages": 1,
  "pageNum": 1,
  "results": [
    {
      "SEARCHVAL": "640 ROWELL ROAD SINGAPORE 200640",
      "BLK_NO": "640",
      "ROAD_NAME": "ROWELL ROAD",
      "BUILDING": "NIL",
      "ADDRESS": "640 ROWELL ROAD SINGAPORE 200640",
      "POSTAL": "200640",
      "X": "30381.1007417506",
      "Y": "32195.1006872542",
      "LATITUDE": "1.30743547948389",
      "LONGITUDE": "103.854713903431"
    }
  ]
}
```

Live HDB example (captured 2026-10-01, query `123 Ang Mo Kio Avenue 6`, no token). It shows the **multiple-result** pitfall:

```json
{
  "error": "Authentication token missing. Please create an account and generate or renew your API Token.",
  "found": 2, "totalNumPages": 1, "pageNum": 1,
  "results": [
    { "SEARCHVAL": "123 ANG MO KIO AVENUE 6 SINGAPORE 560123", "BLK_NO": "123", "ROAD_NAME": "ANG MO KIO AVENUE 6",
      "BUILDING": "NIL", "ADDRESS": "123 ANG MO KIO AVENUE 6 SINGAPORE 560123", "POSTAL": "560123",
      "X": "29278.38836463168", "Y": "39166.36539972574", "LATITUDE": "1.370481187931938", "LONGITUDE": "103.8448058007904" },
    { "SEARCHVAL": "ASIAN WOMEN'S WELFARE ASSOCIATION COMMUNITY HOME FOR SENIOR CITIZENS", "BLK_NO": "123",
      "ROAD_NAME": "ANG MO KIO AVENUE 6", "BUILDING": "ASIAN WOMEN'S WELFARE ASSOCIATION COMMUNITY HOME FOR SENIOR CITIZENS",
      "ADDRESS": "123 ANG MO KIO AVENUE 6 ASIAN WOMEN'S WELFARE ASSOCIATION COMMUNITY HOME FOR SENIOR CITIZENS",
      "POSTAL": "NIL", "X": "29261.30605292972", "Y": "39169.60924980976", "LATITUDE": "1.370510524887771", "LONGITUDE": "103.8446523042996" }
  ]
}
```

Field rules for code:

| Field | Type in JSON | Notes |
|---|---|---|
| `found` | number | Total hits across all pages. |
| `totalNumPages` | number | `0` when `found` is 0. |
| `pageNum` | number | Can be `1` **or** `0` when `found` is 0. The tokenless fixture had 1; the docs' expired-token sample has 0. Do not assert on it. |
| `results` | array | **Max 10 per page.** Observed `found: 392` with `totalNumPages: 40` and `results.length: 10` [VERIFIED-LIVE]. |
| `error` | string, optional | Present on auth problems. It **may coexist with valid results** in the tokenless case. |
| `SEARCHVAL` | string | Display label. For a POI this is the POI name, not the address. |
| `BLK_NO` | string | Can be `""` (empty) for POIs such as MRT exits. Can include a suffix, e.g. `"138C"`. |
| `ROAD_NAME` | string | **Full words**, e.g. `"ANG MO KIO AVENUE 6"`. `"NIL"` when absent. |
| `BUILDING` | string | `"NIL"` when absent. |
| `ADDRESS` | string | Usually `"<BLK> <ROAD> [<BUILDING>] SINGAPORE <POSTAL>"`. Can omit "SINGAPORE <postal>" for POIs. |
| `POSTAL` | string | 6 digits **with leading zeros kept** (e.g. `"098585"`), or `"NIL"`. Never parse as a number. |
| `X`, `Y` | string | SVY21 (EPSG:3414) metres. Parse with `parseFloat`. |
| `LATITUDE`, `LONGITUDE` | string | WGS84. Parse with `parseFloat`. The new API has **no** `LONGTITUDE` (the old API had that typo). |

- With `getAddrDetails=N`, the address fields (`BLK_NO`, `ROAD_NAME`, `BUILDING`, `ADDRESS`, `POSTAL`) are omitted. The pre-2023 API sample shows this (https://raw.githubusercontent.com/sheshbabu/Blog/HEAD/source/_posts/exploring-singapore-onemap-api.md). [CORROBORATED for the old API] For the new API, a live probe on 2026-10-03 (`searchVal=VivoCity&returnGeom=Y&getAddrDetails=N`, tokenless, `found: 2`) returned exactly **565 bytes**. That is the byte count of the same two results re-serialised with only `SEARCHVAL, X, Y, LATITUDE, LONGITUDE`; the full `getAddrDetails=Y` fixture is 961 bytes. (sg-smart-commute `docs/probe-output/map-probes.txt` vs `test/fixtures/onemap/mall-vivocity.json`.) [CORROBORATED for the new API by byte count; the body itself was truncated in the log]
- With `returnGeom=N`, the geometry fields (`X`, `Y`, `LATITUDE`, `LONGITUDE`) are presumably omitted. This follows the docs wording, but **no captured sample confirms it (UNVERIFIED)**. Code should not depend on either flag's omission behaviour.
- **For HDB geocoding always send `returnGeom=Y&getAddrDetails=Y`**, because you need `BLK_NO` and `ROAD_NAME` to validate the match.

### 1.4 Rate limits

- **Official docs text** [VERIFIED-OFFICIAL-TEXT, captured 2026-08-21]: "Users onboard the token-based authentication will have a higher API call limit capped at **250**; and further request for higher limits can be discussed on a case-by-case basis." Interested parties can email `onemap@sla.gov.sg`.
- **The unit is UNVERIFIED in the captured snippet.** The docs sentence names no time window. A OneMap staff answer on the community forum (~2017) gives it as "up to **250 requests per minute** for your registered OneMap API Account". That limit was not tied to an IP. Source: https://discuss.onemap.sg/t/maximum-number-of-request/100 (via search snippet only; the host could not be fetched on 2026-10-10, so this is **UNVERIFIED**). One third-party notebook says "300 calls per minute" without a source (XiyanM/resaleradar `04_geospatial_features.ipynb`). Treat that figure as unsupported. ⇒ **Assume 250 calls/minute per token, and stay well below it.**
- Search docs list only "429 - API limit exceeded". The API Terms of Service give no number (checked 2026-10-02 by https://raw.githubusercontent.com/WeeJC8954/sg-smart-commute/HEAD/docs/data-sources.md).
- **Tokenless traffic is throttled much harder** [VERIFIED-LIVE, 2026-10-02, sg-smart-commute]: 429 after 2–3 calls within about 1.5 s. Low-specificity queries (`"1"`, `""`, `"*"`) got an **immediate 429** [VERIFIED-LIVE, sgSHIOK2026 `P64`].
- **429 response shape** [VERIFIED-LIVE]:
  - `Content-Type: text/html; charset=utf-8`, so the body is not JSON.
  - No `Retry-After` header, no rate-limit headers, and **no `Access-Control-Allow-Origin`**. A browser cannot read it and sees `TypeError: Failed to fetch`.
  - The body says "Too Many Requests … Please try again to visit for a few minutes".
- Successful responses carry no rate-limit headers.
- Batch experience: one project queried 9,712 unique HDB block/street pairs sequentially, with a token and a 0.25 s sleep between calls (https://github.com/XiyanM/resaleradar, `notebooks/04_geospatial_features.ipynb`, committed 2026-09-20).
  - First pass: 9,617 pairs returned at least one result. 95 returned nothing after 3 tries. Its "failure" count lumps empty results and exceptions together, so it does not report transport failures separately.
  - It then expanded abbreviations and retried. All 95 returned at least one result.
  - **"Success" there means `found > 0`.** It took `results[0]` without checking `BLK_NO` or `ROAD_NAME`, so these counts say nothing about match accuracy.
  - Its query was `"{block} {street_name} SINGAPORE"`, with " SINGAPORE" appended and no comma.
- **Recommendation for our ingest job:**
  - Run **sequentially at ≤ 3 req/s (≤ 180/min)** with a token.
  - On a 429, or on a non-JSON body, pause 60 s and then back off exponentially.
  - Never parallelise.
  - Cache results permanently, keyed by `block|street_name`, and only geocode new keys.

### 1.5 Search behaviour pitfalls [VERIFIED-LIVE / CORROBORATED]

- **Typo tolerance: UNVERIFIED.** No captured test covers misspelled queries. Do not rely on fuzzy matching, and do not assume it is absent.
- **A `Blk`/`Block` prefix can break the search.** `Blk 123 Ang Mo Kio Ave 6` returned `found: 0` (tokenless), while `123 Ang Mo Kio Avenue 6` returned an exact hit (https://raw.githubusercontent.com/WeeJC8954/sg-smart-commute/HEAD/docs/api-feasibility.md, 2026-10-01; fixture `hdb-blk-raw.json`). It does not always fail. With a token, `BLK 1 BEDOK NORTH AVE 4` returned `found: 2`, though those results were not checked (PropertyLens `raw_data_collection.ipynb`, cell 28). Strip the prefix either way.
- **Common abbreviations usually work; rare ones do not.** `201 Tampines St 21` resolved exactly (sg-smart-commute). In the 9,712-pair resaleradar run, the unexpanded HDB `street_name` returned results for 9,617 pairs.
  - 95 pairs returned nothing. The 10 failures the notebook prints use `C'WEALTH`, `PK`, `MKT` and `ST. GEORGE'S`.
  - Only 93 of the 9,712 pairs contain those tokens (recomputed from the repo's `data/raw/hdb_resale_transactions.csv`). So at least 2 of the 95 failed for another, unshown reason.
  - All 95 returned at least one result after expansion. Those results were not validated (XiyanM/resaleradar, 2026).
- **A ", Singapore" suffix can produce 0 results.** With a valid token, `174 ANG MO KIO AVE 4` gave `found=1` and `174 ANG MO KIO AVE 4, Singapore` gave `found=0` (https://github.com/cloudriver-yc/PropertyLens, `SystemCode/notebooks/01_data_layer/pipelines/raw_data_collection.ipynb`, cell 28). A plain " SINGAPORE" suffix with no comma did return results in the resaleradar run. Still, do not append either form.
- **The top result may be the wrong block or the wrong road.** From a real geocoded resale sample that took `results[0]` blindly (https://raw.githubusercontent.com/akuaku/singapore-property-prediction/HEAD/hdb_geocoded.csv.bak):

  | Queried block / street | OneMap `results[0]` |
  |---|---|
  | `412 C'WEALTH AVE WEST` | `412 BEDOK NORTH AVENUE 2` (wrong town) |
  | `50 C'WEALTH DR` | `50 BERWICK DRIVE` |
  | `83 C'WEALTH CL` | `CHESTNUT CLOSE PARK` |
  | `104 SPOTTISWOODE PK RD` | `18 SPOTTISWOODE PARK ROAD` |
  | `15 FARRER PK RD` | `FARRER PARK MRT STATION` |
  | `8 LOR 7 TOA PAYOH` | `7 LORONG 8 TOA PAYOH FIRST TOA PAYOH PRIMARY SCHOOL` |
  | `14 ST. GEORGE'S RD` | `4C ST. GEORGE'S LANE HDB PUBLIC SHELTERS` |

  That project's exact query strings are unknown; the failure mode is what matters. ⇒ **Always validate `BLK_NO` and `ROAD_NAME`** (section 4).
- **Same block, several results.** A block can return the residential block itself plus tenant POIs that share the block and road: childcare centres, RCs, welfare homes, MSCPs. These often have `POSTAL: "NIL"` or a different `SEARCHVAL`.
- `BUILDING` cannot prove residential identity. Some first hits are institutional or tenant labels (https://github.com/shenghaoc/hdb-resale-qt, `docs/coverage/onemap/historical/README.md`, 2026-10-03).
- The search is not an enumeration API: `searchVal=Singapore` gives only 392 hits.

### 1.6 Reverse geocode, routing, themes and other APIs (all need a token)

The token requirement comes from the 26 Aug 2025 workshop deck (search snippet only, **UNVERIFIED**), which says a token is needed for everything except basemaps and the static map. The official docs bundle agrees: its token tutorial says "The OneMap API requires a valid access token for each API request", and the getToken text says "The token is not required for the map services" (captured by sgSHIOK2026 `P64`/`P203`). Observed live, 2026-10-01: `GET /api/public/revgeocode` without a token returns **HTTP 401 `{"message":"Unauthorized"}`** with CORS `*`. Routing without a token also returns **401** (sg-smart-commute docs).

Request and response details below come from the SLA workshop notebook (28 May 2025, https://github.com/andikasun/onemap-workshop-may-2025) [VERIFIED-OFFICIAL-TEXT for params and sample output, except where a cell says otherwise]. The notebook only exercises routing with `routeType=pt` and `mode=TRANSIT`. The other `routeType` and `mode` values listed below are **not** in the notebook and are **UNVERIFIED** here:

| API | Endpoint | Params | Response (key fields) |
|---|---|---|---|
| Reverse geocode (WGS84) | `GET /api/public/revgeocode` | `location=lat,lng` (required); `buffer` 0–500 m; `addressType=HDB\|All` (default All); `otherFeatures=Y\|N` (default N) | `{"GeocodeInfo":[{"BUILDINGNAME","BLOCK","ROAD","POSTALCODE","XCOORD","YCOORD","LATITUDE","LONGITUDE"}]}` |
| Reverse geocode (SVY21) | `GET /api/public/revgeocodexy` | `location=X,Y` plus the same optional params | same shape [CORROBORATED]. The docs bundle has a `"page_section":"revgeocodexy"` entry (sgSHIOK2026 P64); params and shape not re-checked |
| Routing | `GET /api/public/routingsvc/route` | `start=lat,lng`, `end=lat,lng`, `routeType=walk\|drive\|cycle\|pt`. For `pt` also: `date=MM-DD-YYYY`, `time=HH:MM:SS`, `mode=TRANSIT\|BUS\|RAIL`, `maxWalkDistance` (m), `numItineraries` | `pt`: `{requestParameters, plan:{itineraries:[{duration,walkTime,transitTime,waitingTime,walkDistance,transfers,fare,legs:[{mode,legGeometry:{points}}…]}]}}` with Google-encoded polylines at precision 5. walk/drive/cycle: `route_geometry`, `route_instructions`, `route_summary.total_time` (s), `route_summary.total_distance` (m) [CORROBORATED] |
| Themes: list | `GET /api/public/themesvc/getAllThemesInfo?moreInfo=Y` | | `{"Theme_Names":[{"THEMENAME","QUERYNAME","ICON","EXPIRY_DATE","PUBLISHED_DATE","CATEGORY","THEME_OWNER"}]}` |
| Themes: data | `GET /api/public/themesvc/retrieveTheme?queryName={QUERYNAME}` | optional `extents` (bbox; format UNVERIFIED) | `{"SrchResults":[{FeatCount,Theme_Name,…},{NAME,DESCRIPTION,ADDRESSPOSTALCODE,ADDRESSSTREETNAME,…,"Type":"Point","LatLng":"1.39,103.74"}]}`. **The first element is metadata.** |
| Planning area of a point | `GET /api/public/popapi/getPlanningarea?latitude=&longitude=` | `year` optional (UNVERIFIED) | `[{"pln_area_n":"TAMPINES"}]` [CORROBORATED, bettersg/SchemesSG_v3 `backend/scheme-processor/app/clients/onemap.py`, which sends the raw token and reads `pa_data[0]["pln_area_n"]`] |
| Coordinate convert | `GET /api/common/convert/4326to3414?latitude=&longitude=`, `3414to4326?X=&Y=`, plus `4326to3857`, `3857to4326`, `3414to3857`, `3857to3414` | | [CORROBORATED by the original author; no source named and **not re-checked on 2026-10-10 (UNVERIFIED)**] |
| Static map (token **not** required) | `GET /api/staticmap/getStaticImage?layerchosen=default&latitude=&longitude=&zoom=17&width=400&height=400` | `layerchosen` default/night/grey/original/landlot; zoom 11–19; width/height 128–512 px (limits **UNVERIFIED**); optional `points=[lat,lng,"r,g,b"]`. The endpoint path, the `layerchosen` values and the `points` syntax are also **UNVERIFIED**: no capture was checked on 2026-10-10 | PNG |

---

## 2. Token / auth flow

### 2.1 getToken [VERIFIED-OFFICIAL-TEXT]

```
POST https://www.onemap.gov.sg/api/auth/post/getToken
Content-Type: application/json

{ "email": "you@example.com", "password": "your-onemap-password" }
```

Official sample response (docs bundle):

```json
{ "access_token": "***********************", "expiry_timestamp": "1689388144" }
```

Official docs text (verbatim):

- "This API authenticates users' credentials (email and password) as a POST request body to generate an access token. *The token is not required for the map services.*"
- "Each token is valid for **3 days**. Its expiry timestamp is in **UNIX format**. When it expires, the user needs to re-authenticate with the same credentials. **The token does not auto renew when it expires.**"
- "Developers are strongly encourage to securely store sensitive data such as API keys and passwords in your application. Do not pass the authentication data in plain text."
- There is a tutorial: "Managing and Refreshing OneMap Token Validity in NodeJS". It says "tokens need to be refreshed every 72 hours" and is "based on snippet built on **Next.JS** … We setup a middleware proxy which will take care of calling OneMap API and refreshing the token in a single location."

Details:

- **Token format**: an RS256-signed JWT, per the 26 Aug 2025 workshop deck. This is **UNVERIFIED**: it was seen in a search snippet only. A real token in PropertyLens was 572 characters long, which fits a JWT. Treat the token as an opaque string anyway.
- **`expiry_timestamp`** is a **string of Unix seconds**, e.g. `"1689388144"`. Convert with `Number(x) * 1000` before comparing to `Date.now()`. [CORROBORATED by several clients]
- **Registration**: https://www.onemap.gov.sg/apidocs/register. The docs banner links to `/apidocs/register`. The workshop notebook also points there. The email-confirmation and password-setting steps are **UNVERIFIED**.
- **Docs pages**: https://www.onemap.gov.sg/apidocs/authentication (token exemption for map services), https://www.onemap.gov.sg/apidocs/routing. These exact paths are **UNVERIFIED**. `/apidocs/search` and `/apidocs/register` are verified.

### 2.2 Sending the token

- **Docs sample** for Search [CORROBORATED]: https://github.com/technicalassessments/mk-fe `scrap.js` carries a copy that uses the official sample URL (`searchVal=200640…`). It is in **transpiled** form, `'Authorization': "".concat(authToken)`, which is what a compiler emits for `` `${authToken}` ``. This is the **raw token, with no `Bearer ` prefix**. The official source text itself was not captured.
- The SLA workshop notebook (May 2025) also sends the raw token for Search. It sends `Authorization: Bearer <token>` for revgeocode, routing and themes. **Only the `Bearer` cells have saved outputs.** The Search cell was never run (`execution_count: null`, no output), so the notebook does **not** show the raw form working.
- The raw form is shown working elsewhere:
  - PropertyLens sent `Authorization: <token>` to Search with a valid token and got `found=1` with `error=None`.
  - bettersg/SchemesSG_v3 sends the raw token to `popapi/getPlanningarea`.
- ⇒ **Use the raw token: `Authorization: <access_token>`.** Do not put the token in the query string. The old API had `&token=`; that is UNVERIFIED for the new API.

### 2.3 Which APIs need a token (as of Oct 2026)

| Needs token | No token |
|---|---|
| Search (per docs since the 2025–2026 change; still tolerated without a token as of 2026-10-03), Reverse geocode, Routing, Themes, Planning area / population (`popapi`), Coordinate converters | Basemap tiles (`/maps/tiles/...`, TileJSON, mbstyle, WMTS/WMS), Static map API |

### 2.4 Implementation rules for our Next.js app on Vercel

- **Server-only.** Keep `ONEMAP_EMAIL` and `ONEMAP_PASSWORD` in Vercel env vars. Never send the token or the credentials to the browser. The API Terms require you to "keep such credentials secure and confidential" and say you "shall not mis-present or mask your API Client's identity" (https://www.onemap.gov.sg/legal/apitermsofservice.html, captured 2026-08-21).
- **Cache the token** in memory per lambda instance, or better in KV or a file during ingest. Refresh when less than about 6 h remains, or on any `error` containing "expired"/"invalid", or on a 401. Retry once after a refresh, never more.
- Prefer geocoding **at ingest time** (GitHub Actions) over request time. Store `lat`, `lng`, `postal`, `x`, `y` with the data.

```ts
// lib/onemap/token.ts — server-only
const TOKEN_URL = "https://www.onemap.gov.sg/api/auth/post/getToken";
let cached: { token: string; expiresAtMs: number } | null = null;

export async function getOneMapToken(force = false): Promise<string> {
  const now = Date.now();
  if (!force && cached && cached.expiresAtMs - 6 * 3600_000 > now) return cached.token;
  const email = process.env.ONEMAP_EMAIL;
  const password = process.env.ONEMAP_PASSWORD;
  if (!email || !password) throw new Error("ONEMAP_EMAIL / ONEMAP_PASSWORD not set");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`OneMap getToken HTTP ${res.status}`);
  const data = (await res.json()) as { access_token?: string; expiry_timestamp?: string | number; error?: string };
  if (!data.access_token) throw new Error(`OneMap getToken failed: ${data.error ?? "no access_token"}`);
  let exp = Number(data.expiry_timestamp);
  if (!Number.isFinite(exp) || exp <= 0) exp = now / 1000 + 72 * 3600; // documented 3-day validity
  if (exp > 1e12) exp = exp / 1000;                                      // defensive: ms instead of s
  cached = { token: data.access_token, expiresAtMs: exp * 1000 };
  return cached.token;
}
```

```ts
// lib/onemap/search.ts — server-only
export interface OneMapSearchResult {
  SEARCHVAL: string; BLK_NO: string; ROAD_NAME: string; BUILDING: string; ADDRESS: string;
  POSTAL: string; X: string; Y: string; LATITUDE: string; LONGITUDE: string;
}
export interface OneMapSearchResponse {
  found: number; totalNumPages: number; pageNum: number; results: OneMapSearchResult[]; error?: string;
}

export async function oneMapSearch(searchVal: string, pageNum = 1): Promise<OneMapSearchResponse> {
  const url = new URL("https://www.onemap.gov.sg/api/common/elastic/search");
  url.search = new URLSearchParams({ searchVal, returnGeom: "Y", getAddrDetails: "Y", pageNum: String(pageNum) }).toString();
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getOneMapToken(attempt > 0);
    const res = await fetch(url, { headers: { Authorization: token, Accept: "application/json" }, cache: "no-store" });
    if (res.status === 429) throw new RateLimitedError();                 // body is text/html; caller backs off
    if (res.status === 401) continue;                                     // refresh and retry once
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok || !ct.includes("application/json")) throw new Error(`OneMap HTTP ${res.status} (${ct})`);
    const body = (await res.json()) as OneMapSearchResponse;
    if (body.error && /expired|invalid/i.test(body.error) && attempt === 0) continue; // refresh token, retry once
    if (body.error && (!Array.isArray(body.results) || body.results.length === 0) && /token/i.test(body.error)) {
      throw new Error(`OneMap auth error: ${body.error}`);                 // never treat as "no match"
    }
    return body;
  }
  throw new Error("OneMap auth failed after token refresh");
}
export class RateLimitedError extends Error { constructor() { super("OneMap 429"); } }
```

---

## 3. Basemap tiles, zoom, bounds, attribution, terms

### 3.1 Tile URLs (raster XYZ, 256 px, no token, CORS `*`)

Template: `https://www.onemap.gov.sg/maps/tiles/{Style}/{z}/{x}/{y}.png`. The style name is **case-sensitive**.

| Style | XYZ template | Docs page |
|---|---|---|
| Default | `https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png` | https://www.onemap.gov.sg/docs/maps/ |
| Night | `https://www.onemap.gov.sg/maps/tiles/Night/{z}/{x}/{y}.png` | https://www.onemap.gov.sg/docs/maps/night.html |
| Grey | `https://www.onemap.gov.sg/maps/tiles/Grey/{z}/{x}/{y}.png` | https://www.onemap.gov.sg/docs/maps/grey.html |
| Original | `https://www.onemap.gov.sg/maps/tiles/Original/{z}/{x}/{y}.png` | https://www.onemap.gov.sg/docs/maps/original.html |
| GreyLite | `https://www.onemap.gov.sg/maps/tiles/GreyLite/{z}/{x}/{y}.png` (XYZ and TileJSON only) | https://www.onemap.gov.sg/docs/maps/greylite.html |
| LandLot | `https://www.onemap.gov.sg/maps/tiles/LandLot/{z}/{x}/{y}.png` | https://www.onemap.gov.sg/docs/maps/landlot.html |

Verification status of the table:

- Live 200 + `ACAO: *` + `image/png` probes exist (2026-10-02/03, sg-smart-commute `docs/probe-output/map-probes.txt`) for Default, Night, Grey and Original.
- GreyLite appears in sg-smart-commute's endpoint list. `greylite.html` returned 200 (sgSHIOK2026 P1).
- **UNVERIFIED** on 2026-10-10:
  - the `LandLot` tile URL (the legacy leaflet-providers entry does list a `LandLot` variant);
  - the "XYZ and TileJSON only" note for GreyLite;
  - the `night.html`, `grey.html`, `original.html` and `landlot.html` docs-page URLs;
  - the WMTS URL below.

Other formats per style:

- **HD variant**: `…/maps/tiles/{Style}_HD/{z}/{x}/{y}.png`, e.g. `Default_HD`. **Do not use it.** On 2026-10-02 and again on 2026-10-04 the `_HD` tiles were still 256×256 and served as `Content-Type: image/undefined`. The Default TileJSON points at `Default_HD`. (https://raw.githubusercontent.com/WeeJC8954/sg-smart-commute/HEAD/docs/map-feasibility.md)
- **TileJSON 2.2.0**: `https://www.onemap.gov.sg/maps/json/raster/tilejson/2.2.0/{Style}.json`. It gives minzoom 11 and maxzoom 19.
- **Mapbox/MapLibre style**: `https://www.onemap.gov.sg/maps/json/raster/mbstyle/{Style}.json` (Default, Night, Grey, Original). Widely used with MapLibre.
- **WMTS**: `https://www.onemap.gov.sg/maps/service?REQUEST=GetCapabilities&SERVICE=WMTS`. A WMS service also exists; see the docs pages.

Live behaviour, observed 2026-10-02 [VERIFIED-LIVE]:

- `Cache-Control: max-age=14400` (4 h).
- z10 is also served. z20 and tiles outside Singapore return an **empty HTTP 200**.
- At one-view scale (40 parallel tiles) tile traffic did not trip the Search rate limit.
- The legacy Leaflet-providers entry `https://maps-{s}.onemap.sg/v3/{variant}/{z}/{x}/{y}.png` is **outdated**. Do not use it.

### 3.2 Zoom and bounds (official Leaflet sample values)

The bounds, `minZoom 11`, `maxZoom 19`, the tile URL and the attribution are [VERIFIED-OFFICIAL-TEXT via third-party captures]: sg-smart-commute `map-feasibility.md` §4.1 and sgSHIOK2026 `P1`. The `center` `(1.2868108, 103.8545349)`, `zoom: 16` and `detectRetina: true` lines were **not** found in any capture checked on 2026-10-10 and are **UNVERIFIED**.

```js
let sw = L.latLng(1.144, 103.535);
let ne = L.latLng(1.494, 104.502);
let bounds = L.latLngBounds(sw, ne);
let map = L.map('mapdiv', { center: L.latLng(1.2868108, 103.8545349), zoom: 16 });
map.setMaxBounds(bounds);
let basemap = L.tileLayer('https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png', {
  detectRetina: true,
  maxZoom: 19,
  minZoom: 11,
  /** DO NOT REMOVE the OneMap attribution below **/
  attribution: '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;"/>&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>'
});
basemap.addTo(map);
```

- **minZoom 11, maxZoom 19.**
- **maxBounds**: SW `(1.144, 103.535)`, NE `(1.494, 104.502)`.
- For MapLibre, community samples use `maxBounds: [103.596, 1.1443, 104.1, 1.4835]` with the mbstyle URL (e.g. https://github.com/gpng/onemap-react-maplibre-demo). That box is **UNVERIFIED as official**. Prefer the official Leaflet bounds above.
- **Leaflet `detectRetina` (corrected).** In Leaflet 1.9.4, on a retina screen `detectRetina: true` does three things: it halves `tileSize`, adds 1 to `zoomOffset`, and lowers the layer's `maxZoom` by 1 (19 → 18).
  - At map zoom 18 the layer already requests **z19** tiles, so no detail is lost.
  - **Do not combine `detectRetina: true` with `maxNativeZoom: 19`.** `maxNativeZoom` clamps the zoom *before* `zoomOffset` is added. With `maxZoom: 20` (→ 19), a retina screen at map zoom 19 would request **z20** tiles, which OneMap serves as empty 200s.
  - To overzoom past z19, drop `detectRetina` and set `maxNativeZoom: 19, maxZoom: 20`. This is optional.
  - Source: Leaflet v1.9.4 `src/layer/tile/TileLayer.js` (`initialize`, `_getZoomForUrl`) and `src/layer/tile/GridLayer.js` (`_setView`, `_clampZoom`).

### 3.3 Required attribution and logo [VERIFIED-OFFICIAL-TEXT]

- The basemap docs say: "Under our Terms of Use, by using our base map services, you **MUST include the OneMap logo and attribution**." (https://www.onemap.gov.sg/docs/maps/)
- **Official snippet**, fetched 2026-08-11 and 2026-10-03 from https://www.onemap.gov.sg/docs/maps/resources/code-attr.txt. The older `docs/maps/code-attr.txt` now shows a "We have moved!" page.
  ```html
  <img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;"/>&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>
  ```
  Source captures: https://raw.githubusercontent.com/hongyime/sgSHIOK2026/HEAD/qa/verification/P1-research.md and https://raw.githubusercontent.com/WeeJC8954/sg-smart-commute/HEAD/docs/map-feasibility.md
- Rendered text: **"OneMap © contributors | Singapore Land Authority"**. "OneMap" links to `https://www.onemap.gov.sg/` and "Singapore Land Authority" links to `https://www.sla.gov.sg/`.
- **Logo**: `https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png`.
  - Official PNG is 32×32; display it at 20×20.
  - CORS `*`.
  - SHA-256 `657db347017b13e71bc4942afbe985566052446b13433f2dd5492e92fce34f16`, as downloaded 2026-10-03 (https://raw.githubusercontent.com/shenghaoc/hdb-resale-qt/HEAD/src/HdbResale.App/assets/README.md).
- **Keep the attribution visible whenever tiles show**, in light and dark themes. Do not collapse it behind an "i" button (MapLibre's compact attribution). Do not hide or alter it. The Terms forbid removing or obscuring SLA notices and logos.

### 3.4 Terms (https://www.onemap.gov.sg/legal/termsofuse.html; re-read by third party on 2026-10-03)

- **Clause 3(a)** grants a "non-transferable, non-exclusive, royalty-free, revocable licence to access, view, download, print or otherwise use the SLA Data and the SLA Material for any usage".
- **Clause 3(b)** forbids storing, archiving, reproducing or redistributing "except as expressly permitted in Clause 3(a)". It also forbids removing or obscuring copyright notices and logos.
- **Clause 2**: SLA may suspend the service "for any period of time without any prior notice", may restrict parts to "Registered Developers only", and may block IPs.
  - Data is provided "as is" and "as available".
  - There is no SLA (service-level agreement).
  - No charge today, but one may be introduced.
- **No published tile volume limit.** ⇒ Do not prefetch or bulk-download tiles, and do not build offline packs. Rely on the HTTP cache.
- **API Terms of Service**: https://www.onemap.gov.sg/legal/apitermsofservice.html. API datasets are under the **Singapore Open Data Licence v1.0**. The OneMap-hosted copy at https://www.onemap.gov.sg/legal/opendatalicence.html is **UNVERIFIED as a URL**. The verified canonical copy is https://data.gov.sg/open-data-licence (HTTP 200, sgSHIOK2026 `P1`, 2026-08-11).
  - That licence requires a conspicuous source acknowledgement with a link to the licence.
  - The licence's own template, as captured in `P1`: "Contains information from {name of dataset} accessed on {date of access of dataset} from {source of data} which is made available under the terms of the Singapore Open Data Licence version 1.0 {URL link to licence}".
  - Filled in for us: "Contains information from OneMap Search API accessed on {date} from Singapore Land Authority which is made available under the terms of the Singapore Open Data Licence version 1.0 {link}".
  - Use of the API "may be subject to additional terms … found on the individual pages of each API".

---

## 4. Geocoding an HDB block by "<blk> <street>" reliably

### 4.1 Source data fields

- **HDB resale CSV** (data.gov.sg) columns: `month, town, flat_type, block, street_name, storey_range, floor_area_sqm, flat_model, lease_commence_date, remaining_lease, resale_price`. `street_name` uses HDB abbreviations, e.g. `ANG MO KIO AVE 10`, `C'WEALTH CRES`.
- The HDB Property Information dataset uses `blk_no` and `street`, with the same abbreviation style.
- Scale: the resale data from Jan 2017 to Jun 2026 has 233,055 transactions but only **9,712 unique block/street pairs** and 577 distinct `street_name` values. These figures were recomputed from XiyanM/resaleradar `data/raw/hdb_resale_transactions.csv`, which runs 2017-01 to 2026-06. Geocode the unique pairs once and cache them.

### 4.2 Abbreviation → full road word (HDB `street_name` tokens)

The token inventory below comes from 584 distinct HDB resale street names. That list (RajiVenkat89 `street_list.csv`, committed 2024-07-29) merges the resale files from 1990 onwards. Two sets of newer names were added:

- Names that first appear in resale data between **Aug 2024 and Jan 2026**: `BIDADARI PK DR` (2024-08), `SENGKANG WEST RD` (2024-08), `CANBERRA VIEW` (2024-09), `TAMPINES NTH DR 1` (2024-10), `ALKAFF CRES` (2024-12), `YISHUN ST 42/44` (2025-03), `BT BATOK ST 41` (2025-04), `NORTHSHORE DR` (2025-05), `ANG MO KIO ST 23` (2025-12) and `TAMPINES ST 85` (2026-01). First-seen months come from resaleradar's resale CSV.
- Names that appear only in the HDB-rental street list (abdul0398 `constants.ts`), not yet in that resale CSV: `TAMPINES NTH DR 2`, `TAMPINES ST 62`, `NORTHSHORE CRES`, `SENJA CL`, `BEDOK NTH DR`.

None of these introduces a new abbreviation token. "Verified in OneMap" means a real OneMap `ADDRESS`/`ROAD_NAME`, or the SG road-name list, shows the expanded form. The "Count" column is the number of names containing the token in the 584-name list. Adding the post-2024 resale names gives ST 153, RD 121, DR 46, CRES 23, NTH 19, BT 31, PK 5; the other counts are unchanged.

| Token | Expand to | Count in HDB lists | Example HDB → OneMap road | Verified |
|---|---|---|---|---|
| `AVE` | `AVENUE` | 105 | `ANG MO KIO AVE 6` → `ANG MO KIO AVENUE 6` | ✓ OneMap |
| `ST` (no dot) | `STREET` | 148 | `BISHAN ST 12` → `BISHAN STREET 12`; `UPP CROSS ST` → `UPPER CROSS STREET` | ✓ OneMap |
| `ST.` (with dot) | **keep `ST.`** (= Saint) | 2 | `ST. GEORGE'S RD` → `ST. GEORGE'S ROAD`; `ST. GEORGE'S LANE` | ✓ road list. OneMap ADDRESS shows `ST. GEORGE'S LANE`. Searching `SAINT GEORGE'S ROAD` returned results in resaleradar, but they were unvalidated `results[0]` hits |
| `RD` | `ROAD` | 120 | `BEDOK NTH RD` → `BEDOK NORTH ROAD` | ✓ OneMap |
| `DR` | `DRIVE` | 43 | `SERANGOON CTRL DR` → `SERANGOON CENTRAL DRIVE` | ✓ OneMap |
| `CRES` | `CRESCENT` | 22 | `ALJUNIED CRES` → `ALJUNIED CRESCENT` | ✓ OneMap |
| `CL` | `CLOSE` | 9 | `KEAT HONG CL` → `KEAT HONG CLOSE`; `DOVER CL EAST` → `DOVER CLOSE EAST` | ✓ OneMap |
| `CTRL` | `CENTRAL` | 19 | `TAMPINES CTRL 8` → `TAMPINES CENTRAL 8` | ✓ OneMap |
| `CTR` | `CENTRE` (British spelling, **not** CENTER) | 1 | `WOODLANDS CTR RD` → `WOODLANDS CENTRE ROAD` | ✓ road list and addresses |
| `NTH` | `NORTH` | 18 | `CHOA CHU KANG NTH 5` → `CHOA CHU KANG NORTH 5`; `NTH BRIDGE RD` → `NORTH BRIDGE ROAD` | ✓ OneMap |
| `STH` | `SOUTH` | 6 | `BEDOK STH AVE 2` → `BEDOK SOUTH AVENUE 2`; `BUANGKOK STH FARMWAY 1` → `BUANGKOK SOUTH FARMWAY 1` | ✓ OneMap / road list |
| `UPP` | `UPPER` | 7 | `NEW UPP CHANGI RD` → `NEW UPPER CHANGI ROAD` | ✓ OneMap |
| `LOR` | `LORONG` | 13 | `LOR 1A TOA PAYOH` → `LORONG 1A TOA PAYOH` (**number stays before the place name**) | ✓ OneMap |
| `BT` | `BUKIT` | 30 | `BT BATOK WEST AVE 8` → `BUKIT BATOK WEST AVENUE 8`; `JLN BT HO SWEE` → `JALAN BUKIT HO SWEE` | ✓ OneMap |
| `JLN` | `JALAN` | 21 | `JLN TENTERAM` → `JALAN TENTERAM` | ✓ OneMap |
| `KG` | `KAMPONG` | 3 | `KG ARANG RD`, `KG KAYU RD`, `KG BAHRU HILL` → `KAMPONG …` | ✓ road list for `KAMPONG ARANG ROAD` and `KAMPONG KAYU ROAD`. `KAMPONG BAHRU HILL` is **not** in the cited road list (only `KAMPONG BAHRU ROAD` is), so that one is UNVERIFIED. It has no resale transactions since 2017 |
| `TG` | `TANJONG` | 1 | `TG PAGAR PLAZA` → `TANJONG PAGAR PLAZA` | ✓ OneMap |
| `PK` | `PARK` | 4 + new | `EVERTON PK`, `OUTRAM PK`, `FARRER PK RD`, `SPOTTISWOODE PK RD`, `BIDADARI PK DR` | ✓ OneMap / road list. **Fails unexpanded** |
| `PL` | `PLACE` | 4 | `KIM TIAN PL` → `KIM TIAN PLACE` | ✓ OneMap |
| `TER` | `TERRACE` | 2 | `MARINE TER`, `MOH GUAN TER` | ✓ OneMap / road list |
| `GDNS` | `GARDENS` | 2 | `PANDAN GDNS`, `TEBAN GDNS RD` → `TEBAN GARDENS ROAD` | ✓ OneMap |
| `HTS` | `HEIGHTS` | 1 | `TELOK BLANGAH HTS` → `TELOK BLANGAH HEIGHTS` | ✓ road list |
| `MKT` | `MARKET` | 1 | `NEW MKT RD` → `NEW MARKET ROAD` | ✓ road list. **Fails unexpanded** |
| `C'WEALTH` | `COMMONWEALTH` | 5 | `C'WEALTH AVE WEST` → `COMMONWEALTH AVENUE WEST`; also `C'WEALTH CL/CRES/DR/AVE` | ✓ road list. **Fails or mis-matches unexpanded** |

Notes on the table:

- Defensive extras that are absent from HDB resale data but harmless to include: `GDN`→`GARDEN`, `SQ`→`SQUARE`, `CTRL`/`CNTRL` variants, `S'GOON`→`SERANGOON` (seen in LTA bus data, not HDB).
- Words already in full form in HDB data, left as-is: `LANE, WAY, LINK, WALK, VIEW, RISE, LOOP, CIRCLE, CIRCUIT, PLAINS, FIELD, FARMWAY, PLAZA, GREEN, HILL, EAST, WEST`.
  - `VALE` occurs only inside words such as `ANCHORVALE`, `FERNVALE` and `RIVERVALE`, never as its own token.
  - `NORTH` and `SOUTH` never occur in full; HDB always writes `NTH` and `STH`.
  - Checked against the 584-name list plus the 2017–2026 resale names.
- Apostrophes in genuine names are fine. Keep them: `QUEEN'S CL` → OneMap `20 QUEEN'S CLOSE`; also `JLN MA'MOR`.
- Sources:
  - street lists: https://raw.githubusercontent.com/DineshDhamodharan24/Singapore_Flat_Resale_/HEAD/street_name.csv, https://raw.githubusercontent.com/RajiVenkat89/SingaporeFlatResalePrediction/HEAD/Data/street_list.csv, https://raw.githubusercontent.com/abdul0398/HDB-Rental-portal/HEAD/src/data/constants.ts
  - OneMap outputs: https://raw.githubusercontent.com/akuaku/singapore-property-prediction/HEAD/hdb_geocoded.csv.bak
  - road list: https://raw.githubusercontent.com/leroytan/the-website/HEAD/backend/api/services/data/road_names.csv
  - expansion success: XiyanM/resaleradar

### 4.3 Algorithm (implement exactly)

1. **Normalise the input.**
   - `block = block.trim().toUpperCase()`.
   - `street = street_name.trim().toUpperCase().replace(/\s+/g," ")`.
   - Strip any leading `BLK`/`BLOCK`.
2. **Expand** token by token, splitting on whitespace and using the table in 4.2. `ST.` with a dot is never expanded to STREET. A bare `ST` is always STREET, because HDB data has no bare-`ST` Saint names.
3. **Query variants, in order.** Stop at the first that passes validation.
   - a. `${block} ${expandedStreet}`, e.g. `123 ANG MO KIO AVENUE 6`.
   - b. `${block} ${rawStreet}`, e.g. `123 ANG MO KIO AVE 6`.
   - c. If the street contains `ST.`: `${block} ${expandedStreet.replace("ST. ", "SAINT ")}`.
   - d. Optional: a known 6-digit postal for that block, as `searchVal=<postal>`.
   - Never append ", Singapore". Never prefix "Blk".
4. **Validate each candidate result**, scanning `results` on page 1. Read further pages only if `totalNumPages > 1`; cap at 3 pages. A result **matches** only if both hold:
   - `r.BLK_NO.toUpperCase() === block`, and
   - `canon(r.ROAD_NAME) === canon(expandedStreet)`, where `canon` uppercases, expands abbreviations, maps the token `SAINT` → `ST`, removes `.` and `'`, and collapses spaces.
   - If `ROAD_NAME` is `"NIL"`, fall back to checking that `canon(r.ADDRESS)` contains `canon(expandedStreet)` as a token sequence.
5. **Disambiguate multiple matches.**
   - Prefer `/^\d{6}$/.test(POSTAL)`.
   - Then prefer `BUILDING === "NIL"` or `SEARCHVAL === ADDRESS` (the plain address record rather than a tenant POI).
   - If matches still carry **different** postals, mark the result **ambiguous**. Do not guess.
   - Matches with the same postal are the same building: take the first, since coordinates differ by metres.
6. **Sanity-check coordinates.** Require lat in `[1.15, 1.48]` and lng in `[103.59, 104.10]`. Otherwise reject.
7. **Persist.** Store `{block, street_name, query_used, postal, lat, lng, x, y, matched_road_name, retrieved_at}`.
   - Failures and ambiguous results are stored as such, never as "no such block".
   - An auth error or 429 is **never** a no-match.

```ts
// lib/onemap/hdb-geocode.ts
export const HDB_ABBREV: Record<string, string> = {
  AVE: "AVENUE", ST: "STREET", RD: "ROAD", DR: "DRIVE", CRES: "CRESCENT", CL: "CLOSE",
  CTRL: "CENTRAL", CTR: "CENTRE", NTH: "NORTH", STH: "SOUTH", UPP: "UPPER", LOR: "LORONG",
  BT: "BUKIT", JLN: "JALAN", KG: "KAMPONG", TG: "TANJONG", PK: "PARK", PL: "PLACE",
  TER: "TERRACE", GDNS: "GARDENS", GDN: "GARDEN", HTS: "HEIGHTS", MKT: "MARKET",
  "C'WEALTH": "COMMONWEALTH", SQ: "SQUARE",
};
// NOTE: "ST." (with dot) is NOT in the map on purpose: it means SAINT and OneMap keeps it as "ST.".

export function expandHdbStreet(street: string): string {
  return street.trim().toUpperCase().split(/\s+/).map((t) => HDB_ABBREV[t] ?? t).join(" ");
}

export function canonRoad(s: string): string {
  return expandHdbStreet(s)
    .split(" ")
    .map((t) => (t === "SAINT" ? "ST." : t))
    .join(" ")
    .replace(/[.']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function hdbQueryVariants(block: string, street: string): string[] {
  const b = block.trim().toUpperCase().replace(/^(BLK|BLOCK)\s+/, "");
  const raw = street.trim().toUpperCase().replace(/\s+/g, " ");
  const exp = expandHdbStreet(raw);
  const v = [`${b} ${exp}`, `${b} ${raw}`];
  if (exp.includes("ST. ")) v.push(`${b} ${exp.replace("ST. ", "SAINT ")}`);
  return [...new Set(v)];
}

export function matchesHdb(r: { BLK_NO: string; ROAD_NAME: string; ADDRESS: string }, block: string, street: string): boolean {
  const b = block.trim().toUpperCase().replace(/^(BLK|BLOCK)\s+/, "");
  if ((r.BLK_NO ?? "").trim().toUpperCase() !== b) return false;
  const want = canonRoad(street);
  if (r.ROAD_NAME && r.ROAD_NAME !== "NIL") return canonRoad(r.ROAD_NAME) === want;
  const hay = ` ${canonRoad(r.ADDRESS ?? "")} `;
  return hay.includes(` ${want} `);
}
```

Worked checks:

- `canonRoad("ST. GEORGE'S RD")` gives `ST GEORGES ROAD`, and so does `canonRoad("ST. GEORGE'S ROAD")`.
- `canonRoad("SAINT GEORGE'S ROAD")` maps SAINT to `ST.` then strips punctuation, giving `ST GEORGES ROAD`. ✓
- `canonRoad("C'WEALTH AVE WEST")` and `canonRoad("COMMONWEALTH AVENUE WEST")` both give `COMMONWEALTH AVENUE WEST`. ✓
- `canonRoad("LOR 1A TOA PAYOH")` gives `LORONG 1A TOA PAYOH`. ✓

### 4.4 Other pitfalls to remember

- The same block number exists on many streets, sometimes in the same town. **Never match on block alone.**
- Block suffixes are significant: `138C` ≠ `138`. Keep the letter. OneMap returns `BLK_NO: "138C"`.
- `POSTAL` must stay a string. Leading-zero postals start with `0` (e.g. `090106`, `081003` in Bukit Merah and Tanjong Pagar).
- Results for very new blocks may be missing until OneMap's address base updates. The SLA update cadence is UNVERIFIED. Retry failures on later ingests.
- Do not cache `error`-bearing empty responses as "not found".
- The 26 Aug 2025 workshop deck advises automatic token renewal. Implement it.

---

## 5. Summary of 2025–2026 changes

| Change | Effective / first seen | Source |
|---|---|---|
| Token required for all APIs except basemaps and static map | Workshop deck dated **26 Aug 2025** (snippet only, UNVERIFIED). The docs bundle's "requires a valid access token for each API request" is verified | onemap.gov.sg apidocs PDF (search snippet); docs bundle via sgSHIOK2026 P203 |
| Docs banner "Search API now requires token-based authentication" | Present by **2026-08-21**, still on **2026-10-02** | docs bundle `main.4c62b5c1.js` (third-party capture) |
| Tokenless Search still answers 200 + `error` warning | Observed **2026-10-01 → 2026-10-03** | fixtures / PRs above |
| Enforcement date for Search tokens | **UNVERIFIED / not announced** | none |
| Token users "API call limit capped at 250" (unit likely per minute) | Docs text captured **2026-08-21** | docs bundle |
| Attribution snippet moved to `/docs/maps/resources/code-attr.txt` | Served at the new path by **2026-08-11** (sgSHIOK2026 `P1`). The old path showed "We have moved!" on **2026-10-03** | sgSHIOK2026 P1; sg-smart-commute map-feasibility |
| `_HD` tiles are still 256 px and served as `image/undefined`; do not use | **2026-10-02 / 2026-10-04** | sg-smart-commute |

---

## Verification log

Adversarial fact-check run on **2026-10-10**.

Access limits during the check:
- `onemap.gov.sg`, `discuss.onemap.sg`, `codepen.io` and `web.archive.org` could not be reached: DNS failure or proxy 403.
- No web-search budget was left.

So every check below used third-party captures and code on GitHub, which were fetched or cloned and read directly. Where a figure is recomputed, the arithmetic was redone locally: Python over the cited CSVs, and Node for the §4.3 helpers. Verdicts are **confirmed**, **corrected** (the file was edited) or **unverifiable** (marked UNVERIFIED in the text).

| # | Claim (section) | Verdict | Source / evidence |
|---|---|---|---|
| 1 | Search endpoint `/api/common/elastic/search`, params `searchVal`/`returnGeom`/`getAddrDetails` "Required", `pageNum` integer with no Required label, verbatim descriptions, sample request (§1.1) | confirmed | docs bundle `main.4c62b5c1.js` text in sgSHIOK2026 `qa/verification/P64-…md` and `P203-…md` (2026-08-21) |
| 2 | `pageNum` default 1 (§1.1) | confirmed | SLA workshop notebook cell 3 ("Default: 1") |
| 3 | Banner "IMPORTANT: Search API now requires token-based authentication… Register your token…" linking `/apidocs/register` (§1.2) | confirmed | P64 bundle extract. The same bundle hash was fetched 2026-08-21 (P203). Still shown 2026-10-02 per sg-smart-commute `docs/data-sources.md` |
| 4 | Tokenless Search → 200 + results + `error: "Authentication token missing…"`; the AMK Ave 6 sample (§1.2, §1.3) | confirmed; nuance added | sg-smart-commute fixture `hdb-123-amk-ave-6.json` matches byte-for-byte in content. P64 shows one tokenless reply **without** `error`, so a note was added |
| 5 | Expired-token sample text, "Response (200 OK)", `pageNum: 0`; "3. Invalid Token" heading (§1.2) | confirmed | P64 bundle extract |
| 6 | Invalid-token message text (§1.2) | unverifiable as official text | only in a third-party test (rbrishi15 `onemap.test.ts`, which does contain that string). Already marked UNVERIFIED |
| 7 | Official sample response (Rowell Road, X/Y/lat/lng values) (§1.3) | confirmed | P64/P203 bundle extracts |
| 8 | `found: 392`, `totalNumPages: 40`, 10 results per page (§1.3, §1.5) | confirmed | P64 live probe. Arithmetic: ceil(392/10) = 40 |
| 9 | `BLK_NO` `""` for MRT POIs; suffix like `400A`/`138C`; `POSTAL` `"NIL"`; `098585` | confirmed | fixtures `mrt-bishan.json`, `postal-098585.json` (VivoCity, 1 HarbourFront Walk); P64 (`400A`); akuaku CSV (`138C LORONG 1A TOA PAYOH`) |
| 10 | `getAddrDetails=N` omits address fields (§1.3) | corrected (strengthened) | the new-API live probe's 565-byte body equals the geometry-only re-serialisation of the 961-byte full fixture (sg-smart-commute `map-probes.txt`) |
| 11 | `returnGeom=N` omits geometry (§1.3) | unverifiable | no capture. Stays UNVERIFIED |
| 12 | "higher API call limit capped at 250…", `onemap@sla.gov.sg` (§1.4) | confirmed (text) | P203 bundle extract |
| 13 | 250 is per minute (§1.4) | unverifiable | the forum post could not be fetched. A third-party notebook says 300/min with no source. Text now says so |
| 14 | 429 after 2–3 tokenless calls in ~1.5 s; 429 is `text/html`, no `Retry-After`, no ACAO; body text (§1.4) | confirmed | sg-smart-commute `data-sources.md` and `map-probes.txt`; P64 shows the 429 HTML body ("Please try again to visit for a few minutes") |
| 15 | Immediate 429 for `"1"`, `""`, `"*"` (§1.4) | confirmed; source re-attributed | P64 (sgSHIOK2026), not sg-smart-commute |
| 16 | Search docs list only "429 - API limit exceeded"; API ToS gives no number (§1.4) | confirmed (third-party check 2026-10-02) | sg-smart-commute `data-sources.md` line "Rate limit" |
| 17 | resaleradar batch: 9,712 pairs, token, 0.25 s, "0 transport failures" (§1.4) | **corrected** | notebook `04_geospatial_features.ipynb`: first pass 95 empty, 9,617 = 9,712 − 95 with results; failure counter mixes exceptions and empties; success = `found>0`, `results[0]` unvalidated; query appended " SINGAPORE" |
| 18 | "No typo tolerance" (§1.5) | **corrected → UNVERIFIED** | no source found |
| 19 | `Blk` prefix "breaks the search" (§1.5) | **corrected** (softened) | 0 results tokenless (sg-smart-commute 2026-10-01). But `BLK 1 BEDOK NORTH AVE 4` with a token gave `found=2` (PropertyLens cell 28) |
| 20 | `201 Tampines St 21` exact (§1.5) | confirmed | sg-smart-commute `api-feasibility.md` §4.3 |
| 21 | "95 failed: these used C'WEALTH, PK, MKT, ST. GEORGE'S"; "all 95 succeeded after expansion" (§1.5) | **corrected** | only the 10 printed failures are shown. Recount: 93 of 9,712 pairs contain those tokens (< 95). "Succeeded" = non-empty, unvalidated |
| 22 | ", Singapore" suffix → 0 results (§1.5) | confirmed; nuance added | PropertyLens cell 28: `found=1` vs `found=0` with a token. A no-comma " SINGAPORE" suffix still returned results in resaleradar |
| 23 | Mis-geocode table (412 C'WEALTH AVE WEST → 412 BEDOK NORTH AVENUE 2, etc.) (§1.5) | confirmed | all 7 rows found in `akuaku/.../hdb_geocoded.csv.bak` (`geocoded_address` column). Table entries are shortened forms |
| 24 | `BUILDING` cannot prove residential identity (§1.5) | confirmed | shenghaoc/hdb-resale-qt `docs/coverage/onemap/historical/README.md` (2026-10-03) |
| 25 | revgeocode and routing without a token → 401 `{"message":"Unauthorized"}`, CORS `*` (§1.6) | confirmed | sg-smart-commute `api-feasibility.md` table; `map-probes.txt` routing probe (2026-10-03) |
| 26 | Token needed for all but basemaps/static map (26 Aug 2025 deck) (§1.6, §5) | unverifiable (deck); consistent with verified docs text | bundle: "requires a valid access token for each API request"; "token is not required for the map services" (P64/P203) |
| 27 | Workshop notebook: revgeocode params (`buffer` 0–500, `addressType` HDB/All default All, `otherFeatures` default N), `GeocodeInfo` fields, routing `pt` params/date format/`itineraries` fields, polyline precision 5 (÷1e5), themes endpoints and fields, first `SrchResults` element is metadata (§1.6) | confirmed | cloned `andikasun/onemap-workshop-may-2025` (commit 2025-06-03), cells 6, 7, 10, 12, 15, 17 |
| 28 | Routing `routeType=walk\|drive\|cycle` and `mode=BUS\|RAIL` (§1.6) | **corrected → UNVERIFIED** | not in the notebook, which shows only `pt`/`TRANSIT`; no other capture |
| 29 | `revgeocodexy` exists (§1.6) | confirmed (existence only) | P64 bundle `"page_section":"revgeocodexy"` |
| 30 | `getPlanningarea` → `[{"pln_area_n":…}]` (§1.6) | confirmed | bettersg/SchemesSG_v3 `onemap.py` |
| 31 | Coordinate converters; static-map path/params/limits (§1.6) | unverifiable | no capture checked; marked |
| 32 | getToken POST `/api/auth/post/getToken`, JSON `{email,password}`, sample `{"access_token","expiry_timestamp":"1689388144"}` (§2.1) | confirmed | P64 bundle; workshop notebook cell 18; SchemesSG `onemap.py` |
| 33 | "Each token is valid for 3 days… UNIX format… does not auto renew"; "not required for the map services"; "strongly encourage to securely store…"; tutorial "refreshed every 72 hours… Next.JS… middleware proxy" (§2.1) | confirmed verbatim | P64 and P203 bundle extracts. Arithmetic: 3 d = 72 h = 259,200 s, matching `72 * 3600` in code |
| 34 | `1689388144` = 2023-07-15 02:29:04 UTC (§0) | confirmed (computed) | `date -u -d @1689388144` |
| 35 | Token is RS256 JWT (§2.1) | unverifiable | deck snippet only; marked |
| 36 | Registration flow details; `/apidocs/authentication` and `/apidocs/routing` page paths (§2.1) | unverifiable | marked. `/apidocs/search` (P203 HTTP 200) and `/apidocs/register` (banner href) confirmed |
| 37 | mk-fe copy is "verbatim" `${authToken}` (§2.2) | **corrected** | `scrap.js` has the transpiled `"".concat(authToken)` |
| 38 | Workshop notebook "live outputs show both forms worked" (§2.2) | **corrected** | the Search cell (raw token) has `execution_count: null` and no output. Only the Bearer cells have outputs. Raw form shown working by PropertyLens (Search, `error=None`) and SchemesSG (popapi) |
| 39 | API ToS quotes "keep such credentials secure and confidential", "shall not mis-present or mask your API Client's identity", "may be subject to additional terms… individual pages of each API" (§2.4, §3.4) | confirmed | P203 terms extract (2026-08-21) |
| 40 | Tile template, styles Default/Night/Grey/Original live 200, `ACAO: *`, `image/png`; `Cache-Control: max-age=14400` (= 4 h) (§3.1) | confirmed | sg-smart-commute `map-probes.txt` (2026-10-03T02:10Z) and `testing.md` row 2026-10-02 |
| 41 | Outside-SG tile → empty 200; z10 served; z20 empty (§3.1) | confirmed / third-party only | outside-SG: raw probe (0 bytes, 200). z10/z20: sg-smart-commute `map-feasibility.md` table only |
| 42 | `_HD` tiles 256×256, `image/undefined`; TileJSON 2.2.0 z11–19 points at `Default_HD` (§3.1) | confirmed | sg-smart-commute `testing.md` row 2026-10-04 (P2-M4 Task 4) |
| 43 | mbstyle URL pattern (§3.1) | confirmed | gpng/onemap-react-maplibre-demo `pages/index.tsx` uses `…/maps/json/raster/mbstyle/Grey.json` |
| 44 | LandLot tile URL, GreyLite "XYZ/TileJSON only", per-style docs pages, WMTS URL (§3.1) | unverifiable | marked |
| 45 | 40 parallel tiles did not trip the Search limit (§3.1) | confirmed | `map-probes.txt`: 40 × 200, then search 200. 8 × 5 = 40 |
| 46 | Legacy leaflet-providers `maps-{s}.onemap.sg/v3/…` is outdated (§3.1) | confirmed | leaflet-extras/leaflet-providers `master` still has that URL (also `maxZoom 18` and an old `docs.onemap.sg` logo) |
| 47 | Bounds SW (1.144, 103.535), NE (1.494, 104.502), minZoom 11, maxZoom 19 (§3.2) | confirmed | sg-smart-commute `map-feasibility.md` §4.1 |
| 48 | Leaflet sample center `(1.2868108, 103.8545349)`, zoom 16, `detectRetina: true` (§3.2) | unverifiable | no capture found; marked |
| 49 | MapLibre community bounds `[103.596, 1.1443, 104.1, 1.4835]` (§3.2) | confirmed (as community value) | gpng demo `pages/index.tsx` line 35 |
| 50 | "`detectRetina` lowers maxZoom by 1; set `maxNativeZoom: 19` with `maxZoom: 20`" (§3.2) | **corrected** | Leaflet v1.9.4 source: on retina, `zoomOffset++` is applied after the `maxNativeZoom` clamp, so map z19 would request z20 (empty). Advice rewritten |
| 51 | Attribution snippet text and path; old path "We have moved!" (§3.3) | confirmed | sgSHIOK2026 `P1` (2026-08-11, HTTP 200, literal markup) and sg-smart-commute `map-feasibility.md` (2026-10-03) |
| 52 | "MUST include the OneMap logo and attribution" quote (§3.3) | confirmed (third-party capture) | sg-smart-commute `map-feasibility.md` §4.1 |
| 53 | Logo PNG 32×32, SHA-256 `657db347…4f16` (§3.3) | confirmed | downloaded hdb-resale-qt's bundled `onemap-logo.png` (declared unchanged from `om_logo.png`): IHDR 32×32; `sha256sum` matches |
| 54 | Terms of Use clauses 2, 3(a), 3(b); "as is"/"as available"; no published tile volume limit (§3.4) | confirmed (third-party re-read 2026-10-03) | sg-smart-commute `map-feasibility.md` §4.1 |
| 55 | SODL v1.0 applies to API datasets (§3.4) | confirmed | sgSHIOK2026 `P1` A2 |
| 56 | SODL URL `onemap.gov.sg/legal/opendatalicence.html` (§3.4) | unverifiable | marked. The `data.gov.sg/open-data-licence` copy is confirmed (P1). The licence's own acknowledgement template was added |
| 57 | HDB resale CSV columns (§4.1) | confirmed | header of resaleradar `hdb_resale_transactions.csv` (identical 11 columns) |
| 58 | HDB Property Information uses `blk_no`, `street` (abbreviated) (§4.1) | confirmed | `docs/research/datagov-api.md` §5.2 (example `street=BEACH RD`) |
| 59 | "from Jan 2017… about 233k transactions… 9,712 unique pairs" (§4.1) | confirmed; made precise | recomputed: 233,055 rows, months 2017-01 to 2026-06, 9,712 pairs, 577 streets |
| 60 | 584 distinct street names, 1990–2024 (§4.2) | confirmed | RajiVenkat89 `street_list.csv`: 584 unique names, committed 2024-07-29; its README says the resale files start in 1990. Dinesh list (567) is a subset |
| 61 | Per-token counts AVE 105, ST 148, ST. 2, RD 120, DR 43, CRES 22, CL 9, CTRL 19, CTR 1, NTH 18, STH 6, UPP 7, LOR 13, BT 30, JLN 21, KG 3, TG 1, PK 4, PL 4, TER 2, GDNS 2, HTS 1, MKT 1, C'WEALTH 5 (§4.2) | confirmed (recomputed) | Python token count over the 584-name list: every figure matches |
| 62 | "newer 2025–2026 additions" list (§4.2) | **corrected** | first resale months 2024-08 … 2026-01 (resaleradar CSV). `TAMPINES NTH DR 2`, `TAMPINES ST 62`, `NORTHSHORE CRES`, `SENJA CL`, `BEDOK NTH DR` occur only in the rental list (abdul0398 `constants.ts`) |
| 63 | Every example HDB street in the table exists (§4.2) | confirmed | all present in the 584 list or the post-2024 resale names |
| 64 | Expanded forms in OneMap / road list (§4.2) | confirmed except one | akuaku `geocoded_address` (e.g. `UPPER CROSS STREET`, `SERANGOON CENTRAL DRIVE`, `LORONG 1A TOA PAYOH`, `TANJONG PAGAR PLAZA`, `QUEEN'S CLOSE`) and leroytan `road_names.csv` (e.g. `WOODLANDS CENTRE ROAD`, `BUANGKOK SOUTH FARMWAY 1`, `ST. GEORGE'S ROAD`). **`KAMPONG BAHRU HILL` is absent** from the road list, so that cell was corrected to UNVERIFIED |
| 65 | No bare-`ST` Saint names in HDB data (§4.3) | confirmed | no `ST` token anywhere but at the end or before a number, in 595 names |
| 66 | No other abbreviation tokens missing from `HDB_ABBREV` (§4.2) | confirmed | every ≤4-letter non-numeric token outside the map is a proper word (e.g. `KIO`, `TOA`, `UBI`) or `ST.` |
| 67 | "Words already in full form… VALE… NORTH(…)" (§4.2) | **corrected** | `VALE` and `NORTH` never occur as tokens. `HILL` does (`OUTRAM HILL`, `KG BAHRU HILL`) |
| 68 | Worked checks: `canonRoad` results for ST. GEORGE'S / SAINT / C'WEALTH / LOR 1A (§4.3) | confirmed | ran the exact TS logic in Node: `ST GEORGES ROAD` ×3, `COMMONWEALTH AVENUE WEST` ×2, `LORONG 1A TOA PAYOH` |
| 69 | `hdbQueryVariants`/`matchesHdb` behave as described (Blk strip, SAINT variant, `4C ST. GEORGE'S LANE` ≠ 14 ST. GEORGE'S RD) (§4.3) | confirmed | Node run |
| 70 | Coordinate sanity box lat [1.15, 1.48], lng [103.59, 104.10] covers HDB (§4.3) | confirmed | all 9,712 resaleradar coordinates fall in lat 1.2704–1.4571, lng 103.6852–103.9878 |
| 71 | Leading-zero postals `090106`, `081003` in Bukit Merah / Tanjong Pagar (§4.4) | confirmed | akuaku: `106 BUKIT PURMEI ROAD … 090106` (Bukit Merah); `3 TANJONG PAGAR PLAZA SINGAPORE 081003` |
| 72 | methylDragon PR #3 "commit dated 2024-04-19"; `LONGTITUDE` dropped (§0) | **corrected** | PR page: opened 2024-04-19, still open (unmerged). Its README diff drops the `'LONGTITUDE'` sample line |
| 73 | massgowhere PR #42 (2026-10-03) (§1.2) | confirmed; detail added | PR page: rejected token gave error + no results; tokenless retry returned results |
| 74 | Code arithmetic: `6 * 3600_000` ms = 6 h; `72 * 3600` s = 3 d; ≤ 3 req/s = ≤ 180/min < 250 (§1.4, §2.4) | confirmed | computed |
| 75 | Workshop deck URL/date (26 Aug 2025); forum post (~2017) | unverifiable | hosts not reachable; already flagged as search-snippet sourced |
