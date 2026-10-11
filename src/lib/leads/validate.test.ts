import { describe, expect, it } from "vitest";
import {
  isValidEmail,
  isValidPostalCode,
  isValidPreferredDate,
  isValidSgPhone,
  maxPreferredDate,
  normalizeSgPhone,
  singaporeToday,
  validateLeadFields,
  type LeadFieldValues,
} from "./validate";

describe("Singapore phone numbers", () => {
  it("accepts 8 digits starting with 3, 6, 8 or 9, with or without +65 / 65", () => {
    expect(normalizeSgPhone("91234567")).toBe("+6591234567");
    expect(normalizeSgPhone("8123 4567")).toBe("+6581234567");
    expect(normalizeSgPhone("6123-4567")).toBe("+6561234567");
    expect(normalizeSgPhone("31234567")).toBe("+6531234567");
    expect(normalizeSgPhone("+65 9123 4567")).toBe("+6591234567");
    expect(normalizeSgPhone("+6591234567")).toBe("+6591234567");
    expect(normalizeSgPhone("6591234567")).toBe("+6591234567");
    expect(normalizeSgPhone("(+65) 9123.4567")).toBe("+6591234567");
  });
  it("treats an 8-digit number starting with 65 as a local number, not a prefix", () => {
    expect(normalizeSgPhone("65123456")).toBe("+6565123456");
  });
  it("rejects other prefixes, lengths and foreign numbers", () => {
    for (const bad of ["11234567", "21234567", "41234567", "51234567", "71234567", "9123456", "912345678", "+6512345678", "+60123456789", "+1 415 555 0100", "", "abcdefgh", "0091234567"]) {
      expect(isValidSgPhone(bad), bad).toBe(false);
    }
  });
});

describe("postal codes", () => {
  it("accepts 6-digit codes in postal sectors 01-82", () => {
    expect(isValidPostalCode("521872")).toBe(true);
    expect(isValidPostalCode("018956")).toBe(true);
    expect(isValidPostalCode("828761")).toBe(true);
    expect(isValidPostalCode(" 570123 ")).toBe(true);
  });
  it("rejects wrong lengths, non-digits and sectors outside 01-82", () => {
    for (const bad of ["52187", "5218721", "52a872", "", "000000", "001234", "830000", "999999"]) {
      expect(isValidPostalCode(bad), bad).toBe(false);
    }
  });
});

describe("e-mail", () => {
  it("accepts normal addresses and rejects malformed ones", () => {
    expect(isValidEmail("tan.ah.kow@example.com.sg")).toBe(true);
    expect(isValidEmail("a+b@x.io")).toBe(true);
    for (const bad of ["a@b", "a b@c.com", "@c.com", "a@@c.com", "a@c.", `${"x".repeat(250)}@c.com`]) {
      expect(isValidEmail(bad), bad).toBe(false);
    }
  });
});

describe("preferred service date", () => {
  it("allows today up to a year ahead, rejects past and impossible dates", () => {
    const today = "2026-10-10";
    expect(isValidPreferredDate("2026-10-10", today)).toBe(true);
    expect(isValidPreferredDate("2027-10-10", today)).toBe(true);
    expect(isValidPreferredDate("2027-10-11", today)).toBe(false);
    expect(isValidPreferredDate("2026-10-09", today)).toBe(false);
    expect(isValidPreferredDate("2027-02-30", today)).toBe(false);
    expect(isValidPreferredDate("10/11/2026", today)).toBe(false);
    expect(maxPreferredDate(today)).toBe("2027-10-10");
  });
  it("computes today's date in Singapore time", () => {
    expect(singaporeToday(new Date("2026-10-09T16:30:00Z"))).toBe("2026-10-10");
    expect(singaporeToday(new Date("2026-10-09T15:59:00Z"))).toBe("2026-10-09");
  });
});

describe("validateLeadFields", () => {
  const base: LeadFieldValues = { type: "general", name: "Tan", email: "tan@example.org", phone: "", message: "", consent: true };
  it("passes a complete general lead", () => {
    expect(validateLeadFields(base)).toEqual({});
  });
  it("needs a name, a contact channel and consent", () => {
    expect(validateLeadFields({ ...base, name: "  ", email: "", phone: "", consent: false })).toEqual({ name: "required", contact: "required", consent: "required" });
  });
  it("flags invalid contact details and long messages", () => {
    const e = validateLeadFields({ ...base, email: "nope", phone: "1234", message: "x".repeat(2001) });
    expect(e).toEqual({ email: "invalid", phone: "invalid", message: "too_long" });
  });
  it("requires postal code and service for services leads", () => {
    const e = validateLeadFields({ ...base, type: "services" }, "2026-10-10");
    expect(e).toEqual({ postal: "required", service: "required" });
    const e2 = validateLeadFields({ ...base, type: "services", postal: "12345", service: "painting", preferredDate: "2020-01-01" }, "2026-10-10");
    expect(e2).toEqual({ postal: "invalid", service: "invalid", preferredDate: "invalid" });
    expect(validateLeadFields({ ...base, type: "services", postal: "521872", service: "aircon", preferredDate: "2026-11-01" }, "2026-10-10")).toEqual({});
  });
  it("checks the mortgage purpose when given", () => {
    expect(validateLeadFields({ ...base, type: "mortgage", purpose: "refinance" })).toEqual({});
    expect(validateLeadFields({ ...base, type: "mortgage", purpose: "flip" })).toEqual({ purpose: "invalid" });
  });
});
