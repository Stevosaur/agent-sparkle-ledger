import "server-only";
import { getBlocksInTown, getHdbBlocks, getTown } from "@/lib/data/hdb";
import { getProjects } from "@/lib/data/private";
import { getMrtStations } from "@/lib/data/geo";
import { resolveProperty } from "@/lib/data/resolve";
import { parsePropertyRef } from "@/lib/property-ref";
import { slugify, titleCase } from "@/lib/slug";
import { rankByWeightedDistance } from "./fit";
import { getActiveListings, toSummary } from "./listings";
import { resolveListingProperty } from "./property";
import type { FitPlace, FitResponse, FitResultRow, ListingType } from "./types";

export const FIT_RESULT_LIMIT = 25;

/** Resolve a place ref to a labelled point; null when unknown or without coordinates. */
export function resolvePlace(ref: string): Omit<FitPlace, "weight"> | null {
  const [kind, rest] = [ref.slice(0, ref.indexOf(":")), ref.slice(ref.indexOf(":") + 1)];
  if (kind === "town") {
    const town = getTown(rest);
    if (!town) return null;
    const pts = getBlocksInTown(rest).filter((b) => b.lat != null && b.lng != null);
    if (pts.length === 0) return null;
    const lat = pts.reduce((s, b) => s + (b.lat as number), 0) / pts.length;
    const lng = pts.reduce((s, b) => s + (b.lng as number), 0) / pts.length;
    return { ref, label: `${titleCase(town.town)} (town centre of HDB blocks)`, lat, lng };
  }
  if (kind === "mrt") {
    const station = getMrtStations().find((s) => slugify(s.name) === rest);
    if (!station) return null;
    const suffix = station.status === "future" ? ` (opens ${station.expectedYear ?? "TBC"})` : "";
    return { ref, label: `${titleCase(station.name)} MRT${suffix}`, lat: station.lat, lng: station.lng };
  }
  const pref = parsePropertyRef(ref);
  if (!pref) return null;
  const resolved = resolveProperty(pref);
  if (!resolved || resolved.lat == null || resolved.lng == null) return null;
  return { ref, label: resolved.label, lat: resolved.lat, lng: resolved.lng };
}

/**
 * Rank active listings by weighted distance to the places; when there are no active listings, rank HDB
 * blocks and condo / EC projects with at least one sale in the latest 12 months instead.
 */
export async function computeFit(input: { ref: string; weight: number }[], opts: { listingType?: ListingType | null } = {}): Promise<FitResponse> {
  const places: FitPlace[] = [];
  const unresolved: string[] = [];
  for (const p of input) {
    const r = resolvePlace(p.ref);
    if (r) places.push({ ...r, weight: p.weight });
    else unresolved.push(p.ref);
  }

  const { listings } = await getActiveListings(opts.listingType ? { type: opts.listingType } : {});
  if (listings.length > 0) {
    const candidates = listings.map((l) => {
      const prop = resolveListingProperty(l.ref);
      const s = toSummary(l);
      return { l, s, lat: l.lat ?? prop?.lat ?? null, lng: l.lng ?? prop?.lng ?? null };
    });
    const ranked = places.length ? rankByWeightedDistance(candidates, places, FIT_RESULT_LIMIT) : [];
    const results: FitResultRow[] = ranked.map(({ item, score, distances }) => ({
      id: item.l.id,
      kind: "listing",
      label: item.l.title,
      sub: [item.s.propertyLabel, item.s.areaLabel].filter(Boolean).join(" · ") || null,
      href: `/homes/${item.l.id}/`,
      score,
      distances,
      listingType: item.l.listingType,
      askingPrice: item.l.askingPrice,
    }));
    return { mode: "listings", places, unresolved, results, candidates: candidates.filter((c) => c.lat != null && c.lng != null).length };
  }

  type Candidate = { id: string; kind: "hdb" | "condo"; label: string; sub: string; href: string; lat: number | null; lng: number | null; medianPsf12m: number | null; count12m: number; lastPrice: number | null };
  const candidates: Candidate[] = [];
  for (const b of getHdbBlocks()) {
    if (b.tx.count12m <= 0 || b.lat == null || b.lng == null) continue;
    candidates.push({
      id: `hdb:${b.slug}`,
      kind: "hdb",
      label: `Blk ${b.block} ${titleCase(b.street)}`,
      sub: `${titleCase(b.town)} · HDB`,
      href: `/hdb/${b.slug}/`,
      lat: b.lat,
      lng: b.lng,
      medianPsf12m: b.tx.medianPsf12m,
      count12m: b.tx.count12m,
      lastPrice: b.tx.lastPrice,
    });
  }
  for (const p of getProjects()) {
    if (p.isLanded || p.tx.count12m <= 0 || p.lat == null || p.lng == null) continue;
    const ec = p.propertyTypes.includes("Executive Condominium");
    candidates.push({
      id: `condo:${p.slug}`,
      kind: "condo",
      label: titleCase(p.name),
      sub: [p.district != null ? `D${p.district}` : null, p.segment, ec ? "EC" : "Condo"].filter(Boolean).join(" · "),
      href: `/condo/${p.slug}/`,
      lat: p.lat,
      lng: p.lng,
      medianPsf12m: p.tx.medianPsf12m,
      count12m: p.tx.count12m,
      lastPrice: p.tx.lastPrice,
    });
  }
  const ranked = places.length ? rankByWeightedDistance(candidates, places, FIT_RESULT_LIMIT) : [];
  return {
    mode: "properties",
    places,
    unresolved,
    candidates: candidates.length,
    results: ranked.map(({ item, score, distances }) => ({
      id: item.id,
      kind: item.kind,
      label: item.label,
      sub: item.sub,
      href: item.href,
      score,
      distances,
      medianPsf12m: item.medianPsf12m,
      count12m: item.count12m,
      lastPrice: item.lastPrice,
    })),
  };
}
