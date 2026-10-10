# data.gov.sg APIs and dataset IDs: research notes for engineers

Research date: **2026-10-10**. Scope:
1. The current data.gov.sg APIs for programmatic download: metadata, initiate/poll download, `datastore_search`, API keys and rate limits.
2. Exact dataset IDs and column names for:
   - HDB resale (all 5 eras)
   - HDB Property Information
   - HDB Renting Out of Flats
   - HDB Resale Price Index
   - MOE schools
   - LTA MRT exits and station layers
   - HDB Existing Building
   - URA Master Plan land use
   - HDB town names and codes

---

## 0. How these facts were sourced (read this first)

- **The primary hosts could not be fetched directly.**
  - This container's `curl` got `CONNECT tunnel failed, response 403` from the egress proxy for `data.gov.sg` and `api-production.data.gov.sg`.
  - The research fetch tool hit `getaddrinfo ENOTFOUND` on `data.gov.sg`, `guide.data.gov.sg`, `api-production.data.gov.sg`, `www.hdb.gov.sg` and `reports.open.gov.sg`.
  - Facts therefore come from three kinds of source:
    1. **Search-index extracts of the primary pages.** These are guide.data.gov.sg developer-guide pages, data.gov.sg dataset pages and ura.gov.sg circulars. Each primary URL is cited, even though it was read through the search index and not fetched.
    2. **Open-source code that calls these exact endpoints in production in 2026.** Several independent repos were read: their constants, column names, comments and notebook outputs.
    3. A few third-party write-ups. These are marked as such.
- **Confidence labels**
  - **[PRIMARY]**: seen in the official guide or the official dataset page (via the search index).
  - **[CORROBORATED]**: two or more independent 2026 codebases agree, with no conflict with primary text.
  - **UNVERIFIED**: my best understanding only. Code defensively.
- **Engineering rule.** The ingestion script must run a smoke test against the live API before trusting this file. It should check that the expected columns exist and that row counts are above minimums (see §5.9). It should then fail loudly instead of writing partial data.

---

## 1. Hosts and base URLs [PRIMARY + CORROBORATED]

| Purpose | Base URL | Notes |
|---|---|---|
| Catalogue: dataset and collection metadata, dataset listing | `https://api-production.data.gov.sg/v2/public/api` | Official "production" host in guide.data.gov.sg. A staging host `https://api-staging.data.gov.sg` exists, and **dataset IDs can differ on staging**. Do not use staging. |
| File download (initiate / poll) | `https://api-open.data.gov.sg/v1/public/api/datasets/{datasetId}` | Note the **v1** path and the **api-open** host. |
| Row query (CKAN-style, legacy but maintained) | `https://data.gov.sg/api/action/datastore_search` | `resource_id` = dataset ID (`d_...`). The guide calls `resource_id` "a legacy reference" to the dataset ID. |
| Row listing (newer, v2) | `https://api-production.data.gov.sg/v2/public/api/datasets/{datasetId}/list-rows` | Documented in the guide. Parameters were not confirmed (see §3.6). Not needed by us. |
| Real-time APIs (weather, etc.) | `https://api-open.data.gov.sg/v2/real-time/api` | Not used by this app. |
| Human page for a dataset | `https://data.gov.sg/datasets/{datasetId}/view` | Use this as the citation link in the UI. |
| Human page for a collection | `https://data.gov.sg/collections/{collectionId}/view` | |

Sources:
- https://guide.data.gov.sg/developer-guide/api-overview
- https://guide.data.gov.sg/developer-guide/dataset-apis
- https://raw.githubusercontent.com/hithereiamaliff/mcp-datagovsg/main/src/config.ts (`API_BASES`, 2026)

---

## 2. API keys and rate limits

### 2.1 API key [PRIMARY]

- **Is a key required?** No. Reads work anonymously. A key is **optional but recommended**, because it gives higher rate limits.
  - Effective since the self-serve key launch in the October 2025 release.
  - Sources:
    - https://guide.data.gov.sg/whats-new/release-notes-october-2025
    - https://guide.data.gov.sg/developer-guide/api-overview/how-to-use-your-api-key
- **Header name:** `x-api-key: <YOUR_API_KEY>`.
  - The guide's curl example sends it to `api-production.data.gov.sg`. The Real Time APIs page shows the same header against `api-open.data.gov.sg`.
  - Source: https://guide.data.gov.sg/developer-guide/api-overview/how-to-use-your-api-key
- **Admin header (do not use).** Write/admin APIs use a different header, `x-dgs-admin-api-key`. It is only for data owners uploading data.
  - Source: https://guide.data.gov.sg/user-guide/for-data-owners/write-apis
- **How to get a key** [PRIMARY]:
  1. Go to data.gov.sg and open the login modal at top right. Sign up; an organisation email is preferred. Verify with the email OTP.
  2. Open the dashboard, click **"Create API Key"** and choose a key type:
     - **Developer**: testing and staging, lower limits.
     - **Production**: operational use, higher limits.
  3. Describe the intended use, then click **Create**. The key is shown **once**. Copy it and store it securely.
  - Source: https://guide.data.gov.sg/developer-guide/api-overview/how-to-request-an-api-key
- **Security** [PRIMARY]: the guide warns against sharing the key or putting it in client-side code. For this app:
  - Read the key from a server-only env var. Recommended name: `DATA_GOV_SG_API_KEY`. Never use a `NEXT_PUBLIC_` variable.
  - Use the key only in build-time or ingestion scripts and in server routes.
  - Precedent: `DATA_GOV_SG_API_KEY` is used by garethgoh99/hdb-resale-dashboard, and `DATA_GOV_API_KEY` by shenghaoc/hdb-resale-visualizer.

### 2.2 Rate limits [PRIMARY + CORROBORATED by 3 codebases]

Limits are **per 10-second window**. Without a key they apply per IP; with a key they apply per key. Exceeding a limit returns **HTTP 429 "Too Many Requests"**.

| API group | No key (public) | Developer key | Production key |
|---|---|---|---|
| v2 Real-time APIs | 6 / 10 s | 12 / 10 s | 30 / 10 s |
| **Datastore Search** (`datastore_search`) | **4 / 10 s** | 8 / 10 s | 20 / 10 s |
| **Dataset Downloads** (initiate / poll) | **2 / 10 s** | 4 / 10 s | 10 / 10 s |

- Primary source: https://guide.data.gov.sg/developer-guide/api-overview/api-rate-limits
- The same numbers, citing that page, appear in:
  - `hithereiamaliff/mcp-datagovsg/src/config.ts`
  - `shenghaoc/hdb-resale-visualizer/scripts/lib/sync/rate-limits.ts`
  - the dlt/mcp docs
- **Older conflicting text.** The Download Dataset guide page still says *"if you exceed the quota of 5 requests per minute, you'll likely receive a 429 Error."* That is an older per-minute figure. To be safe, pace anonymous download calls at **≥ 12 s apart**. shenghaoc's pipeline does the same: it takes the stricter of the two limits.
  - Source: https://guide.data.gov.sg/developer-guide/dataset-apis/download-dataset
- **Metadata / catalogue endpoints.** No limit is documented for these. One MCP server paces them at 20 per 10 s anonymously. UNVERIFIED.
- **Enforcement timeline** (changes in 2025):
  - The October 2025 release notes said enforcement would start **1 Nov 2025**.
  - A later notice extended this to **31 Dec 2025**.
  - The data.gov.sg Telegram channel says **1 Jan 2026**.
  - Either way, **limits are being enforced as of Oct 2026.**
  - Sources:
    - https://guide.data.gov.sg/whats-new/release-notes-october-2025
    - https://guide.data.gov.sg/whats-new/extended-deadline-upgrade-to-api-keys-by-dec-31-2025
    - https://t.me/s/datagovsg
  - *Fact-check note (2026-10-10):* an earlier banner on data.gov.sg dataset pages (seen via the search index) gave **1 Oct 2025** as the roll-out date, before the 1 Nov and 31 Dec 2025 dates above. The Telegram "1 Jan 2026" post could not be re-found and is **UNVERIFIED**. The conclusion stands: limits are in force.
- **Rate limiting can arrive as HTTP 200.** On the download endpoints data.gov.sg returns HTTP 429 **and also** HTTP 200 with the body `{ "code": 24, "name": "TOO_MANY_REQUESTS", ... }` [CORROBORATED: subsetsio/connectors `mpa_singapore.py`, 2026]. Treat envelope `code === 24` as retryable, not as a hard error.
- **Client behaviour** (every reviewed 2026 codebase does this):
  - Retry on 429, on envelope `code === 24`, and on 5xx with exponential backoff, honouring `Retry-After` if present. mcp-datagovsg's source comment says *"data.gov.sg sends no Retry-After header"*, so the backoff fallback is the normal path.
  - Add a small courtesy delay between `datastore_search` calls. garethgoh99 uses 2.5 s without a key and 0.6 s with one. **Corrected arithmetic:** the minimum spacing is 10 s ÷ limit, i.e. 2.5 s anonymous (4/10 s, no headroom; use ≥ 2.6 s), **1.25 s with a Developer key** (8/10 s) and 0.5 s with a Production key (20/10 s). garethgoh99's 0.6 s (≈ 16.7 calls/10 s) is only safe with a **Production** key; with a Developer key it exceeds the limit by about 2×.

---

## 3. Endpoints

All JSON responses from the `api-production` and `api-open` hosts use the same envelope [PRIMARY]:

```json
{ "code": 0, "data": { ... }, "errorMsg": "" }
```

- `code === 0` means success.
- `code === 24` (with `name: "TOO_MANY_REQUESTS"`) is a rate-limit response that can come with HTTP 200 (§2.2). Retry it.
- **Quirk:** the official sample Python on dataset pages prints `json_data['errMsg']`, but the guide documents `errorMsg`. Read `json.errorMsg ?? json.errMsg`.
- The `datastore_search` host uses a **different** CKAN envelope: `{ "success": true, "result": {...} }` (§3.5).

### 3.1 Get dataset metadata [PRIMARY]

```
GET https://api-production.data.gov.sg/v2/public/api/datasets/{datasetId}/metadata
```

Source: https://guide.data.gov.sg/developer-guide/dataset-apis/get-dataset-metadata

Response shape. These are the field names documented in the guide; the guide's own example uses placeholder values.

```json
{
  "code": 0,
  "data": {
    "datasetId": "d_8b84c4ee58e3cfc0ece0d773c8ca6abc",
    "createdAt": "…ISO datetime…",
    "name": "Resale flat prices based on registration date from Jan-2017 onwards",
    "collectionIds": ["189"],
    "format": "CSV",
    "lastUpdatedAt": "…ISO datetime…",
    "managedBy": "…",
    "coverageStart": "…",
    "coverageEnd": "…",
    "datasetSize": 0,
    "columnMetadata": {
      "order": ["month", "town", "…"],
      "map": { "…": "…" },
      "metaMapping": {
        "<colId>": { "name": "…", "columnTitle": "…", "dataType": "text", "index": 0 }
      }
    }
  },
  "errorMsg": ""
}
```

- `format` (`CSV`, `GEOJSON`, `KML`, …), `columnMetadata.order` and `columnMetadata.metaMapping` are confirmed in use by mcp-datagovsg `fetchDatasetMetadata` [CORROBORATED].
- `datasetSize` and `collectionIds` are read by the same code.
- **The exact key names inside `metaMapping` entries** are not in a primary source. mcp-datagovsg reads `name`, `columnTitle`, `dataType` and `isCategorical` (one codebase; no literal `title` key). Treat as UNVERIFIED beyond that.
- **Use `lastUpdatedAt`** to decide whether to re-download. garethgoh99 checks `lastUpdatedAt` first, then `last_updated_at`, `lastUpdated` and `updatedAt`. Do the same defensively. (garethgoh99 calls metadata on `https://api-open.data.gov.sg/v2/public/api/datasets/{id}/metadata`, with a v1 fallback; the `api-production` host above is the documented one.)
- Not found returns HTTP 404. *Fact-check note:* a June 2026 audit (minghao51/egg-n-bacon-housing `docs/guides/datagovsg-resource-migration.md`) saw deleted IDs return the body `{"error": "No table found for dataset ID: ..."}` from this endpoint, which is not the `{code, data, errorMsg}` envelope. Treat any non-2xx status **or** a missing `data` object as "not found".
- **Dataset IDs are not permanent and can be repurposed.** The same audit found an old HDB resale ID (`d_5785799d63a9da091f4e0b456291eeb8`) that had been *swapped* to serve a URA private-property dataset, and three other IDs deleted. At ingest, **assert that `data.name` equals the expected official title** in §4 before using the file.

### 3.2 List datasets / collections [PRIMARY]

```
GET https://api-production.data.gov.sg/v2/public/api/datasets?page={n}                 # page ≥ 1; results in data.datasets[]
GET https://api-production.data.gov.sg/v2/public/api/collections?page={n}
GET https://api-production.data.gov.sg/v2/public/api/collections/{collectionId}/metadata?withDatasetMetadata={true|false}   # default false
```

- The collection metadata response has `data.collectionMetadata` with these fields:
  - `collectionId`, `name`, `description`
  - `lastUpdatedAt`, `coverageStart`, `coverageEnd`
  - `managedBy`, `sources`, `frequency`
  - **`childDatasets`**: a string array of `d_…` IDs
- `childDatasets` is read in production by shenghaoc/hdb-resale-visualizer via `parsed.data.collectionMetadata.childDatasets` for collection `189`, and by mcp-datagovsg.
- The dataset listing returns about **10 datasets per page**: a June 2026 audit walked 4,410 datasets across 441 pages (minghao51/egg-n-bacon-housing). Third-party figure.
- Sources:
  - https://guide.data.gov.sg/developer-guide/dataset-apis/list-all-datasets
  - https://guide.data.gov.sg/developer-guide/collection-apis

### 3.3 Download a full dataset: initiate, then poll [PRIMARY + CORROBORATED]

Source: https://guide.data.gov.sg/developer-guide/dataset-apis/download-dataset

**Step 1: initiate** (CSV datasets only):

```
GET https://api-open.data.gov.sg/v1/public/api/datasets/{datasetId}/initiate-download
```

- Documented method: **GET**. The optional JSON body is:
  ```json
  { "columnNames": ["month","town"], "filters": [ { "columnName": "town", "type": "EQ", "value": "BEDOK" } ] }
  ```
  Filter `type` is one of:
  - `EQ`: case-sensitive exact match
  - `LIKE`: partial match
  - `ILIKE`: case-insensitive partial match
- Documented responses:
  - `201` success
  - `400` failure
  - `429` rate limited
- Body: `{ code, data: { message }, errorMsg }`. The exact `message` text is UNVERIFIED.
- **Non-CSV datasets** (GeoJSON, KML, PDF, …) **skip this step** and go straight to poll [PRIMARY]: *"For datasets that do not have the CSV extension (ie GeoJSON, KML, PDF etc.), you may skip this endpoint and proceed to the Poll Download API."*
- **Node.js gotcha.** `fetch` (undici) throws on a GET with a body. Two working patterns were seen in 2026 production code:
  - garethgoh99/hdb-resale-dashboard `pipeline/fetch.py`: **GET with no body**. It downloads all 5 HDB resale eras daily or weekly.
  - shenghaoc/hdb-resale-visualizer `scripts/lib/sync/fetchers.ts`: **POST with body `{}`** (`method: "POST", body: JSON.stringify({})`).
  - **Recommendation:** send `GET` with no body. That is the documented method, and we do not need server-side filters: download the whole CSV and filter locally. Fall back to `POST {}` if the GET is rejected with 4xx.
  - Whether POST is officially supported is UNVERIFIED.

**Step 2: poll:**

```
GET https://api-open.data.gov.sg/v1/public/api/datasets/{datasetId}/poll-download
```

Response [PRIMARY: `data.status` and `data.url` are documented; the sample code reads `data.url`]:

```json
{ "code": 0, "data": { "status": "…", "url": "https://<signed S3 URL>" }, "errorMsg": "" }
```

- **Readiness.** Treat "`data.url` is present" as ready; every 2026 codebase reviewed does this.
- **Status values.** No primary source lists them. *Corrected (2026-10-10):* the success value **`DOWNLOAD_SUCCESS`** is used by three independent 2026 codebases: subsetsio/connectors `mpa_singapore.py` (`data.get("status") == "DOWNLOAD_SUCCESS" and data.get("url")`), capt-muji/rn.athan.uk `bulk-datasets.md` (`{"status":"DOWNLOAD_SUCCESS","url":"https://s3.ap-southeast-1.amazonaws.com/..."}`) and circularsquare/maps `sources/sg.md`. The last notes that **CSV (table) datasets return `status: "DOWNLOAD_SUCCESS"` with `url`, while geospatial datasets return `url` with no `status` key at all.** So keep "`data.url` present" as the readiness test; never require `status`. Other status strings (pending or failed) remain UNVERIFIED.
- **Failure.** Treat `code !== 0` (except `code === 24`, which is a rate limit to retry), or a `status` matching `/FAIL|ERROR/i`, as failure. mcp-datagovsg does the same.
- **Poll cadence.** garethgoh99 polls every 3 s, up to 40 attempts. *Corrected arithmetic:* poll calls count against the Downloads limit in §2.2, so 3 s spacing (≈ 3.3 calls/10 s) is only within limits **with a key** (Developer 4/10 s → ≥ 2.5 s; Production 10/10 s → ≥ 1 s). **Without a key, poll at ≥ 12 s** (2/10 s → ≥ 5 s, and the stricter "5 requests per minute" text → ≥ 12 s). 40 polls at 12 s is 8 minutes.
- **The URL is a pre-signed S3 URL** (an `s3.ap-southeast-1.amazonaws.com` host per capt-muji).
  - Fetch it with a plain GET and **no `x-api-key` header**. garethgoh99 comments: `# pre-signed URL: no API headers`.
  - It is **short-lived**. The exact lifetime is UNVERIFIED (one codebase says about 1 hour; kangcodex/singapore-skills says only "expire after a short period"). An expired URL returns **HTTP 403**; subsetsio treats 403 as expiry and re-polls for a fresh URL. Request it just before use, never store it, and on 403 poll again.
- **Sizes to expect:**
  - HDB resale Jan-2017+ CSV: about 21.6 MB, about 229K rows (Apr 2026). It grows by roughly 2K rows a month; TonyDS2022/sg-hdb-estates' README (2026, snapshot date not stated) reports 239,583 rows.
  - URA Master Plan 2025 land use GeoJSON: about **181 MB** (andrewchengyr/property-tracker docstring: "181 MB / 113,394 parcels"; Jenjenson/TRIAD-Sensor-Fusion lists "about 180.8 MB"). Never ship it to the browser raw.

Reference implementation (TypeScript, Node 20+, run at build or ingest time, not in a request path):

```ts
const DL = (id: string) => `https://api-open.data.gov.sg/v1/public/api/datasets/${id}`;
const headers: Record<string, string> = process.env.DATA_GOV_SG_API_KEY
  ? { 'x-api-key': process.env.DATA_GOV_SG_API_KEY } : {};

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
// Downloads limit (§2.2): anonymous 2/10 s and "5 requests per minute" → ≥ 12 s; Developer key 4/10 s → ≥ 2.5 s.
const POLL_MS = headers['x-api-key'] ? 3000 : 12000;

async function getJson(url: string, init: RequestInit = {}, tries = 6): Promise<any> {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { ...init, headers: { ...headers, Accept: 'application/json', ...(init.headers ?? {}) } });
    const backoff = () => {
      const ra = Number(r.headers.get('retry-after'));           // usually absent on data.gov.sg
      return sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 3000 * 2 ** i);
    };
    if (r.status === 429 || r.status >= 500) { await backoff(); continue; }
    if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
    const body = await r.json();
    if (body?.code === 24) { await backoff(); continue; }         // rate limit delivered as HTTP 200
    return body;
  }
  throw new Error(`${url} -> gave up after ${tries} tries`);
}

export async function downloadUrl(datasetId: string, isCsv: boolean): Promise<string> {
  if (isCsv) {
    const init = await getJson(`${DL(datasetId)}/initiate-download`); // GET, no body
    if (init.code !== 0) throw new Error(init.errorMsg ?? init.errMsg ?? 'initiate failed');
    await sleep(POLL_MS);                                              // initiate counts against the same limit
  }
  for (let i = 0; i < 40; i++) {
    const p = await getJson(`${DL(datasetId)}/poll-download`);
    if (p.code !== 0) throw new Error(p.errorMsg ?? p.errMsg ?? 'poll failed');
    if (p.data?.url) return p.data.url as string;          // ready (CSV: status DOWNLOAD_SUCCESS; GeoJSON: no status)
    if (/FAIL|ERROR/i.test(String(p.data?.status ?? ''))) throw new Error(`download failed: ${p.data.status}`);
    await sleep(POLL_MS);
  }
  throw new Error(`poll-download timed out for ${datasetId}`);
}
// then: const res = await fetch(url);   // NO x-api-key header on the S3 URL
// if (res.status === 403) → URL expired: call downloadUrl() again; else const csvText = await res.text();
```

### 3.4 Which method to use for what

| Need | Use |
|---|---|
| Full ingest of a CSV dataset (resale, property info, rentals, RPI, schools) | initiate + poll (one file, fewest calls) |
| GeoJSON / KML layers (MRT exits, HDB buildings, Master Plan) | poll-download only (no initiate) |
| Small ad-hoc server-side lookups, or a fallback if download fails | `datastore_search` with paging |

### 3.5 `datastore_search` [PRIMARY for params; CORROBORATED for response shape]

```
GET https://data.gov.sg/api/action/datastore_search?resource_id={datasetId}&limit={n}&offset={n}
```

Source: https://guide.data.gov.sg/developer-guide/dataset-apis/search-and-filter-within-dataset

| Param | Meaning [PRIMARY] |
|---|---|
| `resource_id` | **Required.** The dataset ID `d_…`. |
| `limit` | Maximum rows to return. **Default 100.** |
| `offset` | Number of rows to skip. |
| `fields` | Comma-separated fields to return. Default: all, in original order. |
| `filters` | **URL-encoded JSON** dict of exact-match conditions, e.g. `filters={"town":"BEDOK","flat_type":"4 ROOM"}`. Values are case-sensitive and the HDB data is UPPERCASE. |
| `q` | Full-text query: a string, or a JSON dict to search specific columns. Totals with plain-text `q` may be approximate. Prefer `filters`. |
| `sort` | e.g. `sort=_id asc` or `sort=month desc,resale_price asc`. |

- **Maximum `limit`.** Not documented: **UNVERIFIED**.
  - `limit=10000` is used successfully in 2026 by three independent pipelines: andrewchengyr/property-tracker, beisong/hdbtracker and garethgoh99/hdb-resale-dashboard.
  - seehiong/autonomous-hdb-deepagents uses 5000. mcp-datagovsg caps its own tool at 1000.
  - Use **`limit ≤ 10000`**, and fall back to 5000 if the call errors.
- **Stable paging.** Always pass **`sort=_id asc`**. seehiong's comment: *"an unsorted page boundary can repeat or skip rows as the server reorders."*
- **End of paging.** Stop when `records.length === 0`, or when `offset >= result.total`. Do **not** rely on `_links.next`, which is a relative path and is present even on the last page (CKAN behaviour; UNVERIFIED for data.gov.sg).
- **`_id` is not stable.** It is a datastore row number and can be **reassigned when the dataset is republished**. Never use it as a transaction key.
- **The response envelope differs from §3.**

```json
{
  "success": true,
  "result": {
    "resource_id": "d_8b84c4ee58e3cfc0ece0d773c8ca6abc",
    "fields": [ { "type": "int4", "id": "_id" }, { "type": "text", "id": "month" }, "… one entry per column …" ],
    "records": [ { "_id": 1, "month": "2017-01", "town": "ANG MO KIO", "…": "…" } ],
    "_links": { "start": "/api/action/datastore_search?resource_id=d_…", "next": "/api/action/datastore_search?resource_id=d_…&offset=100" },
    "limit": 100,
    "total": 229000
  }
}
```

- `success`, `result.records`, `result.total` and `result._links.start/next` are [CORROBORATED] (official guide example plus 5 codebases).
- The `fields[].type` values are UNVERIFIED.
- **Record values arrive as strings**, even for numeric columns (`"resale_price": "232000"`, `"floor_area_sqm": "44"`). The yahweh9/hdb-resale-pipeline README says "every column arrives as text". **Always coerce with `Number()`** and validate.
- `success: false` means a bad request. Treat it as an error even when HTTP status is 200.
- An unknown `filters` value returns **HTTP 200 with 0 records** and no error. Validate filter values against known enums.

### 3.6 `list-rows` (v2) [PRIMARY existence only]

```
GET https://api-production.data.gov.sg/v2/public/api/datasets/{datasetId}/list-rows
```

- The documented 200 body includes `rows`, `resourceId`, `resourceName`, `limit` and `links.next`. Documented errors: 429.
- **Query parameters (limit, cursor, filters) are UNVERIFIED.** Do not depend on this endpoint; use §3.3 or §3.5.
- Source: https://guide.data.gov.sg/developer-guide/dataset-apis/list-rows-of-dataset

### 3.7 Deprecation status

- No deprecation of `datastore_search` was found as of Oct 2026. The guide still documents it. sfdye/pasarguru PR #78 (merged 14 Sep 2026) says data.gov.sg "announced no retirement date for `datastore_search`" and that it is "still maintained and documented".
  - *Conflicting third-party claim:* kangcodex/singapore-skills `docs/api/HDB.md` says the legacy CKAN `datastore_search` endpoint "returns 404 and should not be used". Several other 2026 codebases still call it. This conflict is unresolved (UNVERIFIED either way), which is one more reason to use initiate/poll download as the primary path and `datastore_search` only as a fallback.
- Legacy CKAN metadata APIs and `legacy.data.gov.sg` were sunset in Q4 2023. Do **not** use any of these:
  - `data.gov.sg/api/action/package_show`
  - `resource_show`
  - old UUID resource IDs such as `resource_id=52e93430-…`
- Only `d_…` IDs are valid.

---

## 4. Dataset ID master table

The "Rows / coverage" column is a snapshot seen in the dataset page via the search index; check it live through §3.1 metadata.

| Key in our code | Dataset ID | Official title | Agency | Collection | Format | Rows / coverage (as seen) | Confidence |
|---|---|---|---|---|---|---|---|
| `RESALE_1990_1999` | `d_ebc5ab87086db484f88045b47411ebc5` | Resale Flat Prices (Based on Approval Date), 1990 - 1999 | HDB | 189 | CSV | 287,196 rows (third-party count: JosiahMendes, leesaichee); Jan 1990–Dec 1999; last updated 28 Aug 2024 | PRIMARY + 4 codebases |
| `RESALE_2000_2012FEB` | `d_43f493c6c50d54243cc1eab0df142d6a` | Resale Flat Prices (Based on Approval Date), 2000 - Feb 2012 | HDB | 189 | CSV | 369,651 rows (third-party count); Jan 2000–Feb 2012 | PRIMARY + 4 codebases |
| `RESALE_2012MAR_2014` | `d_2d5ff9ea31397b66239f245f57751537` | Resale Flat Prices (Based on Registration Date), From Mar 2012 to Dec 2014 | HDB | 189 | CSV | 52,203 rows (third-party count); last updated 28 Aug 2024 | PRIMARY + 4 codebases |
| `RESALE_2015_2016` | `d_ea9ed51da2787afaf8e51f827c304208` | Resale Flat Prices (Based on Registration Date), From Jan 2015 to Dec 2016 | HDB | 189 | CSV | 37,153 rows (third-party count from two independent analyses, JosiahMendes and leesaichee; garethgoh99 asserts ≥30,000); last updated 28 Aug 2024 | PRIMARY + 4 codebases |
| `RESALE_2017_ON` | `d_8b84c4ee58e3cfc0ece0d773c8ca6abc` | Resale flat prices based on registration date from Jan-2017 onwards | HDB | 189 | CSV | ~229K rows, Jan 2017–Apr 2026 (snapshot); **live, updated continually** | PRIMARY + 6 codebases |
| `HDB_PROPERTY_INFO` | `d_17f5382f26140b1fdae0ba2ef6239d2f` | HDB Property Information | HDB | 150 | CSV | ~13.3K rows, 932 KB; "Data from Jan 1937 to Dec 2025"; updated quarterly (pages show last-updated 06 Apr 2026 and 06 Jul 2026) | PRIMARY + 3 codebases |
| `HDB_RENTALS` | `d_c9f57187485a850908655db0e8cfe651` | Renting Out of Flats from Jan 2021 | HDB | 166 | CSV | ~209.9K rows, Jan 2021–Aug 2026, last updated 02 Sep 2026 | PRIMARY + 1 codebase |
| `HDB_RPI` | `d_14f63e595975691e7c24a27ae4c07c79` | HDB Resale Price Index (1Q2009 = 100), Quarterly | HDB | 152 | CSV | 146 rows (1990-Q1 … 2026-Q2), 2.1 KB | PRIMARY |
| `MOE_SCHOOLS` | `d_688b934f82c1059ed0a6993d2a829089` | General information of schools | MOE | 457 ("School Directory and Information") | CSV | 337 rows (Apr 2026; also shape `(337, 31)` in XiyanM/resaleradar and "337 schools" in TonyDS2022 and minghao51) | PRIMARY + 4 codebases |
| `LTA_MRT_EXITS` | `d_b39d3a0871985372d7e1637193335da5` | LTA MRT Station Exit (GEOJSON) | LTA | 367 | GeoJSON | ~597 exit points / ~186 stations (third-party count, Apr 2026); collection lastUpdated 2026-01-06 (pages also show 04 Dec 2025 and 19 Jul 2026) | PRIMARY + 3 codebases |
| (alt) | `d_f820139ee3b0865b5512cf61ab7d1122` | LTA MRT Station Exit (KML) | LTA | 367 | KML | KML twin. Do not use. | PRIMARY (search) |
| `HDB_BUILDINGS` | `d_16b157c52ed637edd6ba1232e026258d` | HDB Existing Building | HDB | 2033 | GeoJSON | 13,352 polygons (notebook output, 2025) | PRIMARY title + 1 codebase |
| `URA_MP19_LANDUSE` (optional) | `d_90d86daa5bfaa371668b84fa5f01424f` | Master Plan 2019 Land Use layer | URA | 1646 | GeoJSON | "Data from Dec 2019", last updated 05 Dec 2025 | PRIMARY |
| `URA_MP25_LANDUSE` (preferred, optional) | `d_a8c3546b26712e35021f3a681d0353ae` | Master Plan 2025 Land Use Layer | URA | (n/a) | GeoJSON | ~181 MB; ~113K parcels (third-party) | PRIMARY + 1 codebase |
| `URA_MP25_LANDUSE_AMEND` (optional) | `d_7a03324bed531cdff76a16239b0e84e1` | Amendment to Master Plan 2025 Land Use Layer | URA | (n/a) | GeoJSON | updated as amendments are gazetted | PRIMARY (search) |
| `URA_MP19_RAIL_STATION` (optional) | `d_8d886e3a83934d7447acdf5bc6959999` | Master Plan 2019 Rail Station layer (GEOJSON) | URA | (n/a) | GeoJSON | station outlines; attrs incl. `NAME`, `RAIL_TYPE`, `GRND_LEVEL` | PRIMARY (search) |
| (optional) | `d_bd17bca97549a4ab0fb7b6ad102d640c` | Master Plan 2019 Rail Station Name layer (GEOJSON) | URA | (n/a) | GeoJSON | label annotations | PRIMARY (search) |
| (optional) | `d_9a6bdc9d93bd041eb0cfbb6a8cb3248f` | Amendment to Master Plan 2019 Rail Station layer | URA | (n/a) | GeoJSON | "Data from Sep 2025" | PRIMARY (search) |
| (optional) | `d_2cc750190544007400b2cfd5d7f53209` | Master Plan 2025 Planning Area Boundary (No Sea) | URA | (n/a) | GeoJSON | (n/a) | PRIMARY (search) |

Notes:
- Do **not** use `d_60a6c3d88483cf63d2063c93771a6aeb`. One search snippet titled it "HDB Existing Building", but the ID confirmed by the dataset-page title and by the seehiong notebook citation is `d_16b157c52ed637edd6ba1232e026258d`. kangcodex/singapore-skills lists collection **2033 "HDB Existing Building" with 2 datasets**, these two IDs, which fits the other one being a twin in another format (its format is still UNVERIFIED).
- Collection IDs **189, 150, 152, 166, 1646 and 2033** match the kangcodex/singapore-skills catalogue dump (third-party). Collections 367 (LTA MRT exits) and 457 (MOE) were not independently re-checked.
- A SingStat-sourced duplicate RPI table exists: `d_f0c768860912d66940efdac9435dc046`, "Housing And Development Board (HDB) Resale Price Index (1Q2009 = 100), Quarterly". It is **wide format**, with one column per quarter such as `20261Q`. **Do not use it**; use `d_14f63e595975691e7c24a27ae4c07c79`.
- Rather than hard-coding the five resale IDs only, you can also resolve them at run time from `collections/189/metadata` → `childDatasets` (shenghaoc does this). **Do both**: hard-code the IDs, and assert at ingest that collection 189 still lists exactly these five.

Dataset pages (citations):
- https://data.gov.sg/collections/189/view
- https://data.gov.sg/datasets/d_ebc5ab87086db484f88045b47411ebc5/view
- https://data.gov.sg/datasets/d_43f493c6c50d54243cc1eab0df142d6a/view
- https://data.gov.sg/datasets/d_2d5ff9ea31397b66239f245f57751537/view
- https://data.gov.sg/datasets/d_ea9ed51da2787afaf8e51f827c304208/view
- https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view
- https://data.gov.sg/datasets/d_17f5382f26140b1fdae0ba2ef6239d2f/view
- https://data.gov.sg/datasets/d_c9f57187485a850908655db0e8cfe651/view
- https://data.gov.sg/datasets/d_14f63e595975691e7c24a27ae4c07c79/view
- https://data.gov.sg/datasets/d_688b934f82c1059ed0a6993d2a829089/view
- https://data.gov.sg/datasets/d_b39d3a0871985372d7e1637193335da5/view
- https://data.gov.sg/datasets/d_16b157c52ed637edd6ba1232e026258d/view
- https://data.gov.sg/datasets/d_90d86daa5bfaa371668b84fa5f01424f/view
- https://data.gov.sg/datasets/d_a8c3546b26712e35021f3a681d0353ae/view

Corroborating code:
- https://github.com/garethgoh99/hdb-resale-dashboard (`pipeline/fetch.py`: all 5 resale IDs with era labels)
- https://github.com/seehiong/autonomous-hdb-deepagents (README citations plus `notebook/data-ingestion/*.ipynb` outputs)
- https://github.com/andrewchengyr/property-tracker (README plus `ingest/*.py`)
- https://github.com/shenghaoc/hdb-resale-visualizer (`scripts/lib/sync/constants.ts`)

---

## 5. Dataset schemas (exact column names)

### 5.1 HDB resale flat prices: all eras

**Columns per era** [CORROBORATED: garethgoh99 `REQUIRED_COLS` across all 5 files, plus harmonize.py, shenghaoc normalization.ts, andrewchengyr hdb.py]

| Era (dataset) | `month` basis | Columns, in file order |
|---|---|---|
| 1990–1999 (`d_ebc5…`) | **approval** date | `month, town, flat_type, block, street_name, storey_range, floor_area_sqm, flat_model, lease_commence_date, resale_price` (10 cols) |
| 2000–Feb 2012 (`d_43f4…`) | **approval** date | same 10 cols |
| Mar 2012–Dec 2014 (`d_2d5f…`) | **registration** date | same 10 cols |
| Jan 2015–Dec 2016 (`d_ea9e…`) | **registration** date | same 10 cols **+ `remaining_lease`** (inserted before `resale_price`) = 11 cols |
| Jan 2017 onwards (`d_8b84…`) | **registration** date | same 11 cols as 2015–2016 |

- **`remaining_lease`** exists **only** in the 2015–2016 and 2017+ files, and its format differs:
  - **2015–2016**: plain integer years, e.g. `"70"`. garethgoh99 comment: *"2015-2016 era: plain year count (possibly as text via the API)"*. The data.gov.sg page types it as text.
  - **2017+**: a string like `"61 years 04 months"`. Some rows may be `"62 years"` with no months part. Parse with:
    ```ts
    // returns decimal years, or null
    function parseRemainingLease(s: string | null | undefined): number | null {
      if (s == null || String(s).trim() === '') return null;
      const t = String(s).trim();
      if (/^\d+(\.\d+)?$/.test(t)) return Number(t);                 // 2015–2016 era
      const y = /(\d+)\s*year/i.exec(t)?.[1], m = /(\d+)\s*month/i.exec(t)?.[1];
      if (!y && !m) return null;
      return Number(y ?? 0) + Number(m ?? 0) / 12;                    // 2017+ era
    }
    ```
  - **Eras with no `remaining_lease`** (pre-2015): derive it. The standard approximation is `99 - (txnYear - lease_commence_date)`; garethgoh99 uses this fallback. Label it as *derived* in the UI.
- **Field semantics** [PRIMARY: dataset page notes]:
  - `month`: `"YYYY-MM"`. It is the **approval** month up to Feb 2012 and the **registration** month from Mar 2012. The collection page notes: "from March 2012 onwards, the data are based on the date of registration of the resale transactions."
  - `town`: UPPERCASE town name (see §6).
  - `flat_type`: one of `1 ROOM`, `2 ROOM`, `3 ROOM`, `4 ROOM`, `5 ROOM`, `EXECUTIVE`, `MULTI-GENERATION`.
    - **Quirk:** the 1990–1999 file spells it `MULTI GENERATION` (no hyphen; 279 rows). The 2000–Feb 2012 and Mar 2012–Dec 2014 files use `MULTI-GENERATION` (leesaichee value counts). Normalise `MULTI GENERATION` → `MULTI-GENERATION`. garethgoh99 and shenghaoc both do this [CORROBORATED].
  - `block`: text, e.g. `"406"`, `"138C"`. Never parse it as a number.
  - `street_name`: UPPERCASE with HDB abbreviations, e.g. `ANG MO KIO AVE 10`, `LOR 1A TOA PAYOH`. See `docs/research/onemap-api.md` for the expansions.
  - `storey_range`: `"NN TO MM"`, e.g. `"01 TO 03"`, `"10 TO 12"`.
    - Mostly 3-storey bands, from `"01 TO 03"` up to `"49 TO 51"` in current data.
    - *Corrected (2026-10-10):* 5-storey bands (`"01 TO 05"`, `"06 TO 10"`, … `"36 TO 40"`) occur in the **Mar 2012–Dec 2014 file**, where they sit alongside 3-storey bands (e.g. `01 TO 05` = 2,700 rows). They are **absent** from the 1990–1999, 2000–Feb 2012 and 2015–2016 files, and from the 2017+ file as of its 2023 snapshot (leesaichee/Python-HDB_Flat_Resale_Price_Analysis value counts, third-party). Keep the generic parser in case new bands appear.
    - Parse generically with `/^(\d+) TO (\d+)$/`.
  - `floor_area_sqm`: numeric square metres. Per the page notes it *"includes any recess area purchased, space adding item under HDB's upgrading programmes, roof terrace, etc."*
  - `flat_model`: free text.
    - **Casing differs by era.** *Corrected:* only the **1990–1999** file is UPPERCASE (`IMPROVED`, `NEW GENERATION`, `MODEL A`). From the 2000–Feb 2012 file onwards the values are Title or sentence case (`Improved`, `New Generation`, `Model A`, `Premium Apartment`, `DBSS`, `Adjoined flat`, `2-room`, `3Gen`, …) (leesaichee value counts).
    - One analysis found 34 raw values that collapse to 21 after case and spelling cleanup (JosiahMendes/HDB-Resale-Price-Prediction).
    - Compare case-insensitively.
  - `lease_commence_date`: 4-digit year, e.g. `"1979"`.
  - `resale_price`: SGD, numeric.
- **Exclusions** [PRIMARY]:
  - Resale between relatives and resale of part shares are excluded. They "may not reflect the full market price".
  - Prices are "indicative only".
  - Repeat both in the UI disclaimer.
- **All values may arrive as strings.** This holds via `datastore_search` for certain, and the CSV is untyped. Coerce numbers.
- **Era overlap rule** (garethgoh99): the files tile the timeline month by month. If two files ever cover the same month, keep the later era's file.
- **Duplicates:** identical rows (same month, block, storey band, area and price) are legitimate distinct transactions. **Do not de-duplicate on content.**

Example rows. These are the first data rows of each file. Each line below was found verbatim in third-party CSV copies on GitHub (aisingapore/kapitan-hull; djsilenceboy/LearnTest and UPenn-CIT599 team-86; roshane/java-kitchen-sink), but not checked against the live file:

```csv
# 1990–1999 file
month,town,flat_type,block,street_name,storey_range,floor_area_sqm,flat_model,lease_commence_date,resale_price
1990-01,ANG MO KIO,1 ROOM,309,ANG MO KIO AVE 1,10 TO 12,31,IMPROVED,1977,9000
# 2015–2016 file
month,town,flat_type,block,street_name,storey_range,floor_area_sqm,flat_model,lease_commence_date,remaining_lease,resale_price
2015-01,ANG MO KIO,3 ROOM,174,ANG MO KIO AVE 4,07 TO 09,60,Improved,1986,70,255000
# 2017+ file
month,town,flat_type,block,street_name,storey_range,floor_area_sqm,flat_model,lease_commence_date,remaining_lease,resale_price
2017-01,ANG MO KIO,2 ROOM,406,ANG MO KIO AVE 10,10 TO 12,44,Improved,1979,61 years 04 months,232000
```

### 5.2 HDB Property Information: `d_17f5382f26140b1fdae0ba2ef6239d2f`

**24 columns in file order** [CORROBORATED]:
- The seehiong notebook's `INSERT` list, plus its rename rules `1room`→`room1` … `5room`→`room5`, prove the raw headers use the digit-first form.
- The data.gov.sg page lists `bldg_contract_town` as column 11.

| # | Column | Type | Meaning / example |
|---|---|---|---|
| 1 | `blk_no` | text | `"1"`, `"686B"` |
| 2 | `street` | text | Abbreviated street, e.g. `"BEACH RD"`. Same abbreviation style as resale `street_name`. |
| 3 | `max_floor_lvl` | int | Highest floor, e.g. `16` |
| 4 | `year_completed` | int | e.g. `1970` |
| 5 | `residential` | `Y`/`N` | Block has residential units. **Filter `residential === 'Y'`**: the dataset also lists non-residential HDB blocks. |
| 6 | `commercial` | `Y`/`N` | |
| 7 | `market_hawker` | `Y`/`N` | |
| 8 | `miscellaneous` | `Y`/`N` | |
| 9 | `multistorey_carpark` | `Y`/`N` | |
| 10 | `precinct_pavilion` | `Y`/`N` | |
| 11 | `bldg_contract_town` | text code | Town **code**, not name, e.g. `BM`, `CT` (legend in §6.2) |
| 12 | `total_dwelling_units` | int | |
| 13 | `1room_sold` | int | count of sold 1-room units |
| 14 | `2room_sold` | int | |
| 15 | `3room_sold` | int | |
| 16 | `4room_sold` | int | |
| 17 | `5room_sold` | int | |
| 18 | `exec_sold` | int | |
| 19 | `multigen_sold` | int | |
| 20 | `studio_apartment_sold` | int | |
| 21 | `1room_rental` | int | HDB public rental units |
| 22 | `2room_rental` | int | |
| 23 | `3room_rental` | int | |
| 24 | `other_room_rental` | int | |

- The full 24-column order is corroborated by yctsaiyc/gov `sg_realestate.py`, which lists the 24 display names in the same order ("Block Number" … "Building Contract Town" (11th) … "Other Room Rental"). The seehiong notebook shows "5 rows × 24 columns".
- **Gotchas**
  - Column names **start with a digit** (`1room_sold`). Access them as `row['1room_sold']` and never with dot syntax. Avoid them as unquoted SQL identifiers.
  - **No postal code.** The page says to approach SingPost and that charges may apply. Get postal codes from HDB Existing Building `POSTAL_COD` (§5.7) or OneMap.
  - Example row from the notebook output: `blk_no=1, street=BEACH RD, max_floor_lvl=16, year_completed=1970, residential=Y, commercial=Y, market_hawker=N, miscellaneous=N, multistorey_carpark=N, precinct_pavilion=N, 3room_sold=138, 4room_sold=1, 5room_sold=2, exec_sold=0, multigen_sold=0, studio_apartment_sold=0, 1room_rental=0, 2room_rental=0, 3room_rental=0, other_room_rental=0`.
- Sources:
  - https://data.gov.sg/datasets/d_17f5382f26140b1fdae0ba2ef6239d2f/view
  - https://raw.githubusercontent.com/seehiong/autonomous-hdb-deepagents/main/notebook/data-ingestion/hdb-property-info.ipynb

### 5.3 Renting Out of Flats from Jan 2021: `d_c9f57187485a850908655db0e8cfe651`

Six columns. Snake_case IDs are [CORROBORATED] (andrewchengyr `rental.py`, a third-party analysis); display names are [PRIMARY].

| Column | Display name (data.gov.sg) | Example |
|---|---|---|
| `rent_approval_date` | Rent Approval Date (YYYY-MM) | `"2021-06"` |
| `town` | Town | `"TOA PAYOH"` |
| `block` | Block | `"10"` |
| `street_name` | Street Name | `"JOO SENG RD"` |
| `flat_type` | Flat Type | `"5-ROOM"` |
| `monthly_rent` | Monthly Rent (numeric) | `"2200"` |

- **flat_type uses HYPHENS here.** The values are `1-ROOM`, `2-ROOM`, `3-ROOM`, `4-ROOM`, `5-ROOM` and `EXECUTIVE`. Resale uses spaces (`4 ROOM`). **Normalise both** to one canonical enum.
  - [PRIMARY: values like "4-ROOM", "3-ROOM", "EXECUTIVE" seen on the page; andrewchengyr comment: "Matching on the raw string returns zero rows silently"]
- **Town naming differs from resale.** The resale town `"CENTRAL AREA"` appears as **`"CENTRAL"`** in this dataset. [CORROBORATED, upgraded from UNVERIFIED on 2026-10-10. Sources: andrewchengyr `rental.py` (`TOWN_ALIASES = {"CENTRAL AREA": "CENTRAL"}`, comment: "The resale and rental datasets disagree on this town's name, and on nothing" else); donkey-king-kong/sc3040_rentNest, whose rental town list ends in `"CENTRAL"`; IS415-AY2425T1-G3/UrbanScope, which filters `town != "CENTRAL"` on this data.] Map `CENTRAL` → `CENTRAL AREA` at ingest, and still diff `town` sets against §6.1.
- **Rents are owner-declared and not verified by HDB** [PRIMARY; also paraphrased by ualsg.github.io: "indicative (owner-declared) and not verified by the statutory board"]. Show this caveat.
- **No floor area.** Rent per sqm must borrow floor area from resale rows for the same block and flat type. That figure is approximate.
- Coverage starts **Jan 2021**. For approval *counts* before 2021, see `d_dad4567fc02596774010f765567780e3`, "Renting Out of Flat Approvals by Flat Type, Quarterly": Jan 2007–Sep 2021, lowercase values such as `3-room`. It is not needed.
- Source: https://data.gov.sg/datasets/d_c9f57187485a850908655db0e8cfe651/view

### 5.4 HDB Resale Price Index (1Q2009 = 100), Quarterly: `d_14f63e595975691e7c24a27ae4c07c79` [PRIMARY]

| Column | Type | Example |
|---|---|---|
| `quarter` | text `"YYYY-Qn"` | `"1990-Q1"` … `"2026-Q2"` |
| `index` | numeric | base 1Q2009 = 100 |

- 146 rows as of the Q2 2026 release. Arithmetic check: 1990-Q1 to 2025-Q4 is 36 × 4 = 144 quarters, plus 2026-Q1 and 2026-Q2, giving 146. ✓ BinhongDo-it/monetary-topology `data/SOURCES.md` (added 2026-09-25) independently describes the series as "1990-Q1 to 2026-Q2".
- Method note [PRIMARY: HDB methodology text on the page]:
  - Up to 3Q2014 the index was computed by stratification.
  - From 4Q2014 it uses **stratified hedonic regression**. (Corroborated: monetary-topology says "Stratification method to 3Q2014, stratified hedonic regression from 4Q2014.")
  - Pre-2014 values were rescaled by 100 / 138.3. **UNVERIFIED:** the primary page could not be re-read and no second source gives the factor. Do not quote it in the UI.
- `index` is a reserved word in some SQL dialects. Quote it.
- The latest value is not quoted here. Read it from the data. Third-party figures differ: SingStat 4Q2025 = 203.6; propkaki 2Q2026 = 202.8 (both UNVERIFIED). One weak consistency check: sanand0/talks (Jul 2026) reports that the RPI rose "51.5% from 2017-Q1 to 2026-Q2". With 1Q2017 = 133.9 (from memory, unsourced), that implies about 202.8. Never hard-code either number.
- Release timing: HDB publishes **flash** estimates at quarter end and **final** figures about 4 weeks later. The dataset holds the final series (UNVERIFIED cadence).
- Source: https://data.gov.sg/datasets/d_14f63e595975691e7c24a27ae4c07c79/view

### 5.5 MOE General information of schools: `d_688b934f82c1059ed0a6993d2a829089`

**31 columns in file order** [CORROBORATED]. Sources: the seehiong notebook `df.head()` (visible columns) plus its SQL schema (the 11 elided columns); andrewchengyr `schools.py`; shenghaoc `normalization.ts`.

```
school_name, url_address, address, postal_code, telephone_no, telephone_no_2, fax_no, fax_no_2,
email_address, mrt_desc, bus_desc, principal_name, first_vp_name, second_vp_name, third_vp_name,
fourth_vp_name, fifth_vp_name, sixth_vp_name, dgp_code, zone_code, type_code, nature_code,
session_code, mainlevel_code, sap_ind, autonomous_ind, gifted_ind, ip_ind,
mothertongue1_code, mothertongue2_code, mothertongue3_code
```

- **Example row** (visible columns, notebook output):
  - `school_name=ADMIRALTY PRIMARY SCHOOL`, `url_address=https://admiraltypri.moe.edu.sg/`, `address=11 WOODLANDS CIRCLE`, `postal_code=738907`
  - `telephone_no=63620598`, `telephone_no_2=na`, `fax_no=63627512`, `fax_no_2=na`, `email_address=ADMIRALTY_PS@MOE.EDU.SG`, `mrt_desc=Admiralty Station`
  - `nature_code=CO-ED SCHOOL`, `session_code=FULL DAY`, `mainlevel_code=PRIMARY`
  - `sap_ind=No`, `autonomous_ind=No`, `gifted_ind=No`, `ip_ind=No`
  - `mothertongue1_code=CHINESE`, `mothertongue2_code=MALAY`, `mothertongue3_code=TAMIL`
- **Missing values are the literal string `"na"`.** Map them to null.
- **`postal_code` must be a string padded to 6 digits.** Singapore postal codes can start with `0`, and pandas or a naive CSV parse drops the zero. Read the CSV with all columns as strings.
- **No lat/lng in the dataset.** Geocode by `postal_code` via OneMap (see `onemap-api.md`).
- **`mainlevel_code` values.** *Updated 2026-10-10:* the full set in the 337-row file, with counts, is [CORROBORATED: XiyanM/resaleradar `notebooks/05_amenity_data.ipynb` output; the same strings appear in TonyDS2022/sg-hdb-estates, ongelvis/school-compass and NexDoorSg code]:

  | `mainlevel_code` | Schools |
  |---|---|
  | `PRIMARY` | 179 |
  | `SECONDARY (S1-S5)` | 117 |
  | `SECONDARY (S1-S4)` | 16 |
  | `JUNIOR COLLEGE` | 10 |
  | `MIXED LEVEL (S1-JC2)` | 10 |
  | `MIXED LEVEL (P1-S4)` | 3 |
  | `CENTRALISED INSTITUTE` | 1 |
  | `MIXED LEVEL (S1-S5, JC1-JC2)` | 1 |
  | **Total** | **337** ✓ |

  - **To detect schools with a P1 intake**, use `mainlevel_code === 'PRIMARY' || /P1/.test(mainlevel_code)`, as andrewchengyr does. Today that yields 179 + 3 = 182 schools. Never exact-match a single value.
- `zone_code` is UPPERCASE: `NORTH`, `SOUTH` and `EAST` were seen in raw rows; `WEST` is assumed.
- `dgp_code` holds planning-area names in UPPERCASE, e.g. `ANG MO KIO`, `HOUGANG`, `KALLANG`, `PUNGGOL` (raw CSV rows mirrored in seehiong and TonyDS2022). The exact semantics are UNVERIFIED.
- **Values carry stray whitespace.** For example, `address` is `"10 ANG MO KIO STREET 53   "` with trailing spaces, and `email_address` casing varies between file versions. Trim every field.
- Sources:
  - https://data.gov.sg/datasets/d_688b934f82c1059ed0a6993d2a829089/view
  - https://data.gov.sg/collections/457/view
  - https://raw.githubusercontent.com/seehiong/autonomous-hdb-deepagents/main/notebook/data-ingestion/moe-sg-schools.ipynb

### 5.6 LTA MRT Station Exit (GEOJSON): `d_b39d3a0871985372d7e1637193335da5`

- **Retrieval:** use poll-download only; it is a non-CSV dataset.
- **Geometry:** `Point`, coordinates `[lon, lat]` in WGS84 decimal degrees.
  - Coordinates may carry a 3rd (Z) value; take only `[0]` and `[1]`. *Fact-check:* seehiong's loader unpacks each `coordinates` array into exactly `lon, lat` and runs without error, so the current file is probably 2-D. Keep the defensive slice anyway.
- **Feature `properties`** [PRIMARY: the attribute table on the dataset page lists these 5; CORROBORATED by 3 codebases]:

| Property | Example |
|---|---|
| `OBJECTID` | `14641` |
| `STATION_NA` | `"JELAPANG LRT STATION"`, `"BRIGHT HILL MRT STATION"`, `"LENTOR MRT STATION"` |
| `EXIT_CODE` | `"Exit A"`, `"Exit 1"`, `"Exit 4"` |
| `INC_CRC` | `"45CDB0D9BDC73079"` (record hash) |
| `FMEL_UPD_D` | `"20231019120510"` (yyyyMMddHHmmss) |

- **Station list.** No official point-per-station dataset exists. Derive it by grouping exits on `STATION_NA` and averaging the exit coordinates.
  - Strip the `" MRT STATION"` or `" LRT STATION"` suffix for display.
  - **LRT stations are included** (BPL / Sengkang / Punggol LRT). Use the suffix to set mode.
  - Interchanges appear once per name, not once per line. Line membership (NS/EW/…) is **not** in this dataset. If you need line colours, keep a hand-curated station-to-lines table.
- **Older exports** of LTA and URA layers put attributes inside an HTML table in a `Description` property; current GeoJSON uses plain properties (seehiong `datagov.py` docstring). **Support both.** If `STATION_NA` is missing but `Description` exists, parse `<th>STATION_NA</th> <td>…</td>` from it.
- **Size:** about 597 exits and 186 stations (leejaew/sg-mrt-exits-mcp README, retrieved 15 Apr 2026; re-read 2026-10-10). Third-party count; assert a sanity range at ingest (e.g. 400–900 features).
  - That README spells the ID property `OBJECT_ID`. The seehiong notebook's actual DataFrame output shows `OBJECTID`, the form used above; treat `OBJECT_ID` as a README typo, but read either.
- **Alternative station outlines:** URA "Master Plan 2019 Rail Station layer (GEOJSON)" `d_8d886e3a83934d7447acdf5bc6959999`. Attributes include `NAME`, `RAIL_TYPE` and `GRND_LEVEL`. It is indicative only and reflects the 2019 plan, so it may include planned stations that are not yet open. Prefer the exits.
- Sources:
  - https://data.gov.sg/datasets/d_b39d3a0871985372d7e1637193335da5/view
  - https://data.gov.sg/collections/367/view
  - https://raw.githubusercontent.com/seehiong/autonomous-hdb-deepagents/main/notebook/data-ingestion/lta-mrt-exits.ipynb
  - https://github.com/leejaew/sg-mrt-exits-mcp

### 5.7 HDB Existing Building: `d_16b157c52ed637edd6ba1232e026258d`

- **Retrieval:** GeoJSON via poll-download.
- **Geometry:** `Polygon`, possibly `MultiPolygon`; handle both. WGS84 lon/lat, e.g. `[103.7529…, 1.3544…]`.
- **Properties** [PRIMARY: the attribute table on the dataset page lists these 9; CORROBORATED by the seehiong notebook]:

| Property | Example | Notes |
|---|---|---|
| `OBJECTID` | `898584` | |
| `BLK_NO` | `"514"`, `"686B"` | text |
| `ST_COD` | `"BUS14E"` | **street code**, not street name, so it cannot be joined to `street_name` directly |
| `ENTITYID` | `8235` | |
| `POSTAL_COD` | `"650514"` | 6-digit postal code. Keep as a string. |
| `INC_CRC` | `"74585E59F18D2E73"` | |
| `FMEL_UPD_D` | `"20130426120328"` | yyyyMMddHHmmss |
| `SHAPE.AREA` | `1033.685604` | m². The key contains a dot, so use `props['SHAPE.AREA']`. |
| `SHAPE.LEN` | `253.971941` | m |

- **Feature count:** 13,352 (2025 notebook).
- **Use:**
  - Block footprints and centroids on the map.
  - Postal codes for blocks.
- **Joining to resale or property info:** the key is (`BLK_NO`, postal code from OneMap) or a spatial join. There is no shared street-name key.
- Source: https://raw.githubusercontent.com/seehiong/autonomous-hdb-deepagents/main/notebook/data-ingestion/hdb-existing-building.ipynb

### 5.8 URA Master Plan land use (optional)

**Change in 2025:** URA's **Master Plan 2025 was gazetted on 1 Dec 2025, with immediate effect**, superseding MP2019 as the statutory plan. Sources:
- https://www.ura.gov.sg/guidelines/circulars/ppg25-12/
- https://www.ura.gov.sg/news/media/pr25-64/
- Corroborated, since ura.gov.sg was unreachable on 2026-10-10: andrewchengyr `ingest/masterplan.py` ("MP2025 was gazetted 1 Dec 2025") and minghao51 `docs/research/singapore-open-datasets.md` ("Gazetted 1 Dec 2025"). The "with immediate effect" wording rests on the URA pages above only.

For *current* zoning, use **MP2025**.

- **MP2025 Land Use Layer** `d_a8c3546b26712e35021f3a681d0353ae` (GeoJSON, about 181 MB).
  - Attribute table [PRIMARY: dataset page]:
    - `LU_DESC` (text, e.g. `RESIDENTIAL`, `COMMERCIAL & RESIDENTIAL`, `BUSINESS 1`, `EDUCATIONAL INSTITUTION`, `PARK`, `ROAD`, `MASS RAPID TRANSIT`, `RESERVE SITE`, `WHITE`, …)
    - `LU_TEXT`
    - `GPR` (**text**)
    - `GPR_B_MN` (numeric)
  - andrewchengyr reads `properties.LU_DESC` and `properties.GPR` directly, which shows plain properties. Its docstring says the file carries **ten properties per parcel**, so the four above are not the full set. Do not assert an exact property count.
  - `GPR` may be non-numeric codes, e.g. `EVA`, `SDP`, `LND` (UNVERIFIED). Parse with `Number()` and keep the raw text if the result is NaN.
- **Amendments to MP2025** `d_7a03324bed531cdff76a16239b0e84e1`. Its `GPR` is numeric. URA updates it as amendments are gazetted; one batch was inspectable from 13 Mar 2026.
- **MP2019 Land Use layer** `d_90d86daa5bfaa371668b84fa5f01424f`.
  - *Corrected:* MP2019 was **gazetted on 27 Nov 2019**. URA circular URA/PB/2019/20-PPG (DC19-20) and press release PR19-50, both dated 27 Nov 2019, say: "The Master Plan 2019 is officially gazetted on 27 November 2019." These were read from the drgnfrts/ura-llm-search mirror of ura.gov.sg. The earlier "approved 18 Nov 2019" has no source and was removed. The page shows "Data from Dec 2019", last updated 05 Dec 2025.
  - Fields: land-use description, gross plot ratio, shape area/length.
  - Older exports used `Name` plus an HTML `Description` table holding `LU_DESC` and `GPR`. Support both forms (UNVERIFIED for the current file).
- **Do not ship raw Master Plan GeoJSON to Vercel functions or the client.** Pre-clip and simplify at ingest, e.g. to parcels near HDB blocks, rounded to 6 decimals.

### 5.9 Ingest-time assertions (copy into the pipeline)

**Minimum row counts.** The five resale minimums are garethgoh99's exact values (250,000 / 300,000 / 45,000 / 30,000 / 200,000, checked against `pipeline/fetch.py`). The others are ours, set below the observed counts:

| Dataset | Minimum rows |
|---|---|
| resale 1990–99 | ≥ 250,000 |
| resale 2000–Feb 2012 | ≥ 300,000 |
| resale Mar 2012–2014 | ≥ 45,000 |
| resale 2015–16 | ≥ 30,000 |
| resale 2017+ | ≥ 200,000 |
| property info | ≥ 12,000 |
| rentals | ≥ 150,000 |
| RPI | ≥ 140 |
| schools | ≥ 300 |
| MRT exits | ≥ 400 |
| HDB buildings | ≥ 12,000 |

**Other checks**

- Required columns exist, comparing the header after trim and lowercase:
  - Resale: the 10 base columns in §5.1, plus `remaining_lease` for the 2015–16 and 2017+ files.
  - The other datasets: the column lists in §5.2–5.7.
- **Every resale `month`** matches `/^\d{4}-\d{2}$/` and falls inside the era's documented range.
- **Every `town`** is in the known set (§6.1), after the rental-dataset mapping.
- **Every `flat_type`**, after normalisation, is in the 7-value enum.
- **The metadata `name` for each dataset ID equals the expected official title** in §4. IDs can be repurposed (§3.1).
- **Fail the build** (keeping the previous snapshot) if any assertion fails.

---

## 6. Town names and codes

### 6.1 `town` values in the resale data (UPPERCASE, exact strings)

The 26 towns in current (2017+) data [CORROBORATED: the hdbinsights.sg Sep 2026 town table lists exactly 26; HDB's Q2 2026 Annex C includes CENTRAL AREA and KALLANG/WHAMPOA]:

```
ANG MO KIO, BEDOK, BISHAN, BUKIT BATOK, BUKIT MERAH, BUKIT PANJANG, BUKIT TIMAH, CENTRAL AREA,
CHOA CHU KANG, CLEMENTI, GEYLANG, HOUGANG, JURONG EAST, JURONG WEST, KALLANG/WHAMPOA,
MARINE PARADE, PASIR RIS, PUNGGOL, QUEENSTOWN, SEMBAWANG, SENGKANG, SERANGOON, TAMPINES,
TOA PAYOH, WOODLANDS, YISHUN
```

- **Historic extra:** the full 1990–2026 data has **27** unique towns (JosiahMendes analysis). The 27th is **`LIM CHU KANG`**, which appears only in the 1990–1999 file, with **64 rows** [CORROBORATED, upgraded from UNVERIFIED: JosiahMendes ("only had 64 resale transactions") and the leesaichee value counts (`LIM CHU KANG 64` in the 1990–99 file only)]. Keep it in the enum, but do not show it as a selectable current town.
- **`TENGAH`**: HDB's newest town. Its first residents arrived in 2023; the month is UNVERIFIED (the earlier "around Aug 2023" has no source, and one third-party page says "first residents 2023-24"). **It does not appear in resale data yet**: the 2017–2023 snapshot has 26 towns (leesaichee), and the hdbinsights.sg Sep 2026 table cited above lists 26 (not re-checked on 2026-10-10). The 5-year MOP means the earliest ordinary Tengah resales are around 2028. It does appear as code `TG` in Property Information.
  - The code must accept new town strings without crashing: log them and include them.
- **Spelling traps:** `KALLANG/WHAMPOA` has a slash and no spaces. `CENTRAL AREA` is `CENTRAL` in the rental dataset (CORROBORATED, §5.3).

### 6.2 `bldg_contract_town` codes (HDB Property Information) [PRIMARY: legend on the dataset page]

The legend text on the page reads *"AMK - ANG MO KIO BB - BUKIT BATOK BD - BEDOK BH - BISHAN BM - BUKIT MERAH BP - BUKIT PANJANG BT - BUKIT TIMAH CCK - CHOA CHU KANG CL - CLEMENTI CT - CENTRAL AREA GL - GEYLANG HG - HOUGANG JE - JURONG EAST …"*. The remaining entries were confirmed individually through search extracts of the same page (KWN, PRC, TG, MP, QT, SB, SK, TAP, TP, WL). The full 27-code mapping:

```ts
export const HDB_TOWN_CODE: Record<string, string> = {
  AMK: 'ANG MO KIO',      BB: 'BUKIT BATOK',     BD: 'BEDOK',          BH: 'BISHAN',
  BM: 'BUKIT MERAH',      BP: 'BUKIT PANJANG',   BT: 'BUKIT TIMAH',    CCK: 'CHOA CHU KANG',
  CL: 'CLEMENTI',         CT: 'CENTRAL AREA',    GL: 'GEYLANG',        HG: 'HOUGANG',
  JE: 'JURONG EAST',      JW: 'JURONG WEST',     KWN: 'KALLANG/WHAMPOA', MP: 'MARINE PARADE',
  PG: 'PUNGGOL',          PRC: 'PASIR RIS',      QT: 'QUEENSTOWN',     SB: 'SEMBAWANG',
  SGN: 'SERANGOON',       SK: 'SENGKANG',        TAP: 'TAMPINES',      TG: 'TENGAH',
  TP: 'TOA PAYOH',        WL: 'WOODLANDS',       YS: 'YISHUN',
};
```

- *Updated 2026-10-10:* all 27 code→name pairs, including `JW`, `PG`, `SGN` and `YS`, match these independent copies exactly:
  - yctsaiyc/gov `singapore/sg_realestate.py`
  - seehiong/hdb-price-predictor `02c_enrich_property_info.py`
  - AY22-23S2-IS3107-Group6/ezproperty `propertyInfo.py`
  - teyang-lau/HDB_Resale_Prices `metadata-hdb-property-information.txt`, a copy of the legacy data.gov.sg metadata (`'TG - TENGAH'`)

  [CORROBORATED]
- The map values match the resale `town` strings, so codes map 1:1 onto resale towns.
- The data.gov.sg page notes that some codes in the legend may have no rows.

---

## 7. Summary of UNVERIFIED items (handle defensively in code)

1. **`poll-download` `data.status` strings other than `DOWNLOAD_SUCCESS`.** `DOWNLOAD_SUCCESS` is now corroborated by 3 codebases for CSV; GeoJSON has no `status`. Use "has `data.url`" as the success signal.
2. **The initiate-download success `message` text.** Whether **POST** is officially accepted (GET is documented; both work in 2026 production code).
3. **Maximum `limit` for `datastore_search`.** 10,000 works in practice. Also whether `datastore_search` still works at all: one third-party doc says it returns 404 (§3.7).
4. **Pre-signed S3 URL lifetime.** About 1 h per a third party. An expired URL returns 403.
5. **Rate limit for the metadata/catalogue endpoints.**
6. **Inner key names of `columnMetadata.metaMapping`.** One codebase reads `name`, `columnTitle`, `dataType` and `isCategorical`.
7. **`list-rows` v2 query parameters.**
8. ~~Rental `town` spelling for Central Area~~. **Resolved:** it is `CENTRAL` (§5.3).
9. ~~Whether `LIM CHU KANG` appears in the 1990s resale file~~. **Resolved:** yes, 64 rows (§6.1).
10. ~~Full list of MOE `mainlevel_code` values, and `zone_code` casing~~. **Resolved** (§5.5); `WEST` is assumed, not seen.
11. **Whether MP2019 or MRT-exit GeoJSON still carries the HTML `Description` variant.** Support both.
12. ~~Exact row count of the 2015–2016 resale file~~. **Resolved:** 37,153, a third-party count (§4).
13. ~~The 5-storey `storey_range` bands~~. **Resolved:** Mar 2012–Dec 2014 file only (§5.1).
14. **RPI pre-2014 rescaling factor 100/138.3**, and the latest RPI values.
15. **Telegram "1 Jan 2026" enforcement date**, and Tengah's first-resident month.
16. **Collection IDs 367 and 457.**

---

## 8. Sources

Primary, read via search-index extracts because direct fetch failed.

guide.data.gov.sg developer guide:
- https://guide.data.gov.sg/developer-guide/api-overview
- https://guide.data.gov.sg/developer-guide/api-overview/api-rate-limits
- https://guide.data.gov.sg/developer-guide/api-overview/how-to-request-an-api-key
- https://guide.data.gov.sg/developer-guide/api-overview/how-to-use-your-api-key
- https://guide.data.gov.sg/developer-guide/dataset-apis
- https://guide.data.gov.sg/developer-guide/dataset-apis/download-dataset
- https://guide.data.gov.sg/developer-guide/dataset-apis/get-dataset-metadata
- https://guide.data.gov.sg/developer-guide/dataset-apis/list-all-datasets
- https://guide.data.gov.sg/developer-guide/dataset-apis/search-and-filter-within-dataset
- https://guide.data.gov.sg/developer-guide/dataset-apis/list-rows-of-dataset
- https://guide.data.gov.sg/developer-guide/collection-apis
- https://guide.data.gov.sg/user-guide/for-data-owners/write-apis

guide.data.gov.sg release notes:
- https://guide.data.gov.sg/whats-new/release-notes-october-2025
- https://guide.data.gov.sg/whats-new/extended-deadline-upgrade-to-api-keys-by-dec-31-2025

data.gov.sg dataset and collection pages: listed in §4.

URA:
- https://www.ura.gov.sg/guidelines/circulars/ppg25-12/
- https://www.ura.gov.sg/news/media/pr25-64/

Corroborating open-source code, read directly via GitHub in Oct 2026:
- https://github.com/hithereiamaliff/mcp-datagovsg (`src/config.ts`, `src/datasets.tools.ts`, `src/utils/http-client.ts`)
- https://github.com/garethgoh99/hdb-resale-dashboard (`pipeline/fetch.py`, `pipeline/harmonize.py`)
- https://github.com/shenghaoc/hdb-resale-visualizer (`scripts/lib/sync/{constants,fetchers,rate-limits,normalization}.ts`, `scripts/sync-data.ts`)
- https://github.com/seehiong/autonomous-hdb-deepagents (`db/datagov.py`, `notebook/data-ingestion/*.ipynb`)
- https://github.com/andrewchengyr/property-tracker (`ingest/{datagov,hdb,schools,rental,masterplan}.py`). Note: its `tests/fixtures` are synthetic. Their field names match the real APIs, but the values do not.
- https://github.com/beisong/hdbtracker (`scripts/download_data.py`)
- https://github.com/sfdye/pasarguru/pull/78 (`datastore_search` still maintained; legacy CKAN metadata APIs sunset Q4 2023)
- https://github.com/leejaew/sg-mrt-exits-mcp
- https://github.com/JosiahMendes/HDB-Resale-Price-Prediction

---

## Verification log

**Adversarial fact-check pass, 2026-10-10.**

**Access limits on this pass**
- These hosts were unreachable: `data.gov.sg`, `api-production.data.gov.sg`, `guide.data.gov.sg`, `ura.gov.sg`, `t.me`, `tablebuilder.singstat.gov.sg` and `wikipedia.org`. The proxy returned 403 to `curl`, and the fetch tool returned ENOTFOUND.
- The web-search budget ran out after a few queries.

**How claims were checked**
- Search-index extracts of guide.data.gov.sg.
- Source files read directly from raw.githubusercontent.com.
- GitHub code search.

**Verdicts**
- *confirmed*: matches at least one independent source and no source conflicts with it.
- *corrected*: the file was edited.
- *unverifiable*: left in place and marked UNVERIFIED.

| # | Claim (section) | Verdict | Source(s) |
|---|---|---|---|
| 1 | Rate limits per 10 s: real-time 6/12/30, datastore 4/8/20, downloads 2/4/10 (§2.2) | confirmed | Search extract of guide.data.gov.sg/developer-guide/api-overview/api-rate-limits; hithereiamaliff/mcp-datagovsg `src/config.ts` and README; shenghaoc `scripts/lib/sync/rate-limits.ts` header |
| 2 | Limits are per key, or per IP without a key; exceeding returns 429; window resets every 10 s (§2.2) | confirmed | api-rate-limits extract; mcp-datagovsg README |
| 3 | "5 requests per minute" text on the Download page, so ≥ 12 s anonymous pacing (§2.2) | confirmed (arithmetic 60/5 = 12 s ✓) | download-dataset extract; shenghaoc `DATA_GOV_ANONYMOUS_DOWNLOADS_PER_MINUTE = 5` |
| 4 | Enforcement 1 Nov 2025, extended to 31 Dec 2025 (§2.2) | confirmed | Search extracts of release-notes-october-2025 and extended-deadline page |
| 5 | Telegram says 1 Jan 2026 (§2.2) | unverifiable | t.me unreachable; not found in search. An earlier "1 Oct 2025" banner date was added |
| 6 | Rate limit can come as HTTP 200 with `code: 24` (new, §2.2/§3) | corrected (added) | subsetsio/connectors `src/mpa-singapore/src/nodes/mpa_singapore.py` |
| 7 | Courtesy delay 2.5 s anonymous / 0.6 s with key (§2.2) | corrected | Recomputed: 10 s ÷ 8 = 1.25 s minimum for a Developer key, so 0.6 s fits only a Production key (10 s ÷ 20 = 0.5 s). Values match garethgoh99 `pipeline/fetch.py` |
| 8 | Poll every 3 s × 40 attempts (§3.3) | corrected | Values match garethgoh99, but 3 s gives ≈ 3.3 calls/10 s, above the anonymous 2/10 s limit. Anonymous polling must be ≥ 12 s |
| 9 | Reference code polled every 6 s without a key (§3.3) | corrected | Contradicted the ≥ 12 s rule (6 s = 10 calls/min > 5/min). Changed to 12 s, with a wait after initiate and retry on `code === 24` |
| 10 | Poll `status` strings: "no source documents `DOWNLOAD_SUCCESS`" (§3.3) | corrected | subsetsio `mpa_singapore.py`; capt-muji/rn.athan.uk `bulk-datasets.md`; circularsquare/maps `religiondots/sources/sg.md` (GeoJSON has no `status`) |
| 11 | Pre-signed URL is short-lived (~1 h) (§3.3) | lifetime unverifiable; 403-on-expiry added | subsetsio (403 treated as expired); kangcodex/singapore-skills `docs/api/HDB.md` ("expire after a short period") |
| 12 | Host and base URLs: api-production v2, api-open v1 download, datastore_search, real-time v2 (§1) | confirmed | mcp-datagovsg `src/config.ts` `API_BASES`; garethgoh99 `fetch.py`; andrewchengyr `ingest/masterplan.py` |
| 13 | initiate-download sent as GET with no body works; shenghaoc uses POST `{}` (§3.3) | confirmed | garethgoh99 (GET); subsetsio (GET); shenghaoc `fetchers.ts` (`method: "POST", body: JSON.stringify({})`) |
| 14 | Filter types EQ / LIKE / ILIKE (§3.3) | confirmed | mcp-datagovsg `src/datasets.tools.ts` |
| 15 | Non-CSV datasets skip initiate (§3.3) | confirmed | mcp-datagovsg ("Non-CSV files are pre-generated: poll returns the link directly"); seehiong `db/datagov.py` |
| 16 | Envelope `{code, data, errorMsg}`; sample code uses `errMsg` (§3) | confirmed | mcp-datagovsg `http-client.ts` (`errorMsg`); seehiong `datagov.py` (`errMsg`) |
| 17 | Metadata 404 on not-found (§3.1) | partly corrected | minghao51/egg-n-bacon-housing `docs/guides/datagovsg-resource-migration.md` (Jun 2026): body `{"error":"No table found for dataset ID: ..."}`; also documents an ID swapped to another dataset. Added an ingest assertion on `data.name` |
| 18 | `metaMapping` inner keys (§3.1) | partly confirmed | mcp-datagovsg reads `name`, `columnTitle`, `dataType`, `isCategorical` |
| 19 | `childDatasets` read by shenghaoc for collection 189 (§3.2) | confirmed | shenghaoc `scripts/sync-data.ts` (`parsed.data.collectionMetadata.childDatasets`) |
| 20 | datastore_search limit 10000 (andrewchengyr, beisong, garethgoh99), 5000 (seehiong), mcp cap 1000 (§3.5) | confirmed | Each file read: `PAGE_SIZE = 10000`; `BATCH_SIZE = 10000`; default 10,000; `DATASTORE_BATCH = 5000`; `.max(1000)` |
| 21 | `sort=_id asc` and seehiong's comment on page boundaries (§3.5) | confirmed | seehiong `db/datagov.py` |
| 22 | datastore_search not deprecated (§3.7) | confirmed, with a conflict noted | sfdye/pasarguru PR #78 (merged 14 Sep 2026); conflicting claim in kangcodex `docs/api/HDB.md` ("returns 404") |
| 23 | Legacy metadata APIs and legacy.data.gov.sg sunset Q4 2023 (§3.7) | confirmed (third-party only) | pasarguru PR #78 |
| 24 | Five resale dataset IDs and era labels (§4) | confirmed | garethgoh99 `fetch.py`; kangcodex catalogue (collection 189 lists exactly these 5) |
| 25 | Resale row counts 287.2K / 369.7K / 52.2K / ~37K (§4) | confirmed and made exact: 287,196 / 369,651 / 52,203 / 37,153 | JosiahMendes README; leesaichee notebook shapes |
| 26 | 2017+ ~229K rows (Apr 2026) (§4) | consistent | 146,965 rows to Feb 2023 (JosiahMendes); 169,168 (leesaichee, 2023); 239,583 (TonyDS2022 README, 2026) |
| 27 | Property Info, RPI, rentals, MOE, MRT exits, HDB buildings, MP2019, MP2025 IDs (§4) | confirmed | shenghaoc `constants.ts` (property, MRT, MOE); kangcodex HDB catalogue (property, RPI, rentals, buildings); seehiong notebooks; andrewchengyr `rental.py`, `schools.py`, `masterplan.py`; kangcodex URA catalogue (MP2019, collection 1646); TonyDS2022 (MP2025 land use, MP2025 PA boundary `d_2cc75…`) |
| 28 | MP2025 amendment ID `d_7a03324…`, MP2019 rail station IDs, `d_f0c76…`, `d_dad45…`, KML twin `d_f8201…` (§4, §5.3) | unverifiable | No independent copy found |
| 29 | Collection IDs 189/150/152/166/1646/2033 (§4) | confirmed | kangcodex/singapore-skills `docs/api/HDB.md`, `docs/api/URA.md` |
| 30 | Collection IDs 367 (LTA) and 457 (MOE) (§4) | unverifiable | — |
| 31 | `d_60a6c3d…` is not the main HDB Existing Building dataset (§4) | confirmed (it is the 2nd dataset of collection 2033; format unverified) | kangcodex HDB catalogue |
| 32 | Resale column sets: 10 cols, plus `remaining_lease` from 2015 (§5.1) | confirmed | garethgoh99 `REQUIRED_COLS`; leesaichee shapes (10 cols for 1990–99, 2000–12 and 2012–14; 11 for 2015–16 and 2017+) |
| 33 | `remaining_lease` formats ("70" vs "61 years 04 months") and 99-year fallback (§5.1) | confirmed | garethgoh99 `pipeline/harmonize.py` docstring and comment. Arithmetic: 99 − (2015 − 1986) = 70 ✓; 99 − (2017 − 1979) = 61 ✓ (the file says 61 y 4 m) |
| 34 | Three example first rows (§5.1) | confirmed (verbatim in third-party CSV copies) | aisingapore/kapitan-hull; djsilenceboy/LearnTest; roshane/java-kitchen-sink |
| 35 | `MULTI GENERATION` spelling in older files (§5.1) | refined | leesaichee: 1990–99 uses a space; 2000–12 and 2012–14 use a hyphen |
| 36 | 5-storey bands: "which eras" (§5.1) | corrected (resolved) | leesaichee: Mar 2012–Dec 2014 only |
| 37 | flat_model "older files UPPERCASE" (§5.1) | corrected | leesaichee: only the 1990–99 file is UPPERCASE; 2000–12 is already Title case |
| 38 | 34 → 21 flat_model labels (§5.1) | confirmed | JosiahMendes README |
| 39 | No content de-duplication; era overlap keeps the later file (§5.1) | confirmed | garethgoh99 `harmonize.py` |
| 40 | Property Info 24 columns, order, `bldg_contract_town` 11th, example row (§5.2) | confirmed | seehiong notebook (5 rows × 24 columns, row values); yctsaiyc/gov display-name order |
| 41 | Rental columns and display names; hyphenated flat_type (§5.3) | confirmed | andrewchengyr `rental.py`; yctsaiyc/gov |
| 42 | Rental town `CENTRAL` (§5.3) | corrected (upgraded from UNVERIFIED) | andrewchengyr `TOWN_ALIASES`; donkey-king-kong/sc3040_rentNest; IS415-AY2425T1-G3/UrbanScope |
| 43 | Rents owner-declared, not verified (§5.3) | confirmed | ualsg.github.io open-urban-data page |
| 44 | RPI 146 rows, 1990-Q1 to 2026-Q2 (§5.4) | confirmed (arithmetic 144 + 2 = 146 ✓) | BinhongDo-it/monetary-topology `data/SOURCES.md` |
| 45 | RPI method change at 3Q/4Q 2014 (§5.4) | confirmed | monetary-topology `SOURCES.md` |
| 46 | RPI rescale 100/138.3; 4Q2025 = 203.6; 2Q2026 = 202.8; flash/final cadence (§5.4) | unverifiable | Primary unreachable. 2Q2026 = 202.8 is weakly consistent with "+51.5% since 2017-Q1" (sanand0/talks), but that check rests on an unsourced 1Q2017 base |
| 47 | MOE 31 columns and Admiralty example row (§5.5) | confirmed | seehiong `moe-sg-schools.ipynb` (CREATE TABLE lists 31 columns) |
| 48 | MOE `mainlevel_code` values; `zone_code` casing (§5.5) | corrected (resolved; full list with counts summing to 337 ✓) | XiyanM/resaleradar `05_amenity_data.ipynb`; raw rows in seehiong and TonyDS2022 `schools.csv` |
| 49 | MRT exit properties and example values (§5.6) | confirmed | seehiong `lta-mrt-exits.ipynb` output |
| 50 | MRT exits ~597 / 186 stations, 15 Apr 2026 (§5.6) | confirmed (third-party) | leejaew/sg-mrt-exits-mcp README (spells `OBJECT_ID`; noted) |
| 51 | MRT coordinates may have Z (§5.6) | refined | seehiong loader unpacks exactly `lon, lat` |
| 52 | HDB Existing Building properties and 13,352 features (§5.7) | confirmed | seehiong `hdb-existing-building.ipynb` ("/13352 total") |
| 53 | MP2025 gazetted 1 Dec 2025 (§5.8) | confirmed (secondary) | andrewchengyr `masterplan.py`; minghao51 `singapore-open-datasets.md`. URA pages unreachable |
| 54 | MP2025 land use ~181 MB, ~113K parcels (§5.8) | confirmed | andrewchengyr ("181 MB / 113,394 parcels"); Jenjenson/TRIAD-Sensor-Fusion ("about 180.8 MB") |
| 55 | MP2019 "approved 18 Nov 2019" (§5.8) | **corrected to gazetted 27 Nov 2019** | URA circular URA/PB/2019/20-PPG and PR19-50 (27 Nov 2019), via the drgnfrts/ura-llm-search mirror |
| 56 | Older layers put attributes in an HTML `Description` (§5.6, §5.8) | confirmed (that both forms exist) | seehiong `db/datagov.py` docstring ("older KML conversions") |
| 57 | Minimum row counts attributed to garethgoh99 (§5.9) | corrected wording | garethgoh99 `fetch.py` min_rows equal ours for resale |
| 58 | 27 unique towns; `LIM CHU KANG` in the 1990s only (§6.1) | confirmed (upgraded) | JosiahMendes (64 transactions); leesaichee (`LIM CHU KANG 64`, 1990–99 only) |
| 59 | Tengah first residents "around Aug 2023" (§6.1) | unverifiable; reduced to "2023" | Only third-party: Propheus/digital-atlas-sgp ("first residents 2023-24") |
| 60 | 27 town codes incl. JW/PG/SGN/YS/TG (§6.2) | confirmed (upgraded) | yctsaiyc/gov; seehiong/hdb-price-predictor; ezproperty; teyang-lau metadata copy |
| 61 | `x-api-key` header; env-var precedents (§2.1) | confirmed | garethgoh99 (`DATA_GOV_SG_API_KEY`); shenghaoc (`DATA_GOV_API_KEY`); mcp-datagovsg `http-client.ts` |
| 62 | Key is optional (anonymous reads work) (§2.1) | confirmed, with a conflict noted | API-overview extract ("can be accessed without an API key"); garethgoh99 runs without a key. kangcodex claims downloads "need" a key; this is contradicted, so it was not adopted |
| 63 | Admin header `x-dgs-admin-api-key` (§2.1) | confirmed (it exists) | schoolex/hdb-resale-data `generate_data.py` (sent empty from the web UI flow). Its being admin-only is per the guide and was not re-checked |
| 64 | Key-request steps, Developer vs Production tiers (§2.1) | partly confirmed | Search extracts (tiers, login modal); step-by-step UI text unverifiable |
| 65 | list-rows v2 response fields (§3.6) | unverifiable | — |
| 66 | Listing ≈ 10 datasets per page (new, §3.2) | added (third-party) | minghao51 migration doc (4,410 datasets over 441 pages) |
