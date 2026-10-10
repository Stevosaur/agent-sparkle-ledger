import "server-only";
import { getSeries } from "@/lib/data/stats";
import { yearOfMonth } from "@/lib/data/months";
import { getLaunches } from "@/lib/data/private";
import { HDB_FLAT_TYPES, type StatSeries } from "@/lib/data/types";
import { formatInt, formatMonthIndex, formatPct, formatPsf, formatSgd } from "@/lib/format";
import { titleCase } from "@/lib/slug";
import { getHdbRentScan, getHdbSalesScan } from "./hdb-scan";
import { getPrivateRentScan, getPrivateSalesScan } from "./private-scan";
import { annualised, describeChange, extremes, pctChange, sumCounts, toChartPoints, windowLabel } from "./math";
import { memoBySnapshot, referenceYear } from "./memo";
import type { ChartLine, InsightMeta, InsightResult } from "./types";

/**
 * Market insight modules. Every caption is computed from the same data as its chart; a module returns
 * null (and is hidden) when its source data is not in the snapshot.
 */

const SRC_HDB = "HDB resale prices, data.gov.sg";
const SRC_HDB_RENT = "HDB rental approvals (renting out of flats), data.gov.sg";
const SRC_PRIVATE = "URA private residential transactions (URA Data Service)";
const SRC_PRIVATE_RENT = "URA private residential rental contracts (URA Data Service)";
const SRC_LAUNCH = "URA developer sales and private residential pipeline";
/** data.gov.sg notes that HDB rental figures are declared by owners (docs/research/datagov-api.md §5.3). */
export const RENT_CAVEAT = "Rents are declared by flat owners and are not verified by HDB.";

/** Minimum samples for a town / district bar to be shown. */
export const MIN_BAR_SAMPLE = 3;

/** How many available modules are free (server-rendered for everyone). */
export const FREE_INSIGHTS = 6;

interface ModuleDef extends InsightMeta {
  compute: () => Omit<InsightResult, "id" | "title"> | null;
}

const FLAT_ORDER: readonly string[] = HDB_FLAT_TYPES;

function points(key: string): StatSeries["points"] {
  return getSeries(key)?.points ?? [];
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function flatTypeName(t: string): string {
  if (t === "EXECUTIVE") return "executive";
  if (t === "MULTI-GENERATION") return "multi-generation";
  return t.toLowerCase().replace(" room", "-room");
}

function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The flat type with the most rental approvals in the latest 12 months (data-driven, not assumed). */
function mostRentedFlatType(): string | null {
  let best: string | null = null;
  let n = 0;
  for (const [t, s] of getHdbRentScan().byType) {
    if (s.count > n) {
      n = s.count;
      best = t;
    }
  }
  return best;
}

const MODULES: ModuleDef[] = [
  /* ------------------------------ free ------------------------------ */
  {
    id: "hdb-price-trend",
    title: "HDB resale price trend",
    teaser: "Monthly median resale price across all HDB flats since 1990.",
    compute: () => {
      const pts = points("hdb:ALL:ALL");
      const scan = getHdbSalesScan();
      if (pts.length === 0 || !scan.windows || !scan.national.cur.medianPrice) return null;
      const { cur, prev12 } = scan.national;
      const change = describeChange(pctChange(prev12.medianPrice, cur.medianPrice));
      return {
        chart: { kind: "line", yFormat: "sgd", ariaLabel: "Line chart of the monthly median HDB resale price", series: [{ name: "Median resale price", points: toChartPoints(pts, "medianPrice") }] },
        caption: `The median HDB resale price over ${windowLabel(scan.windows.cur.to)} was ${formatSgd(cur.medianPrice)} across ${formatInt(cur.count)} resales${change && prev12.count ? `, ${change} on the previous 12 months` : ""}.`,
        source: SRC_HDB,
        note: "Medians across all flat types, so a shift in the mix of flats sold also moves the line.",
      };
    },
  },
  {
    id: "hdb-volume",
    title: "HDB resale volume",
    teaser: "Number of HDB resale transactions registered each month.",
    compute: () => {
      const pts = points("hdb:ALL:ALL");
      const scan = getHdbSalesScan();
      if (pts.length === 0 || !scan.windows) return null;
      const cur = sumCounts(pts, scan.windows.cur);
      const prev = sumCounts(pts, scan.windows.prev12);
      const change = describeChange(pctChange(prev, cur));
      return {
        chart: { kind: "line", yFormat: "int", ariaLabel: "Line chart of monthly HDB resale volume", series: [{ name: "Resales", points: toChartPoints(pts, "count") }] },
        caption: `${formatInt(cur)} resales were recorded in ${windowLabel(scan.windows.cur.to)}${prev > 0 && change ? `, ${change} on the 12 months before (${formatInt(prev)})` : ""}.`,
        source: SRC_HDB,
        note: "Months are registration months from March 2012 and approval months before that.",
      };
    },
  },
  {
    id: "hdb-by-flat-type",
    title: "HDB prices by flat type",
    teaser: "Median resale price for each flat type over the last ten years.",
    compute: () => {
      const scan = getHdbSalesScan();
      if (!scan.windows || scan.latestMonth == null) return null;
      const from = scan.latestMonth - 119;
      const series: ChartLine[] = [];
      for (const t of HDB_FLAT_TYPES) {
        const p = toChartPoints(points(`hdb:ALL:${t}`), "medianPrice", from);
        if (p.length) series.push({ name: t, points: p });
      }
      if (series.length === 0) return null;
      const types = Object.entries(scan.national.byType)
        .filter(([, v]) => v.cur.count > 0 && v.cur.medianPrice)
        .sort((a, b) => b[1].cur.count - a[1].cur.count)
        .slice(0, 4)
        .sort((a, b) => FLAT_ORDER.indexOf(a[0]) - FLAT_ORDER.indexOf(b[0]));
      const parts = types.map(([t, v]) => `${formatSgd(v.cur.medianPrice)} for ${flatTypeName(t)}`);
      return {
        chart: { kind: "line", yFormat: "sgd", ariaLabel: "Line chart of median HDB resale prices by flat type over ten years", series },
        caption: parts.length ? `Over ${windowLabel(scan.windows.cur.to)}, median resale prices were ${joinList(parts)} flats.` : "No resales were recorded in the latest 12 months.",
        source: SRC_HDB,
      };
    },
  },
  {
    id: "hdb-psf-by-town",
    title: "Median price psf by town",
    teaser: "Median HDB resale price per square foot in each town over the last 12 months.",
    compute: () => {
      const scan = getHdbSalesScan();
      if (!scan.windows) return null;
      const towns = scan.towns.filter((t) => t.cur.count >= MIN_BAR_SAMPLE && t.cur.medianPsf).sort((a, b) => (b.cur.medianPsf ?? 0) - (a.cur.medianPsf ?? 0));
      const ex = extremes(towns, (t) => t.cur.medianPsf ?? 0);
      if (!ex || towns.length < 2) return null;
      return {
        chart: { kind: "bar", yFormat: "psf", ariaLabel: "Bar chart of median HDB resale price per square foot by town", data: towns.map((t) => ({ label: titleCase(t.town), value: t.cur.medianPsf ?? 0 })) },
        caption: `Over ${windowLabel(scan.windows.cur.to)}, ${titleCase(ex.max.town)} had the highest median at ${formatPsf(ex.max.cur.medianPsf)} and ${titleCase(ex.min.town)} the lowest at ${formatPsf(ex.min.cur.medianPsf)}.`,
        source: SRC_HDB,
        note: `Towns with fewer than ${MIN_BAR_SAMPLE} resales in the period are left out.`,
      };
    },
  },
  {
    id: "hdb-rent-trend",
    title: "HDB rents by flat type",
    teaser: "Median monthly rent in HDB rental approvals, by flat type.",
    compute: () => {
      const rent = getHdbRentScan();
      if (!rent.window) return null;
      const series: ChartLine[] = [];
      for (const t of HDB_FLAT_TYPES) {
        const p = toChartPoints(points(`rent-hdb:ALL:${t}`), "medianPrice", rent.window.to - 119);
        if (p.length) series.push({ name: t, points: p });
      }
      if (series.length === 0) return null;
      const parts = [...rent.byType.entries()]
        .filter(([, v]) => v.count > 0 && v.medianRent)
        .sort((a, b) => FLAT_ORDER.indexOf(a[0]) - FLAT_ORDER.indexOf(b[0]))
        .map(([t, v]) => `${formatSgd(v.medianRent)} for ${flatTypeName(t)}`);
      return {
        chart: { kind: "line", yFormat: "rent", ariaLabel: "Line chart of median monthly HDB rents by flat type", series },
        caption: parts.length ? `Median monthly rents over ${windowLabel(rent.window.to)} were ${joinList(parts)} flats.` : "No rental approvals were recorded in the latest 12 months.",
        source: SRC_HDB_RENT,
        note: RENT_CAVEAT,
      };
    },
  },
  {
    id: "private-segments",
    title: "Private prices by market segment",
    teaser: "Median price psf of condos and apartments in the CCR, RCR and OCR.",
    compute: () => {
      const scan = getPrivateSalesScan();
      if (!scan.windows) return null;
      const series: ChartLine[] = [];
      for (const seg of ["CCR", "RCR", "OCR"]) {
        const p = toChartPoints(points(`private:${seg}:Condo`), "medianPsf");
        if (p.length) series.push({ name: seg, points: p });
      }
      if (series.length === 0) return null;
      const parts = scan.segments.filter((s) => s.cur.medianPsf).map((s) => `${formatPsf(s.cur.medianPsf)} in the ${s.segment}`);
      return {
        chart: { kind: "line", yFormat: "psf", ariaLabel: "Line chart of private condo median price per square foot by market segment", series },
        caption: parts.length ? `Over ${windowLabel(scan.windows.cur.to)}, condos and apartments (excluding ECs) sold at a median of ${joinList(parts)}.` : "No condo sales were recorded in the latest 12 months.",
        source: SRC_PRIVATE,
        note: "CCR: Core Central Region; RCR: Rest of Central Region; OCR: Outside Central Region. Bulk deals excluded.",
      };
    },
  },

  /* ------------------------------ gated ----------------------------- */
  {
    id: "hdb-psf-trend",
    title: "HDB price per square foot",
    teaser: "Monthly median HDB resale price per square foot, which adjusts for flat size.",
    compute: () => {
      const pts = points("hdb:ALL:ALL");
      const scan = getHdbSalesScan();
      if (pts.length === 0 || !scan.windows || !scan.national.cur.medianPsf) return null;
      const { cur, prev5y } = scan.national;
      const g = prev5y.count ? annualised(prev5y.medianPsf, cur.medianPsf, 5) : null;
      return {
        chart: { kind: "line", yFormat: "psf", ariaLabel: "Line chart of the monthly median HDB resale price per square foot", series: [{ name: "Median psf", points: toChartPoints(pts, "medianPsf") }] },
        caption: `The median over ${windowLabel(scan.windows.cur.to)} was ${formatPsf(cur.medianPsf)}${g != null ? `, against ${formatPsf(prev5y.medianPsf)} five years earlier (${formatPct(g)} a year compounded)` : ""}.`,
        source: SRC_HDB,
      };
    },
  },
  {
    id: "hdb-region",
    title: "HDB prices by region",
    teaser: "Median HDB price psf in the Central, East, North, North-East and West regions.",
    compute: () => {
      const scan = getHdbSalesScan();
      if (!scan.windows) return null;
      const regions = scan.regions.filter((r) => r.cur.count >= MIN_BAR_SAMPLE && r.cur.medianPsf).sort((a, b) => (b.cur.medianPsf ?? 0) - (a.cur.medianPsf ?? 0));
      const ex = extremes(regions, (r) => r.cur.medianPsf ?? 0);
      if (!ex || regions.length < 2) return null;
      const growth = regions
        .map((r) => ({ r, g: r.prev5y.count >= MIN_BAR_SAMPLE ? annualised(r.prev5y.medianPsf, r.cur.medianPsf, 5) : null }))
        .filter((x): x is { r: (typeof regions)[number]; g: number } => x.g != null);
      const fastest = extremes(growth, (x) => x.g)?.max;
      return {
        chart: { kind: "bar", yFormat: "psf", ariaLabel: "Bar chart of median HDB price per square foot by region", data: regions.map((r) => ({ label: r.region, value: r.cur.medianPsf ?? 0 })) },
        caption: `Over ${windowLabel(scan.windows.cur.to)}, the ${ex.max.region} region had the highest median (${formatPsf(ex.max.cur.medianPsf)}) and the ${ex.min.region} region the lowest (${formatPsf(ex.min.cur.medianPsf)}).${fastest ? ` Over five years, the ${fastest.r.region} region grew fastest at ${formatPct(fastest.g)} a year.` : ""}`,
        source: SRC_HDB,
        note: "Regions follow URA planning regions; each HDB town is assigned to one.",
      };
    },
  },
  {
    id: "town-growth",
    title: "Five-year growth by town",
    teaser: "Compound annual growth in median HDB price psf by town over five years.",
    compute: () => {
      const scan = getHdbSalesScan();
      if (!scan.windows) return null;
      const rows = scan.towns
        .filter((t) => t.cur.count >= MIN_BAR_SAMPLE && t.prev5y.count >= MIN_BAR_SAMPLE)
        .map((t) => ({ t, g: annualised(t.prev5y.medianPsf, t.cur.medianPsf, 5) }))
        .filter((x): x is { t: (typeof scan.towns)[number]; g: number } => x.g != null)
        .sort((a, b) => b.g - a.g);
      const ex = extremes(rows, (x) => x.g);
      if (!ex || rows.length < 2) return null;
      return {
        chart: { kind: "bar", yFormat: "pct", ariaLabel: "Bar chart of five-year annual growth in median HDB price per square foot by town", data: rows.map((x) => ({ label: titleCase(x.t.town), value: x.g })) },
        caption: `Comparing ${windowLabel(scan.windows.cur.to)} with the same period five years earlier, ${titleCase(ex.max.t.town)} grew fastest (${formatPct(ex.max.g)} a year) and ${titleCase(ex.min.t.town)} slowest (${formatPct(ex.min.g)} a year).`,
        source: SRC_HDB,
        note: `Towns need at least ${MIN_BAR_SAMPLE} resales in both periods. Median psf mixes flat types and ages, so changes in what sold also count.`,
      };
    },
  },
  {
    id: "million-dollar",
    title: "Million-dollar HDB resales",
    teaser: "How many HDB flats resold for S$1 million or more each year.",
    compute: () => {
      const scan = getHdbSalesScan();
      if (scan.latestMonth == null) return null;
      const firstIdx = scan.yearly.findIndex((y) => y.million > 0);
      if (firstIdx < 0) return null;
      const years = scan.yearly.slice(Math.max(0, firstIdx - 2));
      const latestYear = yearOfMonth(scan.latestMonth);
      const partial = scan.latestMonth % 12 !== 11;
      const label = (y: number) => (y === latestYear && partial ? `${y} (to ${formatMonthIndex(scan.latestMonth!).slice(0, 3)})` : String(y));
      const full = [...years].reverse().find((y) => !(y.year === latestYear && partial));
      const current = years.find((y) => y.year === latestYear);
      const parts: string[] = [];
      if (full) parts.push(`${formatInt(full.million)} HDB flats resold for S$1 million or more in ${full.year}, out of ${formatInt(full.count)} resales.`);
      if (current && partial) parts.push(`${formatInt(current.million)} have done so in ${latestYear} up to ${formatMonthIndex(scan.latestMonth)}.`);
      return {
        chart: { kind: "bar", yFormat: "int", ariaLabel: "Bar chart of HDB resales at or above one million dollars per year", data: years.map((y) => ({ label: label(y.year), value: y.million })) },
        caption: parts.join(" "),
        source: SRC_HDB,
      };
    },
  },
  {
    id: "hdb-rent-by-town",
    title: "HDB rent by town",
    teaser: "Median monthly rent by town for the most commonly rented flat type.",
    compute: () => {
      const rent = getHdbRentScan();
      const type = mostRentedFlatType();
      if (!rent.window || !type) return null;
      const scan = getHdbSalesScan();
      const rows = scan.towns
        .map((t) => ({ t, r: rent.byTownType.get(`${t.slug}|${type}`) }))
        .filter((x): x is { t: (typeof scan.towns)[number]; r: { count: number; medianRent: number } } => !!x.r && x.r.count >= MIN_BAR_SAMPLE && x.r.medianRent != null)
        .sort((a, b) => b.r.medianRent - a.r.medianRent);
      const ex = extremes(rows, (x) => x.r.medianRent);
      if (!ex || rows.length < 2) return null;
      return {
        chart: { kind: "bar", yFormat: "rent", ariaLabel: `Bar chart of median monthly rent for ${flatTypeName(type)} HDB flats by town`, data: rows.map((x) => ({ label: titleCase(x.t.town), value: x.r.medianRent })) },
        caption: `${sentence(flatTypeName(type))} flats were the most rented type over ${windowLabel(rent.window.to)}. Median rents ranged from ${formatSgd(ex.min.r.medianRent)} a month in ${titleCase(ex.min.t.town)} to ${formatSgd(ex.max.r.medianRent)} in ${titleCase(ex.max.t.town)}.`,
        source: SRC_HDB_RENT,
        note: `${RENT_CAVEAT} Towns with fewer than ${MIN_BAR_SAMPLE} approvals are left out.`,
      };
    },
  },
  {
    id: "hdb-yield-by-town",
    title: "Gross rental yield by town",
    teaser: "Median rent × 12 ÷ median resale price for the most rented flat type in each town.",
    compute: () => {
      const rent = getHdbRentScan();
      const type = mostRentedFlatType();
      const scan = getHdbSalesScan();
      if (!rent.window || !scan.windows || !type) return null;
      const rows = scan.towns
        .map((t) => {
          const r = rent.byTownType.get(`${t.slug}|${type}`);
          const s = t.byType[type]?.cur;
          if (!r || !s || r.count < MIN_BAR_SAMPLE || s.count < MIN_BAR_SAMPLE || !r.medianRent || !s.medianPrice) return null;
          return { t, y: (r.medianRent * 12) / s.medianPrice };
        })
        .filter((x): x is { t: (typeof scan.towns)[number]; y: number } => x != null)
        .sort((a, b) => b.y - a.y);
      const ex = extremes(rows, (x) => x.y);
      if (!ex || rows.length < 2) return null;
      return {
        chart: { kind: "bar", yFormat: "pct", ariaLabel: `Bar chart of gross rental yield for ${flatTypeName(type)} HDB flats by town`, data: rows.map((x) => ({ label: titleCase(x.t.town), value: x.y })) },
        caption: `For ${flatTypeName(type)} flats, estimated gross yields over the latest 12 months ranged from ${formatPct(ex.min.y, 2)} in ${titleCase(ex.min.t.town)} to ${formatPct(ex.max.y, 2)} in ${titleCase(ex.max.t.town)}.`,
        source: `${SRC_HDB}; ${SRC_HDB_RENT}`,
        note: `Estimate: gross yield before property tax, maintenance and vacancy. Both medians need at least ${MIN_BAR_SAMPLE} records. ${RENT_CAVEAT}`,
      };
    },
  },
  {
    id: "lease-vs-psf",
    title: "Remaining lease and price psf",
    teaser: "Median HDB price psf by remaining-lease band over the last 12 months.",
    compute: () => {
      const scan = getHdbSalesScan();
      if (!scan.windows) return null;
      const bands = scan.leaseBands.filter((b) => b.stat.count >= MIN_BAR_SAMPLE && b.stat.medianPsf);
      if (bands.length < 2) return null;
      const ex = extremes(bands, (b) => b.stat.medianPsf ?? 0)!;
      return {
        chart: { kind: "bar", yFormat: "psf", ariaLabel: "Bar chart of median HDB price per square foot by remaining lease", data: bands.map((b) => ({ label: b.label, value: b.stat.medianPsf ?? 0 })) },
        caption: `Over ${windowLabel(scan.windows.cur.to)}, medians ranged from ${formatPsf(ex.min.stat.medianPsf)} for flats with ${ex.min.label.toLowerCase()} of lease left to ${formatPsf(ex.max.stat.medianPsf)} for ${ex.max.label.toLowerCase()}.`,
        source: SRC_HDB,
        note: `Lease is only one driver: older flats are also often more central and larger. ${scan.leaseEstimated12m ? `${formatInt(scan.leaseEstimated12m)} records used an estimated remaining lease.` : "Remaining lease as published by HDB."}`,
      };
    },
  },
  {
    id: "storey-premium",
    title: "Storey premium",
    teaser: "How much more high-floor HDB flats sell for per square foot than low floors.",
    compute: () => {
      const scan = getHdbSalesScan();
      if (!scan.windows) return null;
      const bands = scan.storeyBands.filter((b) => b.stat.count >= MIN_BAR_SAMPLE && b.stat.medianPsf);
      if (bands.length < 2) return null;
      const low = bands.find((b) => b.id === "low");
      const top = bands.find((b) => b.id === "high") ?? bands.find((b) => b.id === "mid");
      const prem = low && top ? pctChange(low.stat.medianPsf, top.stat.medianPsf) : null;
      return {
        chart: { kind: "bar", yFormat: "psf", ariaLabel: "Bar chart of median HDB price per square foot by storey band", data: bands.map((b) => ({ label: b.label, value: b.stat.medianPsf ?? 0 })) },
        caption:
          low && top && prem != null
            ? `Over ${windowLabel(scan.windows.cur.to)}, ${top.id === "high" ? "high-floor (16+)" : "mid-floor (7–15)"} flats sold at a median ${formatPsf(top.stat.medianPsf)}, ${formatPct(Math.abs(prem))} ${prem >= 0 ? "more" : "less"} per square foot than low-floor flats (${formatPsf(low.stat.medianPsf)}).`
            : `Median psf by storey band over ${windowLabel(scan.windows.cur.to)}.`,
        source: SRC_HDB,
        note: "Storey bands use the mid-point of HDB's published storey range. Taller blocks are also newer on average, which adds to the gap.",
      };
    },
  },
  {
    id: "busiest-towns",
    title: "Busiest towns",
    teaser: "The ten towns with the most HDB resales over the last 12 months.",
    compute: () => {
      const scan = getHdbSalesScan();
      if (!scan.windows || scan.national.cur.count === 0) return null;
      const rows = scan.towns.filter((t) => t.cur.count > 0).sort((a, b) => b.cur.count - a.cur.count).slice(0, 10);
      if (rows.length === 0) return null;
      const top = rows[0];
      return {
        chart: { kind: "bar", yFormat: "int", ariaLabel: "Bar chart of HDB resales by town for the ten busiest towns", data: rows.map((t) => ({ label: titleCase(t.town), value: t.cur.count })) },
        caption: `${titleCase(top.town)} recorded the most resales over ${windowLabel(scan.windows.cur.to)}: ${formatInt(top.cur.count)}, or ${formatPct(top.cur.count / scan.national.cur.count)} of all ${formatInt(scan.national.cur.count)}.`,
        source: SRC_HDB,
      };
    },
  },
  {
    id: "flat-type-mix",
    title: "Resales by flat type",
    teaser: "Which flat types changed hands most over the last 12 months.",
    compute: () => {
      const scan = getHdbSalesScan();
      const total = scan.national.cur.count;
      if (!scan.windows || total === 0) return null;
      const rows = HDB_FLAT_TYPES.map((t) => ({ t, n: scan.national.byType[t]?.cur.count ?? 0 })).filter((r) => r.n > 0);
      const top = [...rows].sort((a, b) => b.n - a.n)[0];
      return {
        chart: { kind: "bar", yFormat: "int", ariaLabel: "Bar chart of HDB resales by flat type", data: rows.map((r) => ({ label: r.t, value: r.n })) },
        caption: `${sentence(flatTypeName(top.t))} flats made up ${formatPct(top.n / total)} of the ${formatInt(total)} resales over ${windowLabel(scan.windows.cur.to)}.`,
        source: SRC_HDB,
      };
    },
  },
  {
    id: "hdb-vs-private",
    title: "HDB vs private condo prices",
    teaser: "Median price psf of HDB resales against private condos and apartments.",
    compute: () => {
      const hdb = toChartPoints(points("hdb:ALL:ALL"), "medianPsf");
      const condo = toChartPoints(points("private:ALL:Condo"), "medianPsf");
      if (hdb.length === 0 || condo.length === 0) return null;
      const from = condo[0].x;
      const scan = getHdbSalesScan();
      const pscan = getPrivateSalesScan();
      const h = scan.national.cur.medianPsf;
      const c = pscan.groups.find((g) => g.group === "Condo")?.cur.medianPsf ?? null;
      return {
        chart: {
          kind: "line",
          yFormat: "psf",
          ariaLabel: "Line chart comparing median price per square foot of HDB resales and private condos",
          series: [
            { name: "HDB resale", points: hdb.filter((p) => p.x >= from) },
            { name: "Private condo", points: condo },
          ],
        },
        caption:
          h && c && pscan.windows
            ? `Over ${windowLabel(pscan.windows.cur.to)}, condos and apartments sold at a median ${formatPsf(c)}, ${(c / h).toFixed(1)} times the HDB resale median of ${formatPsf(h)} over ${windowLabel(scan.windows!.cur.to)}.`
            : "Median price psf of HDB resales and private condos by month.",
        source: `${SRC_HDB}; ${SRC_PRIVATE}`,
        note: "Private condos exclude ECs and landed homes; bulk deals excluded.",
      };
    },
  },
  {
    id: "district-psf",
    title: "Private price psf by district",
    teaser: "Median price psf of non-landed private homes in each postal district.",
    compute: () => {
      const scan = getPrivateSalesScan();
      if (!scan.windows) return null;
      const rows = scan.districts.filter((d) => d.cur.count >= MIN_BAR_SAMPLE && d.cur.medianPsf).sort((a, b) => (b.cur.medianPsf ?? 0) - (a.cur.medianPsf ?? 0));
      const ex = extremes(rows, (d) => d.cur.medianPsf ?? 0);
      if (!ex || rows.length < 2) return null;
      const dl = (d: number) => `D${String(d).padStart(2, "0")}`;
      return {
        chart: { kind: "bar", yFormat: "psf", ariaLabel: "Bar chart of median private non-landed price per square foot by postal district", data: rows.map((d) => ({ label: dl(d.district), value: d.cur.medianPsf ?? 0 })) },
        caption: `Over ${windowLabel(scan.windows.cur.to)}, District ${ex.max.district} had the highest median at ${formatPsf(ex.max.cur.medianPsf)} and District ${ex.min.district} the lowest at ${formatPsf(ex.min.cur.medianPsf)}.`,
        source: SRC_PRIVATE,
        note: `Condos, apartments and ECs; districts with fewer than ${MIN_BAR_SAMPLE} sales are left out.`,
      };
    },
  },
  {
    id: "private-volume-by-sale-type",
    title: "Private sales by type of sale",
    teaser: "Monthly private home sales split into new sales, sub sales and resales.",
    compute: () => {
      const scan = getPrivateSalesScan();
      const st = scan.saleType12m;
      const total = st.newSale + st.subSale + st.resale;
      if (!scan.windows || scan.saleTypeMonthly.length === 0 || total === 0) return null;
      const line = (name: string, key: "newSale" | "subSale" | "resale"): ChartLine => ({ name, points: scan.saleTypeMonthly.map((r) => ({ x: r.m, y: r[key] })) });
      return {
        chart: { kind: "line", yFormat: "int", ariaLabel: "Line chart of monthly private home sales by type of sale", series: [line("New sale", "newSale"), line("Resale", "resale"), line("Sub sale", "subSale")] },
        caption: `Of ${formatInt(total)} private units sold over ${windowLabel(scan.windows.cur.to)}, ${formatPct(st.newSale / total)} were new sales from developers, ${formatPct(st.resale / total)} resales and ${formatPct(st.subSale / total)} sub sales.`,
        source: SRC_PRIVATE,
        note: "Sub sales are resales before the project is completed. Counts are units, including bulk purchases.",
      };
    },
  },
  {
    id: "ec-vs-condo",
    title: "Executive condos vs condos",
    teaser: "Median price psf of executive condominiums against private condos.",
    compute: () => {
      const ec = toChartPoints(points("private:ALL:EC"), "medianPsf");
      const condo = toChartPoints(points("private:ALL:Condo"), "medianPsf");
      if (ec.length === 0 || condo.length === 0) return null;
      const scan = getPrivateSalesScan();
      const e = scan.groups.find((g) => g.group === "EC")?.cur.medianPsf ?? null;
      const c = scan.groups.find((g) => g.group === "Condo")?.cur.medianPsf ?? null;
      const gap = pctChange(c, e);
      return {
        chart: { kind: "line", yFormat: "psf", ariaLabel: "Line chart comparing median price per square foot of executive condominiums and condos", series: [{ name: "Executive condo", points: ec }, { name: "Condo / apartment", points: condo }] },
        caption:
          e && c && gap != null && scan.windows
            ? `Over ${windowLabel(scan.windows.cur.to)}, ECs sold at a median ${formatPsf(e)} against ${formatPsf(c)} for condos and apartments, ${formatPct(Math.abs(gap))} ${gap < 0 ? "lower" : "higher"}.`
            : "Median price psf of ECs and condos by month.",
        source: SRC_PRIVATE,
      };
    },
  },
  {
    id: "private-rents",
    title: "Private rents",
    teaser: "Median monthly rent of private homes by contract month.",
    compute: () => {
      const pts = points("rent-private:ALL:ALL");
      const rent = getPrivateRentScan();
      if (pts.length === 0 || !rent.window || !rent.overall.medianRent) return null;
      return {
        chart: { kind: "line", yFormat: "rent", ariaLabel: "Line chart of the monthly median private rent", series: [{ name: "Median rent", points: toChartPoints(pts, "medianPrice") }] },
        caption: `The median private rent over ${windowLabel(rent.window.to)} was ${formatSgd(rent.overall.medianRent)} a month across ${formatInt(rent.overall.count)} contracts.`,
        source: SRC_PRIVATE_RENT,
        note: "All private rentals together, so the mix of unit sizes moves the median.",
      };
    },
  },
  {
    id: "new-launch-take-up",
    title: "New-launch take-up",
    teaser: "Share of launched units sold at each project with developer sales data.",
    compute: () => {
      const launches = getLaunches().filter((l) => l.unitsLaunched != null && l.unitsLaunched > 0 && l.unitsSold != null);
      if (launches.length === 0) return null;
      const rows = [...launches].sort((a, b) => (b.unitsLaunched ?? 0) - (a.unitsLaunched ?? 0)).slice(0, 12);
      const sold = launches.reduce((s, l) => s + (l.unitsSold ?? 0), 0);
      const launched = launches.reduce((s, l) => s + (l.unitsLaunched ?? 0), 0);
      return {
        chart: { kind: "bar", yFormat: "pct", ariaLabel: "Bar chart of the share of launched units sold by project", data: rows.map((l) => ({ label: titleCase(l.name), value: (l.unitsSold ?? 0) / (l.unitsLaunched ?? 1) })) },
        caption: `Across ${formatInt(launches.length)} launched project${launches.length === 1 ? "" : "s"}, developers have sold ${formatInt(sold)} of ${formatInt(launched)} units released (${formatPct(sold / launched)}).`,
        source: SRC_LAUNCH,
        note: "Take-up = units sold ÷ units launched to date, as reported by developers to URA.",
      };
    },
  },
  {
    id: "launch-pipeline",
    title: "Completion pipeline",
    teaser: "New-launch units by expected completion year.",
    compute: () => {
      const byYear = new Map<number, number>();
      for (const l of getLaunches()) {
        if (l.expectedCompletionYear == null || !l.totalUnits) continue;
        byYear.set(l.expectedCompletionYear, (byYear.get(l.expectedCompletionYear) ?? 0) + l.totalUnits);
      }
      if (byYear.size === 0) return null;
      const years = [...byYear.entries()].sort((a, b) => a[0] - b[0]);
      const ref = referenceYear();
      const next3 = years.filter(([y]) => y > ref && y <= ref + 3).reduce((s, [, n]) => s + n, 0);
      return {
        chart: { kind: "bar", yFormat: "int", ariaLabel: "Bar chart of new-launch units by expected completion year", data: years.map(([y, n]) => ({ label: String(y), value: n })) },
        caption: `${formatInt(next3)} units in tracked launches are expected to complete in ${ref + 1}–${ref + 3}.`,
        source: SRC_LAUNCH,
        note: "Only launches in this dataset; expected completion years can change.",
      };
    },
  },
];

const MODULE_INDEX = new Map(MODULES.map((m) => [m.id, m]));

export function isInsightId(id: string): boolean {
  return MODULE_INDEX.has(id);
}

/** Compute one module (memoised per snapshot); null when its data is missing. */
export function getInsight(id: string): InsightResult | null {
  const def = MODULE_INDEX.get(id);
  if (!def) return null;
  return memoBySnapshot(`insight:${id}`, () => {
    const r = def.compute();
    return r ? { id: def.id, title: def.title, ...r } : null;
  });
}

export interface AvailableInsight extends InsightMeta {
  free: boolean;
}

/** Modules with data, in display order; the first FREE_INSIGHTS are free. */
export function availableInsights(): AvailableInsight[] {
  return memoBySnapshot("insights:available", () => {
    let free = 0;
    const out: AvailableInsight[] = [];
    for (const m of MODULES) {
      if (!getInsight(m.id)) continue;
      out.push({ id: m.id, title: m.title, teaser: m.teaser, free: free < FREE_INSIGHTS });
      free += 1;
    }
    return out;
  });
}

/** True when `id` is available and free (so its data may be server-rendered). */
export function isFreeInsight(id: string): boolean {
  return availableInsights().some((m) => m.id === id && m.free);
}

export const ALL_INSIGHT_IDS = MODULES.map((m) => m.id);
