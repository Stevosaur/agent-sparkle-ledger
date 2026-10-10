import { describe, expect, it } from "vitest";
import { AUTHOR, getExplainers } from "./articles";
import { freeBlocks, getArticle, getArticles, resolveBlocks } from "./index";
import { getMarketReport, REPORT_SLUG } from "./report";
import { isValidSeriesKey } from "@/lib/insights/series-keys";
import { site } from "@/lib/config/site";
import type { Article, ArticleBlock } from "./types";
import { BALA_TABLE_STATUS, balaPct } from "@/lib/calc/lease";

function text(a: Article): string {
  const parts: string[] = [a.title, a.description];
  const walk = (b: ArticleBlock) => {
    if (b.type === "paragraph" || b.type === "heading") parts.push(b.text);
    else if (b.type === "list") parts.push(...b.items);
    else if (b.type === "table") parts.push(b.caption ?? "", ...b.head, ...b.rows.flat(), b.note ?? "");
    else parts.push(b.title, b.seriesKey);
  };
  a.body.forEach(walk);
  return parts.join("\n");
}

describe("explainers", () => {
  const all = getExplainers();
  it("has 8-10 well-formed explainers with unique slugs", () => {
    expect(all.length).toBeGreaterThanOrEqual(8);
    expect(all.length).toBeLessThanOrEqual(10);
    expect(new Set(all.map((a) => a.slug)).size).toBe(all.length);
    for (const a of all) {
      expect(a.slug).toMatch(/^[a-z0-9-]+$/);
      expect(a.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(a.author).toBe(`${site.name} Research`);
      expect(a.body.length).toBeGreaterThan(3);
      expect(a.sources.length).toBeGreaterThan(0);
      for (const s of a.sources) expect(s.url).toMatch(/^https:\/\//);
      for (const r of a.related) expect(r.href).toMatch(/^\/[^?#]*\/([?#].*)?$/);
      const t = text(a);
      expect(t, a.slug).not.toMatch(/NaN|undefined|lorem|ipsum|\{\w+\}/i);
      for (const b of a.body) if (b.type === "chart") expect(isValidSeriesKey(b.seriesKey)).toBe(true);
    }
  });
  it("has exactly two Plus explainers with a free teaser", () => {
    const plus = all.filter((a) => a.plusOnly);
    expect(plus.map((a) => a.slug).sort()).toEqual(["en-bloc-basics", "lease-decay-balas-table"]);
    for (const a of plus) {
      expect(a.teaserBlocks).toBeGreaterThan(0);
      expect(a.teaserBlocks).toBeLessThan(a.body.length);
      expect(freeBlocks(a)).toHaveLength(a.teaserBlocks);
    }
  });
  it("computes stamp-duty examples that match the IRAS research vectors", () => {
    const t = text(getExplainers().find((a) => a.slug === "stamp-duties-bsd-absd-ssd")!);
    expect(t).toContain("S$24,600 of BSD"); // BSD on S$1,000,000
    expect(t).toContain("S$44,600 on S$1,500,000");
    expect(t).toContain("S$94,600 on S$2,500,000");
    expect(t).toContain("ABSD of S$300,000 (20%)");
    expect(t).toContain("S$75,000 (5%)");
    expect(t).toContain("SSD is 12%, or S$168,000");
    expect(t).toContain("SSD is 4%, or S$80,000");
  });
  it("computes loan examples that match the MAS/HDB research vectors", () => {
    const t = text(getExplainers().find((a) => a.slug === "tdsr-msr-ltv-explained")!);
    expect(t).toContain("supports S$568,357"); // 3,000 x 189.452483
    expect(t).toContain("so the loan is S$525,000");
    expect(t).toContain("supports S$984,468"); // 4,700 x 209.461240
    expect(t).toContain("supports S$506,103"); // 2,400 x 210.876453
    expect(t).toContain("is S$2,042 a month"); // 450,000 at 2.6% over 25 years = 2,041.51
  });
  it("computes the CPF pro-rating example", () => {
    expect(text(getExplainers().find((a) => a.slug === "lease-decay-balas-table")!)).toContain("about 88.9% of the Valuation Limit");
  });
  it("quotes only corroborated Bala's Table rows, with the table's status label", () => {
    const lease = getExplainers().find((a) => a.slug === "lease-decay-balas-table")!;
    const tables = lease.body.filter((b): b is Extract<ArticleBlock, { type: "table" }> => b.type === "table");
    if (balaPct(99) == null) {
      expect(tables).toHaveLength(0);
      return;
    }
    expect(tables).toHaveLength(1);
    for (const [years, value] of tables[0].rows) {
      expect(BALA_TABLE_STATUS.corroboratedYears).toContain(Number(years));
      expect(value).toBe(`${balaPct(Number(years))!.toFixed(1)}%`);
    }
    expect(tables[0].note).toContain(BALA_TABLE_STATUS.label);
  });
});

describe("market report", () => {
  it("is generated from the fixture data", () => {
    const r = getMarketReport()!;
    expect(r.slug).toBe(REPORT_SLUG);
    expect(r.title).toBe("HDB resale market report: Aug 2026");
    expect(r.dataDriven).toBe(true);
    expect(r.author).toBe(AUTHOR);
    const t = text(r);
    expect(t).toContain("28 flats were resold");
    expect(t).not.toMatch(/NaN|undefined/);
  });
  it("leads the article list and resolves its chart", () => {
    const list = getArticles();
    expect(list[0].slug).toBe(REPORT_SLUG);
    expect(getArticle("nope")).toBeNull();
    const resolved = resolveBlocks(getArticle(REPORT_SLUG)!.body);
    const chart = resolved.find((b) => b.type === "chart");
    expect(chart && chart.type === "chart" && chart.chart?.kind).toBe("line");
  });
  it("explains missing chart data instead of inventing it", () => {
    const [b] = resolveBlocks([{ type: "chart", title: "x", seriesKey: "private:CCR:Landed" }]);
    expect(b.type === "chart" && b.chart).toBeNull();
    expect(b.type === "chart" && b.missing).toContain("URA");
  });
});
