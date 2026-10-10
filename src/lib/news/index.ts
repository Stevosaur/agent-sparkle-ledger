import "server-only";
import { getSeries } from "@/lib/data/stats";
import { isRentSeries } from "@/lib/insights/series-keys";
import { toChartPoints } from "@/lib/insights/math";
import type { ChartLine, ChartSpec } from "@/lib/insights/types";
import { getExplainers } from "./articles";
import { getMarketReport } from "./report";
import type { Article, ArticleBlock, ArticleSummary, ResolvedBlock } from "./types";

/** Every article, newest first; the data-driven market report leads when it exists. */
export function getArticles(): Article[] {
  const report = getMarketReport();
  const explainers = [...getExplainers()].sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  return report ? [report, ...explainers] : explainers;
}

export function getArticle(slug: string): Article | null {
  return getArticles().find((a) => a.slug === slug) ?? null;
}

export function summarize(a: Article): ArticleSummary {
  const { body: _body, ...rest } = a;
  return rest;
}

/** Blocks anyone may see: the whole body, or only the teaser for Plus articles. */
export function freeBlocks(a: Article): ArticleBlock[] {
  return a.plusOnly ? a.body.slice(0, a.teaserBlocks) : a.body;
}

function sourceFor(key: string): string {
  if (key.startsWith("rent-hdb")) return "HDB rental approvals (data.gov.sg)";
  if (key.startsWith("hdb")) return "HDB resale records (data.gov.sg)";
  if (key.startsWith("rent-private")) return "URA rental contracts (needs a URA Data Service key)";
  return "URA private transactions (needs a URA Data Service key)";
}

/** Attach series data to chart blocks; missing series become an honest "data not loaded" note. */
export function resolveBlocks(blocks: ArticleBlock[]): ResolvedBlock[] {
  return blocks.map((b): ResolvedBlock => {
    if (b.type !== "chart") return b;
    const metric = b.metric ?? "price";
    const field = metric === "psf" ? "medianPsf" : metric === "volume" ? "count" : "medianPrice";
    const fromMonth = b.fromYear != null ? (b.fromYear - 1990) * 12 : -Infinity;
    const keys = [b.seriesKey, ...(b.compareKeys ?? [])];
    const lines: ChartLine[] = [];
    for (const key of keys) {
      const s = getSeries(key);
      if (!s) continue;
      const points = toChartPoints(s.points, field, fromMonth);
      if (points.length) lines.push({ name: s.label, points });
    }
    if (lines.length === 0) return { type: "chart", title: b.title, chart: null, missing: `This chart needs ${sourceFor(b.seriesKey)}, which is not in this dataset yet.` };
    const yFormat: ChartSpec["yFormat"] = metric === "psf" ? "psf" : metric === "volume" ? "int" : keys.every(isRentSeries) ? "rent" : "sgd";
    return { type: "chart", title: b.title, chart: { kind: "line", yFormat, ariaLabel: `Line chart: ${b.title}`, series: lines }, missing: null };
  });
}

export type { Article, ArticleBlock, ArticleSummary, ResolvedBlock } from "./types";
