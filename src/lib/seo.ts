import type { Metadata } from "next";
import { site } from "@/lib/config/site";

/** Absolute URL for a site path ("/hdb/blk-1-x/" -> "https://example.com/hdb/blk-1-x/"). */
export function absoluteUrl(path: string): string {
  return `${site.url}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Standard page metadata: title template, description, canonical URL (with trailing slash, matching
 * next.config trailingSlash) and Open Graph / Twitter cards.
 */
export function pageMetadata({ title, description, path, noindex = false, ogType = "website" }: { title: string; description: string; path: string; noindex?: boolean; ogType?: "website" | "article" }): Metadata {
  const canonical = path.endsWith("/") || path.includes("?") ? path : `${path}/`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: noindex ? { index: false, follow: true } : undefined,
    openGraph: { title: `${title} | ${site.name}`, description, url: absoluteUrl(canonical), siteName: site.name, type: ogType, locale: "en_SG" },
    twitter: { card: "summary_large_image", title: `${title} | ${site.name}`, description },
  };
}
