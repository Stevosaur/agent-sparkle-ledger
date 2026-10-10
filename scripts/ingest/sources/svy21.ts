// SVY21 (EPSG:3414) -> WGS84. Port of cgcai/SVY21 (MIT, LINZ TM formulae), exact origin 1°22'N 103°50'E.
// See docs/research/ura-api.md §3 (verified against proj4 to < 0.2 mm across Singapore).
const a = 6378137;
const f = 1 / 298.257223563;
const ORIGIN_LAT = 1 + 22 / 60;
const ORIGIN_LON = 103 + 50 / 60;
const FALSE_N = 38744.572;
const FALSE_E = 28001.642;
const K = 1;
const b = a * (1 - f);
const e2 = 2 * f - f * f;
const e4 = e2 * e2;
const e6 = e4 * e2;
const A0 = 1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256;
const A2 = (3 / 8) * (e2 + e4 / 4 + (15 * e6) / 128);
const A4 = (15 / 256) * (e4 + (3 * e6) / 4);
const A6 = (35 * e6) / 3072;
const n = (a - b) / (a + b);
const n2 = n * n;
const n3 = n2 * n;
const n4 = n2 * n2;
const G = a * (1 - n) * (1 - n2) * (1 + (9 * n2) / 4 + (225 * n4) / 64) * (Math.PI / 180);
const meridian = (latDeg: number) => {
  const r = (latDeg * Math.PI) / 180;
  return a * (A0 * r - A2 * Math.sin(2 * r) + A4 * Math.sin(4 * r) - A6 * Math.sin(6 * r));
};
const M0 = meridian(ORIGIN_LAT);

/** URA: northing = y, easting = x. */
export function svy21ToWgs84(northing: number, easting: number): { lat: number; lng: number } {
  const Mp = M0 + (northing - FALSE_N) / K;
  const sigma = (Mp * Math.PI) / (180 * G);
  const latP =
    sigma +
    ((3 * n) / 2 - (27 * n3) / 32) * Math.sin(2 * sigma) +
    ((21 * n2) / 16 - (55 * n4) / 32) * Math.sin(4 * sigma) +
    ((151 * n3) / 96) * Math.sin(6 * sigma) +
    ((1097 * n4) / 512) * Math.sin(8 * sigma);
  const s2 = Math.sin(latP) ** 2;
  const rho = (a * (1 - e2)) / Math.pow(1 - e2 * s2, 1.5);
  const v = a / Math.sqrt(1 - e2 * s2);
  const psi = v / rho;
  const psi2 = psi * psi;
  const psi3 = psi2 * psi;
  const psi4 = psi3 * psi;
  const t = Math.tan(latP);
  const t2 = t * t;
  const t4 = t2 * t2;
  const t6 = t4 * t2;
  const Ep = easting - FALSE_E;
  const x = Ep / (K * v);
  const x3 = x ** 3;
  const x5 = x ** 5;
  const x7 = x ** 7;
  const lf = t / (K * rho);
  const lat =
    latP -
    lf * ((Ep * x) / 2) +
    lf * ((Ep * x3) / 24) * (-4 * psi2 + 9 * psi * (1 - t2) + 12 * t2) -
    lf * ((Ep * x5) / 720) * (8 * psi4 * (11 - 24 * t2) - 12 * psi3 * (21 - 71 * t2) + 15 * psi2 * (15 - 98 * t2 + 15 * t4) + 180 * psi * (5 * t2 - 3 * t4) + 360 * t4) +
    lf * ((Ep * x7) / 40320) * (1385 - 3633 * t2 + 4095 * t4 + 1575 * t6);
  const sec = 1 / Math.cos(lat);
  const lon =
    (ORIGIN_LON * Math.PI) / 180 +
    x * sec -
    ((x3 * sec) / 6) * (psi + 2 * t2) +
    ((x5 * sec) / 120) * (-4 * psi3 * (1 - 6 * t2) + psi2 * (9 - 68 * t2) + 72 * psi * t2 + 24 * t4) -
    ((x7 * sec) / 5040) * (61 + 662 * t2 + 1320 * t4 + 720 * t6);
  return { lat: (lat * 180) / Math.PI, lng: (lon * 180) / Math.PI };
}
