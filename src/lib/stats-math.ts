/** Pure statistics helpers shared by the pipeline, calculators and pages. */

/** Linear-interpolated quantile (q in [0,1]) of an unsorted array; NaN for empty input. */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return quantileSorted(sorted, q);
}

export function quantileSorted(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

/** Compound annual growth rate between two values over `years`; NaN when undefined. */
export function cagr(start: number, end: number, years: number): number {
  if (!(start > 0) || !(end > 0) || !(years > 0)) return Number.NaN;
  return Math.pow(end / start, 1 / years) - 1;
}

/** Ordinary least squares y = a + b x. Returns null with fewer than 2 distinct x values. */
export function linearFit(xs: readonly number[], ys: readonly number[]): { a: number; b: number; r2: number } | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return null;
  const b = sxy / sxx;
  const a = my - b * mx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { a, b, r2 };
}
