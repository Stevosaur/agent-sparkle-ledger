import { describe, expect, it } from "vitest";
import { svy21ToWgs84 } from "./svy21";

describe("SVY21 -> WGS84 (research test vectors)", () => {
  it("maps the false origin to the projection origin", () => {
    const p = svy21ToWgs84(38744.572, 28001.642);
    expect(p.lat).toBeCloseTo(1.3666666667, 8);
    expect(p.lng).toBeCloseTo(103.8333333333, 8);
  });
  it("matches 570 Ang Mo Kio Ave 10", () => {
    const p = svy21ToWgs84(39105.269, 30629.967);
    expect(p.lat).toBeCloseTo(1.3699285644, 8);
    expect(p.lng).toBeCloseTo(103.8569506831, 8);
  });
  it("matches the LIVIA fixture", () => {
    const p = svy21ToWgs84(39055.1, 40560.2);
    expect(p.lat).toBeCloseTo(1.369472298, 8);
    expect(p.lng).toBeCloseTo(103.9461807234, 8);
  });
});
