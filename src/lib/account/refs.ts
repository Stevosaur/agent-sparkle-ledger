import { formatPropertyRef, parsePropertyRef, type PropertyKind, type PropertyRef } from "@/lib/property-ref";
import type { LaunchType } from "@/lib/data/types";

/** Property references as stored in watchlist / tracked_homes / alerts rows ("hdb:blk-1-x", "launch:condo/foo"). */

export const MAX_REF_LENGTH = 200;

const LAUNCH_TYPES: readonly LaunchType[] = ["condo", "ec", "landed"];

/** Kinds a home can be tracked as on /my-property/ (an actual dwelling with a value estimate). */
export const TRACKABLE_KINDS: readonly PropertyKind[] = ["hdb", "condo", "landed"];

/** Kinds that can carry a new-sale / new-launch alert. */
export const ALERTABLE_KINDS: readonly PropertyKind[] = ["hdb", "condo", "landed", "landed-street", "launch"];

export type AlertKind = "new-sale" | "new-launch";
export type AlertChannel = "telegram" | "email";

/**
 * Validate a ref string from a request body or query and return it in canonical form.
 * Returns null for anything parsePropertyRef rejects, unknown launch types or over-long input.
 */
export function normaliseRef(input: unknown): { ref: PropertyRef; id: string } | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_REF_LENGTH) return null;
  const ref = parsePropertyRef(trimmed);
  if (!ref) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ref.slug)) return null;
  if (ref.kind === "launch" && !LAUNCH_TYPES.includes((ref.launchType ?? "") as LaunchType)) return null;
  return { ref, id: formatPropertyRef(ref) };
}

/** The alert kind that applies to a property: launches report sales updates, everything else new sales. */
export function alertKindFor(ref: PropertyRef): AlertKind {
  return ref.kind === "launch" ? "new-launch" : "new-sale";
}

/**
 * Map a property page path (as returned by the search index) back to a ref:
 * "/hdb/blk-1-x/" -> hdb:blk-1-x, "/new-launch/condo/foo/" -> launch:condo/foo. Towns, MRT stations and
 * other pages return null.
 */
export function refFromHref(href: string): PropertyRef | null {
  const path = href.split(/[?#]/)[0];
  const launch = /^\/new-launch\/([a-z]+)\/([a-z0-9-]+)\/?$/.exec(path);
  if (launch) return normaliseRef(`launch:${launch[1]}/${launch[2]}`)?.ref ?? null;
  const m = /^\/(hdb|condo|landed|landed-street)\/([a-z0-9-]+)\/?$/.exec(path);
  if (!m) return null;
  return normaliseRef(`${m[1]}:${m[2]}`)?.ref ?? null;
}
