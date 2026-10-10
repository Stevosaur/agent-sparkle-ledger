import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Low-level JSON snapshot reader. Files live under DATA_DIR (default ./data) and are produced by
 * `npm run ingest`. Missing files are not an error: callers receive the fallback so pages can render
 * an honest "no data yet" state instead of crashing.
 */

export function dataDir(): string {
  return process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
}

const cache = new Map<string, unknown>();
const MISSING = Symbol("missing");

export function readJson<T>(relPath: string, fallback: T): T {
  const key = `${dataDir()}::${relPath}`;
  if (cache.has(key)) {
    const hit = cache.get(key);
    return (hit === MISSING ? fallback : hit) as T;
  }
  const file = path.join(dataDir(), relPath);
  let value: unknown = MISSING;
  try {
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`[data] failed to read ${relPath}:`, err);
    }
  }
  cache.set(key, value);
  return (value === MISSING ? fallback : value) as T;
}

export function dataFileExists(relPath: string): boolean {
  return fs.existsSync(path.join(dataDir(), relPath));
}

/** Small LRU for decoded (expanded) per-town / per-district transaction arrays. */
export class Lru<K, V> {
  private map = new Map<K, V>();
  constructor(private readonly max: number) {}
  get(key: K): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }
  set(key: K, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value as K;
      this.map.delete(oldest);
    }
  }
}

/** Test helper: forget cached files (used when DATA_DIR changes between tests). */
export function clearDataCache(): void {
  cache.clear();
}
