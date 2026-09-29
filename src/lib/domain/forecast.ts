/**
 * Transparent demand forecasting. No black-box ML: every number is explainable.
 *
 * forecast = max(standing orders, baseline × trend adj × wastage adj × holiday factor)
 * baseline = mean of the last N same-weekday observations (falls back to weekday-factored 28-day mean)
 * 80% interval = forecast ± 1.28 σ (σ from the same-weekday samples, floor 8% of forecast)
 */
import { addDays, isoWeekday, weekdayName } from "./time";

export type DemandObservation = { date: string; kg: number };

export type ForecastInput = {
  targetDate: string; // delivery date being forecast
  history: DemandObservation[]; // daily demand, one row per date; missing dates are treated as 0 within the window
  standingOrderKg?: number;
  currentStockKg?: number;
  recentWastagePct?: number;
  holidayFactor?: number;
  holidayName?: string;
  sameWeekdaySamples?: number;
};

export type ForecastResult = {
  forecastKg: number;
  lowKg: number;
  highKg: number;
  recommendedPurchaseKg: number;
  components: {
    sameWeekdayAvgKg: number | null;
    sameWeekdayCount: number;
    baselineKg: number;
    trendPct: number;
    trendAdjPct: number;
    wastageAdjPct: number;
    holidayFactor: number;
    standingOrderKg: number;
    currentStockKg: number;
    method: "SAME_WEEKDAY" | "WEEKDAY_FACTORED" | "STANDING_ONLY" | "NO_HISTORY";
  };
  reasons: string[];
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function stdev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function forecastDemand(input: ForecastInput): ForecastResult {
  const byDate = new Map(input.history.map((h) => [h.date, h.kg]));
  const n = input.sameWeekdaySamples ?? 4;
  const val = (d: string) => byDate.get(d) ?? 0;
  const reasons: string[] = [];

  // Only look back as far as history actually exists (don't treat pre-relationship dates as zero demand).
  const firstDate = input.history.map((h) => h.date).sort()[0];
  const inWindow = (d: string) => !!firstDate && d >= firstDate;

  const sameWeekday: number[] = [];
  for (let k = 1; k <= n; k++) {
    const d = addDays(input.targetDate, -7 * k);
    if (inWindow(d)) sameWeekday.push(val(d));
  }
  const last28: number[] = [];
  for (let k = 1; k <= 28; k++) {
    const d = addDays(input.targetDate, -k);
    if (inWindow(d)) last28.push(val(d));
  }
  const recent14 = last28.slice(0, 14);
  const prior14 = last28.slice(14, 28);

  const standing = input.standingOrderKg ?? 0;
  const stock = input.currentStockKg ?? 0;
  const wd = weekdayName(isoWeekday(input.targetDate));

  let method: ForecastResult["components"]["method"];
  let baseline: number;
  let sigma: number;
  if (sameWeekday.length >= 2) {
    method = "SAME_WEEKDAY";
    baseline = mean(sameWeekday);
    sigma = stdev(sameWeekday);
    reasons.push(`Last ${sameWeekday.length} ${wd}s averaged ${r1(baseline).toFixed(1)} kg.`);
  } else if (last28.length >= 7) {
    method = "WEEKDAY_FACTORED";
    // Weekday factor from whatever same-weekday data exists in the last 8 weeks.
    const wdVals: number[] = [];
    const all: number[] = [];
    for (let k = 1; k <= 56; k++) {
      const d = addDays(input.targetDate, -k);
      if (!inWindow(d)) continue;
      all.push(val(d));
      if (isoWeekday(d) === isoWeekday(input.targetDate)) wdVals.push(val(d));
    }
    const factor = mean(all) > 0 && wdVals.length ? mean(wdVals) / mean(all) : 1;
    baseline = mean(last28) * factor;
    sigma = stdev(last28);
    reasons.push(`Limited ${wd} history; used 28-day average ${r1(mean(last28)).toFixed(1)} kg × ${wd} factor ${factor.toFixed(2)}.`);
  } else if (standing > 0) {
    method = "STANDING_ONLY";
    baseline = standing;
    sigma = standing * 0.05;
    reasons.push(`No usable history; based on standing orders only.`);
  } else {
    method = "NO_HISTORY";
    baseline = 0;
    sigma = 0;
    reasons.push(`No purchase history for this buyer/species yet.`);
  }

  // Recent trend: last 14 days vs previous 14, damped by half and capped at ±20%.
  let trendPct = 0;
  if (recent14.length >= 7 && prior14.length >= 7 && mean(prior14) > 0) {
    trendPct = (mean(recent14) / mean(prior14) - 1) * 100;
  }
  const trendAdjPct = Math.max(-10, Math.min(10, trendPct / 2));
  if (Math.abs(trendPct) >= 3) reasons.push(`Sales have ${trendPct > 0 ? "increased" : "decreased"} ${Math.abs(Math.round(trendPct))}% over the last 14 days (applied ${trendAdjPct > 0 ? "+" : ""}${trendAdjPct.toFixed(1)}%).`);

  // Wastage: if more than 5% of recent stock was written off, trim by half the excess (max 10%).
  const w = input.recentWastagePct ?? 0;
  const wastageAdjPct = w > 5 ? -Math.min(10, (w - 5) / 2) : 0;
  if (wastageAdjPct < 0) reasons.push(`Recent wastage ${w.toFixed(1)}% → reduced ${Math.abs(wastageAdjPct).toFixed(1)}%.`);

  const holidayFactor = input.holidayFactor ?? 1;
  if (holidayFactor !== 1) reasons.push(`${input.holidayName ?? "Holiday"} adjustment ×${holidayFactor.toFixed(2)}.`);

  const statistical = baseline * (1 + trendAdjPct / 100) * (1 + wastageAdjPct / 100) * holidayFactor;
  const forecast = Math.max(standing, statistical);
  if (standing > 0) reasons.push(`Standing orders: ${r1(standing).toFixed(1)} kg${standing >= statistical ? " (floor applied)" : ""}.`);

  const band = Math.max(sigma * 1.28, forecast * 0.08);
  const low = Math.max(standing, forecast - band);
  const high = forecast + band;
  const recommended = Math.max(0, forecast - stock);
  if (stock > 0) reasons.push(`Current stock is ${r1(stock).toFixed(1)} kg.`);

  return {
    forecastKg: r1(forecast),
    lowKg: r1(low),
    highKg: r1(high),
    recommendedPurchaseKg: r1(recommended),
    components: {
      sameWeekdayAvgKg: sameWeekday.length ? r1(mean(sameWeekday)) : null,
      sameWeekdayCount: sameWeekday.length,
      baselineKg: r1(baseline),
      trendPct: r1(trendPct),
      trendAdjPct: r1(trendAdjPct),
      wastageAdjPct: r1(wastageAdjPct),
      holidayFactor,
      standingOrderKg: r1(standing),
      currentStockKg: r1(stock),
      method,
    },
    reasons,
  };
}

/** Mean absolute percentage error style accuracy: 100% − |forecast − actual| / actual. */
export function forecastAccuracyPct(forecast: number, actual: number): number | null {
  if (actual <= 0) return forecast <= 0 ? 100 : null;
  return Math.max(0, Math.round((1 - Math.abs(forecast - actual) / actual) * 1000) / 10);
}
