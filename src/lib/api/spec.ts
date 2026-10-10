import { site } from "@/lib/config/site";
import { CACHE, PUBLIC_API_RATE_LIMIT } from "./constants";
import { toJsonSchema, type JsonSchema } from "./json-schema";
import {
  BUYER_PROFILES,
  CondoResponseSchema,
  ErrorSchema,
  HdbBlockResponseSchema,
  HdbSalesResponseSchema,
  LaunchesResponseSchema,
  MortgageResponseSchema,
  RatesResponseSchema,
  SearchResponseSchema,
  StampDutyResponseSchema,
  TownsResponseSchema,
} from "./schemas";

export { toJsonSchema, type JsonSchema };

/**
 * The public API, described once. The OpenAPI document (/openapi.json) and the reference page (/docs/)
 * are both generated from API_ENDPOINTS, and a unit test checks every path has a route handler.
 */

export interface ApiParam {
  name: string;
  in: "path" | "query";
  required: boolean;
  description: string;
  schema: JsonSchema;
  example?: string | number;
}

export interface ApiEndpoint {
  operationId: string;
  method: "GET";
  /** OpenAPI path template with trailing slash, e.g. "/api/v1/hdb/blocks/{slug}/" */
  path: string;
  tag: "Search" | "HDB" | "Private" | "Rates" | "Calculators";
  summary: string;
  description: string;
  params: ApiParam[];
  /** name of the response schema in components.schemas */
  response: keyof typeof RESPONSE_SCHEMAS;
  /** CDN cache lifetime in seconds */
  cacheSeconds: number;
  /** example request path (with query string) used in docs */
  example: string;
  /** error statuses this endpoint can return besides 429/500 */
  errors: (400 | 404 | 503)[];
}

export const RESPONSE_SCHEMAS = {
  SearchResponse: SearchResponseSchema,
  HdbBlockResponse: HdbBlockResponseSchema,
  HdbSalesResponse: HdbSalesResponseSchema,
  TownsResponse: TownsResponseSchema,
  CondoResponse: CondoResponseSchema,
  LaunchesResponse: LaunchesResponseSchema,
  RatesResponse: RatesResponseSchema,
  StampDutyResponse: StampDutyResponseSchema,
  MortgageResponse: MortgageResponseSchema,
} as const;

const slugParam = (description: string, example: string): ApiParam => ({
  name: "slug",
  in: "path",
  required: true,
  description,
  schema: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
  example,
});

export const API_ENDPOINTS: ApiEndpoint[] = [
  {
    operationId: "search",
    method: "GET",
    path: "/api/v1/search/",
    tag: "Search",
    summary: "Search properties, streets and towns",
    description: "Token search over HDB blocks, condo projects, landed streets and addresses, new launches and HDB towns. A 6-digit postal code matches exactly.",
    params: [
      { name: "q", in: "query", required: true, description: "Search text, 1 to 100 characters (e.g. a block and street, project name or postal code).", schema: { type: "string", minLength: 1, maxLength: 100 }, example: "tampines" },
      { name: "limit", in: "query", required: false, description: "Maximum results, 1 to 20 (default 10).", schema: { type: "integer", minimum: 1, maximum: 20, default: 10 }, example: 5 },
    ],
    response: "SearchResponse",
    cacheSeconds: CACHE.data,
    example: "/api/v1/search/?q=tampines&limit=5",
    errors: [400],
  },
  {
    operationId: "getHdbBlock",
    method: "GET",
    path: "/api/v1/hdb/blocks/{slug}/",
    tag: "HDB",
    summary: "HDB block details",
    description: "Block facts (town, lease commencement, completion year, unit mix, facilities), a summary of recorded resale prices, rental activity and the nearest MRT station.",
    params: [slugParam('Block slug as used in page URLs: "blk-<block>-<street>".', "blk-872a-tampines-st-86")],
    response: "HdbBlockResponse",
    cacheSeconds: CACHE.data,
    example: "/api/v1/hdb/blocks/blk-872a-tampines-st-86/",
    errors: [404],
  },
  {
    operationId: "getHdbBlockSales",
    method: "GET",
    path: "/api/v1/hdb/blocks/{slug}/sales/",
    tag: "HDB",
    summary: "Latest resale transactions of an HDB block",
    description: "The 10 most recent resale transactions of the block, newest first. The full history is available on the block page on the website.",
    params: [slugParam("Block slug.", "blk-872a-tampines-st-86")],
    response: "HdbSalesResponse",
    cacheSeconds: CACHE.data,
    example: "/api/v1/hdb/blocks/blk-872a-tampines-st-86/sales/",
    errors: [404],
  },
  {
    operationId: "listHdbTowns",
    method: "GET",
    path: "/api/v1/hdb/towns/",
    tag: "HDB",
    summary: "HDB towns with 12-month medians",
    description: "Every HDB town with its block count, sales summary and median resale price and rent by flat type over the latest 12 months.",
    params: [],
    response: "TownsResponse",
    cacheSeconds: CACHE.data,
    example: "/api/v1/hdb/towns/",
    errors: [],
  },
  {
    operationId: "getCondo",
    method: "GET",
    path: "/api/v1/condos/{slug}/",
    tag: "Private",
    summary: "Condo project summary and latest sales",
    description: "Project facts (district, market segment, tenure, property types), a sales summary and the 10 most recent transactions. Requires URA private transaction data; deployments without it return 404 for every project.",
    params: [slugParam("Project slug from the official project name, e.g. the-hillford.", "sample-park-condo")],
    response: "CondoResponse",
    cacheSeconds: CACHE.data,
    example: "/api/v1/condos/sample-park-condo/",
    errors: [404],
  },
  {
    operationId: "listLaunches",
    method: "GET",
    path: "/api/v1/launches/",
    tag: "Private",
    summary: "New launches and upcoming projects",
    description: "Launched and upcoming private projects with units, sales to date and expected completion. Filter by type and status; page through results with limit and offset.",
    params: [
      { name: "type", in: "query", required: false, description: "condo, ec or landed.", schema: { type: "string", enum: ["condo", "ec", "landed"] }, example: "condo" },
      { name: "status", in: "query", required: false, description: "launched or upcoming.", schema: { type: "string", enum: ["launched", "upcoming"] }, example: "launched" },
      { name: "limit", in: "query", required: false, description: "Page size, 1 to 200 (default 100).", schema: { type: "integer", minimum: 1, maximum: 200, default: 100 } },
      { name: "offset", in: "query", required: false, description: "Number of launches to skip (default 0).", schema: { type: "integer", minimum: 0, default: 0 } },
    ],
    response: "LaunchesResponse",
    cacheSeconds: CACHE.data,
    example: "/api/v1/launches/?status=launched",
    errors: [400],
  },
  {
    operationId: "getRates",
    method: "GET",
    path: "/api/v1/rates/",
    tag: "Rates",
    summary: "SORA, HDB loan rate and CPF OA rate",
    description: "Latest Singapore Overnight Rate Average (overnight and compounded 1/3/6-month), the monthly 3-month compounded SORA series, the HDB concessionary loan rate and the CPF Ordinary Account rate.",
    params: [],
    response: "RatesResponse",
    cacheSeconds: CACHE.data,
    example: "/api/v1/rates/",
    errors: [503],
  },
  {
    operationId: "calcStampDuty",
    method: "GET",
    path: "/api/v1/calc/stamp-duty/",
    tag: "Calculators",
    summary: "Buyer's and Additional Buyer's Stamp Duty",
    description: "Residential BSD by tier and ABSD for the buyer profile and number of residential properties owned after the purchase (current IRAS rates).",
    params: [
      { name: "price", in: "query", required: true, description: "Purchase price (or market value if higher) in SGD.", schema: { type: "number", minimum: 1, maximum: 100000000 }, example: 1500000 },
      { name: "profile", in: "query", required: false, description: "SC (Singapore Citizen), SPR (permanent resident), FOREIGNER or ENTITY. Default SC.", schema: { type: "string", enum: [...BUYER_PROFILES], default: "SC" }, example: "SC" },
      { name: "count", in: "query", required: false, description: "Residential properties owned including this purchase (1 = first). Default 1.", schema: { type: "integer", minimum: 1, maximum: 10, default: 1 }, example: 2 },
    ],
    response: "StampDutyResponse",
    cacheSeconds: CACHE.calc,
    example: "/api/v1/calc/stamp-duty/?price=1500000&profile=SC&count=2",
    errors: [400],
  },
  {
    operationId: "calcMortgage",
    method: "GET",
    path: "/api/v1/calc/mortgage/",
    tag: "Calculators",
    summary: "Monthly mortgage repayment",
    description: "Monthly instalment, total interest and a yearly amortisation schedule for a fixed-rate loan.",
    params: [
      { name: "principal", in: "query", required: true, description: "Loan amount in SGD.", schema: { type: "number", minimum: 1, maximum: 100000000 }, example: 500000 },
      { name: "rate", in: "query", required: true, description: "Interest rate, % per annum (0 to 20).", schema: { type: "number", minimum: 0, maximum: 20 }, example: 2.6 },
      { name: "years", in: "query", required: true, description: "Loan tenure in whole years (1 to 35).", schema: { type: "integer", minimum: 1, maximum: 35 }, example: 25 },
    ],
    response: "MortgageResponse",
    cacheSeconds: CACHE.calc,
    example: "/api/v1/calc/mortgage/?principal=500000&rate=2.6&years=25",
    errors: [400],
  },
];

export const API_ERRORS: Record<number, { code: string; description: string }> = {
  400: { code: "invalid_parameter", description: "A query parameter is missing or out of range." },
  404: { code: "not_found", description: "No record matches the slug (or the dataset is not loaded on this deployment)." },
  429: { code: "rate_limited", description: `More than ${PUBLIC_API_RATE_LIMIT.max} requests in ${PUBLIC_API_RATE_LIMIT.windowSec} seconds from one IP address. Retry after the number of seconds in the Retry-After header.` },
  500: { code: "internal_error", description: "Unexpected server error." },
  503: { code: "data_unavailable", description: "The dataset behind this endpoint has not been loaded yet." },
};

export const API_LICENCE_NOTES: { title: string; body: string; url?: string }[] = [
  {
    title: "data.gov.sg datasets",
    body: "HDB resale prices, HDB property information, HDB rental approvals, LTA and MOE datasets are made available under the Singapore Open Data Licence version 1.0. Credit the original publisher, e.g. \"Contains information from Resale flat prices accessed from data.gov.sg, made available under the Singapore Open Data Licence version 1.0\".",
    url: "https://data.gov.sg/open-data-licence",
  },
  {
    title: "URA data",
    body: "Private residential transactions, rentals and developer sales come from the URA Data Service and are subject to URA's terms of use. Attribute URA as the source and do not present the data as endorsed by URA.",
    url: "https://eservice.ura.gov.sg/maps/api/",
  },
  {
    title: "Derived figures",
    body: `Summaries, medians and calculator outputs are computed by ${site.name} from the sources above. They are information only, not financial advice, and may contain errors.`,
  },
];

/* ------------------------------------------------------------------ */
/* OpenAPI                                                             */
/* ------------------------------------------------------------------ */

export interface OpenApiDocument {
  openapi: "3.1.0";
  info: Record<string, unknown>;
  servers: { url: string; description?: string }[];
  tags: { name: string; description: string }[];
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, JsonSchema>; responses: Record<string, unknown>; headers: Record<string, unknown> };
  externalDocs: { description: string; url: string };
}

export function buildOpenApiDocument(baseUrl: string = site.url): OpenApiDocument {
  const schemas: Record<string, JsonSchema> = { Error: toJsonSchema(ErrorSchema) };
  for (const [name, schema] of Object.entries(RESPONSE_SCHEMAS)) schemas[name] = toJsonSchema(schema);

  const errorResponse = (description: string) => ({
    description,
    headers: { "Access-Control-Allow-Origin": { $ref: "#/components/headers/AccessControlAllowOrigin" } },
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  });

  const paths: OpenApiDocument["paths"] = {};
  for (const e of API_ENDPOINTS) {
    const responses: Record<string, unknown> = {
      "200": {
        description: "OK",
        headers: {
          "Cache-Control": { description: `Cached by the CDN for ${e.cacheSeconds} seconds.`, schema: { type: "string" } },
          "X-RateLimit-Limit": { $ref: "#/components/headers/XRateLimitLimit" },
          "Access-Control-Allow-Origin": { $ref: "#/components/headers/AccessControlAllowOrigin" },
        },
        content: { "application/json": { schema: { $ref: `#/components/schemas/${e.response}` } } },
      },
    };
    for (const status of e.errors) responses[String(status)] = { $ref: `#/components/responses/${API_ERRORS[status].code}` };
    responses["429"] = { $ref: "#/components/responses/rate_limited" };
    responses["500"] = { $ref: "#/components/responses/internal_error" };
    paths[e.path] = {
      [e.method.toLowerCase()]: {
        operationId: e.operationId,
        tags: [e.tag],
        summary: e.summary,
        description: e.description,
        parameters: e.params.map((p) => ({
          name: p.name,
          in: p.in,
          required: p.required,
          description: p.description,
          schema: p.schema,
          ...(p.example !== undefined ? { example: p.example } : {}),
        })),
        responses,
      },
    };
  }

  const responses: Record<string, unknown> = {};
  for (const [status, err] of Object.entries(API_ERRORS)) {
    const r = errorResponse(err.description) as Record<string, unknown>;
    if (status === "429") {
      r.headers = {
        ...(r.headers as Record<string, unknown>),
        "Retry-After": { description: "Seconds to wait before retrying.", schema: { type: "integer" } },
        "X-RateLimit-Limit": { $ref: "#/components/headers/XRateLimitLimit" },
        "X-RateLimit-Remaining": { description: "Requests left in the current window.", schema: { type: "integer" } },
        "X-RateLimit-Reset": { description: "Seconds until the current window resets.", schema: { type: "integer" } },
      };
    }
    responses[err.code] = r;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: `${site.name} public API`,
      version: "1.0.0",
      summary: "Free, read-only Singapore property data.",
      description: [
        `Read-only JSON API for ${site.name}: HDB blocks, towns, condo projects, new launches, interest rates and stamp duty / mortgage calculators.`,
        `No key is needed. Requests are limited to ${PUBLIC_API_RATE_LIMIT.max} per ${PUBLIC_API_RATE_LIMIT.windowSec} seconds per IP address, CORS is open to every origin and responses are cached by the CDN.`,
        "Attribution: data.gov.sg datasets are used under the Singapore Open Data Licence version 1.0; URA data is subject to URA's terms of use. Figures are information only, not financial advice.",
      ].join("\n\n"),
      contact: { email: site.contactEmail, url: `${baseUrl}/docs/` },
    },
    servers: [{ url: baseUrl, description: site.name }],
    tags: [
      { name: "Search", description: "Find properties, streets and towns." },
      { name: "HDB", description: "HDB blocks, resale transactions and towns (data.gov.sg)." },
      { name: "Private", description: "Condo projects and new launches (URA)." },
      { name: "Rates", description: "Interest rates used in housing loans." },
      { name: "Calculators", description: "Stamp duty and mortgage calculators using current rules." },
    ],
    paths,
    components: {
      schemas,
      responses,
      headers: {
        XRateLimitLimit: { description: `Requests allowed per ${PUBLIC_API_RATE_LIMIT.windowSec} seconds.`, schema: { type: "integer" } },
        AccessControlAllowOrigin: { description: "CORS: every origin is allowed.", schema: { type: "string", const: "*" } },
      },
    },
    externalDocs: { description: "API reference and attribution", url: `${baseUrl}/docs/` },
  };
}
