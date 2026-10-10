/**
 * Post-login redirect targets (`?next=`) must be same-origin relative paths. Anything else (absolute URLs,
 * protocol-relative "//evil.com", backslash tricks, javascript: URLs, control characters) falls back to a
 * safe default so the login flow can never be used as an open redirect.
 */

export const DEFAULT_NEXT_PATH = "/profile/";

const PROBE_ORIGIN = "http://plotline.invalid";

/** Paths that must never be a post-login destination (they would loop or sign the user out). */
const BLOCKED_PREFIXES = ["/auth/", "/login/", "/api/"];

export function safeNextPath(raw: string | null | undefined, fallback: string = DEFAULT_NEXT_PATH): string {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim();
  if (!value || value.length > 1024) return fallback;
  // Must be a rooted path, but not protocol-relative ("//host") or backslash-relative ("/\host").
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // Browsers treat "\" like "/" and ignore tabs/newlines inside URLs: reject both outright.
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN) return fallback;
  let path = url.pathname;
  // Site convention: trailingSlash URLs. Add the slash to page paths (not files such as /sitemap.xml).
  if (!path.endsWith("/") && !/\.[a-z0-9]+$/i.test(path)) path = `${path}/`;
  const lower = path.toLowerCase();
  if (BLOCKED_PREFIXES.some((p) => lower.startsWith(p))) return fallback;
  return `${path}${url.search}${url.hash}`;
}

/** First value of a search param that may be repeated. */
export function firstParam(value: string | string[] | undefined | null): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}
