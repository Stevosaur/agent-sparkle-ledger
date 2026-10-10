import { describe, expect, it } from "vitest";
import { parseListingInput } from "./listing-schema";

const hdb = { listingType: "sale", ref: "hdb:blk-872a-tampines-st-86", title: "4-room at Tampines", askingPrice: "620,000", flatType: "4 room", areaSqm: "93", floorLevel: "8", bedrooms: 3, bathrooms: "2", whatsapp: "+65 9123 4567", contactName: " Mei " };

describe("parseListingInput", () => {
  it("accepts and normalises an HDB listing", () => {
    const r = parseListingInput(hdb);
    expect(r).toEqual({
      ok: true,
      value: {
        listingType: "sale",
        ref: "hdb:blk-872a-tampines-st-86",
        kind: "hdb",
        title: "4-room at Tampines",
        description: null,
        askingPrice: 620_000,
        flatType: "4 ROOM",
        areaSqm: 93,
        floorLevel: 8,
        bedrooms: 3,
        bathrooms: 2,
        contactName: "Mei",
        whatsapp: "6591234567",
      },
    });
  });
  it("requires a valid HDB flat type for HDB listings", () => {
    expect(parseListingInput({ ...hdb, flatType: undefined })).toMatchObject({ ok: false, errors: { flatType: "required" } });
    expect(parseListingInput({ ...hdb, flatType: "penthouse" })).toMatchObject({ ok: false, errors: { flatType: "invalid" } });
  });
  it("requires floor area for condos and keeps free-form unit types for private homes", () => {
    const condo = { listingType: "rent", ref: "condo:aurora-fixture-residences", title: "2-bedder for rent", askingPrice: 4200 };
    expect(parseListingInput(condo)).toMatchObject({ ok: false, errors: { areaSqm: "required" } });
    const ok = parseListingInput({ ...condo, areaSqm: 70.25, flatType: "2-bedroom + study" });
    expect(ok.ok && ok.value.flatType).toBe("2-bedroom + study");
    expect(ok.ok && ok.value.areaSqm).toBe(70.3);
  });
  it("checks price ranges by listing type", () => {
    expect(parseListingInput({ ...hdb, askingPrice: 10_000 })).toMatchObject({ ok: false, errors: { askingPrice: "out_of_range" } });
    expect(parseListingInput({ ...hdb, listingType: "rent", askingPrice: 620_000 })).toMatchObject({ ok: false, errors: { askingPrice: "out_of_range" } });
    expect(parseListingInput({ ...hdb, listingType: "rent", askingPrice: 3200 }).ok).toBe(true);
  });
  it("rejects bad refs, numbers and WhatsApp numbers", () => {
    expect(parseListingInput({ ...hdb, ref: "launch:condo/x" })).toMatchObject({ ok: false, errors: { ref: "invalid" } });
    expect(parseListingInput({ ...hdb, ref: "HDB:Nope" })).toMatchObject({ ok: false, errors: { ref: "invalid" } });
    expect(parseListingInput({ ...hdb, floorLevel: 0, bedrooms: 2.5, whatsapp: "12345" })).toMatchObject({ ok: false, errors: { floorLevel: "out_of_range", bedrooms: "out_of_range", whatsapp: "invalid" } });
    expect(parseListingInput({ ...hdb, title: "abc" })).toMatchObject({ ok: false, errors: { title: "required" } });
    expect(parseListingInput({ ...hdb, title: "x".repeat(121) })).toMatchObject({ ok: false, errors: { title: "too_long" } });
    expect(parseListingInput({ ...hdb, listingType: "swap" })).toMatchObject({ ok: false, errors: { listingType: "invalid" } });
    expect(parseListingInput(null).ok).toBe(false);
  });
});
