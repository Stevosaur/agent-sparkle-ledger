/**
 * Solar position (NOAA / Meeus simplified algorithm), accurate to well under a degree — enough for
 * "which facades get afternoon sun" on a property page. Angles in degrees; azimuth measured clockwise from north.
 */
export function sunPosition(date: Date, lat: number, lng: number): { azimuth: number; altitude: number } {
  const rad = Math.PI / 180;
  const jd = date.getTime() / 86_400_000 + 2_440_587.5;
  const n = jd - 2_451_545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const epsilon = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lst = (gmst * 15 + lng) * rad;
  const ha = lst - ra;
  const phi = lat * rad;
  const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const azimuth = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha));
  return { azimuth: ((azimuth / rad) % 360 + 360) % 360, altitude: altitude / rad };
}

/** Sun positions through one day (Singapore time, UTC+8) at `stepMinutes` intervals, daylight only. */
export function sunPathForDay(year: number, month: number, day: number, lat: number, lng: number, stepMinutes = 30): { time: string; azimuth: number; altitude: number }[] {
  const out: { time: string; azimuth: number; altitude: number }[] = [];
  for (let mins = 6 * 60; mins <= 20 * 60; mins += stepMinutes) {
    const utc = Date.UTC(year, month - 1, day, 0, mins) - 8 * 3_600_000;
    const p = sunPosition(new Date(utc), lat, lng);
    if (p.altitude > 0) out.push({ time: `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`, ...p });
  }
  return out;
}

/** Compass label for an azimuth, e.g. 250 -> "WSW". */
export function compass(azimuth: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round((((azimuth % 360) + 360) % 360) / 22.5) % 16];
}
