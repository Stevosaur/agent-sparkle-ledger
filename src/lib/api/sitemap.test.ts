import { describe, expect, it } from "vitest";
import { getArticles } from "@/lib/news";
import { STATIC_PATHS, chunkAt, chunkCount, collectSitemapPaths, sitemapIds, sitemapUrl, toSitemapEntries } from "./sitemap";

describe("sitemap chunking", () => {
  it("splits URLs into chunks of at most 10,000", () => {
    expect(chunkCount(0)).toBe(1);
    expect(chunkCount(1)).toBe(1);
    expect(chunkCount(10_000)).toBe(1);
    expect(chunkCount(10_001)).toBe(2);
    expect(chunkCount(25_000)).toBe(3);
    expect(sitemapIds(25_000)).toEqual([{ id: 0 }, { id: 1 }, { id: 2 }]);
  });

  it("returns each URL exactly once across chunks", () => {
    const items = Array.from({ length: 23_456 }, (_, i) => i);
    const ids = sitemapIds(items.length);
    const chunks = ids.map(({ id }) => chunkAt(items, id));
    expect(chunks.map((c) => c.length)).toEqual([10_000, 10_000, 3_456]);
    expect(chunks.flat()).toEqual(items);
    expect(chunkAt(items, 3)).toEqual([]);
    expect(chunkAt(items, -1)).toEqual([]);
    expect(chunkAt(items, Number.NaN)).toEqual([]);
    expect(chunkAt([1, 2, 3, 4, 5], 1, 2)).toEqual([3, 4]);
  });
});

describe("sitemap contents (fixtures)", () => {
  const paths = collectSitemapPaths().map((p) => p.path);

  it("lists static pages and every entity family", () => {
    for (const p of STATIC_PATHS) expect(paths).toContain(p);
    expect(paths).toContain("/hdb/blk-872a-tampines-st-86/");
    expect(paths).toContain("/hdb/blk-999-tampines-st-99/");
    expect(paths).toContain("/condo/aurora-fixture-residences/");
    expect(paths).toContain("/condo/sample-park-condo/");
    expect(paths).toContain("/condo/the-fixture-ec/");
    expect(paths).toContain("/landed-street/sample-ln/");
    expect(paths).toContain("/landed/15-sample-ln/");
    expect(paths).toContain("/new-launch/condo/aurora-fixture-residences/");
    expect(paths).toContain("/new-launch/condo/upcoming-fixture-towers/");
    expect(paths).toContain("/insights/town/tampines/");
    const articles = getArticles();
    expect(articles.length).toBeGreaterThan(0);
    for (const a of articles) expect(paths).toContain(`/news/${a.slug}/`);
  });

  it("excludes landed projects from condo URLs, private routes and duplicates", () => {
    expect(paths).not.toContain("/condo/landed-sample-ln/");
    expect(paths.some((p) => /^\/(api|profile|my-property|login|auth)\//.test(p))).toBe(false);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.every((p) => p.startsWith("/") && p.endsWith("/"))).toBe(true);
  });

  it("builds absolute entries with lastModified on data pages", () => {
    const entries = toSitemapEntries(collectSitemapPaths());
    expect(entries[0].url).toMatch(/^https?:\/\/[^/]+\/$/);
    const block = entries.find((e) => e.url.endsWith("/hdb/blk-872a-tampines-st-86/"));
    expect(block?.lastModified).toBe("2026-09-01T00:00:00.000Z");
    expect(sitemapUrl(2)).toMatch(/\/sitemap\/2\.xml$/);
  });
});
