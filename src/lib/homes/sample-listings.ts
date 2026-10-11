import "server-only";
import { getBlockRentals, getBlockTransactions, getHdbBlocks } from "@/lib/data/hdb";
import { getLandedAddressTransactions, getLandedAddresses, getProjectRentals, getProjectTransactions, getProjects } from "@/lib/data/private";
import { getMeta } from "@/lib/data/meta";
import { titleCase } from "@/lib/slug";
import { roundTo } from "./fair-value";
import { HDB_TYPICAL_BEDROOMS } from "./constants";
import { resolveListingProperty } from "./property";
import type { HomeListing, ListingType } from "./types";

/**
 * Demo listings for deployments running on the synthetic fixture snapshot without Supabase (local
 * development, CI, previews). Every figure is taken from a fixture record (the latest sale or rental of
 * that property) so pages exercise real code paths; they are flagged `sample` and labelled in the UI.
 * Never used when Supabase is configured or when the snapshot holds real data.
 */

function sampleId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function daysBefore(iso: string, days: number): string {
  const base = Date.parse(iso);
  return new Date((Number.isFinite(base) ? base : 0) - days * 86_400_000).toISOString();
}

const DESCRIPTION: Record<ListingType, string> = {
  sale: "Sample listing generated from the synthetic test dataset to demonstrate listing pages. The asking price is the latest recorded sale for this property in that dataset. It is not a real home for sale.",
  rent: "Sample listing generated from the synthetic test dataset to demonstrate listing pages. The asking rent is the latest recorded rental for this property in that dataset. It is not a real home for rent.",
};

let cache: { key: string; listings: HomeListing[] } | null = null;

export function sampleListings(): HomeListing[] {
  const meta = getMeta();
  if (!meta.fixture) return [];
  const key = meta.generatedAt;
  if (cache?.key === key) return cache.listings;

  const out: HomeListing[] = [];
  const created = meta.generatedAt || "2026-01-01T00:00:00.000Z";
  const push = (l: Omit<HomeListing, "id" | "userId" | "status" | "createdAt" | "updatedAt" | "contactName" | "whatsapp" | "sample" | "lat" | "lng" | "description">) => {
    const prop = resolveListingProperty(l.ref);
    if (!prop) return;
    const n = out.length + 1;
    out.push({
      ...l,
      id: sampleId(n),
      userId: null,
      status: "active",
      description: DESCRIPTION[l.listingType],
      contactName: "Sample lister",
      whatsapp: null,
      lat: prop.lat,
      lng: prop.lng,
      createdAt: daysBefore(created, n * 3),
      updatedAt: null,
      sample: true,
    });
  };

  // HDB resale: the three busiest blocks, priced at their latest recorded sale.
  const hdbBlocks = getHdbBlocks()
    .filter((b) => b.tx.count12m > 0)
    .sort((a, b) => b.tx.count12m - a.tx.count12m || a.slug.localeCompare(b.slug))
    .slice(0, 3);
  for (const b of hdbBlocks) {
    const tx = getBlockTransactions(b.slug)[0];
    if (!tx) continue;
    push({
      listingType: "sale",
      ref: `hdb:${b.slug}`,
      title: `${titleCase(tx.flatType)} flat at Blk ${b.block} ${titleCase(b.street)}`,
      askingPrice: roundTo(tx.price, 1000),
      flatType: tx.flatType,
      areaSqm: tx.floorAreaSqm,
      floorLevel: Number.isFinite(tx.storeyMid) ? Math.round(tx.storeyMid) : null,
      bedrooms: HDB_TYPICAL_BEDROOMS[tx.flatType] ?? null,
      bathrooms: null,
    });
  }

  // HDB rental: one block with rental approvals, at its latest recorded rent.
  for (const b of [...getHdbBlocks()].sort((a, c) => a.slug.localeCompare(c.slug))) {
    const r = getBlockRentals(b.slug)[0];
    if (!r) continue;
    push({
      listingType: "rent",
      ref: `hdb:${b.slug}`,
      title: `${titleCase(r.flatType)} flat for rent at Blk ${b.block} ${titleCase(b.street)}`,
      askingPrice: roundTo(r.monthlyRent, 10),
      flatType: r.flatType,
      areaSqm: null,
      floorLevel: null,
      bedrooms: HDB_TYPICAL_BEDROOMS[r.flatType] ?? null,
      bathrooms: null,
    });
    break;
  }

  // Condo / EC resale: each non-landed project's latest single-unit sale.
  const projects = getProjects()
    .filter((p) => !p.isLanded && p.tx.count12m > 0)
    .sort((a, b) => a.slug.localeCompare(b.slug));
  for (const p of projects.slice(0, 3)) {
    const tx = getProjectTransactions(p.slug).find((t) => t.units === 1 && t.typeOfArea !== "Land");
    if (!tx) continue;
    push({
      listingType: "sale",
      ref: `condo:${p.slug}`,
      title: `${Math.round(tx.areaSqft)} sqft unit at ${titleCase(p.name)}`,
      askingPrice: roundTo(tx.price, 1000),
      flatType: null,
      areaSqm: tx.areaSqm,
      floorLevel: tx.floorMid != null ? Math.round(tx.floorMid) : null,
      bedrooms: null,
      bathrooms: null,
    });
  }

  // Condo rental: the first project with a rental contract that states bedrooms.
  for (const p of projects) {
    const r = getProjectRentals(p.slug).find((x) => x.bedrooms != null);
    if (!r) continue;
    const area = r.areaSqmLow != null && r.areaSqmHigh != null ? Math.round((r.areaSqmLow + r.areaSqmHigh) / 2) : null;
    push({
      listingType: "rent",
      ref: `condo:${p.slug}`,
      title: `${r.bedrooms}-bedroom unit for rent at ${titleCase(p.name)}`,
      askingPrice: roundTo(r.monthlyRent, 10),
      flatType: null,
      areaSqm: area,
      floorLevel: null,
      bedrooms: r.bedrooms,
      bathrooms: null,
    });
    break;
  }

  // Landed: the first address with a recorded sale.
  for (const a of [...getLandedAddresses()].sort((x, y) => x.slug.localeCompare(y.slug))) {
    const tx = getLandedAddressTransactions(a.slug)[0];
    if (!tx) continue;
    push({
      listingType: "sale",
      ref: `landed:${a.slug}`,
      title: `${a.propertyType ?? "Landed home"} at ${titleCase(a.address)}`,
      askingPrice: roundTo(tx.price, 1000),
      flatType: null,
      areaSqm: tx.areaSqm,
      floorLevel: null,
      bedrooms: null,
      bathrooms: null,
    });
    break;
  }

  cache = { key, listings: out };
  return out;
}
