import type { MetadataRoute } from "next";
import { chunkAt, collectSitemapPaths, sitemapIds, toSitemapEntries } from "@/lib/api/sitemap";

/**
 * Sitemaps in chunks of at most 10,000 URLs, served at /sitemap/<id>.xml (all listed in robots.txt):
 * static pages, then every HDB block, condo project, landed street, landed address, new launch, town and news article.
 */

export const revalidate = 86400;

export async function generateSitemaps() {
  return sitemapIds(collectSitemapPaths().length);
}

export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id);
  return toSitemapEntries(chunkAt(collectSitemapPaths(), id));
}
