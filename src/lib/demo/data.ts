/**
 * DEMO DATA — every organisation, person, vessel, farm, licence and document below is fictional.
 * Public landmarks (Jurong Fishery Port, Tiong Bahru Market, etc.) are used only as delivery locations;
 * the customers at those locations are invented and do not represent real businesses.
 */
export const DEMO_PASSWORD = "pasarcatch-demo";

export const DEMO_USERS = [
  { email: "owner@demo.pasarcatch.sg", name: "Demo Owner", role: "OWNER", title: "Managing Director" },
  { email: "procurement@demo.pasarcatch.sg", name: "Lim Wei", role: "PROCUREMENT", title: "Procurement Manager" },
  { email: "ops@demo.pasarcatch.sg", name: "Nur Aisyah", role: "OPERATIONS", title: "Night Operations Lead" },
  { email: "finance@demo.pasarcatch.sg", name: "Priya Raman", role: "FINANCE", title: "Finance Manager" },
  { email: "compliance@demo.pasarcatch.sg", name: "Daniel Koh", role: "ADMIN", title: "Compliance & Admin" },
  { email: "supplier@demo.pasarcatch.sg", name: "Ah Seng (supplier)", role: "SUPPLIER", title: "Skipper, Hai Seng 88", vendorCode: "V-AHSENG" },
  { email: "buyer@demo.pasarcatch.sg", name: "Tiong Bahru stall (buyer)", role: "BUYER", title: "Fishmonger", customerCode: "C-TBM" },
] as const;

export type DemoVendor = {
  code: string;
  name: string;
  type: "FISHING_VESSEL" | "AQUACULTURE_FARM" | "FOREIGN_FISHERY" | "IMPORTER" | "WHOLESALER" | "PROCESSOR" | "LOGISTICS_PROVIDER";
  country: string;
  region: string;
  whatsapp: string;
  contact: string;
  tier: "PREFERRED" | "STANDARD" | "PROBATION";
  gst: boolean;
  terms: number;
  distanceKm: number;
  species: string[];
  vessel?: { name: string; reg: string; port: string; gear: string; flag: string };
  farm?: { name: string; type: "SEA_CAGE" | "LAND_BASED_RAS" | "POND" | "OTHER"; location: string };
  /** Behavioural profile used only to generate plausible demo history. */
  profile: { fill: number; fillSd: number; lateMin: number; gradeA: number; priceBias: number };
};

export const DEMO_VENDORS: DemoVendor[] = [
  { code: "V-AHSENG", name: "Ah Seng Fishing", type: "FISHING_VESSEL", country: "SG", region: "Singapore Strait", whatsapp: "+6580000101", contact: "Ah Seng", tier: "PREFERRED", gst: false, terms: 7, distanceKm: 0.5, species: ["SPM", "PRW", "SQD", "WHR"], vessel: { name: "Hai Seng 88", reg: "DEMO-SG-FV-088", port: "Jurong Fishery Port", gear: "Drift gillnet", flag: "SG" }, profile: { fill: 0.97, fillSd: 0.03, lateMin: 10, gradeA: 0.75, priceBias: 0 } },
  { code: "V-KIMHOCK", name: "Kim Hock Marine", type: "FISHING_VESSEL", country: "SG", region: "South China Sea (Anambas)", whatsapp: "+6580000102", contact: "Uncle Kim", tier: "STANDARD", gst: true, terms: 14, distanceKm: 0.5, species: ["SPM", "RSN", "GSN", "STR", "HTL"], vessel: { name: "Kim Hock 3", reg: "DEMO-SG-FV-003", port: "Jurong Fishery Port", gear: "Trawl", flag: "SG" }, profile: { fill: 0.92, fillSd: 0.04, lateMin: 25, gradeA: 0.6, priceBias: -0.02 } },
  { code: "V-SENGHUAT", name: "Seng Huat Fisheries", type: "FISHING_VESSEL", country: "SG", region: "Singapore Strait", whatsapp: "+6580000103", contact: "Ah Huat", tier: "STANDARD", gst: false, terms: 7, distanceKm: 0.5, species: ["THF", "POM", "IMK", "YTS", "SQD"], vessel: { name: "Seng Huat 21", reg: "DEMO-SG-FV-021", port: "Senoko Fishery Port", gear: "Hook and line", flag: "SG" }, profile: { fill: 0.95, fillSd: 0.03, lateMin: 15, gradeA: 0.7, priceBias: 0.01 } },
  { code: "V-NELAYAN", name: "Nelayan Jaya Johor", type: "FOREIGN_FISHERY", country: "MY", region: "Johor, Malaysia", whatsapp: "+60120000104", contact: "Encik Rahman", tier: "STANDARD", gst: false, terms: 7, distanceKm: 32, species: ["SPM", "IMK", "SQD", "FCR", "STR"], vessel: { name: "Nelayan Jaya 7", reg: "DEMO-MY-JHR-0007", port: "Tanjung Pengelih", gear: "Gillnet", flag: "MY" }, profile: { fill: 0.9, fillSd: 0.05, lateMin: 40, gradeA: 0.55, priceBias: -0.05 } },
  { code: "V-BATAM", name: "Laut Segar Batam", type: "FOREIGN_FISHERY", country: "ID", region: "Batam, Riau Islands", whatsapp: "+62810000105", contact: "Pak Budi", tier: "PROBATION", gst: false, terms: 3, distanceKm: 28, species: ["GRP", "RSN", "FCR", "MCR", "PRW"], vessel: { name: "Laut Segar 2", reg: "DEMO-ID-BTM-0002", port: "Batam", gear: "Trap", flag: "ID" }, profile: { fill: 0.86, fillSd: 0.06, lateMin: 55, gradeA: 0.45, priceBias: -0.07 } },
  { code: "V-STRAITSBLUE", name: "Straits Blue Aquaculture", type: "AQUACULTURE_FARM", country: "SG", region: "East Johor Strait (sea cages)", whatsapp: "+6580000106", contact: "Farm office", tier: "PREFERRED", gst: true, terms: 30, distanceKm: 38, species: ["BAR", "GRP", "MUS"], farm: { name: "Straits Blue Cage Farm", type: "SEA_CAGE", location: "Off Changi, Singapore" }, profile: { fill: 0.99, fillSd: 0.01, lateMin: 5, gradeA: 0.9, priceBias: 0.03 } },
  { code: "V-LCKPRAWN", name: "Kranji Prawn Farm", type: "AQUACULTURE_FARM", country: "SG", region: "Lim Chu Kang agri-food area", whatsapp: "+6580000107", contact: "Farm manager", tier: "PREFERRED", gst: true, terms: 30, distanceKm: 22, species: ["PRW", "TPR"], farm: { name: "Kranji RAS Prawn Farm", type: "LAND_BASED_RAS", location: "Lim Chu Kang, Singapore" }, profile: { fill: 0.99, fillSd: 0.01, lateMin: 5, gradeA: 0.88, priceBias: 0.04 } },
  { code: "V-JSCAGE", name: "Johor Strait Cage Farm", type: "AQUACULTURE_FARM", country: "MY", region: "Pasir Gudang, Johor", whatsapp: "+60120000108", contact: "Mr Tan", tier: "STANDARD", gst: false, terms: 14, distanceKm: 45, species: ["BAR", "TIL", "RSN"], farm: { name: "JS Cage Farm", type: "SEA_CAGE", location: "Pasir Gudang, Johor" }, profile: { fill: 0.96, fillSd: 0.02, lateMin: 30, gradeA: 0.7, priceBias: -0.04 } },
  { code: "V-RIAUGRP", name: "Riau Grouper Farm", type: "AQUACULTURE_FARM", country: "ID", region: "Bintan, Riau Islands", whatsapp: "+62810000109", contact: "Ibu Sari", tier: "STANDARD", gst: false, terms: 7, distanceKm: 55, species: ["GRP", "MCR"], farm: { name: "Bintan Grouper Cages", type: "SEA_CAGE", location: "Bintan, Indonesia" }, profile: { fill: 0.94, fillSd: 0.03, lateMin: 35, gradeA: 0.65, priceBias: -0.06 } },
  { code: "V-NORDIC", name: "Nordic Ocean Imports", type: "IMPORTER", country: "SG", region: "Imports from Norway", whatsapp: "+6580000110", contact: "Sales desk", tier: "PREFERRED", gst: true, terms: 30, distanceKm: 18, species: ["SAL"], profile: { fill: 1, fillSd: 0.005, lateMin: 0, gradeA: 0.95, priceBias: 0.02 } },
  { code: "V-ANDAMAN", name: "Andaman Sea Trading", type: "IMPORTER", country: "SG", region: "Imports from Myanmar & Thailand", whatsapp: "+6580000111", contact: "Ms Ong", tier: "STANDARD", gst: true, terms: 14, distanceKm: 12, species: ["POM", "BPM", "THF", "HTL"], profile: { fill: 0.97, fillSd: 0.02, lateMin: 20, gradeA: 0.6, priceBias: 0 } },
  { code: "V-OCEANHV", name: "Ocean Harvest Imports", type: "IMPORTER", country: "SG", region: "Imports from Malaysia & India", whatsapp: "+6580000112", contact: "Mr Siva", tier: "STANDARD", gst: true, terms: 14, distanceKm: 9, species: ["THF", "SQD", "CLM", "GSN"], profile: { fill: 0.95, fillSd: 0.03, lateMin: 20, gradeA: 0.62, priceBias: 0.05 } },
  { code: "V-LEEBROS", name: "Lee Brothers JFP Merchant", type: "WHOLESALER", country: "SG", region: "Jurong Fishery Port", whatsapp: "+6580000113", contact: "Lee Jr", tier: "STANDARD", gst: true, terms: 7, distanceKm: 0.2, species: ["SPM", "THF", "POM", "RSN"], profile: { fill: 0.98, fillSd: 0.02, lateMin: 5, gradeA: 0.65, priceBias: 0.08 } },
  { code: "V-CLEANCATCH", name: "CleanCatch Processing", type: "PROCESSOR", country: "SG", region: "Jurong", whatsapp: "+6580000114", contact: "Plant supervisor", tier: "STANDARD", gst: true, terms: 30, distanceKm: 3, species: [], profile: { fill: 1, fillSd: 0, lateMin: 0, gradeA: 0.8, priceBias: 0 } },
  { code: "V-COLDLINK", name: "ColdLink Logistics", type: "LOGISTICS_PROVIDER", country: "SG", region: "Island-wide", whatsapp: "+6580000115", contact: "Dispatch", tier: "STANDARD", gst: true, terms: 30, distanceKm: 0, species: [], profile: { fill: 1, fillSd: 0, lateMin: 0, gradeA: 0.8, priceBias: 0 } },
];

export type DemoCustomer = {
  code: string;
  name: string;
  type: "WET_MARKET_STALL" | "RESTAURANT" | "HOTEL" | "SUPERMARKET" | "HAWKER" | "CATERER" | "FISHMONGER";
  tier: number;
  address: string;
  postal: string;
  lat: number;
  lng: number;
  window: [string, string];
  terms: number;
  phone: string;
  /** Typical kg per delivery for each species (weekday baseline). */
  basket: Record<string, number>;
  weekendFactor: number;
};

export const DEMO_CUSTOMERS: DemoCustomer[] = [
  { code: "C-TBM", name: "Ah Hock Fresh Fish (Tiong Bahru Market)", type: "WET_MARKET_STALL", tier: 1, address: "Tiong Bahru Market, 30 Seng Poh Rd", postal: "168898", lat: 1.2851, lng: 103.8325, window: ["04:30", "05:45"], terms: 7, phone: "+6581000201", basket: { SPM: 28, THF: 14, POM: 8, SQD: 10, PRW: 12, GSN: 8 }, weekendFactor: 1.35 },
  { code: "C-CCC", name: "Mei Ling Seafood (Chinatown Complex)", type: "WET_MARKET_STALL", tier: 2, address: "Chinatown Complex Market, 335 Smith St", postal: "050335", lat: 1.2826, lng: 103.8430, window: ["04:30", "06:00"], terms: 7, phone: "+6581000202", basket: { SPM: 22, THF: 10, POM: 10, IMK: 12, STR: 8, PRW: 10 }, weekendFactor: 1.3 },
  { code: "C-TEKKA", name: "Rahman & Sons Fishmonger (Tekka Centre)", type: "FISHMONGER", tier: 2, address: "Tekka Centre, 665 Buffalo Rd", postal: "210665", lat: 1.3064, lng: 103.8509, window: ["04:45", "06:00"], terms: 7, phone: "+6581000203", basket: { SPM: 20, IMK: 18, YTS: 14, SQD: 8, WHR: 10, STR: 6 }, weekendFactor: 1.25 },
  { code: "C-GHIM", name: "Ghim Moh Fish Stall 18", type: "WET_MARKET_STALL", tier: 3, address: "Ghim Moh Market, 20 Ghim Moh Rd", postal: "270020", lat: 1.3113, lng: 103.7881, window: ["05:00", "06:15"], terms: 7, phone: "+6581000204", basket: { SPM: 12, THF: 8, IMK: 8, PRW: 8, TIL: 6 }, weekendFactor: 1.3 },
  { code: "C-GSERAI", name: "Serai Seafood Supply (Geylang Serai)", type: "WET_MARKET_STALL", tier: 3, address: "Geylang Serai Market, 1 Geylang Serai", postal: "402001", lat: 1.3170, lng: 103.8980, window: ["05:00", "06:30"], terms: 7, phone: "+6581000205", basket: { IMK: 16, YTS: 12, SQD: 10, STR: 8, FCR: 6 }, weekendFactor: 1.2 },
  { code: "C-HBR", name: "Harbourfront Chinese Restaurant", type: "RESTAURANT", tier: 1, address: "Harbourfront (demo location)", postal: "098585", lat: 1.2650, lng: 103.8210, window: ["06:00", "08:00"], terms: 30, phone: "+6581000206", basket: { GRP: 14, BAR: 10, PRW: 12, MCR: 10, SQD: 6 }, weekendFactor: 1.15 },
  { code: "C-MBHOTEL", name: "Bayfront Hotel Kitchen (demo)", type: "HOTEL", tier: 1, address: "Marina Bay (demo location)", postal: "018956", lat: 1.2830, lng: 103.8600, window: ["05:30", "07:30"], terms: 30, phone: "+6581000207", basket: { SAL: 30, BAR: 14, PRW: 16, TPR: 8, MUS: 10 }, weekendFactor: 1.1 },
  { code: "C-CLEMFS", name: "Clementi Fish Soup (hawker)", type: "HAWKER", tier: 2, address: "Clementi hawker centre (demo)", postal: "120448", lat: 1.3150, lng: 103.7650, window: ["05:00", "06:30"], terms: 7, phone: "+6581000208", basket: { SPM: 18, THF: 12, GSN: 6 }, weekendFactor: 1.05 },
  { code: "C-FMJ", name: "FreshMart Supermarket Jurong (demo)", type: "SUPERMARKET", tier: 2, address: "Jurong East (demo location)", postal: "609690", lat: 1.3330, lng: 103.7430, window: ["05:30", "07:00"], terms: 30, phone: "+6581000209", basket: { SAL: 18, TIL: 14, PRW: 14, BAR: 10, MUS: 8, CLM: 6 }, weekendFactor: 1.2 },
  { code: "C-BEDOK", name: "Bedok Interchange Fish Stall", type: "WET_MARKET_STALL", tier: 3, address: "Bedok (demo location)", postal: "460208", lat: 1.3252, lng: 103.9290, window: ["05:00", "06:30"], terms: 7, phone: "+6581000210", basket: { SPM: 14, POM: 6, SQD: 8, HTL: 8, RSN: 8 }, weekendFactor: 1.3 },
];

export const DEMO_DRIVERS = [
  { name: "Driver Muthu (demo)", phone: "+6582000301", shift: ["03:30", "09:30"] },
  { name: "Driver Hafiz (demo)", phone: "+6582000302", shift: ["03:30", "09:30"] },
  { name: "Driver Chen (demo)", phone: "+6582000303", shift: ["04:00", "10:00"] },
  { name: "Driver Ravi (demo)", phone: "+6582000304", shift: ["04:00", "10:00"] },
];

export const DEMO_VEHICLES = [
  { name: "Reefer 1", plate: "DEMO-1234A", capacityKg: 1500 },
  { name: "Reefer 2", plate: "DEMO-5678B", capacityKg: 1200 },
  { name: "Reefer 3", plate: "DEMO-9012C", capacityKg: 800 },
];

/** Jurong Fishery Port dispatch bay (public location). */
export const JFP = { lat: 1.3036, lng: 103.7194 };
