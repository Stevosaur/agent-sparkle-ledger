import { describe, expect, it } from "vitest";
import { floorBand, parseRealisCsv, parseSaleMonth } from "./realis";

describe("REALIS-style import", () => {
  it("parses common date formats", () => {
    expect(parseSaleMonth("15 Mar 2024")).toBe("2024-03");
    expect(parseSaleMonth("2024-03-15")).toBe("2024-03");
    expect(parseSaleMonth("Mar-24")).toBe("2024-03");
    expect(parseSaleMonth("15/03/2024")).toBe("2024-03");
  });
  it("derives URA-style floor bands from unit numbers", () => {
    expect(floorBand("#05-12")).toBe("01-05");
    expect(floorBand("#06-01")).toBe("06-10");
    expect(floorBand(null)).toBe("-");
  });
  it("parses unit-level condo and landed rows", () => {
    const csv = `Project Name,Transacted Price ($),Area (SQFT),Sale Date,Address,Type of Sale,Type of Area,Property Type,Tenure,Postal District,Number of Units
THE HILLFORD,1000000,1001,15 Mar 2024,10 JALAN JURONG KECHIL #05-12,Resale,Strata,Apartment,60 yrs lease commencing from 2013,21,1
LANDED HOUSING DEVELOPMENT,4000000,2000,01 Feb 2023,13 HAIG LANE,Resale,Land,Terrace,Freehold,15,1`;
    const rows = parseRealisCsv(csv);
    expect(rows[0]).toMatchObject({ project: "THE HILLFORD", unit: "#05-12", floorRange: "01-05", address: null, street: "JALAN JURONG KECHIL", typeOfSale: 3, district: 21 });
    expect(rows[0].areaSqm).toBeCloseTo(1001 / 10.764, 3);
    expect(rows[1]).toMatchObject({ address: "13 HAIG LANE", street: "HAIG LANE", typeOfArea: "Land", unit: null, floorRange: "-" });
  });
});
