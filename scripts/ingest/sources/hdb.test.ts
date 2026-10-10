import { describe, expect, it } from "vitest";
import { normaliseFlatModel, normaliseFlatType, normaliseTown, parsePropertyInfo, parseRemainingLeaseMonths, parseRentals, parseResaleEra, RESALE_ERAS } from "./hdb";

describe("HDB normalisation", () => {
  it("normalises flat types across datasets", () => {
    expect(normaliseFlatType("MULTI GENERATION")).toBe("MULTI-GENERATION");
    expect(normaliseFlatType("4-ROOM")).toBe("4 ROOM");
    expect(normaliseFlatType("4 ROOM")).toBe("4 ROOM");
    expect(normaliseFlatType("executive")).toBe("EXECUTIVE");
  });
  it("normalises flat models across eras", () => {
    expect(normaliseFlatModel("IMPROVED")).toBe("Improved");
    expect(normaliseFlatModel("New Generation")).toBe("New Generation");
    expect(normaliseFlatModel("NEW GENERATION")).toBe("New Generation");
    expect(normaliseFlatModel("DBSS")).toBe("DBSS");
    expect(normaliseFlatModel("TYPE S1")).toBe("Type S1");
    expect(normaliseFlatModel("Model A2")).toBe("Model A2");
    expect(normaliseFlatModel("3GEN")).toBe("3Gen");
    expect(normaliseFlatModel("2-ROOM")).toBe("2-Room");
    expect(normaliseFlatModel("MODEL A-MAISONETTE")).toBe("Model A-Maisonette");
  });
  it("parses remaining lease formats", () => {
    expect(parseRemainingLeaseMonths("70")).toBe(840);
    expect(parseRemainingLeaseMonths("61 years 04 months")).toBe(736);
    expect(parseRemainingLeaseMonths("62 years")).toBe(744);
    expect(parseRemainingLeaseMonths("")).toBeNull();
  });
  it("maps rental town variants", () => {
    expect(normaliseTown("CENTRAL")).toBe("CENTRAL AREA");
  });
});

describe("HDB parsers", () => {
  it("parses the 2017+ resale format and drops out-of-era rows", () => {
    const csv = `month,town,flat_type,block,street_name,storey_range,floor_area_sqm,flat_model,lease_commence_date,remaining_lease,resale_price
2017-01,ANG MO KIO,2 ROOM,406,ANG MO KIO AVE 10,10 TO 12,44,Improved,1979,61 years 04 months,232000
2016-12,ANG MO KIO,2 ROOM,406,ANG MO KIO AVE 10,10 TO 12,44,Improved,1979,61 years 05 months,230000
2017-02,ANG MO KIO,MULTI GENERATION,1,ANG MO KIO AVE 1,01 TO 03,160,Multi Generation,1987,69 years,780000`;
    const { sales, report } = parseResaleEra(csv, RESALE_ERAS[4]);
    expect(report.rows).toBe(3);
    expect(sales).toHaveLength(2);
    expect(sales[0]).toMatchObject({ month: "2017-01", block: "406", street: "ANG MO KIO AVE 10", storeyRange: "10 TO 12", floorAreaSqm: 44, leaseCommenceYear: 1979, remainingLeaseMonths: 736, price: 232000, flatModel: "Improved" });
    expect(sales[1].flatType).toBe("MULTI-GENERATION");
    expect(report.dropped["outside-era"]).toBe(1);
  });
  it("parses the 1990s format without remaining lease", () => {
    const csv = `month,town,flat_type,block,street_name,storey_range,floor_area_sqm,flat_model,lease_commence_date,resale_price
1990-01,ANG MO KIO,1 ROOM,309,ANG MO KIO AVE 1,10 TO 12,31,IMPROVED,1977,9000`;
    const { sales } = parseResaleEra(csv, RESALE_ERAS[0]);
    expect(sales[0]).toMatchObject({ remainingLeaseMonths: null, flatModel: "Improved", price: 9000 });
  });
  it("parses property information with digit-first columns", () => {
    const csv = `blk_no,street,max_floor_lvl,year_completed,residential,commercial,market_hawker,miscellaneous,multistorey_carpark,precinct_pavilion,bldg_contract_town,total_dwelling_units,1room_sold,2room_sold,3room_sold,4room_sold,5room_sold,exec_sold,multigen_sold,studio_apartment_sold,1room_rental,2room_rental,3room_rental,other_room_rental
1,BEACH RD,16,1970,Y,Y,N,N,N,N,KWN,142,0,1,138,1,2,0,0,0,0,0,0,0`;
    const [b] = parsePropertyInfo(csv);
    expect(b).toMatchObject({ block: "1", street: "BEACH RD", town: "KALLANG/WHAMPOA", yearCompleted: 1970, residential: true, commercial: true, totalDwellingUnits: 142 });
    expect(b.unitMix).toEqual({ "2 ROOM": 1, "3 ROOM": 138, "4 ROOM": 1, "5 ROOM": 2 });
  });
  it("parses rentals with hyphenated flat types", () => {
    const csv = `rent_approval_date,town,block,street_name,flat_type,monthly_rent
2021-06,TOA PAYOH,10,JOO SENG RD,5-ROOM,2200`;
    const { rentals } = parseRentals(csv);
    expect(rentals[0]).toEqual({ month: "2021-06", town: "TOA PAYOH", block: "10", street: "JOO SENG RD", flatType: "5 ROOM", monthlyRent: 2200 });
  });
});
