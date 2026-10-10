import "server-only";
import type { MetadataRoute } from "next";
import { getHdbBlocks, getTowns } from "@/lib/data/hdb";
import { getLandedAddresses, getLandedStreets, getLaunches, getProjects } from "@/lib/data/private";
import { getMeta } from "@/lib/data/meta";
import { getArticles } from "@/lib/news";
import { absoluteUrl } from "@/lib/seo";

/**
 * Sitemap contents, split into chunks for generateSitemaps (src/app/sitemap.ts) and listed in robots.txt.
 * Chunks are served at /sitemap/<id>.xml.
 */

export const SITEMAP_CHUNK_SIZE = 10_000;

/** Public, indexable pages that are not generated from the dataset. */
export const STATIC_PATHS = [
  "/",
  "/valuation/",
  "/property-analysis/",
  "/affordability/",
  "/mortgage-rates/",
  "/listings/",
  "/new-launch/",
  "/hdb/",
  "/lists/",
  "/insights/",
  "/compare/",
  "/map/",
  "/homes/",
  "/news/",
  "/services/",
  "/plus/",
  "/docs/",
  "/spot/",
  "/methodology/",
  "/research/",
  "/about/",
  "/privacy/",
  "/tos/",
] as const;

export interface SitemapPath {
  path: string;
  /** ISO date the underlying data was generated (data pages only) */
  lastModified?: string;
}

/** Every indexable path: static pages, then each property family, towns and news articles. */
export function collectSitemapPaths(extra: SitemapPath[] = []): SitemapPath[] {
  const meta = getMeta();
  const lastModified = meta.generatedAt || undefined;
  const data = (path: string): SitemapPath => (lastModified ? { path, lastModified } : { path });
  const out: SitemapPath[] = STATIC_PATHS.map((path) => ({ path }));
  for (const b of getHdbBlocks()) out.push(data(`/hdb/${b.slug}/`));
  for (const p of getProjects()) if (!p.isLanded) out.push(data(`/condo/${p.slug}/`));
  for (const s of getLandedStreets()) out.push(data(`/landed-street/${s.slug}/`));
  for (const a of getLandedAddresses()) out.push(data(`/landed/${a.slug}/`));
  for (const l of getLaunches()) out.push(data(`/new-launch/${l.type}/${l.slug}/`));
  for (const t of getTowns()) out.push(data(`/insights/town/${t.slug}/`));
  for (const a of getArticles()) out.push(/^\d{4}-\d{2}-\d{2}$/.test(a.date) ? { path: `/news/${a.slug}/`, lastModified: a.date } : { path: `/news/${a.slug}/` });
  out.push(...extra);
  // de-duplicate, keeping the first occurrence
  const seen = new Set<string>();
  return out.filter((p) => (seen.has(p.path) ? false : (seen.add(p.path), true)));
}

/** Number of sitemap files needed for `total` URLs (always at least one). */
export function chunkCount(total: number, size: number = SITEMAP_CHUNK_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

/** The `id`-th chunk (0-based); empty for ids out of range. */
export function chunkAt<T>(items: readonly T[], id: number, size: number = SITEMAP_CHUNK_SIZE): T[] {
  if (!Number.isInteger(id) || id < 0) return [];
  return items.slice(id * size, (id + 1) * size);
}

export function sitemapIds(total: number, size: number = SITEMAP_CHUNK_SIZE): { id: number }[] {
  return Array.from({ length: chunkCount(total, size) }, (_, id) => ({ id }));
}

export function sitemapUrl(id: number): string {
  return absoluteUrl(`/sitemap/${id}.xml`);
}

export function toSitemapEntries(paths: readonly SitemapPath[]): MetadataRoute.Sitemap {
  return paths.map((p) => (p.lastModified ? { url: absoluteUrl(p.path), lastModified: p.lastModified } : { url: absoluteUrl(p.path) }));
}
