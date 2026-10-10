import { describe, expect, it } from "vitest";
import { addCalendarMonths, addCalendarYears, compareDays, dayNumber, formatDay, toSgDay } from "./dates";

describe("Singapore calendar days", () => {
  it("YYYY-MM-DD strings are taken as written; invalid days are rejected", () => {
    expect(toSgDay("2025-07-04")).toEqual({ y: 2025, m: 7, d: 4 });
    expect(toSgDay("2025-02-29")).toBeNull();
    expect(toSgDay("2024-02-29")).toEqual({ y: 2024, m: 2, d: 29 });
    expect(toSgDay("nonsense")).toBeNull();
    expect(toSgDay(new Date(Number.NaN))).toBeNull();
  });

  it("Dates are read in Singapore time (UTC+8)", () => {
    expect(toSgDay(new Date("2025-07-03T16:00:00Z"))).toEqual({ y: 2025, m: 7, d: 4 }); // 00:00 SGT
    expect(toSgDay(new Date("2025-07-03T15:59:59Z"))).toEqual({ y: 2025, m: 7, d: 3 });
    expect(toSgDay(new Date("2025-07-04"))).toEqual({ y: 2025, m: 7, d: 4 }); // UTC midnight = 08:00 SGT
    expect(toSgDay("2025-07-04T00:00:00+08:00")).toEqual({ y: 2025, m: 7, d: 4 });
  });

  it("calendar arithmetic clamps to month ends", () => {
    expect(addCalendarYears({ y: 2028, m: 2, d: 29 }, 1)).toEqual({ y: 2029, m: 2, d: 28 });
    expect(addCalendarYears({ y: 2028, m: 2, d: 29 }, 4)).toEqual({ y: 2032, m: 2, d: 29 });
    expect(addCalendarMonths({ y: 2026, m: 1, d: 31 }, 1)).toEqual({ y: 2026, m: 2, d: 28 });
    expect(addCalendarMonths({ y: 2026, m: 11, d: 30 }, 3)).toEqual({ y: 2027, m: 2, d: 28 });
    expect(addCalendarMonths({ y: 2026, m: 3, d: 15 }, -3)).toEqual({ y: 2025, m: 12, d: 15 });
  });

  it("ordering and formatting", () => {
    expect(dayNumber({ y: 1970, m: 1, d: 2 })).toBe(1);
    // agrees with Date.UTC wherever Date.UTC is unambiguous (years ≥ 100)
    for (const [y, m, d] of [[2025, 7, 4], [2000, 2, 29], [1900, 3, 1], [2100, 12, 31], [1601, 1, 1]]) {
      expect(dayNumber({ y, m, d })).toBe(Date.UTC(y, m - 1, d) / 86_400_000);
    }
    // years 0–99 are real years (Date.UTC would map them to 1900–1999)
    expect(dayNumber({ y: 0, m: 1, d: 1 })).toBe(-719_528);
    expect(dayNumber({ y: 99, m: 12, d: 31 }) - dayNumber({ y: 0, m: 1, d: 1 })).toBe(36_524);
    expect(compareDays({ y: 2025, m: 7, d: 4 }, { y: 2025, m: 7, d: 3 })).toBe(1);
    expect(formatDay({ y: 2025, m: 7, d: 4 })).toBe("2025-07-04");
  });
});
