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
- Base host for everything: `https://www.onemap.gov.sg`. The legacy hosts `developers.onemap.sg` (`/commonapi/...`, `/privateapi/...`) and `docs.onemap.sg` are the old OneMap 2.0 API and docs. **Do not use them.** The client library migration happened in 2023–2024. The old `LONGTITUDE` (sic) field was dropped in the new API. Source: https://github.com/methylDragon/onemapsg-api-client/pull/3 (commit dated 2024-04-19).

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

- With `getAddrDetails=N`, the address fields (`BLK_NO`, `ROAD_NAME`, `BUILDING`, `ADDRESS`, `POSTAL`) are omitted. The pre-2023 API sample shows this (https://raw.githubusercontent.com/sheshbabu/Blog/HEAD/source/_posts/exploring-singapore-onemap-api.md). [CORROBORATED for the old API]
- With `returnGeom=N`, the geometry fields (`X`, `Y`, `LATITUDE`, `LONGITUDE`) are presumably omitted. This follows the docs wording, but **no captured sample confirms it (UNVERIFIED)**. Code should not depend on either flag's omission behaviour.
- **For HDB geocoding always send `returnGeom=Y&getAddrDetails=Y`**, because you need `BLK_NO` and `ROAD_NAME` to validate the match.

### 1.4 Rate limits

- **Official docs text** [VERIFIED-OFFICIAL-TEXT, captured 2026-08-21]: "Users onboard the token-based authentication will have a higher API call limit capped at **250**; and further request for higher limits can be discussed on a case-by-case basis." Interested parties can email `onemap@sla.gov.sg`.
- **The unit is UNVERIFIED in the captured snippet.** A OneMap staff answer on the community forum (~2017) gives it as "up to **250 requests per minute** for your registered OneMap API Account". That limit was not tied to an IP. Source: https://discuss.onemap.sg/t/maximum-number-of-request/100 (via search snippet). ⇒ **Assume 250 calls/minute per token.**
- Search docs list only "429 - API limit exceeded". The API Terms of Service give no number (checked 2026-10-02 by https://raw.githubusercontent.com/WeeJC8954/sg-smart-commute/HEAD/docs/data-sources.md).
- **Tokenless traffic is throttled much harder** [VERIFIED-LIVE, 2026-10-02]: 429 after 2–3 calls within about 1.5 s. Low-specificity queries (`"1"`, `""`, `"*"`) got an **immediate 429**.
- **429 response shape** [VERIFIED-LIVE]:
  - `Content-Type: text/html; charset=utf-8`, so the body is not JSON.
  - No `Retry-After` header, no rate-limit headers, and **no `Access-Control-Allow-Origin`**. A browser cannot read it and sees `TypeError: Failed to fetch`.
  - The body says "Too Many Requests … Please try again to visit for a few minutes".
- Successful responses carry no rate-limit headers.
- Batch experience: one project geocoded 9,712 unique HDB block/street pairs with a token at a 0.25 s delay, with 0 transport failures (https://github.com/XiyanM/resaleradar, `notebooks/04_geospatial_features.ipynb`).
- **Recommendation for our ingest job:**
  - Run **sequentially at ≤ 3 req/s (≤ 180/min)** with a token.
  - On a 429, or on a non-JSON body, pause 60 s and then back off exponentially.
  - Never parallelise.
  - Cache results permanently, keyed by `block|street_name`, and only geocode new keys.

### 1.5 Search behaviour pitfalls [VERIFIED-LIVE / CORROBORATED]

- **No typo tolerance.**
- **A `Blk`/`Block` prefix breaks the search.** `Blk 123 Ang Mo Kio Ave 6` returned `found: 0`, while `123 Ang Mo Kio Avenue 6` returned an exact hit. Strip the prefix. (https://raw.githubusercontent.com/WeeJC8954/sg-smart-commute/HEAD/docs/api-feasibility.md, 2026-10-01)
- **Common abbreviations work, rare ones do not.** `201 Tampines St 21` resolved exactly. In a 9,712-address run, 95 failed: these used `C'WEALTH`, `PK`, `MKT` and `ST. GEORGE'S`. **All 95 succeeded after full expansion** (XiyanM/resaleradar, 2026).
- **A ", Singapore" suffix can produce 0 results.** Do not append it. (https://github.com/cloudriver-yc/PropertyLens, `raw_data_collection.ipynb`)
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

The token requirement comes from the 26 Aug 2025 workshop deck, which says a token is needed for everything except basemaps and the static map. Observed live, 2026-10-01: `GET /api/public/revgeocode` without a token returns **HTTP 401 `{"message":"Unauthorized"}`** with CORS `*`. Routing without a token also returns **401** (sg-smart-commute docs).

Request and response details below come from the SLA workshop notebook (28 May 2025, https://github.com/andikasun/onemap-workshop-may-2025) [VERIFIED-OFFICIAL-TEXT for params and sample output]:

| API | Endpoint | Params | Response (key fields) |
|---|---|---|---|
| Reverse geocode (WGS84) | `GET /api/public/revgeocode` | `location=lat,lng` (required); `buffer` 0–500 m; `addressType=HDB\|All` (default All); `otherFeatures=Y\|N` (default N) | `{"GeocodeInfo":[{"BUILDINGNAME","BLOCK","ROAD","POSTALCODE","XCOORD","YCOORD","LATITUDE","LONGITUDE"}]}` |
| Reverse geocode (SVY21) | `GET /api/public/revgeocodexy` | `location=X,Y` plus the same optional params | same shape [CORROBORATED] |
| Routing | `GET /api/public/routingsvc/route` | `start=lat,lng`, `end=lat,lng`, `routeType=walk\|drive\|cycle\|pt`. For `pt` also: `date=MM-DD-YYYY`, `time=HH:MM:SS`, `mode=TRANSIT\|BUS\|RAIL`, `maxWalkDistance` (m), `numItineraries` | `pt`: `{requestParameters, plan:{itineraries:[{duration,walkTime,transitTime,waitingTime,walkDistance,transfers,fare,legs:[{mode,legGeometry:{points}}…]}]}}` with Google-encoded polylines at precision 5. walk/drive/cycle: `route_geometry`, `route_instructions`, `route_summary.total_time` (s), `route_summary.total_distance` (m) [CORROBORATED] |
| Themes: list | `GET /api/public/themesvc/getAllThemesInfo?moreInfo=Y` | | `{"Theme_Names":[{"THEMENAME","QUERYNAME","ICON","EXPIRY_DATE","PUBLISHED_DATE","CATEGORY","THEME_OWNER"}]}` |
| Themes: data | `GET /api/public/themesvc/retrieveTheme?queryName={QUERYNAME}` | optional `extents` (bbox; format UNVERIFIED) | `{"SrchResults":[{FeatCount,Theme_Name,…},{NAME,DESCRIPTION,ADDRESSPOSTALCODE,ADDRESSSTREETNAME,…,"Type":"Point","LatLng":"1.39,103.74"}]}`. **The first element is metadata.** |
| Planning area of a point | `GET /api/public/popapi/getPlanningarea?latitude=&longitude=` | `year` optional (UNVERIFIED) | `[{"pln_area_n":"TAMPINES"}]` [CORROBORATED, bettersg/SchemesSG_v3] |
| Coordinate convert | `GET /api/common/convert/4326to3414?latitude=&longitude=`, `3414to4326?X=&Y=`, plus `4326to3857`, `3857to4326`, `3414to3857`, `3857to3414` | | [CORROBORATED] |
| Static map (token **not** required) | `GET /api/staticmap/getStaticImage?layerchosen=default&latitude=&longitude=&zoom=17&width=400&height=400` | `layerchosen` default/night/grey/original/landlot; zoom 11–19; width/height 128–512 px (limits **UNVERIFIED**); optional `points=[lat,lng,"r,g,b"]` | PNG |

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

- **Token format**: an RS256-signed JWT (26 Aug 2025 workshop deck).
- **`expiry_timestamp`** is a **string of Unix seconds**, e.g. `"1689388144"`. Convert with `Number(x) * 1000` before comparing to `Date.now()`. [CORROBORATED by several clients]
- **Registration**: https://www.onemap.gov.sg/apidocs/register. You confirm the account by email. The password is set by you.
- **Docs pages**: https://www.onemap.gov.sg/apidocs/authentication (token exemption for map services), https://www.onemap.gov.sg/apidocs/routing

### 2.2 Sending the token

- **Official docs sample** for Search [VERIFIED-OFFICIAL-TEXT, copied verbatim in https://github.com/technicalassessments/mk-fe, `scrap.js`]: `headers: { 'Authorization': `${authToken}` }`. This is the **raw token, with no `Bearer ` prefix**.
- The SLA workshop notebook (May 2025) also sends the raw token for Search. It sends `Authorization: Bearer <token>` for revgeocode, routing and themes, and its live outputs show **both forms worked**.
- ⇒ **Use the raw token: `Authorization: <access_token>`.** This is what the official sample uses. Do not put the token in the query string. The old API had `&token=`; that is UNVERIFIED for the new API.

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

### 3.2 Zoom and bounds (official Leaflet sample values) [VERIFIED-OFFICIAL-TEXT via many verbatim copies]

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
- In Leaflet, `detectRetina` lowers the effective maxZoom by 1 on retina screens. To keep z19 usable, set `maxNativeZoom: 19` with `maxZoom: 20` if you want to overzoom. This is optional.

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
- **API Terms of Service**: https://www.onemap.gov.sg/legal/apitermsofservice.html. API datasets are under the **Singapore Open Data Licence v1.0** (https://www.onemap.gov.sg/legal/opendatalicence.html).
  - That licence requires a conspicuous source acknowledgement with a link to the licence.
  - Suggested form: "Contains information from OneMap (Search API), Singapore Land Authority, accessed {date}, made available under the terms of the Singapore Open Data Licence version 1.0 {link}".
  - Use of the API "may be subject to additional terms … found on the individual pages of each API".

---

## 4. Geocoding an HDB block by "<blk> <street>" reliably

### 4.1 Source data fields

- **HDB resale CSV** (data.gov.sg) columns: `month, town, flat_type, block, street_name, storey_range, floor_area_sqm, flat_model, lease_commence_date, remaining_lease, resale_price`. `street_name` uses HDB abbreviations, e.g. `ANG MO KIO AVE 10`, `C'WEALTH CRES`.
- The HDB Property Information dataset uses `blk_no` and `street`, with the same abbreviation style.
- Scale: the resale data from Jan 2017 had about 233k transactions but only **9,712 unique block/street pairs** in 2026 (XiyanM/resaleradar). Geocode the unique pairs once and cache them.

### 4.2 Abbreviation → full road word (HDB `street_name` tokens)

The token inventory below comes from 584 distinct HDB resale street names (1990–2024 lists) plus newer 2025–2026 additions: `BIDADARI PK DR`, `ALKAFF CRES`, `TAMPINES NTH DR 1/2`, `TAMPINES ST 62`, `NORTHSHORE DR/CRES`, `SENJA CL`, `BEDOK NTH DR`, `YISHUN ST 42/44`. "Verified in OneMap" means a real OneMap `ADDRESS`/`ROAD_NAME`, or the SG road-name list, shows the expanded form.

| Token | Expand to | Count in HDB lists | Example HDB → OneMap road | Verified |
|---|---|---|---|---|
| `AVE` | `AVENUE` | 105 | `ANG MO KIO AVE 6` → `ANG MO KIO AVENUE 6` | ✓ OneMap |
| `ST` (no dot) | `STREET` | 148 | `BISHAN ST 12` → `BISHAN STREET 12`; `UPP CROSS ST` → `UPPER CROSS STREET` | ✓ OneMap |
| `ST.` (with dot) | **keep `ST.`** (= Saint) | 2 | `ST. GEORGE'S RD` → `ST. GEORGE'S ROAD`; `ST. GEORGE'S LANE` | ✓ road list. OneMap ADDRESS shows `ST. GEORGE'S LANE`. Searching `SAINT GEORGE'S ROAD` also worked (resaleradar) |
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
| `KG` | `KAMPONG` | 3 | `KG ARANG RD`, `KG KAYU RD`, `KG BAHRU HILL` → `KAMPONG …` | ✓ road list |
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
- Words already in full form in HDB data, left as-is: `LANE, WAY, LINK, WALK, VIEW, RISE, LOOP, CIRCLE, CIRCUIT, PLAINS, FIELD, FARMWAY, PLAZA, GREEN, VALE, EAST, WEST, NORTH(…)`.
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
| Token required for all APIs except basemaps and static map | Workshop deck dated **26 Aug 2025** | onemap.gov.sg apidocs PDF (search snippet) |
| Docs banner "Search API now requires token-based authentication" | Present by **2026-08-21**, still on **2026-10-02** | docs bundle `main.4c62b5c1.js` (third-party capture) |
| Tokenless Search still answers 200 + `error` warning | Observed **2026-10-01 → 2026-10-03** | fixtures / PRs above |
| Enforcement date for Search tokens | **UNVERIFIED / not announced** | none |
| Token users "API call limit capped at 250" (unit likely per minute) | Docs text captured **2026-08-21** | docs bundle |
| Attribution snippet moved to `/docs/maps/resources/code-attr.txt` | Seen **2026-10-03** | sg-smart-commute map-feasibility |
| `_HD` tiles are still 256 px and served as `image/undefined`; do not use | **2026-10-02 / 2026-10-04** | sg-smart-commute |
