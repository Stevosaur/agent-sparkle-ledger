/** HDB datasets from data.gov.sg -> normalised records (docs/research/datagov-api.md §5, §6). */
import { nullable, num, parseCsv, requireColumns } from "../csv";
import type { RawHdbBlockInfo, RawHdbRental, RawHdbSale } from "../types";

export const HDB_TOWNS = [
  "ANG MO KIO",
  "BEDOK",
  "BISHAN",
  "BUKIT BATOK",
  "BUKIT MERAH",
  "BUKIT PANJANG",
  "BUKIT TIMAH",
  "CENTRAL AREA",
  "CHOA CHU KANG",
  "CLEMENTI",
  "GEYLANG",
  "HOUGANG",
  "JURONG EAST",
  "JURONG WEST",
  "KALLANG/WHAMPOA",
  "LIM CHU KANG",
  "MARINE PARADE",
  "PASIR RIS",
  "PUNGGOL",
  "QUEENSTOWN",
  "SEMBAWANG",
  "SENGKANG",
  "SERANGOON",
  "TAMPINES",
  "TENGAH",
  "TOA PAYOH",
  "WOODLANDS",
  "YISHUN",
];

/** bldg_contract_town codes in HDB Property Information. */
export const HDB_TOWN_CODE: Record<string, string> = {
  AMK: "ANG MO KIO",
  BB: "BUKIT BATOK",
  BD: "BEDOK",
  BH: "BISHAN",
  BM: "BUKIT MERAH",
  BP: "BUKIT PANJANG",
  BT: "BUKIT TIMAH",
  CCK: "CHOA CHU KANG",
  CL: "CLEMENTI",
  CT: "CENTRAL AREA",
  GL: "GEYLANG",
  HG: "HOUGANG",
  JE: "JURONG EAST",
  JW: "JURONG WEST",
  KWN: "KALLANG/WHAMPOA",
  MP: "MARINE PARADE",
  PG: "PUNGGOL",
  PRC: "PASIR RIS",
  QT: "QUEENSTOWN",
  SB: "SEMBAWANG",
  SGN: "SERANGOON",
  SK: "SENGKANG",
  TAP: "TAMPINES",
  TG: "TENGAH",
  TP: "TOA PAYOH",
  WL: "WOODLANDS",
  YS: "YISHUN",
};

export const FLAT_TYPES = ["1 ROOM", "2 ROOM", "3 ROOM", "4 ROOM", "5 ROOM", "EXECUTIVE", "MULTI-GENERATION"];

/** "MULTI GENERATION" -> "MULTI-GENERATION"; rental "4-ROOM" -> "4 ROOM". */
export function normaliseFlatType(raw: string): string {
  const t = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (/^MULTI[\s-]?GENERATION$/.test(t)) return "MULTI-GENERATION";
  const m = /^(\d)[\s-]?ROOM$/.exec(t);
  if (m) return `${m[1]} ROOM`;
  return t;
}

/** Rental data may spell CENTRAL AREA as CENTRAL (unverified); map known variants onto resale town names. */
export function normaliseTown(raw: string): string {
  const t = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (t === "CENTRAL") return "CENTRAL AREA";
  if (t === "KALLANG / WHAMPOA" || t === "KALLANG WHAMPOA") return "KALLANG/WHAMPOA";
  return t;
}

/** Flat model casing differs by era (IMPROVED vs Improved): normalise to Title Case, keeping DBSS, S1/A2 and 3Gen forms. */
export function normaliseFlatModel(raw: string): string {
  const t = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (!t) return "Unknown";
  return t
    .split(" ")
    .map((w) => {
      if (w === "DBSS") return w;
      if (/^[A-Z]\d+$/.test(w)) return w; // S1, A2
      const lead = /^(\d+)([A-Z]+)$/.exec(w); // 3GEN -> 3Gen
      if (lead) return lead[1] + lead[2][0] + lead[2].slice(1).toLowerCase();
      return w
        .split("-")
        .map((p) => (p ? p[0] + p.slice(1).toLowerCase() : p))
        .join("-");
    })
    .join(" ");
}

/** remaining_lease: "70" (2015-16, years) or "61 years 04 months" (2017+) -> months. */
export function parseRemainingLeaseMonths(raw: string | undefined): number | null {
  const t = nullable(raw);
  if (t == null) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * 12);
  const y = /(\d+)\s*year/i.exec(t)?.[1];
  const m = /(\d+)\s*month/i.exec(t)?.[1];
  if (!y && !m) return null;
  return Number(y ?? 0) * 12 + Number(m ?? 0);
}

const RESALE_BASE_COLS = ["month", "town", "flat_type", "block", "street_name", "storey_range", "floor_area_sqm", "flat_model", "lease_commence_date", "resale_price"];

export interface EraSpec {
  key: string;
  /** first and last month the era is documented to cover (inclusive), "YYYY-MM"; null = open-ended */
  from: string;
  to: string | null;
  hasRemainingLease: boolean;
  minRows: number;
}

export const RESALE_ERAS: EraSpec[] = [
  { key: "RESALE_1990_1999", from: "1990-01", to: "1999-12", hasRemainingLease: false, minRows: 250_000 },
  { key: "RESALE_2000_2012FEB", from: "2000-01", to: "2012-02", hasRemainingLease: false, minRows: 300_000 },
  { key: "RESALE_2012MAR_2014", from: "2012-03", to: "2014-12", hasRemainingLease: false, minRows: 45_000 },
  { key: "RESALE_2015_2016", from: "2015-01", to: "2016-12", hasRemainingLease: true, minRows: 30_000 },
  { key: "RESALE_2017_ON", from: "2017-01", to: null, hasRemainingLease: true, minRows: 200_000 },
];

export interface ParseReport {
  rows: number;
  kept: number;
  dropped: Record<string, number>;
  unknownTowns: string[];
}

/** Parse one resale era file. Rows outside the era's month range are dropped (eras tile the timeline). */
export function parseResaleEra(csv: string, era: EraSpec): { sales: RawHdbSale[]; report: ParseReport } {
  const rows = parseCsv(csv);
  requireColumns(rows, era.hasRemainingLease ? [...RESALE_BASE_COLS, "remaining_lease"] : RESALE_BASE_COLS, era.key);
  const dropped: Record<string, number> = {};
  const drop = (why: string) => (dropped[why] = (dropped[why] ?? 0) + 1);
  const unknownTowns = new Set<string>();
  const sales: RawHdbSale[] = [];
  for (const r of rows) {
    const month = r.month?.trim();
    if (!/^\d{4}-\d{2}$/.test(month ?? "")) {
      drop("bad-month");
      continue;
    }
    if (month < era.from || (era.to && month > era.to)) {
      drop("outside-era");
      continue;
    }
    const town = normaliseTown(r.town ?? "");
    if (!HDB_TOWNS.includes(town)) unknownTowns.add(town);
    const flatType = normaliseFlatType(r.flat_type ?? "");
    if (!FLAT_TYPES.includes(flatType)) {
      drop("bad-flat-type");
      continue;
    }
    const price = num(r.resale_price);
    const area = num(r.floor_area_sqm);
    const storey = (r.storey_range ?? "").trim().toUpperCase();
    if (!price || price <= 0 || !area || area <= 0 || !/^\d+ TO \d+$/.test(storey)) {
      drop("bad-values");
      continue;
    }
    const block = (r.block ?? "").trim().toUpperCase();
    const street = (r.street_name ?? "").trim().toUpperCase().replace(/\s+/g, " ");
    if (!block || !street) {
      drop("no-address");
      continue;
    }
    const lease = num(r.lease_commence_date);
    sales.push({
      month,
      town,
      flatType,
      block,
      street,
      storeyRange: storey,
      floorAreaSqm: area,
      flatModel: normaliseFlatModel(r.flat_model ?? ""),
      leaseCommenceYear: lease && lease > 1900 && lease < 2100 ? lease : null,
      remainingLeaseMonths: era.hasRemainingLease ? parseRemainingLeaseMonths(r.remaining_lease) : null,
      price,
    });
  }
  return { sales, report: { rows: rows.length, kept: sales.length, dropped, unknownTowns: [...unknownTowns] } };
}

const yn = (v: string | undefined) => (v ?? "").trim().toUpperCase() === "Y";

export function parsePropertyInfo(csv: string): RawHdbBlockInfo[] {
  const rows = parseCsv(csv);
  requireColumns(rows, ["blk_no", "street", "max_floor_lvl", "year_completed", "residential", "bldg_contract_town", "total_dwelling_units"], "HDB_PROPERTY_INFO");
  return rows.map((r) => {
    const unitMix: Record<string, number> = {};
    const add = (type: string, ...cols: string[]) => {
      const n = cols.reduce((s, c) => s + (num(r[c]) ?? 0), 0);
      if (n > 0) unitMix[type] = (unitMix[type] ?? 0) + n;
    };
    add("1 ROOM", "1room_sold", "1room_rental");
    add("2 ROOM", "2room_sold", "2room_rental");
    add("3 ROOM", "3room_sold", "3room_rental");
    add("4 ROOM", "4room_sold");
    add("5 ROOM", "5room_sold");
    add("EXECUTIVE", "exec_sold");
    add("MULTI-GENERATION", "multigen_sold");
    const code = (r.bldg_contract_town ?? "").trim().toUpperCase();
    return {
      block: (r.blk_no ?? "").trim().toUpperCase(),
      street: (r.street ?? "").trim().toUpperCase().replace(/\s+/g, " "),
      town: HDB_TOWN_CODE[code] ?? null,
      maxFloor: num(r.max_floor_lvl),
      yearCompleted: num(r.year_completed),
      residential: yn(r.residential),
      commercial: yn(r.commercial),
      marketHawker: yn(r.market_hawker),
      miscellaneous: yn(r.miscellaneous),
      multistoreyCarpark: yn(r.multistorey_carpark),
      precinctPavilion: yn(r.precinct_pavilion),
      totalDwellingUnits: num(r.total_dwelling_units),
      unitMix,
    };
  });
}

export function parseRentals(csv: string): { rentals: RawHdbRental[]; report: ParseReport } {
  const rows = parseCsv(csv);
  requireColumns(rows, ["rent_approval_date", "town", "block", "street_name", "flat_type", "monthly_rent"], "HDB_RENTALS");
  const dropped: Record<string, number> = {};
  const drop = (why: string) => (dropped[why] = (dropped[why] ?? 0) + 1);
  const unknownTowns = new Set<string>();
  const rentals: RawHdbRental[] = [];
  for (const r of rows) {
    const month = (r.rent_approval_date ?? "").trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      drop("bad-month");
      continue;
    }
    const town = normaliseTown(r.town ?? "");
    if (!HDB_TOWNS.includes(town)) unknownTowns.add(town);
    const rent = num(r.monthly_rent);
    const flatType = normaliseFlatType(r.flat_type ?? "");
    if (!rent || rent <= 0 || !FLAT_TYPES.includes(flatType)) {
      drop("bad-values");
      continue;
    }
    rentals.push({
      month,
      town,
      block: (r.block ?? "").trim().toUpperCase(),
      street: (r.street_name ?? "").trim().toUpperCase().replace(/\s+/g, " "),
      flatType,
      monthlyRent: rent,
    });
  }
  return { rentals, report: { rows: rows.length, kept: rentals.length, dropped, unknownTowns: [...unknownTowns] } };
}
