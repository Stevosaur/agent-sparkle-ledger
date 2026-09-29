/**
 * Surplus clearance — detect stock likely to remain unsold before dispatch cut-off and propose
 * clearance actions. Never proposes a price below the approved floor.
 */
export type SurplusInput = {
  speciesId: string;
  speciesName: string;
  unallocatedKg: number;
  openDemandKg: number;
  minutesToCutoff: number;
  freshnessHoursRemaining: number;
  costPerKg: number | null;
  listPricePerKg: number;
  /** Maximum discount from list price the organisation has approved, e.g. 15 (%). */
  maxDiscountPct: number;
  /** Buyers who purchased this species in the last 30 days but have no open order tonight. */
  lapsedBuyers: { customerId: string; name: string; avgKg: number }[];
};

export type SurplusAction =
  | { type: "OFFER_EXISTING_BUYERS"; customers: { customerId: string; name: string; suggestKg: number }[] }
  | { type: "DISCOUNT"; fromPrice: number; toPrice: number; discountPct: number; floorPrice: number }
  | { type: "FLASH_MESSAGE"; audienceSize: number }
  | { type: "BUNDLE"; note: string }
  | { type: "HOLD"; note: string };

export type SurplusAssessment = {
  atRiskKg: number;
  severity: "NONE" | "WATCH" | "AT_RISK" | "CRITICAL";
  floorPrice: number;
  actions: SurplusAction[];
  explanation: string;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function assessSurplus(i: SurplusInput): SurplusAssessment {
  const atRisk = Math.max(0, i.unallocatedKg - i.openDemandKg);
  const floor = r2(Math.max(i.costPerKg ?? 0, i.listPricePerKg * (1 - i.maxDiscountPct / 100)));
  if (atRisk < 3) return { atRiskKg: r1(atRisk), severity: "NONE", floorPrice: floor, actions: [], explanation: "No material surplus." };

  const canHold = i.freshnessHoursRemaining >= 30;
  const urgency = i.minutesToCutoff <= 60 ? 1 : i.minutesToCutoff <= 120 ? 0.6 : 0.3;
  const severity: SurplusAssessment["severity"] = canHold && urgency < 1 ? "WATCH" : urgency >= 1 ? "CRITICAL" : "AT_RISK";
  const actions: SurplusAction[] = [];

  if (i.lapsedBuyers.length) {
    let left = atRisk;
    const customers = [...i.lapsedBuyers]
      .sort((a, b) => b.avgKg - a.avgKg)
      .slice(0, 5)
      .map((b) => {
        const kg = r1(Math.min(left, Math.max(2, b.avgKg)));
        left -= kg;
        return { customerId: b.customerId, name: b.name, suggestKg: kg };
      })
      .filter((c) => c.suggestKg > 0);
    if (customers.length) actions.push({ type: "OFFER_EXISTING_BUYERS", customers });
  }
  // Discount scales with urgency but is clamped at the approved floor.
  const desiredPct = Math.min(i.maxDiscountPct, Math.round(i.maxDiscountPct * urgency));
  const toPrice = r2(Math.max(floor, i.listPricePerKg * (1 - desiredPct / 100)));
  if (toPrice < i.listPricePerKg) {
    actions.push({ type: "DISCOUNT", fromPrice: r2(i.listPricePerKg), toPrice, discountPct: r1(((i.listPricePerKg - toPrice) / i.listPricePerKg) * 100), floorPrice: floor });
  }
  actions.push({ type: "FLASH_MESSAGE", audienceSize: i.lapsedBuyers.length });
  if (atRisk >= 15) actions.push({ type: "BUNDLE", note: `Bundle with slower lines (e.g. ${i.speciesName} + mixed fish for restaurant soup packs).` });
  if (canHold) actions.push({ type: "HOLD", note: `Shelf-life allows holding in chiller for tomorrow (${Math.round(i.freshnessHoursRemaining)} h freshness remaining).` });

  const explanation = `${r1(atRisk)} kg ${i.speciesName} unallocated with ${i.minutesToCutoff} min to dispatch cut-off. Floor price S$${floor.toFixed(2)}/kg (${i.maxDiscountPct}% max discount${i.costPerKg ? `, never below cost S$${i.costPerKg.toFixed(2)}` : ""}).`;
  return { atRiskKg: r1(atRisk), severity, floorPrice: floor, actions, explanation };
}
