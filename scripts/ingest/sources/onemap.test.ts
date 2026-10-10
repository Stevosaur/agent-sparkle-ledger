import { describe, expect, it } from "vitest";
import { canonRoad, hdbQueryVariants, matchesHdb, pickHdbMatch, type OneMapResult } from "./onemap";

const r = (o: Partial<OneMapResult>): OneMapResult => ({ SEARCHVAL: "", BLK_NO: "", ROAD_NAME: "NIL", BUILDING: "NIL", ADDRESS: "", POSTAL: "NIL", LATITUDE: "1.37", LONGITUDE: "103.84", ...o });

describe("OneMap HDB matching", () => {
  it("canonicalises roads (research worked checks)", () => {
    expect(canonRoad("ST. GEORGE'S RD")).toBe("ST GEORGES ROAD");
    expect(canonRoad("SAINT GEORGE'S ROAD")).toBe("ST GEORGES ROAD");
    expect(canonRoad("C'WEALTH AVE WEST")).toBe("COMMONWEALTH AVENUE WEST");
    expect(canonRoad("LOR 1A TOA PAYOH")).toBe("LORONG 1A TOA PAYOH");
  });
  it("builds query variants without Blk prefix", () => {
    expect(hdbQueryVariants("123", "ANG MO KIO AVE 6")).toEqual(["123 ANG MO KIO AVENUE 6", "123 ANG MO KIO AVE 6"]);
  });
  it("requires both block and road to match", () => {
    expect(matchesHdb(r({ BLK_NO: "412", ROAD_NAME: "BEDOK NORTH AVENUE 2" }), "412", "C'WEALTH AVE WEST")).toBe(false);
    expect(matchesHdb(r({ BLK_NO: "412", ROAD_NAME: "COMMONWEALTH AVENUE WEST" }), "412", "C'WEALTH AVE WEST")).toBe(true);
  });
  it("prefers the plain address record over tenant POIs", () => {
    const res = [
      r({ SEARCHVAL: "123 ANG MO KIO AVENUE 6 SINGAPORE 560123", BLK_NO: "123", ROAD_NAME: "ANG MO KIO AVENUE 6", ADDRESS: "123 ANG MO KIO AVENUE 6 SINGAPORE 560123", POSTAL: "560123" }),
      r({ SEARCHVAL: "SOME HOME", BLK_NO: "123", ROAD_NAME: "ANG MO KIO AVENUE 6", BUILDING: "SOME HOME", ADDRESS: "123 ANG MO KIO AVENUE 6 SOME HOME", POSTAL: "NIL" }),
    ];
    const { match, ambiguous } = pickHdbMatch(res, "123", "ANG MO KIO AVE 6");
    expect(ambiguous).toBe(false);
    expect(match?.POSTAL).toBe("560123");
  });
  it("flags different postals as ambiguous", () => {
    const res = [r({ BLK_NO: "1", ROAD_NAME: "X ROAD", POSTAL: "111111" }), r({ BLK_NO: "1", ROAD_NAME: "X ROAD", POSTAL: "222222" })];
    expect(pickHdbMatch(res, "1", "X RD").ambiguous).toBe(true);
  });
});
