/**
 * Feature gating table. Every gated section or API names one of these features.
 *   public  - anyone
 *   account - any signed-in user (free account)
 *   plus    - active or trialing Plus subscription
 */
export type AccessLevel = "public" | "account" | "plus";
export type Plan = "anonymous" | "free" | "plus";

export const FEATURES = {
  /** full sales history beyond the latest 10 on property pages */
  "sales.full": "account",
  /** rental records, nearby comparables, lease/MOP/supply context sections on property pages */
  "property.context": "account",
  /** demand vs supply (HDB upgrader pool vs competing private supply) */
  "supply-demand": "plus",
  /** unit-level profit and loss pairs */
  "property.profit-loss": "account",
  /** stacking plan / floor x size price grid */
  "property.stacking": "plus",
  /** valuation estimate */
  "valuation.estimate": "account",
  /** downloadable valuation report */
  "valuation.report": "plus",
  /** full rankings beyond the top 3 + filters */
  "lists.full": "plus",
  /** full insights modules and the trend builder beyond the first series */
  "insights.full": "plus",
  /** mortgage package comparison */
  "mortgage.compare": "plus",
  /** saving affordability results */
  "affordability.save": "account",
  /** watchlist */
  watchlist: "account",
  /** tracking homes on My Property (free accounts can track site.freeTrackedHomes) */
  "tracking.basic": "account",
  "tracking.unlimited": "plus",
  /** price alerts (Telegram / email) */
  alerts: "plus",
  /** listings: likely-buyer "exit audience" analysis */
  "homes.exit-audience": "plus",
  /** Plus-only articles */
  "news.plus": "plus",
  /** AI assistant questions (rate-limited per plan) */
  "ai.ask": "public",
} as const satisfies Record<string, AccessLevel>;

export type FeatureKey = keyof typeof FEATURES;

export function levelOf(feature: FeatureKey): AccessLevel {
  return FEATURES[feature];
}

export function planSatisfies(plan: Plan, level: AccessLevel): boolean {
  if (level === "public") return true;
  if (level === "account") return plan === "free" || plan === "plus";
  return plan === "plus";
}

export function hasFeature(plan: Plan, feature: FeatureKey, gating: "open" | "enforce"): boolean {
  if (gating === "open") return true;
  return planSatisfies(plan, FEATURES[feature]);
}

export function featureMap(plan: Plan, gating: "open" | "enforce"): Record<FeatureKey, boolean> {
  return Object.fromEntries((Object.keys(FEATURES) as FeatureKey[]).map((f) => [f, hasFeature(plan, f, gating)])) as Record<FeatureKey, boolean>;
}
