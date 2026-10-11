/** Per-user caps on account data. Enforced server-side in the route handlers. */

/** Most properties one account can keep on its watchlist. */
export const WATCHLIST_MAX = 200;
/** Hard cap on tracked homes, even with unlimited tracking (keeps /api/tracked/ responses bounded). */
export const TRACKED_MAX = 50;
/** Most alerts one account can keep. */
export const ALERTS_MAX = 50;

/** How many homes this account may track: `freeLimit` without "tracking.unlimited", TRACKED_MAX with it. */
export function trackedHomesLimit(unlimited: boolean, freeLimit: number): number {
  return unlimited ? TRACKED_MAX : Math.max(0, Math.min(Math.floor(freeLimit), TRACKED_MAX));
}

export type TrackedLimitCheck = { allowed: true; limit: number } | { allowed: false; limit: number; reason: "plus_required" | "max_reached" };

/** Can an account that already tracks `count` homes add one more? */
export function checkTrackedLimit(count: number, unlimited: boolean, freeLimit: number): TrackedLimitCheck {
  const limit = trackedHomesLimit(unlimited, freeLimit);
  if (count < limit) return { allowed: true, limit };
  return { allowed: false, limit, reason: unlimited ? "max_reached" : "plus_required" };
}

/**
 * Ids (of rows sorted by id ascending) whose estimates the account may see: the oldest `limit` homes. A
 * lapsed Plus subscriber keeps every row, but only the first `limit` get estimates until they renew.
 */
export function idsWithinLimit(idsAscending: readonly number[], limit: number): Set<number> {
  return new Set(idsAscending.slice(0, Math.max(0, limit)));
}

/**
 * Race-safe re-check after an insert: rows are kept in id order, so the new row is allowed only when it is
 * among the first `limit` ids. Two concurrent inserts by a free account therefore keep the older row and
 * reject the newer one instead of both succeeding.
 */
export function isWithinLimit(idsAscending: readonly number[], newId: number, limit: number): boolean {
  const position = idsAscending.indexOf(newId);
  return position >= 0 && position < limit;
}
