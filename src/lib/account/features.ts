import { FEATURES, type AccessLevel, type FeatureKey } from "@/lib/auth/entitlements";

/**
 * Human labels for every gated feature, used by the /plus/ comparison table. The table is generated from
 * FEATURES, so a new feature key without a label here fails the unit test instead of silently disappearing.
 * `vars` names are filled in by the page ({free}: free tracked homes, {max}: tracked-homes cap).
 */
export const FEATURE_LABELS: Record<FeatureKey, { k: string; fallback: string }> = {
  "sales.full": { k: "account.feature.salesFull", fallback: "Full sales history on every property page" },
  "property.context": { k: "account.feature.propertyContext", fallback: "Rentals, nearby comparables, lease and supply context" },
  "supply-demand": { k: "account.feature.supplyDemand", fallback: "Demand vs supply: upgrader pool against competing private supply" },
  "property.profit-loss": { k: "account.feature.profitLoss", fallback: "Profit and loss on repeat sales of the same unit" },
  "property.stacking": { k: "account.feature.stacking", fallback: "Stacking plans: prices by floor and unit size" },
  "valuation.estimate": { k: "account.feature.valuationEstimate", fallback: "Valuation estimates for any home" },
  "valuation.report": { k: "account.feature.valuationReport", fallback: "Downloadable valuation reports" },
  "lists.full": { k: "account.feature.listsFull", fallback: "Full rankings and filters, beyond the top 3" },
  "insights.full": { k: "account.feature.insightsFull", fallback: "Every market insight and the full trend builder" },
  "mortgage.compare": { k: "account.feature.mortgageCompare", fallback: "Mortgage package comparison" },
  "affordability.save": { k: "account.feature.affordabilitySave", fallback: "Save affordability results" },
  watchlist: { k: "account.feature.watchlist", fallback: "Watchlist of properties you follow" },
  "tracking.basic": { k: "account.feature.trackingBasic", fallback: "Track your home's estimated value ({free} home)" },
  "tracking.unlimited": { k: "account.feature.trackingUnlimited", fallback: "Track up to {max} homes" },
  alerts: { k: "account.feature.alerts", fallback: "New-sale alerts on Telegram" },
  "homes.exit-audience": { k: "account.feature.exitAudience", fallback: "Likely-buyer (exit audience) analysis on listings" },
  "news.plus": { k: "account.feature.newsPlus", fallback: "Members-only articles" },
  "ai.ask": { k: "account.feature.aiAsk", fallback: "AI property assistant" },
};

const LEVEL_ORDER: Record<AccessLevel, number> = { public: 0, account: 1, plus: 2 };

export interface FeatureRow {
  feature: FeatureKey;
  level: AccessLevel;
  k: string;
  fallback: string;
}

/** Every feature with its label, ordered public -> free account -> Plus (stable within a level). */
export function featureRows(): FeatureRow[] {
  return (Object.keys(FEATURES) as FeatureKey[])
    .map((feature, i) => ({ feature, level: FEATURES[feature] as AccessLevel, i, ...FEATURE_LABELS[feature] }))
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.i - b.i)
    .map(({ feature, level, k, fallback }) => ({ feature, level, k, fallback }));
}

/** Which plan columns include a feature at `level`: [visitor, free account, Plus]. */
export function includedIn(level: AccessLevel): [boolean, boolean, boolean] {
  return [level === "public", level !== "plus", true];
}
