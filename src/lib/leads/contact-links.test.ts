import { describe, expect, it } from "vitest";
import { isConfiguredEmail, mailtoHref, whatsappDigits, whatsappHref } from "./contact-links";

describe("contact links", () => {
  it("builds wa.me links from international numbers", () => {
    expect(whatsappDigits("+65 9123 4567")).toBe("6591234567");
    expect(whatsappHref("6591234567")).toBe("https://wa.me/6591234567");
    expect(whatsappHref("6591234567", "Hi & hello?")).toBe("https://wa.me/6591234567?text=Hi%20%26%20hello%3F");
  });
  it("returns null for missing or unusable numbers", () => {
    expect(whatsappHref("")).toBeNull();
    expect(whatsappHref(null)).toBeNull();
    expect(whatsappHref("12345")).toBeNull();
    expect(whatsappHref("1234567890123456")).toBeNull();
  });
  it("treats reserved example domains as not configured", () => {
    expect(isConfiguredEmail("hello@example.com")).toBe(false);
    expect(isConfiguredEmail("ops@mail.example.org")).toBe(false);
    expect(isConfiguredEmail("")).toBe(false);
    expect(isConfiguredEmail("not-an-email")).toBe(false);
    expect(isConfiguredEmail("hello@plotline.sg")).toBe(true);
  });
  it("encodes mailto subject and body", () => {
    expect(mailtoHref("a@b.sg", "Hi there", "Line 1\nLine 2")).toBe("mailto:a@b.sg?subject=Hi%20there&body=Line%201%0ALine%202");
  });
});
