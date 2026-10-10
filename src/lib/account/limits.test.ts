import { describe, expect, it } from "vitest";
import { checkTrackedLimit, idsWithinLimit, isWithinLimit, TRACKED_MAX, trackedHomesLimit } from "./limits";
import { featureRows, FEATURE_LABELS, includedIn } from "./features";
import { FEATURES, type FeatureKey } from "@/lib/auth/entitlements";
import { site } from "@/lib/config/site";

describe("tracked-homes limit", () => {
  it("gives free accounts site.freeTrackedHomes and Plus the hard cap", () => {
    expect(trackedHomesLimit(false, site.freeTrackedHomes)).toBe(site.freeTrackedHomes);
    expect(trackedHomesLimit(true, site.freeTrackedHomes)).toBe(TRACKED_MAX);
    expect(trackedHomesLimit(false, 999)).toBe(TRACKED_MAX);
    expect(trackedHomesLimit(false, -1)).toBe(0);
  });

  it("lets a free account add up to the free limit, then asks for Plus", () => {
    expect(checkTrackedLimit(0, false, 1)).toEqual({ allowed: true, limit: 1 });
    expect(checkTrackedLimit(1, false, 1)).toEqual({ allowed: false, limit: 1, reason: "plus_required" });
    expect(checkTrackedLimit(3, false, 1)).toEqual({ allowed: false, limit: 1, reason: "plus_required" });
  });

  it("lets Plus add up to the hard cap", () => {
    expect(checkTrackedLimit(1, true, 1)).toEqual({ allowed: true, limit: TRACKED_MAX });
    expect(checkTrackedLimit(TRACKED_MAX - 1, true, 1).allowed).toBe(true);
    expect(checkTrackedLimit(TRACKED_MAX, true, 1)).toEqual({ allowed: false, limit: TRACKED_MAX, reason: "max_reached" });
  });

  it("keeps the older row when two concurrent inserts race past the count check", () => {
    // free account (limit 1) had no homes; two requests inserted ids 41 and 42
    expect(isWithinLimit([41, 42], 41, 1)).toBe(true);
    expect(isWithinLimit([41, 42], 42, 1)).toBe(false);
    // an id that is not present (already deleted) is never within the limit
    expect(isWithinLimit([41], 99, 1)).toBe(false);
    expect(isWithinLimit([1, 2, 3], 3, 3)).toBe(true);
  });

  it("shows estimates only for the oldest homes within the limit (e.g. after Plus lapses)", () => {
    expect([...idsWithinLimit([4, 7, 9], 1)]).toEqual([4]);
    expect([...idsWithinLimit([4, 7, 9], TRACKED_MAX)]).toEqual([4, 7, 9]);
    expect(idsWithinLimit([4, 7], 0).size).toBe(0);
    expect(idsWithinLimit([4, 7], -2).size).toBe(0);
  });
});

describe("feature labels for the plans table", () => {
  it("labels every gated feature", () => {
    for (const f of Object.keys(FEATURES) as FeatureKey[]) {
      expect(FEATURE_LABELS[f], f).toBeDefined();
      expect(FEATURE_LABELS[f].k.startsWith("account.feature.")).toBe(true);
      expect(FEATURE_LABELS[f].fallback.length).toBeGreaterThan(3);
    }
  });

  it("orders rows public -> account -> plus and covers every feature once", () => {
    const rows = featureRows();
    expect(rows).toHaveLength(Object.keys(FEATURES).length);
    expect(new Set(rows.map((r) => r.feature)).size).toBe(rows.length);
    const order = { public: 0, account: 1, plus: 2 } as const;
    for (let i = 1; i < rows.length; i++) expect(order[rows[i].level]).toBeGreaterThanOrEqual(order[rows[i - 1].level]);
  });

  it("maps access levels to plan columns", () => {
    expect(includedIn("public")).toEqual([true, true, true]);
    expect(includedIn("account")).toEqual([false, true, true]);
    expect(includedIn("plus")).toEqual([false, false, true]);
  });
});
