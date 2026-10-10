import type { ChartSpec } from "@/lib/insights/types";

/** Article body blocks. Text is plain (no HTML/Markdown); every number is computed, not typed in. */
export type ArticleBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "table"; caption?: string; head: string[]; rows: string[][]; note?: string }
  | {
      type: "chart";
      title: string;
      /** stat-series key, e.g. "hdb:ALL:ALL" */
      seriesKey: string;
      /** extra series drawn on the same chart */
      compareKeys?: string[];
      metric?: "price" | "psf" | "volume";
      fromYear?: number;
    };

/** Internal link (site path with trailing slash). */
export interface ArticleLink {
  label: string;
  href: string;
}

/** External source citation. */
export interface ArticleSource {
  label: string;
  url: string;
}

export interface Article {
  slug: string;
  title: string;
  description: string;
  /** "YYYY-MM-DD" */
  date: string;
  author: string;
  tags: string[];
  plusOnly: boolean;
  /** for plusOnly articles: how many leading body blocks are shown free as the teaser */
  teaserBlocks: number;
  body: ArticleBlock[];
  sources: ArticleSource[];
  related: ArticleLink[];
  /** generated from the dataset (market report) rather than written */
  dataDriven: boolean;
}

/** A body block ready to render: chart blocks carry their data (or the reason it is missing). */
export type ResolvedBlock = Exclude<ArticleBlock, { type: "chart" }> | { type: "chart"; title: string; chart: ChartSpec | null; missing: string | null };

/** Card / listing metadata (no body). */
export type ArticleSummary = Omit<Article, "body">;
