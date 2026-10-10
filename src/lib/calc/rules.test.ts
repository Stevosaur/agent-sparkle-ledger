import { describe, expect, it } from "vitest";
import * as calc from "./index";
import {
  ABSD_RATES,
  ABSD_TABLES,
  BANK_LTV,
  BSD_NON_RESIDENTIAL,
  BSD_RESIDENTIAL,
  BSD_TABLES,
  HDB_LOAN_RATE_PCT,
  HDB_LOAN_RATE_SPREAD_PCT,
  CPF_OA_RATE_PCT,
  RULE_META,
  RULE_STATUS,
  SSD_FROM_2017_03_11,
  SSD_FROM_2025_07_04,
  ruleNeedsDisclaimer,
  type RuleStatus,
} from "./rules";

const STATUSES: RuleStatus[] = ["verified-search", "verified-secondary", "unverified-high-confidence", "unverified", "unverified-conflict", "unverified-reproduction"];

describe("rules registry", () => {
  it("every rule has a known status, a source URL and a research reference", () => {
    for (const [key, meta] of Object.entries(RULE_META)) {
      expect(STATUSES, key).toContain(meta.status);
      expect(meta.source, key).toMatch(/^https:\/\//);
      expect(meta.research, key).toMatch(/\.md/);
      if (meta.effectiveFrom != null) expect(meta.effectiveFrom, key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(RULE_STATUS[key as keyof typeof RULE_STATUS]).toBe(meta.status);
    }
  });

  it("statuses match the research verification logs for the rules the task calls out", () => {
    expect(RULE_STATUS.bala).toBe("unverified-reproduction");
    expect(RULE_STATUS.cpfProration).toBe("unverified");
    expect(RULE_STATUS.hdbLoanLtvProration).toBe("unverified");
    expect(RULE_STATUS.ssdAnniversary).toBe("unverified-conflict");
    expect(RULE_STATUS.absdMarriedCoupleReliefs).toBe("unverified");
    expect(RULE_STATUS.bsdResidential).toBe("verified-search");
    expect(RULE_STATUS.tdsr).toBe("verified-search");
    expect(RULE_STATUS.hdbLoanLtv).toBe("verified-search");
    expect(RULE_STATUS.bankLtv).toBe("unverified");
    expect(ruleNeedsDisclaimer("bala")).toBe(true);
    expect(ruleNeedsDisclaimer("tdsr")).toBe(false);
    expect(ruleNeedsDisclaimer("ssd2025")).toBe(false);
  });
});

describe("rule constants", () => {
  it("BSD tiers are cumulative and ascending; residential top 6% above $3m, non-residential top 5% above $1.5m", () => {
    for (const tiers of [BSD_RESIDENTIAL, BSD_NON_RESIDENTIAL, ...BSD_TABLES.flatMap((t) => [t.residential, t.nonResidential])]) {
      const bounds = tiers.map((t) => t.upTo ?? Infinity);
      expect([...bounds].sort((a, b) => a - b)).toEqual(bounds);
      expect(tiers[tiers.length - 1].upTo).toBeNull();
    }
    expect(BSD_RESIDENTIAL.map((t) => t.rate)).toEqual([0.01, 0.02, 0.03, 0.04, 0.05, 0.06]);
    expect(BSD_NON_RESIDENTIAL.map((t) => t.rate)).toEqual([0.01, 0.02, 0.03, 0.04, 0.05]);
    expect(BSD_TABLES.map((t) => t.since)).toEqual(["2023-02-15", "2018-02-20", "0000-01-01"]);
  });

  it("ABSD keeps exactly the four individual/entity profiles (other code iterates them) and the current table is first", () => {
    expect(Object.keys(ABSD_RATES)).toEqual(["SC", "SPR", "FOREIGNER", "ENTITY"]);
    expect(ABSD_TABLES[0].since).toBe("2023-04-27");
    expect(ABSD_TABLES[0].rates.SC).toEqual(ABSD_RATES.SC);
  });

  it("SSD schedules", () => {
    expect(SSD_FROM_2025_07_04.rates).toEqual([0.16, 0.12, 0.08, 0.04]);
    expect(SSD_FROM_2017_03_11.rates).toEqual([0.12, 0.08, 0.04]);
  });

  it("HDB loan rate = CPF OA rate + 0.1 point", () => {
    expect(CPF_OA_RATE_PCT + HDB_LOAN_RATE_SPREAD_PCT).toBeCloseTo(HDB_LOAN_RATE_PCT, 12);
  });

  it("bank LTV: minimum cash never exceeds the down payment share", () => {
    for (const row of BANK_LTV) {
      expect(row.minCashStandard).toBeLessThanOrEqual(1 - row.standard);
      expect(row.minCashReduced).toBeLessThanOrEqual(1 - row.reduced);
    }
  });

  it("the barrel export resolves without name clashes", () => {
    expect(typeof calc.affordability).toBe("function");
    expect(typeof calc.sellerStampDuty).toBe("function");
    expect(typeof calc.balaPct).toBe("function");
    expect(typeof calc.toSgDay).toBe("function");
  });
});
