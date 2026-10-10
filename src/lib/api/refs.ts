import { formatPropertyRef, type PropertyRef } from "@/lib/property-ref";

/**
 * Map a site path back to a property reference:
 *   "/hdb/blk-1-x/" -> hdb:blk-1-x, "/new-launch/ec/foo/" -> launch:ec/foo.
 * Returns null for non-property paths (towns, tools).
 */
export function refFromPath(path: string): PropertyRef | null {
  const p = path.split(/[?#]/)[0];
  let m = /^\/(hdb|condo|landed|landed-street)\/([a-z0-9-]+)\/?$/.exec(p);
  if (m) return { kind: m[1] as PropertyRef["kind"], slug: m[2] };
  m = /^\/new-launch\/(condo|ec|landed)\/([a-z0-9-]+)\/?$/.exec(p);
  if (m) return { kind: "launch", slug: m[2], launchType: m[1] };
  return null;
}

export function refIdFromPath(path: string): string | null {
  const ref = refFromPath(path);
  return ref ? formatPropertyRef(ref) : null;
}
