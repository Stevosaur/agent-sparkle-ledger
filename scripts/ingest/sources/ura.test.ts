import { describe, expect, it } from "vitest";
import { buildLaunches, parseDeveloperSales, parseRentals, parseTransactions } from "./ura";

describe("URA parsers", () => {
  it("parses transactions (research fixture)", () => {
    const rows = parseTransactions([
      { project: "LIVIA", street: "PASIR RIS GROVE", marketSegment: "OCR", x: "40560.2", y: "39055.1", transaction: [{ area: "143", floorRange: "11-15", noOfUnits: "1", contractDate: "0726", typeOfSale: "3", price: "2268888", propertyType: "Condominium", district: "18", typeOfArea: "Strata", tenure: "99 yrs lease commencing from 2008" }] },
      { project: "LANDED HOUSING DEVELOPMENT", street: "NEO PEE TECK LANE", marketSegment: "RCR", transaction: [{ area: "257", floorRange: "-", noOfUnits: "1", contractDate: "0522", typeOfSale: "1", price: "4600000", propertyType: "Terrace", district: "05", typeOfArea: "Land", tenure: "Freehold" }] },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ project: "LIVIA", month: "2026-07", areaSqm: 143, price: 2268888, district: 18, marketSegment: "OCR", typeOfSale: 3, typeOfArea: "Strata", floorRange: "11-15" });
    expect(rows[0].lat).toBeCloseTo(1.36947, 4);
    expect(rows[1]).toMatchObject({ month: "2022-05", typeOfArea: "Land", lat: null, lng: null, district: 5 });
  });
  it("parses rentals using the sqft band", () => {
    const rows = parseRentals([{ project: "LIVIA", street: "PASIR RIS GROVE", x: "40560.2", y: "39055.1", rental: [{ areaSqm: "140-150", leaseDate: "0726", propertyType: "Non-landed Properties", district: "18", areaSqft: "1500-1600", noOfBedRoom: "4", rent: 5500 }] }]);
    expect(rows[0]).toMatchObject({ month: "2026-07", monthlyRent: 5500, bedrooms: 4, areaSqmLow: 139, areaSqmHigh: 149, district: 18 });
  });
  it("merges developer sales into launches", () => {
    const dev = [
      ...parseDeveloperSales([{ project: "NEW ONE", street: "SOME RD", district: "19", marketSegment: "OCR", developer: "DEV PTE LTD", developerSales: [{ launchedToDate: 100, soldToDate: 60, unitsAvail: 400, launchedInMonth: 100, soldInMonth: 60, medianPrice: 2100, lowestPrice: 1900, highestPrice: 2400 }] }], "0826"),
      ...parseDeveloperSales([{ project: "NEW ONE", street: "SOME RD", district: "19", marketSegment: "OCR", developer: "DEV PTE LTD", developerSales: [{ launchedToDate: 100, soldToDate: 80, unitsAvail: 400, launchedInMonth: 0, soldInMonth: 20, medianPrice: 2150, lowestPrice: 1950, highestPrice: 2450 }] }], "0926"),
    ];
    const launches = buildLaunches(dev, [{ project: "NEW ONE", street: "SOME RD", district: 19, marketSegment: null, developer: null, propertyType: null, totalUnits: 400, expectedCompletionYear: 2029, tenure: null, status: "upcoming", months: [], lat: null, lng: null }]);
    expect(launches).toHaveLength(1);
    expect(launches[0]).toMatchObject({ status: "launched", totalUnits: 400, expectedCompletionYear: 2029, developer: "DEV PTE LTD" });
    expect(launches[0].months.map((m) => m.month)).toEqual(["2026-08", "2026-09"]);
  });
});
