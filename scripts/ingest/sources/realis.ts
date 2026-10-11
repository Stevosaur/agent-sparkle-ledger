/**
 * Optional unit-level import (REALIS-style CSV exports from a licensed data provider). Run locally:
 *   REALIS_CSV_DIR=/path/to/csvs npm run ingest -- --skip hdb
 * Do not commit licensed source files to a public repository; check your licence before publishing derived data.
 *
 * Expected columns (case-insensitive; override with REALIS_COLUMN_MAP='{"price":"My Price Col",...}'):
 *   project: "Project Name"          address: "Address" (e.g. "13 HAIG LANE" or "10 X ROAD #05-12")
 *   price: "Transacted Price ($)"    areaSqm: "Area (SQM)" (or areaSqft: "Area (SQFT)")
 *   date: "Sale Date" (e.g. "15 Mar 2024", "2024-03-15" or "Mar-24")
 *   propertyType: "Property Type"    typeOfSale: "Type of Sale"   typeOfArea: "Type of Area"
 *   tenure: "Tenure"                 district: "Postal District"  units: "Number of Units"
 *   segment: "Market Segment" (optional)
 */
import fs from "node:fs";
import path from "node:path";
import { num, parseCsv } from "../csv";
import { monthLabel, monthIndex } from "../../../src/lib/data/months";
import type { RawPrivateSale } from "../types";

const DEFAULT_COLUMNS: Record<string, string[]> = {
  project: ["project name", "project"],
  address: ["address", "street address"],
  street: ["street name", "street"],
  price: ["transacted price ($)", "transacted price", "price ($)", "price"],
  areaSqm: ["area (sqm)", "area sqm"],
  areaSqft: ["area (sqft)", "area sqft"],
  date: ["sale date", "contract date", "date of sale"],
  propertyType: ["property type"],
  typeOfSale: ["type of sale"],
  typeOfArea: ["type of area"],
  tenure: ["tenure"],
  district: ["postal district", "district"],
  units: ["number of units", "no. of units"],
  segment: ["market segment", "segment"],
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function parseSaleMonth(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  let m = /^(\d{4})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}`;
  m = /^(\d{1,2})[\s/-]([a-z]{3})[a-z]*[\s/-](\d{2,4})$/.exec(s);
  if (m && MONTHS.includes(m[2])) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return monthLabel(monthIndex(`${y}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, "0")}`));
  }
  m = /^([a-z]{3})[a-z]*[\s/-](\d{2,4})$/.exec(s);
  if (m && MONTHS.includes(m[1])) {
    const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return `${y}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, "0")}`;
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); // dd/mm/yyyy
  if (m) return `${m[3]}-${String(Number(m[2])).padStart(2, "0")}`;
  return null;
}

/** "#05-12" -> floor 5 -> URA-style 5-storey band "01-05" */
export function floorBand(unit: string | null): string {
  const m = /#\s*(B?)(\d+)\s*-/.exec(unit ?? "");
  if (!m) return "-";
  if (m[1]) return "B1-B5";
  const floor = Number(m[2]);
  const lo = Math.floor((floor - 1) / 5) * 5 + 1;
  return `${String(lo).padStart(2, "0")}-${String(lo + 4).padStart(2, "0")}`;
}

export function parseRealisCsv(text: string, columnOverrides: Record<string, string> = {}): RawPrivateSale[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  const col = (key: string): string | undefined => {
    const o = columnOverrides[key]?.toLowerCase();
    if (o) return headers.includes(o) ? o : undefined;
    return DEFAULT_COLUMNS[key]?.find((c) => headers.includes(c));
  };
  const c = Object.fromEntries(Object.keys(DEFAULT_COLUMNS).map((k) => [k, col(k)]));
  if (!c.project || !c.price || !c.date || (!c.areaSqm && !c.areaSqft)) throw new Error(`REALIS CSV: missing required columns (have: ${headers.join(", ")})`);
  const out: RawPrivateSale[] = [];
  for (const r of rows) {
    const price = num(r[c.price!]);
    const sqm = c.areaSqm ? num(r[c.areaSqm]) : null;
    const sqft = c.areaSqft ? num(r[c.areaSqft]) : null;
    const area = sqm ?? (sqft != null ? sqft / 10.764 : null);
    const month = parseSaleMonth(r[c.date!] ?? "");
    if (!price || !area || !month) continue;
    const address = c.address ? (r[c.address] ?? "").trim().toUpperCase() : "";
    const unitMatch = /(#\s*B?\d+\s*-\s*\w+)/.exec(address);
    const unit = unitMatch ? unitMatch[1].replace(/\s/g, "") : null;
    const addrNoUnit = address.replace(/#\s*B?\d+\s*-\s*\w+/, "").replace(/\s+/g, " ").trim();
    const street = c.street ? (r[c.street] ?? "").trim().toUpperCase() : addrNoUnit.replace(/^\d+[A-Z]?\s+/, "");
    const sale = (c.typeOfSale ? r[c.typeOfSale] : "").toLowerCase();
    const toa = (c.typeOfArea ? r[c.typeOfArea] : "").toLowerCase();
    const seg = (c.segment ? r[c.segment] : "").toUpperCase();
    out.push({
      project: (r[c.project!] ?? "").trim().toUpperCase(),
      street,
      district: c.district ? num(r[c.district]) : null,
      marketSegment: seg === "CCR" || seg === "RCR" || seg === "OCR" ? seg : null,
      propertyType: (c.propertyType ? r[c.propertyType] : "").trim() || "Condominium",
      tenure: c.tenure ? r[c.tenure] || null : null,
      month,
      areaSqm: area,
      floorRange: floorBand(unit),
      typeOfSale: sale.startsWith("new") ? 1 : sale.startsWith("sub") ? 2 : 3,
      typeOfArea: toa.startsWith("strata") ? "Strata" : toa.startsWith("land") ? "Land" : "Unknown",
      noOfUnits: (c.units ? num(r[c.units]) : null) ?? 1,
      price,
      lat: null,
      lng: null,
      unit,
      address: unit ? null : addrNoUnit || null,
    });
  }
  return out;
}

export function loadRealis(dir: string): RawPrivateSale[] {
  const overrides = process.env.REALIS_COLUMN_MAP ? (JSON.parse(process.env.REALIS_COLUMN_MAP) as Record<string, string>) : {};
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".csv"));
  return files.flatMap((f) => parseRealisCsv(fs.readFileSync(path.join(dir, f), "utf8"), overrides));
}
