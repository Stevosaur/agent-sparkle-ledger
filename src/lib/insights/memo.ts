import "server-only";
import { dataDir } from "@/lib/data/store";
import { getMeta } from "@/lib/data/meta";

const store = new Map<string, unknown>();

/**
 * Per-process memoisation keyed by the dataset snapshot (DATA_DIR + generatedAt), so a new snapshot
 * (or a different DATA_DIR in tests) never serves stale aggregates.
 */
export function memoBySnapshot<T>(name: string, compute: () => T): T {
  const key = `${name}::${dataDir()}::${getMeta().generatedAt}`;
  if (store.has(key)) return store.get(key) as T;
  const value = compute();
  store.set(key, value);
  return value;
}

/** Year used as "now" for age / pipeline calculations: the snapshot's generation year (stable between rebuilds). */
export function referenceYear(): number {
  const generated = Date.parse(getMeta().generatedAt);
  return Number.isFinite(generated) ? new Date(generated).getUTCFullYear() : new Date().getUTCFullYear();
}

/** Test helper. */
export function clearInsightMemo(): void {
  store.clear();
}
