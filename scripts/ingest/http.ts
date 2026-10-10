/** HTTP helpers for the ingestion pipeline: retries with exponential backoff, Retry-After, pacing. */

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export interface FetchOptions extends RequestInit {
  /** attempts including the first (default 6) */
  tries?: number;
  /** base backoff in ms (default 3000) */
  backoffMs?: number;
  /** per-attempt timeout (default 120 s) */
  timeoutMs?: number;
}

/** fetch() with retry on network errors, 429 and 5xx. Throws HttpError on other non-2xx. */
export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { tries = 6, backoffMs = 3000, timeoutMs = 120_000, ...init } = opts;
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : backoffMs * 2 ** i;
        lastErr = new HttpError(`${redact(url)} -> HTTP ${res.status}`, res.status);
        await res.body?.cancel().catch(() => undefined);
        await sleep(Math.min(wait, 120_000));
        continue;
      }
      if (!res.ok) throw new HttpError(`${redact(url)} -> HTTP ${res.status}`, res.status);
      return res;
    } catch (err) {
      if (err instanceof HttpError && err.status !== 429 && err.status < 500) throw err;
      lastErr = err;
      await sleep(Math.min(backoffMs * 2 ** i, 120_000));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${redact(url)} -> failed after ${tries} tries`);
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T> {
  const res = await fetchWithRetry(url, { ...opts, headers: { Accept: "application/json", ...(opts.headers ?? {}) } });
  return (await res.json()) as T;
}

/** Strip query strings (signed URLs, tokens) from log output. */
export function redact(url: string): string {
  return url.split("?")[0];
}

/** Simple pacer: ensures at least `gapMs` between successive calls. */
export function pacer(gapMs: number) {
  let last = 0;
  return async () => {
    const wait = last + gapMs - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
  };
}

export function log(scope: string, msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] [${scope}] ${msg}`);
}

/** Append without spreading into call arguments (push(...big) overflows the stack beyond ~100k items). */
export function pushAll<T>(target: T[], items: readonly T[]): T[] {
  for (let i = 0; i < items.length; i++) target.push(items[i]);
  return target;
}
