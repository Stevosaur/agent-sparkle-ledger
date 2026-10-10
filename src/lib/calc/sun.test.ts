import { describe, expect, it } from "vitest";
import { compass, sunPathForDay, sunPosition } from "./sun";

const SG = { lat: 1.3521, lng: 103.8198 };
const sgt = (y: number, m: number, d: number, minutes: number) => new Date(Date.UTC(y, m - 1, d, 0, minutes) - 8 * 3_600_000);

/** Highest altitude in a day (1-minute steps between 11:00 and 15:00 SGT) and when / where it occurs. */
function transit(y: number, m: number, d: number) {
  let best = { altitude: -90, azimuth: 0, minutes: 0 };
  for (let min = 11 * 60; min <= 15 * 60; min++) {
    const p = sunPosition(sgt(y, m, d, min), SG.lat, SG.lng);
    if (p.altitude > best.altitude) best = { ...p, minutes: min };
  }
  return best;
}

/**
 * Independent cross-check: NOAA "General Solar Position Calculations" (Spencer's Fourier series for declination and
 * the equation of time). Accurate to roughly 0.1–0.4°, i.e. coarser than the module's algorithm.
 */
function noaaGeneral(date: Date, lat: number, lng: number) {
  const y = date.getUTCFullYear();
  const leap = new Date(Date.UTC(y, 1, 29)).getUTCMonth() === 1;
  const doy = Math.floor((Date.UTC(y, date.getUTCMonth(), date.getUTCDate()) - Date.UTC(y, 0, 1)) / 86_400_000) + 1;
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
  const g = ((2 * Math.PI) / (leap ? 366 : 365)) * (doy - 1 + (hour - 12) / 24);
  const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = ((hour * 60 + eot + 4 * lng) / 4 - 180) * (Math.PI / 180);
  const phi = (lat * Math.PI) / 180;
  const altitude = 90 - (Math.acos(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha)) * 180) / Math.PI;
  const azimuth = ((Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) * 180) / Math.PI + 540) % 360;
  return { altitude, azimuth, eot };
}

describe("sun position (Singapore)", () => {
  it("March equinox: solar-noon altitude ≈ 88.5° (90 − 1.35° latitude − 0.16° declination), sun just south, ~13:12 SGT", () => {
    // 20 Mar 2026 ~05:12 UTC is ~9.5 h before the equinox instant, so the declination is ≈ −0.16°
    const t = transit(2026, 3, 20);
    expect(t.altitude).toBeGreaterThan(88.3);
    expect(t.altitude).toBeLessThan(88.7);
    expect(t.azimuth).toBeGreaterThan(170);
    expect(t.azimuth).toBeLessThan(190);
  });

  it("June solstice: noon altitude ≈ 90 − (23.44 − 1.35) = 67.9°, sun to the north", () => {
    const t = transit(2026, 6, 21);
    expect(t.altitude).toBeCloseTo(90 - (23.44 - SG.lat), 0);
    expect(Math.min(t.azimuth, 360 - t.azimuth)).toBeLessThan(1);
  });

  it("December solstice: noon altitude ≈ 90 − (23.44 + 1.35) = 65.2°, sun to the south", () => {
    const t = transit(2026, 12, 21);
    expect(t.altitude).toBeCloseTo(90 - (23.44 + SG.lat), 0);
    expect(Math.abs(t.azimuth - 180)).toBeLessThan(1);
  });

  it("solar noon matches 12:00 + 4 min × (120° − longitude) − equation of time, within 3 minutes", () => {
    for (const [m, d] of [
      [2, 11],
      [3, 20],
      [7, 26],
      [11, 3],
    ]) {
      const t = transit(2026, m, d);
      const eot = noaaGeneral(sgt(2026, m, d, 13 * 60), SG.lat, SG.lng).eot;
      const expected = 12 * 60 + 4 * (120 - SG.lng) - eot;
      expect(Math.abs(t.minutes - expected)).toBeLessThanOrEqual(3);
    }
  });

  it("agrees with the NOAA general formulas away from the zenith", () => {
    for (const iso of ["2026-06-21T05:00:00Z", "2026-12-21T04:50:00Z", "2026-10-10T02:00:00Z", "2026-10-10T09:00:00Z", "2024-02-29T23:30:00Z", "1999-07-01T03:00:00Z"]) {
      const d = new Date(iso);
      const a = sunPosition(d, SG.lat, SG.lng);
      const b = noaaGeneral(d, SG.lat, SG.lng);
      expect(Math.abs(a.altitude - b.altitude), iso).toBeLessThan(0.25);
      const dAz = Math.abs(((a.azimuth - b.azimuth + 540) % 360) - 180);
      expect(dAz, iso).toBeLessThan(0.8);
    }
  });

  it("day path: daylight only, rising in the east around 07:00–07:30 and setting in the west around 19:00 SGT", () => {
    const path = sunPathForDay(2026, 3, 20, SG.lat, SG.lng, 30);
    expect(path.every((p) => p.altitude > 0)).toBe(true);
    expect(path[0].time).toBe("07:30");
    expect(Math.abs(path[0].azimuth - 90)).toBeLessThan(2);
    expect(path[path.length - 1].time).toBe("19:00");
    expect(Math.abs(path[path.length - 1].azimuth - 270)).toBeLessThan(2);
  });

  it("compass labels", () => {
    expect(compass(0)).toBe("N");
    expect(compass(359)).toBe("N");
    expect(compass(90)).toBe("E");
    expect(compass(250)).toBe("WSW");
    expect(compass(-90)).toBe("W");
  });
});
