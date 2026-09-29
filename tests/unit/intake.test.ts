import { describe, expect, it } from "vitest";
import { parseCatchMessage } from "@/lib/domain/intake-parser";
import { catalogueDictionary } from "@/lib/domain/species-catalogue";
import { matchSpecies } from "@/lib/domain/species-match";

const species = catalogueDictionary();
const vendors = [{ vendorId: "v-ah-seng", name: "Ah Seng Fishing", aliases: ["Ah Seng"] }];

describe("catch intake parser", () => {
  it("parses the definition-of-done message", () => {
    const r = parseCatchMessage("Tonight 65kg batang, around 600-800g, asking 8.80. Boat reach 1.30.", { species, vendors, senderVendorId: "v-ah-seng" });
    expect(r.etaLocal).toBe("01:30");
    expect(r.vendor?.vendorId).toBe("v-ah-seng");
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ speciesCode: "SPM", quantityKg: 65, sizeMinKg: 0.6, sizeMaxKg: 0.8, askingPricePerKg: 8.8, currency: "SGD" });
    expect(r.ambiguousFields).toEqual([]);
  });

  it("parses multi-species declarations and ties the price to the named species", () => {
    const r = parseCatchMessage("Boat arriving 1.30am. Today got 80kg batang around 700g, 45kg ang go li, 30kg squid. Batang asking 8.80.", { species });
    expect(r.lines.map((l) => [l.speciesCode, l.quantityKg])).toEqual([["SPM", 80], ["GSN", 45], ["SQD", 30]]);
    expect(r.lines[0].askingPricePerKg).toBe(8.8);
    expect(r.lines[1].askingPricePerKg).toBeNull();
    expect(r.lines[0].sizeMinKg).toBeCloseTo(0.595, 3);
  });

  it("detects vendor by name, estimates, and conditional prices", () => {
    const r = parseCatchMessage("Ah Seng boat tonight 2am maybe 60kg batang 600-800g and 20kg prawns. Batang $9 if take all.", { species, vendors });
    expect(r.vendor?.name).toBe("Ah Seng Fishing");
    expect(r.etaLocal).toBe("02:00");
    expect(r.lines[0]).toMatchObject({ speciesCode: "SPM", quantityKg: 60, quantityIsEstimate: true, askingPricePerKg: 9 });
    expect(r.lines[0].priceCondition).toMatch(/takes the full quantity/);
    expect(r.lines[1]).toMatchObject({ speciesCode: "PRW", quantityKg: 20 });
  });

  it("never reads a price as an ETA and flags ambiguity only on missing fields", () => {
    const r = parseCatchMessage("40kg seabass asking 9.20", { species });
    expect(r.etaLocal).toBeNull();
    expect(r.lines[0].askingPricePerKg).toBe(9.2);
    expect(r.ambiguousFields).toContain("eta");
    expect(r.ambiguousFields).not.toContain("species");
  });

  it("handles Chinese names, kati and ringgit", () => {
    const r = parseCatchMessage("马鲛鱼 50 kati RM 38/kg 3点到", { species });
    expect(r.lines[0].speciesCode).toBe("SPM");
    expect(r.lines[0].quantityKg).toBeCloseTo(30.24, 2);
    expect(r.lines[0].currency).toBe("MYR");
    expect(r.etaLocal).toBe("03:00");
  });
});

describe("species normalisation", () => {
  it.each([
    ["batang", "SPM"], ["Spanish mackerel", "SPM"], ["马鲛鱼", "SPM"], ["ma jiao", "SPM"], ["ang go li", "GSN"], ["golden snapper", "GSN"],
    ["prawns", "PRW"], ["sea bass", "BAR"], ["ngoh her", "THF"], ["sotong", "SQD"],
  ])("%s → %s", (input, code) => {
    const r = matchSpecies(input, species);
    expect(r.best?.code).toBe(code);
    expect(r.needsConfirmation).toBe(false);
  });

  it("treats a generic name like 'mackerel' as ambiguous and returns alternatives", () => {
    const r = matchSpecies("mackerel", species);
    expect(r.needsConfirmation).toBe(true);
    expect([r.best?.code, ...r.alternatives.map((a) => a.code)]).toEqual(expect.arrayContaining(["SPM", "IMK"]));
  });
});
