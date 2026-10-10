import type { MetadataRoute } from "next";
import { collectSitemapPaths, sitemapIds, sitemapUrl } from "@/lib/api/sitemap";

export const revalidate = 86400;

/** robots.txt: everything public is crawlable; account, auth and API routes are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/profile/", "/my-property/", "/login/", "/auth/"],
    },
    sitemap: sitemapIds(collectSitemapPaths().length).map(({ id }) => sitemapUrl(id)),
  };
}
