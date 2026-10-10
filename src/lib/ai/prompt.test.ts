import { describe, expect, it } from "vitest";
import { dynamicContext, rulesReference, rulesReferenceItems, systemPrompt } from "./prompt";
import { ABSD_RATES, BSD_RESIDENTIAL, ruleNeedsDisclaimer } from "@/lib/calc/rules";
import { getMeta } from "@/lib/data/meta";

describe("system prompt", () => {
  it("is stable across calls (cacheable) and states the grounding rules", () => {
    expect(systemPrompt()).toBe(systemPrompt());
    const p = systemPrompt();
    expect(p).toContain("Never estimate");
    expect(p).toMatch(/not financial, legal or tax advice/);
    expect(p).toMatch(/Simplified Chinese/);
    expect(p).toMatch(/Cite the data month/);
  });

  it("renders the rules from rules.ts, tagging unverified ones as indicative", () => {
    const text = rulesReference();
    expect(text).toContain(`${BSD_RESIDENTIAL[0].rate * 100}%`);
    expect(text).toContain(`${ABSD_RATES.SC[1] * 100}%`);
    for (const item of rulesReferenceItems()) {
      expect(item.indicative).toBe(item.keys.some(ruleNeedsDisclaimer));
      expect(text.includes(`${item.text} (indicative`)).toBe(item.indicative);
    }
  });

  it("puts per-request facts in the dynamic context", () => {
    const ctx = dynamicContext({ meta: getMeta(), today: "2026-10-10", lang: "zh", page: { label: "Blk 1 X", ref: "hdb:blk-1-x", path: "/hdb/blk-1-x/" } });
    expect(ctx).toContain("2026-10-10");
    expect(ctx).toContain("Simplified Chinese");
    expect(ctx).toContain("HDB resale data to 2026-08");
    expect(ctx).toContain("synthetic sample data");
    expect(ctx).toContain("hdb:blk-1-x");
    const noPrivate = dynamicContext({ meta: { ...getMeta(), counts: { ...getMeta().counts, privateTransactions: 0 }, latestMonth: { hdb: "2026-08", private: null } }, today: "2026-10-10", lang: "en", page: null });
    expect(noPrivate).toMatch(/not loaded/);
    expect(noPrivate).toContain("general page");
  });
});

describe("sgtDate", () => {
  it("gives the calendar date in Singapore (UTC+8), not UTC", async () => {
    const { sgtDate } = await import("./config");
    expect(sgtDate(new Date("2026-09-30T15:59:59Z"))).toBe("2026-09-30");
    expect(sgtDate(new Date("2026-09-30T16:00:00Z"))).toBe("2026-10-01");
  });
});
