/**
 * Serializable chart/insight shapes shared by server computations, gated route handlers and client
 * renderers. Kept free of server imports so client components can import these types.
 */

/** Same union as the chart kit's ValueFormat (src/components/charts/format.ts). */
export type ChartValueFormat = "sgd" | "sgdCompact" | "psf" | "pct" | "pctRaw" | "int" | "rent";

export interface ChartLine {
  name: string;
  /** x = month index (months since 1990-01) */
  points: { x: number; y: number }[];
}

export interface ChartBar {
  label: string;
  value: number;
}

export type ChartSpec =
  | { kind: "line"; series: ChartLine[]; yFormat: ChartValueFormat; ariaLabel: string }
  | { kind: "bar"; data: ChartBar[]; yFormat: ChartValueFormat; ariaLabel: string };

/** A computed market module: chart + a caption derived from the same data. */
export interface InsightResult {
  id: string;
  title: string;
  caption: string;
  chart: ChartSpec;
  /** short "Source:" line */
  source: string;
  /** optional methodology / caveat line */
  note?: string;
}

/** Public metadata for a module (never contains data). */
export interface InsightMeta {
  id: string;
  title: string;
  /** what the module shows; used as the teaser for gated modules */
  teaser: string;
}

/** Statistics over one time window. Medians are null when count is 0. */
export interface WindowStat {
  count: number;
  medianPrice: number | null;
  medianPsf: number | null;
}

export const EMPTY_WINDOW: WindowStat = { count: 0, medianPrice: null, medianPsf: null };
