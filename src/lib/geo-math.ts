/** Pure geometry helpers (no server-only import, safe for scripts, tests and client code). */

export interface Point {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_008.8;

/** Great-circle distance in metres. */
export function haversineM(a: Point, b: Point): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Rough check that a coordinate lies within Singapore's bounding box. */
export function isInSingapore(p: Point): boolean {
  return p.lat > 1.13 && p.lat < 1.48 && p.lng > 103.55 && p.lng < 104.1;
}
