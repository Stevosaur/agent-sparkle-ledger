import "server-only";
import { getHdbBlock } from "@/lib/data/hdb";
import { getLandedAddress, getProject } from "@/lib/data/private";
import { resolveProperty } from "@/lib/data/resolve";
import { parsePropertyRef, type PropertyRef } from "@/lib/property-ref";
import { titleCase } from "@/lib/slug";
import type { ListingKind } from "./types";

/** What a listing's property reference points at, resolved against the dataset snapshot. */
export interface ListingProperty {
  ref: PropertyRef;
  kind: ListingKind;
  label: string;
  href: string;
  lat: number | null;
  lng: number | null;
  postal: string | null;
  areaKey: string | null;
  areaLabel: string | null;
}

export function districtLabel(d: number): string {
  return `District ${d}`;
}

/** Resolve "hdb:..." / "condo:..." / "landed:..." refs; null for anything else or unknown slugs. */
export function resolveListingProperty(refId: string): ListingProperty | null {
  const ref = parsePropertyRef(refId);
  if (!ref || (ref.kind !== "hdb" && ref.kind !== "condo" && ref.kind !== "landed")) return null;
  const resolved = resolveProperty(ref);
  if (!resolved) return null;
  let areaKey: string | null = null;
  let areaLabel: string | null = null;
  if (ref.kind === "hdb") {
    const b = getHdbBlock(ref.slug);
    if (b) {
      areaKey = `town:${b.townSlug}`;
      areaLabel = titleCase(b.town);
    }
  } else {
    const district = ref.kind === "condo" ? getProject(ref.slug)?.district : getLandedAddress(ref.slug)?.district;
    if (district != null) {
      areaKey = `d:${district}`;
      areaLabel = districtLabel(district);
    }
  }
  return {
    ref,
    kind: ref.kind,
    label: resolved.label,
    href: resolved.href,
    lat: resolved.lat,
    lng: resolved.lng,
    postal: resolved.postal,
    areaKey,
    areaLabel,
  };
}
