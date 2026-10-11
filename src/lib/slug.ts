/**
 * Slug rules (shared by the ingestion pipeline and the app, so URLs are stable):
 * - lowercase, apostrophes dropped, "&" -> "and", every other run of non-alphanumerics -> "-"
 * - HDB block:      blk-<block>-<street as in HDB data>     "872A" + "TAMPINES ST 86"  -> "blk-872a-tampines-st-86"
 * - Project:        <project name>                          "PEOPLE'S PK COMPLEX"      -> "peoples-pk-complex"
 * - Landed address: <house no>-<abbreviated street>         "13 HAIG LANE"             -> "13-haig-ln"
 * - Landed street:  <abbreviated street>                    "HAIG LANE"                -> "haig-ln"
 */

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Street-type words abbreviated in landed slugs (and in HDB street names). Order-insensitive whole-word replacement. */
export const STREET_ABBREVIATIONS: Record<string, string> = {
  AVENUE: "AVE",
  BUKIT: "BT",
  CENTRAL: "CTRL",
  CENTRE: "CTR",
  CIRCLE: "CIR",
  CLOSE: "CL",
  COMMONWEALTH: "C'WEALTH",
  CRESCENT: "CRES",
  DRIVE: "DR",
  GARDEN: "GDN",
  GARDENS: "GDNS",
  GROVE: "GR",
  HEIGHTS: "HTS",
  JALAN: "JLN",
  KAMPONG: "KG",
  LANE: "LN",
  LORONG: "LOR",
  MARKET: "MKT",
  NORTH: "NTH",
  PARK: "PK",
  PLACE: "PL",
  ROAD: "RD",
  SOUTH: "STH",
  SQUARE: "SQ",
  STREET: "ST",
  TANJONG: "TG",
  TERRACE: "TER",
  UPPER: "UPP",
  WALK: "WK",
};

export function abbreviateStreet(street: string): string {
  return street
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => STREET_ABBREVIATIONS[w] ?? w)
    .join(" ");
}

export function hdbBlockSlug(block: string, street: string): string {
  return `blk-${slugify(block)}-${slugify(street)}`;
}

export function projectSlug(name: string): string {
  return slugify(name);
}

export function landedStreetSlug(street: string): string {
  return slugify(abbreviateStreet(street));
}

export function landedAddressSlug(houseNo: string, street: string): string {
  return `${slugify(houseNo)}-${landedStreetSlug(street)}`;
}

export function townSlug(town: string): string {
  return slugify(town);
}

/** Title-case an upper-case government name for display: "TAMPINES ST 86" -> "Tampines St 86", keeps "C'WEALTH" style tokens readable. */
export function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/(\s+|-|\/)/)
    // words get an initial capital; tokens that start with a digit (block / house numbers like "872A") stay upper case
    .map((part) => (/^[a-z]/.test(part) ? part[0].toUpperCase() + part.slice(1) : /^\d/.test(part) ? part.toUpperCase() : part))
    .join("")
    .replace(/\b(Blk|Ec|Mrt|Lrt|Hdb|Ccr|Rcr|Ocr)\b/g, (m) => (m === "Blk" ? m : m.toUpperCase()))
    .replace(/'S\b/g, "'s");
}
