import { describe, expect, it } from "vitest";
import { formatAxis, formatValue, monthTickCount } from "./format";

describe("chart formatters", () => {
  it("keeps close percentage ticks distinct", () => {
    const ticks = [3.05, 3.1, 3.15, 3.2].map((v) => formatAxis(v, "pctRaw"));
    expect(ticks).toEqual(["3.05%", "3.10%", "3.15%", "3.20%"]);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(formatValue(3.456, "pctRaw")).toBe("3.46%");
  });

  it("gives short month axes one tick per month and long ones at most five", () => {
    expect(monthTickCount(400, 400)).toBe(2);
    expect(monthTickCount(400, 401)).toBe(2);
    expect(monthTickCount(400, 402)).toBe(3);
    expect(monthTickCount(400, 403)).toBe(4);
    expect(monthTickCount(400, 459)).toBe(5);
    expect(monthTickCount(Infinity, -Infinity)).toBe(5);
  });
});
