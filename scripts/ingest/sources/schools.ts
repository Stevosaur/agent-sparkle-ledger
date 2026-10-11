/** MOE "General information of schools" (docs/research/datagov-api.md §5.5) geocoded by postal code. */
import { nullable, parseCsv, requireColumns } from "../csv";
import type { School } from "../../../src/lib/data/types";

export interface RawSchool {
  name: string;
  address: string;
  postal: string;
  level: string;
  zone: string | null;
  type: string | null;
}

export function parseSchools(csv: string): RawSchool[] {
  const rows = parseCsv(csv);
  requireColumns(rows, ["school_name", "address", "postal_code", "mainlevel_code", "zone_code", "type_code"], "MOE_SCHOOLS");
  return rows
    .map((r) => ({
      name: (r.school_name ?? "").trim().toUpperCase(),
      address: (r.address ?? "").trim().toUpperCase(),
      postal: (nullable(r.postal_code) ?? "").replace(/\D/g, "").padStart(6, "0"),
      level: (r.mainlevel_code ?? "").trim().toUpperCase(),
      zone: nullable(r.zone_code)?.toUpperCase() ?? null,
      type: nullable(r.type_code)?.toUpperCase() ?? null,
    }))
    .filter((s) => s.name && /^\d{6}$/.test(s.postal));
}

/** Schools with a Primary 1 intake: PRIMARY, or mixed levels that include P1. */
export function hasPrimaryIntake(level: string): boolean {
  return level === "PRIMARY" || /P1/.test(level);
}

export function toSchool(s: RawSchool, lat: number, lng: number): School {
  return { name: s.name, level: s.level, address: s.address, postal: s.postal, zone: s.zone, type: s.type, lat, lng };
}
