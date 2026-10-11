import "server-only";
import { getMeta } from "@/lib/data/meta";
import { getSeries } from "@/lib/data/stats";
import { monthLabel, yearOfMonth } from "@/lib/data/months";
import { HDB_FLAT_TYPES } from "@/lib/data/types";
import { formatInt, formatMonthIndex, formatPct, formatPctSigned, formatPsf, formatSgd } from "@/lib/format";
import { titleCase } from "@/lib/slug";
import { getHdbRentScan, getHdbSalesScan } from "@/lib/insights/hdb-scan";
import { describeChange, extremes, pctChange, windowLabel } from "@/lib/insights/math";
import { MIN_BAR_SAMPLE, RENT_CAVEAT } from "@/lib/insights/modules";
import { memoBySnapshot } from "@/lib/insights/memo";
import { AUTHOR } from "./articles";
import type { Article, ArticleBlock } from "./types";

export const REPORT_SLUG = "hdb-resale-market-report";

const FLAT_ORDER: readonly string[] = HDB_FLAT_TYPES;

function flatName(t: string): string {
  if (t === "EXECUTIVE") return "executive";
  if (t === "MULTI-GENERATION") return "multi-generation";
  return t.toLowerCase().replace(" room", "-room");
}

/** The monthly HDB resale market report, generated entirely from the snapshot. Null without HDB data. */
export function getMarketReport(): Article | null {
  return memoBySnapshot("news:market-report", buildMarketReport);
}

function buildMarketReport(): Article | null {
  const scan = getHdbSalesScan();
  const series = getSeries("hdb:ALL:ALL");
  if (scan.latestMonth == null || !scan.windows || !series || series.points.length === 0) return null;
  const L = scan.latestMonth;
  const month = formatMonthIndex(L);
  const byM = new Map(series.points.map((p) => [p.m, p]));
  const cur = byM.get(L) ?? null;
  const prev = byM.get(L - 1) ?? null;
  const yearAgo = byM.get(L - 12) ?? null;
  const nat = scan.national;
  const w = windowLabel(scan.windows.cur.to);
  const body: ArticleBlock[] = [];

  // the month
  body.push({ type: "heading", text: `${month} at a glance` });
  if (cur && cur.count > 0) {
    const parts = [`${formatInt(cur.count)} HDB resale${cur.count === 1 ? " was" : "s were"} recorded in ${month}, at a median price of ${formatSgd(cur.medianPrice)} (${formatPsf(cur.medianPsf)}).`];
    if (prev && prev.count > 0) parts.push(`That compares with ${formatInt(prev.count)} in ${formatMonthIndex(L - 1)}.`);
    const yoy = yearAgo ? describeChange(pctChange(yearAgo.medianPrice, cur.medianPrice)) : null;
    if (yearAgo && yoy) parts.push(`The median price was ${yoy} on ${formatMonthIndex(L - 12)} (${formatSgd(yearAgo.medianPrice)}).`);
    body.push({ type: "paragraph", text: parts.join(" ") });
    body.push({ type: "paragraph", text: "A single month's median moves with the mix of flats sold, so the 12-month figures below are a steadier guide." });
  } else {
    body.push({ type: "paragraph", text: `No HDB resales are recorded for ${month} yet in this dataset.` });
  }

  // last 12 months
  body.push({ type: "heading", text: "The last 12 months" });
  const ch = describeChange(pctChange(nat.prev12.medianPrice, nat.cur.medianPrice));
  const vol = describeChange(pctChange(nat.prev12.count, nat.cur.count));
  body.push({
    type: "paragraph",
    text: `Over ${w}, ${formatInt(nat.cur.count)} flats were resold at a median of ${formatSgd(nat.cur.medianPrice)} (${formatPsf(nat.cur.medianPsf)}).${nat.prev12.count && ch && vol ? ` The median price was ${ch} on the previous 12 months, and the number of resales ${vol}.` : ""}`,
  });
  const typeRows = Object.entries(nat.byType)
    .filter(([, v]) => v.cur.count > 0)
    .sort((a, b) => FLAT_ORDER.indexOf(a[0]) - FLAT_ORDER.indexOf(b[0]))
    .map(([t, v]) => [t, formatInt(v.cur.count), formatSgd(v.cur.medianPrice), formatPsf(v.cur.medianPsf), v.prev12.count ? formatPctSigned(pctChange(v.prev12.medianPrice, v.cur.medianPrice)) : "—"]);
  if (typeRows.length) body.push({ type: "table", caption: `By flat type, ${w}`, head: ["Flat type", "Resales", "Median price", "Median psf", "Price vs previous 12 months"], rows: typeRows });

  // towns
  const towns = scan.towns.filter((t) => t.cur.count > 0);
  if (towns.length) {
    body.push({ type: "heading", text: "Towns" });
    const busiest = [...towns].sort((a, b) => b.cur.count - a.cur.count);
    const priced = towns.filter((t) => t.cur.count >= MIN_BAR_SAMPLE && t.cur.medianPsf);
    const ex = extremes(priced, (t) => t.cur.medianPsf ?? 0);
    const sentences = [`${titleCase(busiest[0].town)} was the busiest town with ${formatInt(busiest[0].cur.count)} resales (${formatPct(busiest[0].cur.count / nat.cur.count)} of the total).`];
    if (ex && priced.length > 1) sentences.push(`${titleCase(ex.max.town)} had the highest median price per square foot (${formatPsf(ex.max.cur.medianPsf)}) and ${titleCase(ex.min.town)} the lowest (${formatPsf(ex.min.cur.medianPsf)}), among towns with at least ${MIN_BAR_SAMPLE} resales.`);
    body.push({ type: "paragraph", text: sentences.join(" ") });
    body.push({
      type: "table",
      caption: `Busiest towns, ${w}`,
      head: ["Town", "Resales", "Median price", "Median psf"],
      rows: busiest.slice(0, 5).map((t) => [titleCase(t.town), formatInt(t.cur.count), formatSgd(t.cur.medianPrice), formatPsf(t.cur.medianPsf)]),
    });
  }

  // million-dollar flats
  const year = yearOfMonth(L);
  const ytd = scan.yearly.find((y) => y.year === year);
  const last = scan.yearly.find((y) => y.year === year - 1);
  if ((ytd && ytd.million > 0) || (last && last.million > 0)) {
    const parts: string[] = [];
    if (ytd) parts.push(`${formatInt(ytd.million)} flat${ytd.million === 1 ? "" : "s"} resold for S$1 million or more in ${year} up to ${month}`);
    if (last) parts.push(`against ${formatInt(last.million)} in the whole of ${year - 1}`);
    body.push({ type: "paragraph", text: `${parts.join(", ")}.` });
  }

  // rents
  const rent = getHdbRentScan();
  if (rent.window && rent.overall.count > 0) {
    body.push({ type: "heading", text: "Rents" });
    const parts = [...rent.byType.entries()]
      .filter(([, v]) => v.count > 0 && v.medianRent)
      .sort((a, b) => FLAT_ORDER.indexOf(a[0]) - FLAT_ORDER.indexOf(b[0]))
      .map(([t, v]) => `${formatSgd(v.medianRent)} for ${flatName(t)} flats`);
    body.push({ type: "paragraph", text: `${formatInt(rent.overall.count)} HDB rental approvals were recorded over ${windowLabel(rent.window.to)}. Median monthly rents were ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts.join("")}. ${RENT_CAVEAT}` });
  }

  body.push({ type: "chart", title: "Monthly median HDB resale price", seriesKey: "hdb:ALL:ALL", metric: "price", fromYear: year - 10 });
  body.push({ type: "paragraph", text: "Figures are medians of HDB resale records published on data.gov.sg. Months are registration months; a median over 12 months smooths out the monthly mix of flats sold. Recent months can still be revised as late registrations arrive." });

  const generated = getMeta().generatedAt;
  const date = /^\d{4}-\d{2}-\d{2}/.test(generated) ? generated.slice(0, 10) : `${monthLabel(L)}-01`;
  return {
    slug: REPORT_SLUG,
    title: `HDB resale market report: ${month}`,
    description:
      cur && cur.count > 0
        ? `${formatInt(cur.count)} HDB resales in ${month} at a median of ${formatSgd(cur.medianPrice)}, with 12-month prices by flat type, the busiest towns and rents, from data.gov.sg records.`
        : `HDB resale prices, volumes, towns and rents over ${w}, from data.gov.sg records.`,
    date,
    author: AUTHOR,
    tags: ["HDB", "Market report", "Data"],
    plusOnly: false,
    teaserBlocks: 0,
    dataDriven: true,
    body,
    sources: [
      { label: "data.gov.sg: HDB resale flat prices", url: "https://data.gov.sg/collections/189/view" },
      { label: "data.gov.sg: HDB renting out of flats", url: "https://data.gov.sg/datasets/d_c9f57187485a850908655db0e8cfe651/view" },
    ],
    related: [
      { label: "Market insights", href: "/insights/" },
      { label: "Trend builder", href: "/trendmaker/" },
      { label: "Rankings", href: "/lists/" },
    ],
  };
}
