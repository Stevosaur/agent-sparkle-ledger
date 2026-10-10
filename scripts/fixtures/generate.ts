/**
 * Deterministic SYNTHETIC dataset for tests and local development (never deployed).
 * Writes tests/fixtures/data/ (or the directory given as argv[2]) using the same build stage as the
 * real pipeline, so the app is exercised against exactly the production file format.
 * Every value here is made up; meta.fixture = true makes the app show a "sample data" banner.
 */
import path from "node:path";
import { buildSnapshot } from "../ingest/build";
import { hdbGeoKey, type Geocode, type RawHdbBlockInfo, type RawHdbRental, type RawHdbSale, type RawLaunch, type RawPrivateRental, type RawPrivateSale, type SnapshotInput } from "../ingest/types";
import type { MrtStation, RatesSnapshot, School } from "../../src/lib/data/types";
import { monthLabel, monthIndex } from "../../src/lib/data/months";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261010);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);

const LATEST = monthIndex("2026-08");

const mrtStations: MrtStation[] = [
  { name: "TAMPINES", codes: ["EW2", "DT32"], lines: ["EWL", "DTL"], status: "operational", expectedYear: null, approximate: false, lat: 1.3546, lng: 103.9453 },
  { name: "TAMPINES WEST", codes: ["DT31"], lines: ["DTL"], status: "operational", expectedYear: null, approximate: false, lat: 1.3456, lng: 103.9384 },
  { name: "BISHAN", codes: ["NS17", "CC15"], lines: ["NSL", "CCL"], status: "operational", expectedYear: null, approximate: false, lat: 1.3511, lng: 103.8485 },
  { name: "PUNGGOL", codes: ["NE17", "PTC"], lines: ["NEL", "PGLRT"], status: "operational", expectedYear: null, approximate: false, lat: 1.4052, lng: 103.9024 },
  { name: "RAFFLES PLACE", codes: ["NS26", "EW14"], lines: ["NSL", "EWL"], status: "operational", expectedYear: null, approximate: false, lat: 1.2839, lng: 103.8514 },
  { name: "BUKIT TIMAH FIXTURE", codes: ["DT6"], lines: ["DTL"], status: "operational", expectedYear: null, approximate: false, lat: 1.3264, lng: 103.8073 },
  { name: "FIXTURE FUTURE", codes: ["CR9"], lines: ["CRL"], status: "future", expectedYear: 2030, approximate: true, lat: 1.3500, lng: 103.9400 },
];

const schools: School[] = [
  { name: "FIXTURE PRIMARY SCHOOL", level: "PRIMARY", address: "1 FIXTURE ROAD", postal: "529999", zone: "EAST", type: "GOVERNMENT SCHOOL", lat: 1.3530, lng: 103.9420 },
  { name: "SAMPLE PRIMARY SCHOOL", level: "PRIMARY", address: "2 SAMPLE ROAD", postal: "579999", zone: "SOUTH", type: "GOVERNMENT-AIDED SCH", lat: 1.3500, lng: 103.8470 },
  { name: "FIXTURE SECONDARY SCHOOL", level: "SECONDARY", address: "3 FIXTURE ROAD", postal: "529998", zone: "EAST", type: "GOVERNMENT SCHOOL", lat: 1.3480, lng: 103.9390 },
];

interface BlockSpec {
  town: string;
  block: string;
  street: string;
  roadName: string;
  postal: string;
  lat: number;
  lng: number;
  leaseYear: number;
  base4: number; // base 4-room price in 2015
}
const blocks: BlockSpec[] = [
  { town: "TAMPINES", block: "872A", street: "TAMPINES ST 86", roadName: "TAMPINES STREET 86", postal: "521872", lat: 1.3555, lng: 103.9390, leaseYear: 2015, base4: 430_000 },
  { town: "TAMPINES", block: "201", street: "TAMPINES ST 21", roadName: "TAMPINES STREET 21", postal: "520201", lat: 1.3570, lng: 103.9470, leaseYear: 1984, base4: 380_000 },
  { town: "TAMPINES", block: "455", street: "TAMPINES ST 42", roadName: "TAMPINES STREET 42", postal: "520455", lat: 1.3590, lng: 103.9550, leaseYear: 1987, base4: 395_000 },
  { town: "BISHAN", block: "123", street: "BISHAN ST 12", roadName: "BISHAN STREET 12", postal: "570123", lat: 1.3490, lng: 103.8500, leaseYear: 1987, base4: 520_000 },
  { town: "BISHAN", block: "275B", street: "BISHAN ST 24", roadName: "BISHAN STREET 24", postal: "572275", lat: 1.3560, lng: 103.8460, leaseYear: 2012, base4: 640_000 },
  { town: "PUNGGOL", block: "618A", street: "PUNGGOL DR", roadName: "PUNGGOL DRIVE", postal: "821618", lat: 1.4040, lng: 103.9060, leaseYear: 2016, base4: 450_000 },
  { town: "PUNGGOL", block: "301", street: "PUNGGOL CTRL", roadName: "PUNGGOL CENTRAL", postal: "820301", lat: 1.4010, lng: 103.9020, leaseYear: 2003, base4: 400_000 },
];

const FLAT_SPECS: { type: string; sqm: number; mult: number; model: string }[] = [
  { type: "3 ROOM", sqm: 67, mult: 0.75, model: "Model A" },
  { type: "4 ROOM", sqm: 93, mult: 1, model: "Model A" },
  { type: "5 ROOM", sqm: 112, mult: 1.22, model: "Improved" },
];
const STOREYS = ["01 TO 03", "04 TO 06", "07 TO 09", "10 TO 12", "13 TO 15"];

const hdbSales: RawHdbSale[] = [];
const hdbBlockInfo: RawHdbBlockInfo[] = [];
const hdbRentals: RawHdbRental[] = [];
const hdbGeocodes = new Map<string, Geocode>();

for (const b of blocks) {
  hdbGeocodes.set(hdbGeoKey(b.block, b.street), { lat: b.lat, lng: b.lng, postal: b.postal, roadName: b.roadName });
  hdbBlockInfo.push({
    block: b.block,
    street: b.street,
    town: b.town,
    maxFloor: 15,
    yearCompleted: b.leaseYear,
    residential: true,
    commercial: b.block === "201",
    marketHawker: false,
    miscellaneous: false,
    multistoreyCarpark: b.leaseYear > 2010,
    precinctPavilion: true,
    totalDwellingUnits: 120,
    unitMix: { "3 ROOM": 30, "4 ROOM": 60, "5 ROOM": 30 },
  });
  const firstMonth = Math.max(monthIndex("2015-01"), (b.leaseYear + 5 - 1990) * 12);
  for (let m = firstMonth; m <= LATEST; m++) {
    if (rand() > 0.35) continue;
    const spec = pick(FLAT_SPECS);
    const storey = pick(STOREYS);
    const years = (m - monthIndex("2015-01")) / 12;
    const growth = Math.pow(1.035, years);
    const storeyPremium = 1 + STOREYS.indexOf(storey) * 0.015;
    const price = Math.round((b.base4 * spec.mult * growth * storeyPremium * between(0.95, 1.05)) / 1000) * 1000;
    const leaseStart = (b.leaseYear - 1990) * 12 + 6;
    hdbSales.push({
      month: monthLabel(m),
      town: b.town,
      flatType: spec.type,
      block: b.block,
      street: b.street,
      storeyRange: storey,
      floorAreaSqm: spec.sqm + Math.round(between(-2, 2)),
      flatModel: spec.model,
      leaseCommenceYear: b.leaseYear,
      remainingLeaseMonths: m >= monthIndex("2017-01") ? 99 * 12 - (m - leaseStart) : null,
      price,
    });
  }
  for (let m = monthIndex("2021-01"); m <= LATEST; m++) {
    if (rand() > 0.3) continue;
    const spec = pick(FLAT_SPECS);
    hdbRentals.push({ month: monthLabel(m), town: b.town, block: b.block, street: b.street, flatType: spec.type, monthlyRent: Math.round((2400 * spec.mult * between(0.9, 1.25)) / 50) * 50 });
  }
}

// a block with property information but no resale record yet (new completion)
hdbBlockInfo.push({
  block: "999",
  street: "TAMPINES ST 99",
  town: "TAMPINES",
  maxFloor: 18,
  yearCompleted: 2024,
  residential: true,
  commercial: false,
  marketHawker: false,
  miscellaneous: false,
  multistoreyCarpark: true,
  precinctPavilion: false,
  totalDwellingUnits: 150,
  unitMix: { "4 ROOM": 100, "5 ROOM": 50 },
});
hdbGeocodes.set(hdbGeoKey("999", "TAMPINES ST 99"), { lat: 1.3520, lng: 103.9410, postal: "529099", roadName: "TAMPINES STREET 99" });

/* ------------------------------ private ------------------------------ */

interface ProjectSpec {
  project: string;
  street: string;
  district: number;
  segment: "CCR" | "RCR" | "OCR";
  propertyType: string;
  tenure: string;
  lat: number;
  lng: number;
  basePsf: number;
  sizes: number[];
}
const projectsSpec: ProjectSpec[] = [
  { project: "AURORA FIXTURE RESIDENCES", street: "FIXTURE ROAD", district: 18, segment: "OCR", propertyType: "Condominium", tenure: "99 yrs lease commencing from 2012", lat: 1.3540, lng: 103.9440, basePsf: 1050, sizes: [56, 75, 95, 120] },
  { project: "SAMPLE PARK CONDO", street: "SAMPLE AVENUE", district: 20, segment: "RCR", propertyType: "Apartment", tenure: "Freehold", lat: 1.3520, lng: 103.8480, basePsf: 1500, sizes: [48, 70, 105] },
  { project: "THE FIXTURE EC", street: "PUNGGOL FIXTURE WAY", district: 19, segment: "OCR", propertyType: "Executive Condominium", tenure: "99 yrs lease commencing from 2018", lat: 1.4030, lng: 103.9040, basePsf: 980, sizes: [85, 100, 115] },
];

const privateSales: RawPrivateSale[] = [];
const privateRentals: RawPrivateRental[] = [];
const FLOORS = ["01-05", "06-10", "11-15", "16-20"];
for (const p of projectsSpec) {
  for (let m = monthIndex("2021-09"); m <= LATEST; m++) {
    if (rand() > 0.55) continue;
    const sqm = pick(p.sizes);
    const floor = pick(FLOORS);
    const years = (m - monthIndex("2021-09")) / 12;
    const psf = p.basePsf * Math.pow(1.04, years) * (1 + FLOORS.indexOf(floor) * 0.02) * between(0.95, 1.05);
    privateSales.push({
      project: p.project,
      street: p.street,
      district: p.district,
      marketSegment: p.segment,
      propertyType: p.propertyType,
      tenure: p.tenure,
      month: monthLabel(m),
      areaSqm: sqm,
      floorRange: floor,
      typeOfSale: m < monthIndex("2022-06") && p.propertyType === "Executive Condominium" ? 1 : 3,
      typeOfArea: "Strata",
      noOfUnits: 1,
      price: Math.round((psf * sqm * 10.7639) / 1000) * 1000,
      lat: p.lat,
      lng: p.lng,
    });
    if (rand() < 0.6) {
      const lo = Math.floor(sqm / 10) * 10;
      privateRentals.push({ project: p.project, street: p.street, district: p.district, propertyType: "Non-landed Properties", month: monthLabel(m), monthlyRent: Math.round((p.basePsf * sqm * 0.0037) / 50) * 50, areaSqmLow: lo, areaSqmHigh: lo + 10, bedrooms: sqm < 60 ? 1 : sqm < 90 ? 2 : 3, lat: p.lat, lng: p.lng });
    }
  }
}

// landed: generic project name on two streets, unit-level address on one of them
const landed: { street: string; houses: string[]; type: string; district: number; lat: number; lng: number; tenure: string }[] = [
  { street: "SAMPLE LANE", houses: ["13", "15", "17A"], type: "Terrace", district: 15, lat: 1.3080, lng: 103.9050, tenure: "Freehold" },
  { street: "FIXTURE CRESCENT", houses: ["2", "4"], type: "Semi-detached", district: 19, lat: 1.3600, lng: 103.8800, tenure: "999 yrs lease commencing from 1885" },
];
for (const l of landed) {
  for (let m = monthIndex("2021-09"); m <= LATEST; m += 3) {
    if (rand() > 0.5) continue;
    const house = pick(l.houses);
    const land = l.type === "Terrace" ? 160 : 280;
    privateSales.push({
      project: "LANDED HOUSING DEVELOPMENT",
      street: l.street,
      district: l.district,
      marketSegment: "OCR",
      propertyType: l.type,
      tenure: l.tenure,
      month: monthLabel(m),
      areaSqm: land,
      floorRange: "-",
      typeOfSale: 3,
      typeOfArea: "Land",
      noOfUnits: 1,
      price: Math.round((land * 10.7639 * between(1700, 2000)) / 10_000) * 10_000,
      lat: l.lat,
      lng: l.lng,
      address: `${house} ${l.street}`,
      unit: null,
    });
  }
}

const launches: RawLaunch[] = [
  {
    project: "AURORA FIXTURE RESIDENCES",
    street: "FIXTURE ROAD",
    district: 18,
    marketSegment: "OCR",
    developer: "FIXTURE DEVELOPMENT PTE LTD",
    propertyType: "Condominium",
    totalUnits: 400,
    expectedCompletionYear: 2028,
    tenure: "99 yrs lease commencing from 2024",
    status: "launched",
    lat: 1.3540,
    lng: 103.9440,
    months: [
      { month: "2026-06", launchedInMonth: 200, soldInMonth: 150, launchedToDate: 200, soldToDate: 150, medianPsf: 2100, lowestPsf: 1900, highestPsf: 2400 },
      { month: "2026-07", launchedInMonth: 0, soldInMonth: 30, launchedToDate: 200, soldToDate: 180, medianPsf: 2120, lowestPsf: 1950, highestPsf: 2380 },
      { month: "2026-08", launchedInMonth: 100, soldInMonth: 60, launchedToDate: 300, soldToDate: 240, medianPsf: 2150, lowestPsf: 1980, highestPsf: 2450 },
    ],
  },
  {
    project: "UPCOMING FIXTURE TOWERS",
    street: "SAMPLE AVENUE",
    district: 20,
    marketSegment: "RCR",
    developer: "SAMPLE HOLDINGS PTE LTD",
    propertyType: "Condominium",
    totalUnits: 650,
    expectedCompletionYear: 2030,
    tenure: "99 yrs lease commencing from 2026",
    status: "upcoming",
    lat: 1.3505,
    lng: 103.8490,
    months: [],
  },
];

const rates: RatesSnapshot = {
  asOf: "2026-09-30",
  sora: {
    overnight: { value: 1.5, date: "2026-09-30" },
    compounded1m: { value: 1.6, date: "2026-09-30" },
    compounded3m: { value: 1.7, date: "2026-09-30" },
    compounded6m: { value: 1.8, date: "2026-09-30" },
    series3m: [
      { value: 2.0, date: "2026-06-30" },
      { value: 1.9, date: "2026-07-31" },
      { value: 1.8, date: "2026-08-31" },
      { value: 1.7, date: "2026-09-30" },
    ],
    source: "FIXTURE",
  },
  hdbConcessionaryRate: { value: 2.6, date: "2026-07-01", source: "FIXTURE" },
  cpfOaRate: { value: 2.5, date: "2026-07-01", source: "FIXTURE" },
};

const input: SnapshotInput = {
  generatedAt: "2026-09-01T00:00:00.000Z",
  fixture: true,
  sources: [
    { id: "fixture", name: "Synthetic fixture data", publisher: "Test suite", url: "", licence: "n/a", status: "ok", fetchedAt: "2026-09-01T00:00:00.000Z", latestPeriod: "2026-08", rows: hdbSales.length + privateSales.length },
  ],
  hdbSales,
  hdbBlockInfo,
  hdbRentals,
  hdbGeocodes,
  privateSales,
  privateRentals,
  launches,
  mrtStations,
  schools,
  rates,
};

const outDir = path.resolve(process.argv[2] ?? path.join(__dirname, "../../tests/fixtures/data"));
const { meta } = buildSnapshot(input, outDir);
console.log(`fixture snapshot written to ${outDir}`);
console.log(JSON.stringify(meta.counts));
