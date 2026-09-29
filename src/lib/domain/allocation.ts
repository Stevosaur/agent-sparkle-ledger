/**
 * Allocation engine — distributes uncertain catch supply across buyer demand.
 *
 * All arithmetic is done in integer units of 10 g (0.01 kg), so results are exact and never
 * over-allocate a lot. Allocations are rounded to `stepKg` (default 0.1 kg — a scale reading).
 */
export type AllocationPolicy = "PRO_RATA" | "PRIORITY" | "FIRST_CONFIRMED" | "MINIMUM_GUARANTEED" | "MARGIN_MAX" | "MANUAL_RANK";

export const POLICY_LABELS: Record<AllocationPolicy, string> = {
  PRO_RATA: "Pro-rata",
  PRIORITY: "Priority customer",
  FIRST_CONFIRMED: "First confirmed",
  MINIMUM_GUARANTEED: "Minimum guaranteed",
  MARGIN_MAX: "Margin maximisation",
  MANUAL_RANK: "Manual ranking",
};

export type SupplyLot = { lotId: string; lotNumber?: string; availableKg: string | number; costPerKg?: string | number | null; receivedAt?: Date | string | null };
export type DemandLine = {
  lineId: string;
  customerId: string;
  customerName?: string;
  requestedKg: string | number;
  /** 1 = highest priority. */
  priorityTier?: number;
  confirmedAt?: Date | string | null;
  pricePerKg?: string | number | null;
  manualRank?: number;
};

export type AllocationOptions = { stepKg?: number; minimumGuaranteePct?: number };

export type LineAllocation = {
  lineId: string;
  customerId: string;
  customerName?: string;
  requestedKg: number;
  allocatedKg: number;
  shortfallKg: number;
  fromLots: { lotId: string; lotNumber?: string; kg: number }[];
};

export type AllocationResult = {
  policy: AllocationPolicy;
  totalSupplyKg: number;
  totalDemandKg: number;
  totalAllocatedKg: number;
  unallocatedSupplyKg: number;
  totalShortfallKg: number;
  lines: LineAllocation[];
  explanation: string;
};

const U = 100; // units per kg (10 g)
const toU = (v: string | number) => Math.round(Number(v) * U);
const fromU = (u: number) => Math.round(u) / U;
const ts = (d?: Date | string | null) => (d ? new Date(d).getTime() : Number.MAX_SAFE_INTEGER);

type Need = { d: DemandLine; need: number; got: number; idx: number };

/** Pro-rata share of `avail` units over needs, in `step` chunks, remainders by largest-remainder then priority. */
function proRata(needs: Need[], avail: number, step: number): number {
  const total = needs.reduce((a, n) => a + (n.need - n.got), 0);
  if (total <= 0 || avail <= 0) return avail;
  if (avail >= total) {
    for (const n of needs) n.got = n.need;
    return avail - total;
  }
  const shares = needs.map((n) => {
    const exact = ((n.need - n.got) * avail) / total;
    const floored = Math.floor(exact / step) * step;
    return { n, floored, rem: exact - floored };
  });
  let left = avail - shares.reduce((a, s) => a + s.floored, 0);
  for (const s of shares) s.n.got += s.floored;
  shares.sort((a, b) => b.rem - a.rem || (a.n.d.priorityTier ?? 2) - (b.n.d.priorityTier ?? 2) || ts(a.n.d.confirmedAt) - ts(b.n.d.confirmedAt) || a.n.idx - b.n.idx);
  let guard = 0;
  while (left >= step && guard++ < 100000) {
    let progressed = false;
    for (const s of shares) {
      if (left < step) break;
      if (s.n.need - s.n.got >= step) {
        s.n.got += step;
        left -= step;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return left;
}

/** Fill in order until supply runs out; the last partially filled line is rounded down to the step. */
function sequential(ordered: Need[], avail: number, step: number): number {
  for (const n of ordered) {
    if (avail <= 0) break;
    const want = n.need - n.got;
    let give = Math.min(want, avail);
    if (give < want) give = Math.floor(give / step) * step;
    n.got += give;
    avail -= give;
  }
  return avail;
}

export function allocate(policy: AllocationPolicy, lots: SupplyLot[], demand: DemandLine[], opts: AllocationOptions = {}): AllocationResult {
  const step = Math.max(1, Math.round((opts.stepKg ?? 0.1) * U));
  const supplyU = lots.reduce((a, l) => a + Math.max(0, toU(l.availableKg)), 0);
  const needs: Need[] = demand.map((d, idx) => ({ d, need: Math.max(0, toU(d.requestedKg)), got: 0, idx }));
  const demandU = needs.reduce((a, n) => a + n.need, 0);
  let avail = supplyU;

  switch (policy) {
    case "PRO_RATA":
      avail = proRata(needs, avail, step);
      break;
    case "PRIORITY": {
      const tiers = [...new Set(needs.map((n) => n.d.priorityTier ?? 2))].sort((a, b) => a - b);
      for (const t of tiers) avail = proRata(needs.filter((n) => (n.d.priorityTier ?? 2) === t), avail, step);
      break;
    }
    case "FIRST_CONFIRMED":
      avail = sequential([...needs].sort((a, b) => ts(a.d.confirmedAt) - ts(b.d.confirmedAt) || a.idx - b.idx), avail, step);
      break;
    case "MARGIN_MAX":
      avail = sequential([...needs].sort((a, b) => Number(b.d.pricePerKg ?? 0) - Number(a.d.pricePerKg ?? 0) || (a.d.priorityTier ?? 2) - (b.d.priorityTier ?? 2) || a.idx - b.idx), avail, step);
      break;
    case "MANUAL_RANK":
      avail = sequential([...needs].sort((a, b) => (a.d.manualRank ?? 999) - (b.d.manualRank ?? 999) || a.idx - b.idx), avail, step);
      break;
    case "MINIMUM_GUARANTEED": {
      const pct = opts.minimumGuaranteePct ?? 50;
      // Phase 1: everybody gets up to their guaranteed minimum (pro-rata on minimums if even that is short).
      const minNeeds = needs.map((n) => ({ ...n, need: Math.floor((n.need * pct) / 100 / step) * step, got: 0 }));
      avail = proRata(minNeeds, avail, step);
      minNeeds.forEach((m, i) => (needs[i].got = m.got));
      // Phase 2: the remainder pro-rata on remaining need.
      avail = proRata(needs, avail, step);
      break;
    }
  }

  // Assign allocated quantities to physical lots, oldest received first (FEFO), splitting where needed.
  const lotQueue = [...lots]
    .map((l) => ({ ...l, left: Math.max(0, toU(l.availableKg)) }))
    .sort((a, b) => ts(a.receivedAt) - ts(b.receivedAt));
  const lines: LineAllocation[] = needs.map((n) => {
    let remaining = n.got;
    const fromLots: LineAllocation["fromLots"] = [];
    for (const l of lotQueue) {
      if (remaining <= 0) break;
      if (l.left <= 0) continue;
      const take = Math.min(remaining, l.left);
      l.left -= take;
      remaining -= take;
      fromLots.push({ lotId: l.lotId, lotNumber: l.lotNumber, kg: fromU(take) });
    }
    return {
      lineId: n.d.lineId,
      customerId: n.d.customerId,
      customerName: n.d.customerName,
      requestedKg: fromU(n.need),
      allocatedKg: fromU(n.got),
      shortfallKg: fromU(n.need - n.got),
      fromLots,
    };
  });

  const allocatedU = needs.reduce((a, n) => a + n.got, 0);
  const result: AllocationResult = {
    policy,
    totalSupplyKg: fromU(supplyU),
    totalDemandKg: fromU(demandU),
    totalAllocatedKg: fromU(allocatedU),
    unallocatedSupplyKg: fromU(supplyU - allocatedU),
    totalShortfallKg: fromU(demandU - allocatedU),
    lines,
    explanation: "",
  };
  result.explanation = explainAllocation(result);
  return result;
}

export function explainAllocation(r: AllocationResult): string {
  const cover = r.totalDemandKg > 0 ? Math.round((Math.min(r.totalSupplyKg, r.totalDemandKg) / r.totalDemandKg) * 100) : 100;
  if (r.totalShortfallKg <= 0) return `Supply of ${r.totalSupplyKg.toFixed(1)} kg covers all ${r.totalDemandKg.toFixed(1)} kg requested; ${r.unallocatedSupplyKg.toFixed(1)} kg remains unallocated.`;
  const policyText: Record<AllocationPolicy, string> = {
    PRO_RATA: "each buyer receives the same share of their request",
    PRIORITY: "higher-priority customers are filled first, pro-rata within each tier",
    FIRST_CONFIRMED: "orders are filled in the order they were confirmed",
    MINIMUM_GUARANTEED: "every buyer is first guaranteed a minimum share, then the remainder is split pro-rata",
    MARGIN_MAX: "orders with the highest selling price are filled first",
    MANUAL_RANK: "orders are filled in your manual ranking",
  };
  return `Supply ${r.totalSupplyKg.toFixed(1)} kg vs demand ${r.totalDemandKg.toFixed(1)} kg (${cover}% cover). Under ${POLICY_LABELS[r.policy].toLowerCase()}, ${policyText[r.policy]}. Total shortfall ${r.totalShortfallKg.toFixed(1)} kg.`;
}

export type SubstituteSupply = { speciesId: string; speciesName: string; availableKg: number; typicalSizeMatch?: boolean };
export type SubstituteSuggestion = { lineId: string; customerName?: string; shortfallKg: number; speciesId: string; speciesName: string; suggestMinKg: number; suggestMaxKg: number };

/**
 * Suggest substitutes for shortfalls from species the buyer's product can typically be swapped with.
 * Suggestions are ranges (±10%) and are never applied without human confirmation.
 */
export function suggestSubstitutes(result: AllocationResult, substitutes: SubstituteSupply[]): SubstituteSuggestion[] {
  const pool = substitutes.map((s) => ({ ...s, left: s.availableKg }));
  const out: SubstituteSuggestion[] = [];
  for (const l of [...result.lines].sort((a, b) => b.shortfallKg - a.shortfallKg)) {
    if (l.shortfallKg < 0.5) continue;
    const s = pool.find((p) => p.left >= l.shortfallKg * 0.9) ?? pool.sort((a, b) => b.left - a.left)[0];
    if (!s || s.left < 0.5) continue;
    const target = Math.min(l.shortfallKg, s.left);
    const lo = Math.max(0.5, Math.floor(target * 0.9));
    const hi = Math.min(s.left, Math.ceil(target * 1.1));
    s.left -= target;
    out.push({ lineId: l.lineId, customerName: l.customerName, shortfallKg: l.shortfallKg, speciesId: s.speciesId, speciesName: s.speciesName, suggestMinKg: lo, suggestMaxKg: Math.max(lo, hi) });
  }
  return out;
}
