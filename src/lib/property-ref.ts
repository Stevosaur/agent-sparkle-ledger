/** A reference to any property page. Used by compare (?ids=hdb:blk-1-x,condo:foo), watchlist, AI context and supply-demand. */
export type PropertyKind = "hdb" | "condo" | "landed" | "landed-street" | "launch";

export interface PropertyRef {
  kind: PropertyKind;
  slug: string;
  /** launch type for kind "launch" (condo | ec | landed) */
  launchType?: string;
}

export function propertyHref(ref: PropertyRef): string {
  switch (ref.kind) {
    case "hdb":
      return `/hdb/${ref.slug}/`;
    case "condo":
      return `/condo/${ref.slug}/`;
    case "landed":
      return `/landed/${ref.slug}/`;
    case "landed-street":
      return `/landed-street/${ref.slug}/`;
    case "launch":
      return `/new-launch/${ref.launchType ?? "condo"}/${ref.slug}/`;
  }
}

/** "hdb:blk-1-x" -> { kind: "hdb", slug: "blk-1-x" }; "launch:condo/foo" -> launch with type. */
export function parsePropertyRef(id: string): PropertyRef | null {
  const m = /^(hdb|condo|landed|landed-street|launch):([a-z0-9/-]+)$/.exec(id.trim());
  if (!m) return null;
  const kind = m[1] as PropertyKind;
  if (kind === "launch") {
    const [launchType, slug] = m[2].split("/");
    if (!slug) return null;
    return { kind, slug, launchType };
  }
  if (m[2].includes("/")) return null;
  return { kind, slug: m[2] };
}

export function formatPropertyRef(ref: PropertyRef): string {
  return ref.kind === "launch" ? `launch:${ref.launchType ?? "condo"}/${ref.slug}` : `${ref.kind}:${ref.slug}`;
}
