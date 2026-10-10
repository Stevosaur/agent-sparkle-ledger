import "server-only";
import { readJson } from "./store";
import type { StatSeries, StatsFile } from "./types";

/**
 * Monthly statistics precomputed by the pipeline.
 * Series keys:
 *   hdb:<TOWN|ALL>:<FLAT TYPE|ALL>         resale price / psf medians
 *   rent-hdb:<TOWN|ALL>:<FLAT TYPE|ALL>    rental approvals (medianPrice = median monthly rent)
 *   private:<CCR|RCR|OCR|ALL>:<PROPERTY TYPE|ALL>
 *   private-d:<district 1-28>:ALL
 *   rent-private:<CCR|RCR|OCR|ALL>:ALL     (medianPrice = median monthly rent)
 */
export function getStats(): StatsFile {
  return readJson<StatsFile>("stats.json", { series: [] });
}

let seriesIndex: Map<string, StatSeries> | null = null;

export function getSeries(key: string): StatSeries | null {
  if (!seriesIndex) seriesIndex = new Map(getStats().series.map((s) => [s.key, s]));
  return seriesIndex.get(key) ?? null;
}

export function listSeriesKeys(prefix?: string): { key: string; label: string }[] {
  return getStats()
    .series.filter((s) => !prefix || s.key.startsWith(prefix))
    .map((s) => ({ key: s.key, label: s.label }));
}
