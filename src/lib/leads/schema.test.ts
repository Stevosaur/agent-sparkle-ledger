import { describe, expect, it } from "vitest";
import { parseLeadPayload } from "./schema";

const TODAY = "2026-10-10";

describe("parseLeadPayload", () => {
  it("accepts and normalises a valid services lead", () => {
    const r = parseLeadPayload(
      {
        type: "services",
        name: "  Tan Ah Kow ",
        email: "Tan@Example.ORG",
        phone: "+65 9123 4567",
        message: "Two bedrooms",
        consent: true,
        website: "",
        context: { postal: "521872", service: "cleaning", preferredDate: "2026-10-20", property: "hdb:blk-872a-tampines-st-86", empty: "" },
      },
      { today: TODAY },
    );
    expect(r).toEqual({
      ok: true,
      lead: {
        type: "services",
        name: "Tan Ah Kow",
        email: "tan@example.org",
        phone: "+6591234567",
        message: "Two bedrooms",
        context: { postal: "521872", service: "cleaning", preferredDate: "2026-10-20", property: "hdb:blk-872a-tampines-st-86" },
      },
    });
  });

  it("accepts phone-only and email-only leads", () => {
    const phoneOnly = parseLeadPayload({ type: "mortgage", name: "A", phone: "81234567", consent: true, context: { purpose: "refinance" } });
    expect(phoneOnly.ok && phoneOnly.lead.email === null && phoneOnly.lead.phone === "+6581234567").toBe(true);
    const emailOnly = parseLeadPayload({ type: "general", name: "A", email: "a@b.co", consent: true });
    expect(emailOnly.ok && emailOnly.lead.phone === null && emailOnly.lead.message === null).toBe(true);
  });

  it("treats a filled honeypot as spam", () => {
    expect(parseLeadPayload({ type: "general", name: "A", email: "a@b.co", consent: true, website: "http://x" })).toEqual({ ok: false, spam: true });
    // whitespace-only is not a bot signal
    expect(parseLeadPayload({ type: "general", name: "A", email: "a@b.co", consent: true, website: "  " }).ok).toBe(true);
  });

  it("requires consent to be exactly true", () => {
    for (const consent of [false, undefined, "true", 1]) {
      const r = parseLeadPayload({ type: "general", name: "A", email: "a@b.co", consent });
      expect(r.ok, String(consent)).toBe(false);
      if (!r.ok && !r.spam) expect(r.errors.consent).toBeDefined();
    }
  });

  it("reports every problem in one pass, as codes without echoing input", () => {
    const r = parseLeadPayload({ type: "services", name: "", phone: "12345", consent: false, context: { postal: "12ab", service: "painting" } }, { today: TODAY });
    expect(r).toEqual({ ok: false, spam: false, errors: { name: "required", phone: "invalid", consent: "required", postal: "invalid", service: "invalid" } });
    expect(JSON.stringify(r)).not.toContain("12345");
  });

  it("needs postal code and service for services leads", () => {
    const r = parseLeadPayload({ type: "services", name: "A", email: "a@b.co", consent: true }, { today: TODAY });
    expect(r).toEqual({ ok: false, spam: false, errors: { postal: "required", service: "required" } });
  });

  it("rejects unknown types, long messages and oversized context", () => {
    expect(parseLeadPayload({ type: "spam", name: "A", email: "a@b.co", consent: true })).toMatchObject({ ok: false, errors: { type: "invalid" } });
    expect(parseLeadPayload({ type: "general", name: "A", email: "a@b.co", consent: true, message: "x".repeat(2001) })).toMatchObject({ ok: false, errors: { message: "too_long" } });
    const ctx = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, "v"]));
    expect(parseLeadPayload({ type: "general", name: "A", email: "a@b.co", consent: true, context: ctx })).toMatchObject({ ok: false, errors: { context: "invalid" } });
    expect(parseLeadPayload({ type: "general", name: "A", email: "a@b.co", consent: true, context: { "bad key!": "v" } })).toMatchObject({ ok: false, errors: { context: "invalid" } });
    expect(parseLeadPayload({ type: "general", name: "A", email: "a@b.co", consent: true, context: { k: "v".repeat(201) } })).toMatchObject({ ok: false, errors: { context: "too_long" } });
  });

  it("rejects non-object payloads", () => {
    expect(parseLeadPayload(null).ok).toBe(false);
    expect(parseLeadPayload("hello").ok).toBe(false);
    expect(parseLeadPayload([]).ok).toBe(false);
  });
});
