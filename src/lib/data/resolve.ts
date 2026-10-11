import "server-only";
import { getHdbBlock } from "./hdb";
import { getLandedAddress, getLandedStreet, getLaunches, getProject } from "./private";
import { titleCase } from "@/lib/slug";
import type { PropertyRef } from "@/lib/property-ref";

export interface ResolvedProperty {
  ref: PropertyRef;
  label: string;
  href: string;
  lat: number | null;
  lng: number | null;
  postal: string | null;
}

/** Look up any property reference; null if it does not exist in the snapshot. */
export function resolveProperty(ref: PropertyRef): ResolvedProperty | null {
  switch (ref.kind) {
    case "hdb": {
      const b = getHdbBlock(ref.slug);
      return b ? { ref, label: `Blk ${b.block} ${titleCase(b.street)}`, href: `/hdb/${b.slug}/`, lat: b.lat ?? null, lng: b.lng ?? null, postal: b.postal } : null;
    }
    case "condo": {
      const p = getProject(ref.slug);
      return p && !p.isLanded ? { ref, label: titleCase(p.name), href: `/condo/${p.slug}/`, lat: p.lat ?? null, lng: p.lng ?? null, postal: null } : null;
    }
    case "landed": {
      const a = getLandedAddress(ref.slug);
      return a ? { ref, label: titleCase(a.address), href: `/landed/${a.slug}/`, lat: a.lat ?? null, lng: a.lng ?? null, postal: null } : null;
    }
    case "landed-street": {
      const s = getLandedStreet(ref.slug);
      return s ? { ref, label: titleCase(s.street), href: `/landed-street/${s.slug}/`, lat: s.lat ?? null, lng: s.lng ?? null, postal: null } : null;
    }
    case "launch": {
      const l = getLaunches().find((x) => x.slug === ref.slug && (!ref.launchType || x.type === ref.launchType));
      return l ? { ref: { ...ref, launchType: l.type }, label: titleCase(l.name), href: `/new-launch/${l.type}/${l.slug}/`, lat: l.lat ?? null, lng: l.lng ?? null, postal: null } : null;
    }
  }
}

/**
 * Resolve a bare slug (as used by /supply-demand/<slug>/): HDB blocks ("blk-" prefix) first,
 * then condo projects, landed addresses, landed streets and launches.
 */
export function resolveSlug(slug: string): ResolvedProperty | null {
  if (slug.startsWith("blk-")) return resolveProperty({ kind: "hdb", slug });
  return (
    resolveProperty({ kind: "condo", slug }) ??
    resolveProperty({ kind: "landed", slug }) ??
    resolveProperty({ kind: "landed-street", slug }) ??
    resolveProperty({ kind: "launch", slug })
  );
}
