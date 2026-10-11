import type { Metadata } from "next";
import { site } from "@/lib/config/site";

/** Absolute URL for a site path ("/hdb/blk-1-x/" -> "https://example.com/hdb/blk-1-x/"). */
export function absoluteUrl(path: string): string {
  return `${site.url}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * The default social card (src/app/opengraph-image.tsx). A page that sets `openGraph` replaces the root
 * segment's file-based image, so pageMetadata() names it explicitly. Relative to metadataBase (root layout);
 * the trailing slash matches next.config trailingSlash (the bare path 308-redirects).
 */
export const DEFAULT_OG_IMAGE = { url: "/opengraph-image/", width: 1200, height: 630, alt: `${site.name}: Singapore property research` } as const;

/**
 * Standard page metadata: title template, description, canonical URL (with trailing slash, matching
 * next.config trailingSlash) and Open Graph / Twitter cards with the default social image.
 */
export function pageMetadata({ title, description, path, noindex = false, ogType = "website" }: { title: string; description: string; path: string; noindex?: boolean; ogType?: "website" | "article" }): Metadata {
  const canonical = path.endsWith("/") || path.includes("?") ? path : `${path}/`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: noindex ? { index: false, follow: true } : undefined,
    openGraph: { title: `${title} | ${site.name}`, description, url: absoluteUrl(canonical), siteName: site.name, type: ogType, locale: "en_SG", images: [DEFAULT_OG_IMAGE] },
    twitter: { card: "summary_large_image", title: `${title} | ${site.name}`, description, images: [DEFAULT_OG_IMAGE.url] },
  };
}
