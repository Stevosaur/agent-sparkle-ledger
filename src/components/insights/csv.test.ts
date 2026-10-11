import { describe, expect, it } from "vitest";
import { chartToCsv, csvField, csvFileName, toCsv } from "./csv";

describe("csv", () => {
  it("quotes fields that need it", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvField(null)).toBe("");
    expect(csvField(1.23456789)).toBe("1.234568");
    expect(csvField(Number.NaN)).toBe("");
    expect(toCsv([["a", 1], ["b", null]])).toBe("a,1\r\nb,\r\n");
  });
  it("exports line charts with one row per month", () => {
    const csv = chartToCsv({
      kind: "line",
      yFormat: "sgd",
      ariaLabel: "x",
      series: [
        { name: "A", points: [{ x: 0, y: 1 }, { x: 2, y: 3 }] },
        { name: "B, c", points: [{ x: 1, y: 5 }] },
      ],
    });
    expect(csv).toBe('month,A,"B, c"\r\n1990-01,1,\r\n1990-02,,5\r\n1990-03,3,\r\n');
  });
  it("exports bar charts as label,value", () => {
    expect(chartToCsv({ kind: "bar", yFormat: "int", ariaLabel: "x", data: [{ label: "Tampines", value: 11 }] })).toBe("label,value\r\nTampines,11\r\n");
  });
  it("makes safe file names", () => {
    expect(csvFileName("Median price psf by town")).toBe("median-price-psf-by-town.csv");
    expect(csvFileName("???")).toBe("chart-data.csv");
  });
});
