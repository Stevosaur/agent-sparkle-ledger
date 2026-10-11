import { parse } from "csv-parse/sync";

/** Parse CSV text into records keyed by lower-cased, trimmed header names. All values are strings. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parse(text.replace(/^﻿/, ""), {
    columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];
  return rows;
}

export function requireColumns(rows: Record<string, string>[], columns: string[], dataset: string) {
  if (rows.length === 0) throw new Error(`${dataset}: no rows`);
  const have = new Set(Object.keys(rows[0]));
  const missing = columns.filter((c) => !have.has(c));
  if (missing.length) throw new Error(`${dataset}: missing columns ${missing.join(", ")} (have ${[...have].join(", ")})`);
}

/** "na", "-", "" -> null */
export function nullable(v: string | undefined | null): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" || /^(na|n\.a\.|nil|-)$/i.test(t) ? null : t;
}

export function num(v: string | undefined | null): number | null {
  const t = nullable(v);
  if (t == null) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
