import "server-only";
import { readJson } from "./store";
import type { SearchEntry, SearchKind } from "./types";

export function getSearchIndex(): SearchEntry[] {
  return readJson<SearchEntry[]>("search-index.json", []);
}

function normalise(q: string): string {
  return q
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/\bblock\b/g, "blk")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

let prepared: { entry: SearchEntry; hay: string; label: string }[] | null = null;

function getPrepared() {
  if (!prepared) {
    prepared = getSearchIndex().map((entry) => ({
      entry,
      label: normalise(entry.label),
      hay: normalise(`${entry.label} ${entry.sub} ${entry.terms} ${entry.postal ?? ""}`),
    }));
  }
  return prepared;
}

/**
 * Token search over every property, street, town and station.
 * All query tokens must appear (as word prefixes) in the entry; label-prefix matches and busier
 * properties rank first. A 6-digit postal code matches exactly.
 */
export function search(query: string, opts: { limit?: number; kinds?: SearchKind[] } = {}): SearchEntry[] {
  const { limit = 10, kinds } = opts;
  const q = normalise(query);
  if (!q) return [];
  const tokens = q.split(" ").filter(Boolean);
  const postal = /^\d{6}$/.test(q) ? q : null;
  const scored: { e: SearchEntry; score: number }[] = [];
  for (const { entry, hay, label } of getPrepared()) {
    if (kinds && !kinds.includes(entry.kind)) continue;
    if (postal) {
      if (entry.postal === postal) scored.push({ e: entry, score: 1e9 });
      continue;
    }
    const words = ` ${hay}`;
    let ok = true;
    for (const t of tokens) {
      if (!words.includes(` ${t}`)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    let score = Math.log1p(entry.weight);
    if (label.startsWith(q)) score += 20;
    else if (` ${label}`.includes(` ${tokens[0]}`)) score += 8;
    if (entry.kind === "town" || entry.kind === "mrt") score += 5;
    scored.push({ e: entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.e);
}
