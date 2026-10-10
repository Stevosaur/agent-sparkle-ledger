import { z } from "zod";

/**
 * Response shapes of the public API (/api/v1/...). These zod schemas are the single source of truth:
 * - the serializers are typed with z.infer, so TypeScript keeps them in line,
 * - the OpenAPI document (src/lib/api/spec.ts) converts them to JSON Schema,
 * - unit tests parse real serializer output against them.
 */

const month = z.string().regex(/^\d{4}-\d{2}$/).describe('Month, "YYYY-MM"');
const nullableMonth = month.nullable();
const sgd = z.number().describe("Singapore dollars");

export const TxSummarySchema = z
  .object({
    count: z.number().int().describe("Number of recorded sales"),
    first: nullableMonth.describe("Month of the first recorded sale"),
    last: nullableMonth.describe("Month of the latest recorded sale"),
    lastPrice: sgd.nullable().describe("Price of the latest recorded sale (SGD)"),
    medianPsf12m: z.number().nullable().describe("Median price per square foot over the 12 months to the dataset's latest month"),
    count12m: z.number().int().describe("Sales in the 12 months to the dataset's latest month"),
  })
  .describe("Summary of recorded sales");

export const NearbyStationSchema = z.object({
  name: z.string(),
  codes: z.array(z.string()),
  lines: z.array(z.string()),
  status: z.enum(["operational", "future"]),
  expectedYear: z.number().int().nullable(),
  distanceM: z.number().describe("Straight-line distance in metres"),
});

export const TenureSchema = z.object({
  raw: z.string(),
  kind: z.enum(["freehold", "leasehold"]),
  years: z.number().int().nullable(),
  startYear: z.number().int().nullable(),
});

export const RentalSummarySchema = z.object({
  count12m: z.number().int().describe("Rental records in the latest 12 months"),
  medianRent12m: z.number().nullable().describe("Median monthly rent (SGD) in the latest 12 months"),
});

export const DataMetaSchema = z
  .object({
    source: z.string().describe("Where the figures come from"),
    dataMonth: nullableMonth.describe("Latest month covered by the dataset"),
    sampleData: z.boolean().describe("true when this deployment serves synthetic sample data instead of real records"),
  })
  .describe("Provenance of the response");

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export const SearchResultSchema = z.object({
  kind: z.enum(["hdb", "condo", "landed", "landed-street", "launch", "town", "mrt"]),
  label: z.string(),
  sub: z.string(),
  path: z.string().describe("Site path of the page"),
  url: z.string().describe("Absolute URL of the page"),
  ref: z.string().nullable().describe('Property reference such as "hdb:blk-872a-tampines-st-86" (null for towns)'),
});

export const SearchResponseSchema = z.object({
  query: z.string(),
  results: z.array(SearchResultSchema),
});

/* ------------------------------------------------------------------ */
/* HDB                                                                 */
/* ------------------------------------------------------------------ */

export const HdbBlockSchema = z.object({
  slug: z.string(),
  name: z.string().describe('Display name, e.g. "Blk 872A Tampines St 86"'),
  path: z.string(),
  url: z.string(),
  block: z.string(),
  street: z.string().describe("Street as recorded by HDB"),
  streetFull: z.string().nullable(),
  town: z.string(),
  townSlug: z.string(),
  postal: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  leaseCommenceYear: z.number().int().nullable(),
  yearCompleted: z.number().int().nullable(),
  maxFloor: z.number().int().nullable(),
  dwellingUnits: z.number().int().nullable(),
  unitMix: z.record(z.string(), z.number()).describe("Flats per flat type"),
  facilities: z
    .object({
      commercial: z.boolean(),
      marketHawker: z.boolean(),
      multistoreyCarpark: z.boolean(),
      precinctPavilion: z.boolean(),
      miscellaneous: z.boolean(),
    })
    .nullable(),
  sales: TxSummarySchema,
  rentals: RentalSummarySchema.nullable(),
  nearestMrt: NearbyStationSchema.nullable(),
});

export const HdbBlockResponseSchema = z.object({
  block: HdbBlockSchema,
  links: z.object({ page: z.string(), sales: z.string() }),
  meta: DataMetaSchema,
});

export const HdbSaleSchema = z.object({
  month,
  flatType: z.string(),
  storeyRange: z.string(),
  floorAreaSqm: z.number(),
  floorAreaSqft: z.number(),
  price: sgd,
  psf: z.number(),
  flatModel: z.string(),
  remainingLeaseMonths: z.number().nullable(),
  remainingLeaseEstimated: z.boolean().describe("true when HDB did not publish the remaining lease and it was estimated from the lease commencement year"),
});

export const HdbSalesResponseSchema = z.object({
  block: z.string(),
  name: z.string(),
  totalSales: z.number().int(),
  returned: z.number().int(),
  sales: z.array(HdbSaleSchema).describe("Latest sales, newest first (at most 10)"),
  fullHistory: z.string().describe("Page with the full sales history"),
  meta: DataMetaSchema,
});

export const TownSchema = z.object({
  town: z.string(),
  slug: z.string(),
  region: z.string(),
  blocks: z.number().int(),
  sales: TxSummarySchema,
  medianPrice12m: z.record(z.string(), z.number()).describe("Median resale price over the last 12 months by flat type"),
  medianRent12m: z.record(z.string(), z.number()).describe("Median monthly rent over the last 12 months by flat type"),
  path: z.string(),
});

export const TownsResponseSchema = z.object({
  towns: z.array(TownSchema),
  meta: DataMetaSchema,
});

/* ------------------------------------------------------------------ */
/* Private                                                             */
/* ------------------------------------------------------------------ */

export const CondoSchema = z.object({
  slug: z.string(),
  name: z.string(),
  path: z.string(),
  url: z.string(),
  street: z.string(),
  district: z.number().int().nullable(),
  segment: z.enum(["CCR", "RCR", "OCR"]).nullable(),
  propertyTypes: z.array(z.string()),
  tenure: TenureSchema.nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  sales: TxSummarySchema,
  rentals: RentalSummarySchema.nullable(),
  nearestMrt: NearbyStationSchema.nullable(),
  launch: z
    .object({ path: z.string(), status: z.enum(["launched", "upcoming"]), totalUnits: z.number().int().nullable(), unitsSold: z.number().int().nullable() })
    .nullable(),
});

export const PrivateSaleSchema = z.object({
  month,
  propertyType: z.string(),
  floorRange: z.string(),
  areaSqm: z.number(),
  areaSqft: z.number(),
  price: sgd,
  psf: z.number(),
  typeOfSale: z.enum(["New Sale", "Sub Sale", "Resale"]),
  typeOfArea: z.enum(["Strata", "Land", "Unknown"]),
  units: z.number().int().describe("Units in the transaction (bulk purchases > 1)"),
});

export const CondoResponseSchema = z.object({
  project: CondoSchema,
  totalSales: z.number().int(),
  returned: z.number().int(),
  latestSales: z.array(PrivateSaleSchema).describe("Latest sales, newest first (at most 10)"),
  fullHistory: z.string(),
  meta: DataMetaSchema,
});

export const LaunchSalesPointSchema = z.object({
  month,
  launchedInMonth: z.number().nullable(),
  soldInMonth: z.number().nullable(),
  launchedToDate: z.number().nullable(),
  soldToDate: z.number().nullable(),
  medianPsf: z.number().nullable(),
  lowestPsf: z.number().nullable(),
  highestPsf: z.number().nullable(),
});

export const LaunchSchema = z.object({
  slug: z.string(),
  name: z.string(),
  type: z.enum(["condo", "ec", "landed"]),
  status: z.enum(["launched", "upcoming"]),
  path: z.string(),
  url: z.string(),
  street: z.string().nullable(),
  district: z.number().int().nullable(),
  segment: z.enum(["CCR", "RCR", "OCR"]).nullable(),
  developer: z.string().nullable(),
  totalUnits: z.number().int().nullable(),
  unitsLaunched: z.number().int().nullable(),
  unitsSold: z.number().int().nullable(),
  expectedCompletionYear: z.number().int().nullable(),
  tenure: TenureSchema.nullable(),
  latestSales: LaunchSalesPointSchema.nullable().describe("Latest monthly developer sales figures"),
  projectPath: z.string().nullable().describe("Project page with transactions, when available"),
  nearestMrt: NearbyStationSchema.nullable(),
});

export const LaunchesResponseSchema = z.object({
  count: z.number().int(),
  launches: z.array(LaunchSchema),
  meta: DataMetaSchema,
});

/* ------------------------------------------------------------------ */
/* Rates & calculators                                                 */
/* ------------------------------------------------------------------ */

const DatedValueSchema = z.object({ value: z.number().describe("% per annum"), date: z.string() });

export const RatesResponseSchema = z.object({
  asOf: z.string(),
  sora: z.object({
    overnight: DatedValueSchema.nullable(),
    compounded1m: DatedValueSchema.nullable(),
    compounded3m: DatedValueSchema.nullable(),
    compounded6m: DatedValueSchema.nullable(),
    series3m: z.array(DatedValueSchema).describe("Monthly 3-month compounded SORA"),
    source: z.string(),
  }),
  hdbConcessionaryRate: DatedValueSchema.extend({ source: z.string() }),
  cpfOaRate: DatedValueSchema.extend({ source: z.string() }),
  sampleData: z.boolean(),
});

export const BUYER_PROFILES = ["SC", "SPR", "FOREIGNER", "ENTITY"] as const;

export const StampDutyResponseSchema = z.object({
  input: z.object({ price: z.number(), profile: z.enum(BUYER_PROFILES), propertyCount: z.number().int() }),
  bsd: z.object({
    total: z.number(),
    tiers: z.array(z.object({ from: z.number(), to: z.number().nullable(), rate: z.number(), taxable: z.number(), amount: z.number() })),
  }),
  absd: z.object({ rate: z.number().describe("Fraction, e.g. 0.2 = 20%"), total: z.number() }),
  total: z.number(),
  rules: z.object({ bsd: z.string(), absd: z.string() }).describe("Rule sets applied"),
  note: z.string(),
});

export const MortgageResponseSchema = z.object({
  input: z.object({ principal: z.number(), ratePct: z.number(), years: z.number() }),
  monthlyPayment: z.number(),
  totalInterest: z.number(),
  totalPaid: z.number(),
  schedule: z.array(z.object({ year: z.number().int(), payment: z.number(), interest: z.number(), principal: z.number(), balance: z.number() })),
  note: z.string(),
});

export const ErrorSchema = z.object({
  error: z.string().describe('Machine-readable code, e.g. "not_found", "invalid_parameter", "rate_limited"'),
  message: z.string(),
});

export type TxSummaryDto = z.infer<typeof TxSummarySchema>;
export type DataMetaDto = z.infer<typeof DataMetaSchema>;
export type SearchResultDto = z.infer<typeof SearchResultSchema>;
export type SearchResponseDto = z.infer<typeof SearchResponseSchema>;
export type HdbBlockDto = z.infer<typeof HdbBlockSchema>;
export type HdbBlockResponseDto = z.infer<typeof HdbBlockResponseSchema>;
export type HdbSaleDto = z.infer<typeof HdbSaleSchema>;
export type HdbSalesResponseDto = z.infer<typeof HdbSalesResponseSchema>;
export type TownDto = z.infer<typeof TownSchema>;
export type TownsResponseDto = z.infer<typeof TownsResponseSchema>;
export type CondoDto = z.infer<typeof CondoSchema>;
export type PrivateSaleDto = z.infer<typeof PrivateSaleSchema>;
export type CondoResponseDto = z.infer<typeof CondoResponseSchema>;
export type LaunchDto = z.infer<typeof LaunchSchema>;
export type LaunchesResponseDto = z.infer<typeof LaunchesResponseSchema>;
export type RatesResponseDto = z.infer<typeof RatesResponseSchema>;
export type StampDutyResponseDto = z.infer<typeof StampDutyResponseSchema>;
export type MortgageResponseDto = z.infer<typeof MortgageResponseSchema>;
