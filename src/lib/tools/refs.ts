import { formatPropertyRef, parsePropertyRef, type PropertyRef } from "@/lib/property-ref";

/** Maximum number of properties on /compare/. */
export const MAX_COMPARE = 4;

/**
 * Property-reference helpers shared by the compare and valuation pickers (client-safe: no data imports).
 */

/** "/hdb/blk-1-x/" -> { kind: "hdb", slug: "blk-1-x" }; "/new-launch/condo/foo/" -> launch ref. Null for towns, MRT and anything else. */
export function refFromHref(href: string): PropertyRef | null {
  const path = href.split(/[?#]/)[0];
  const launch = /^\/new-launch\/(condo|ec|landed)\/([a-z0-9-]+)\/?$/.exec(path);
  if (launch) return { kind: "launch", slug: launch[2], launchType: launch[1] };
  const m = /^\/(hdb|condo|landed|landed-street)\/([a-z0-9-]+)\/?$/.exec(path);
  if (!m) return null;
  return { kind: m[1] as PropertyRef["kind"], slug: m[2] };
}

/**
 * Parse a comma-separated list of property refs ("hdb:blk-1-x,condo:foo"), dropping duplicates and
 * keeping at most `max`. Unparseable entries are returned in `invalid` so the page can say so.
 */
export function parseRefList(raw: string | string[] | undefined | null, max = MAX_COMPARE): { refs: PropertyRef[]; invalid: string[] } {
  const joined = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const refs: PropertyRef[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const part of joined.split(",")) {
    const id = part.trim();
    if (!id) continue;
    const ref = parsePropertyRef(id);
    if (!ref) {
      invalid.push(id.slice(0, 80));
      continue;
    }
    const key = formatPropertyRef(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    if (refs.length < max) refs.push(ref);
  }
  return { refs, invalid };
}

/** Comma-joined ids for a URL, e.g. "hdb:blk-1-x,condo:foo". */
export function formatRefList(refs: PropertyRef[]): string {
  return refs.map(formatPropertyRef).join(",");
}

/** First value of a search param that may be repeated. */
export function firstParam(v: string | string[] | undefined | null): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}
