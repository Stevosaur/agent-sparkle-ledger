/**
 * Starter species master for new organisations and the demo workspace.
 *
 * PRODUCT ASSUMPTION: names reflect common Singapore/Malaysia market usage gathered for operational
 * matching only. This is NOT a legally authoritative taxonomy — scientific names are indicative and
 * organisations can correct mappings in Settings → Species Master.
 */
export type CatalogueSpecies = {
  code: string;
  canonicalName: string;
  chineseName?: string;
  malayName?: string;
  localNames: string[];
  aliases: { text: string; language: "EN" | "ZH" | "MS" | "HOKKIEN" | "TEOCHEW" | "CANTONESE" | "PINYIN" | "OTHER" }[];
  scientificName?: string;
  category: "FISH" | "CRUSTACEAN" | "MOLLUSC" | "CEPHALOPOD" | "OTHER";
  sizeKg: [number, number];
  yieldPct: number;
  storage: "CHILLED" | "FROZEN" | "LIVE";
  freshnessHours: number;
  substitutes: string[];
  /** Indicative cost band used only by the demo seed. Never shown as market data. */
  demoCost: [number, number];
  markupPct: number;
};

export const SPECIES_CATALOGUE: CatalogueSpecies[] = [
  {
    code: "SPM", canonicalName: "Spanish mackerel", chineseName: "马鲛鱼", malayName: "Ikan tenggiri", localNames: ["batang"],
    aliases: [{ text: "batang", language: "OTHER" }, { text: "tenggiri", language: "MS" }, { text: "ma jiao", language: "PINYIN" }, { text: "ma jiao yu", language: "PINYIN" }, { text: "马鲛", language: "ZH" }, { text: "batang fish", language: "EN" }, { text: "narrow-barred spanish mackerel", language: "EN" }],
    scientificName: "Scomberomorus commerson", category: "FISH", sizeKg: [0.5, 5], yieldPct: 62, storage: "CHILLED", freshnessHours: 48,
    substitutes: ["THF", "WHR"], demoCost: [8.2, 9.4], markupPct: 24,
  },
  {
    code: "THF", canonicalName: "Threadfin", chineseName: "午鱼", malayName: "Ikan kurau", localNames: ["ngoh her"],
    aliases: [{ text: "ngoh her", language: "TEOCHEW" }, { text: "ngor her", language: "TEOCHEW" }, { text: "kurau", language: "MS" }, { text: "wu yu", language: "PINYIN" }, { text: "fourfinger threadfin", language: "EN" }, { text: "threadfin salmon", language: "EN" }],
    scientificName: "Eleutheronema tetradactylum", category: "FISH", sizeKg: [0.6, 3], yieldPct: 58, storage: "CHILLED", freshnessHours: 48,
    substitutes: ["GSN", "BAR"], demoCost: [11.0, 12.8], markupPct: 26,
  },
  {
    code: "RSN", canonicalName: "Red snapper", chineseName: "红鲷鱼", malayName: "Ikan merah", localNames: ["ang sai"],
    aliases: [{ text: "ikan merah", language: "MS" }, { text: "merah", language: "MS" }, { text: "malabar snapper", language: "EN" }, { text: "红鱼", language: "ZH" }],
    scientificName: "Lutjanus malabaricus", category: "FISH", sizeKg: [0.8, 4], yieldPct: 55, storage: "CHILLED", freshnessHours: 60,
    substitutes: ["GSN", "GRP"], demoCost: [10.5, 12.0], markupPct: 25,
  },
  {
    code: "GSN", canonicalName: "Golden snapper", chineseName: "红哥鲤", malayName: "Ikan jenahak", localNames: ["ang go li"],
    aliases: [{ text: "ang go li", language: "HOKKIEN" }, { text: "ang goli", language: "HOKKIEN" }, { text: "ang koli", language: "HOKKIEN" }, { text: "jenahak", language: "MS" }, { text: "john's snapper", language: "EN" }],
    scientificName: "Lutjanus johnii", category: "FISH", sizeKg: [0.6, 3], yieldPct: 55, storage: "CHILLED", freshnessHours: 60,
    substitutes: ["RSN", "THF"], demoCost: [9.4, 10.8], markupPct: 25,
  },
  {
    code: "POM", canonicalName: "Silver pomfret", chineseName: "白鲳", malayName: "Ikan bawal putih", localNames: ["white pomfret"],
    aliases: [{ text: "pomfret", language: "EN" }, { text: "bawal putih", language: "MS" }, { text: "bai chang", language: "PINYIN" }, { text: "pek chio", language: "TEOCHEW" }],
    scientificName: "Pampus argenteus", category: "FISH", sizeKg: [0.2, 0.8], yieldPct: 70, storage: "CHILLED", freshnessHours: 48,
    substitutes: ["BPM"], demoCost: [18.0, 24.0], markupPct: 28,
  },
  {
    code: "BPM", canonicalName: "Black pomfret", chineseName: "黑鲳", malayName: "Ikan bawal hitam", localNames: [],
    aliases: [{ text: "bawal hitam", language: "MS" }, { text: "hei chang", language: "PINYIN" }],
    scientificName: "Parastromateus niger", category: "FISH", sizeKg: [0.3, 1.2], yieldPct: 68, storage: "CHILLED", freshnessHours: 48,
    substitutes: ["POM"], demoCost: [9.0, 11.0], markupPct: 25,
  },
  {
    code: "BAR", canonicalName: "Barramundi (Asian sea bass)", chineseName: "金目鲈", malayName: "Ikan siakap", localNames: ["sea bass", "kim bak lo"],
    aliases: [{ text: "seabass", language: "EN" }, { text: "sea bass", language: "EN" }, { text: "barramundi", language: "EN" }, { text: "siakap", language: "MS" }, { text: "kim bak lo", language: "HOKKIEN" }, { text: "jin mu lu", language: "PINYIN" }, { text: "asian sea bass", language: "EN" }],
    scientificName: "Lates calcarifer", category: "FISH", sizeKg: [0.5, 3], yieldPct: 50, storage: "CHILLED", freshnessHours: 72,
    substitutes: ["GRP", "TIL"], demoCost: [8.4, 9.6], markupPct: 22,
  },
  {
    code: "GRP", canonicalName: "Grouper (hybrid)", chineseName: "石斑鱼", malayName: "Ikan kerapu", localNames: ["sek pan"],
    aliases: [{ text: "grouper", language: "EN" }, { text: "kerapu", language: "MS" }, { text: "garoupa", language: "EN" }, { text: "sek pan", language: "CANTONESE" }, { text: "shi ban", language: "PINYIN" }, { text: "石斑", language: "ZH" }, { text: "tiger grouper", language: "EN" }],
    scientificName: "Epinephelus spp.", category: "FISH", sizeKg: [0.6, 3], yieldPct: 48, storage: "LIVE", freshnessHours: 72,
    substitutes: ["BAR", "RSN"], demoCost: [16.0, 20.0], markupPct: 26,
  },
  {
    code: "IMK", canonicalName: "Indian mackerel", chineseName: "羽鳃鲐", malayName: "Ikan kembung", localNames: ["kembung"],
    aliases: [{ text: "kembung", language: "MS" }, { text: "ikan kembung", language: "MS" }, { text: "chubb mackerel", language: "EN" }],
    scientificName: "Rastrelliger kanagurta", category: "FISH", sizeKg: [0.08, 0.2], yieldPct: 65, storage: "CHILLED", freshnessHours: 36,
    substitutes: ["YTS"], demoCost: [4.2, 5.4], markupPct: 30,
  },
  {
    code: "STR", canonicalName: "Stingray", chineseName: "魔鬼鱼", malayName: "Ikan pari", localNames: ["pari"],
    aliases: [{ text: "pari", language: "MS" }, { text: "ikan pari", language: "MS" }, { text: "sting ray", language: "EN" }, { text: "mo gui yu", language: "PINYIN" }],
    scientificName: "Dasyatidae (various)", category: "FISH", sizeKg: [1, 8], yieldPct: 55, storage: "CHILLED", freshnessHours: 36,
    substitutes: [], demoCost: [7.0, 8.5], markupPct: 30,
  },
  {
    code: "SQD", canonicalName: "Squid", chineseName: "鱿鱼", malayName: "Sotong", localNames: ["sotong"],
    aliases: [{ text: "sotong", language: "MS" }, { text: "calamari", language: "EN" }, { text: "you yu", language: "PINYIN" }, { text: "sotong besar", language: "MS" }],
    scientificName: "Loliginidae (various)", category: "CEPHALOPOD", sizeKg: [0.1, 0.5], yieldPct: 75, storage: "CHILLED", freshnessHours: 36,
    substitutes: [], demoCost: [9.0, 11.5], markupPct: 25,
  },
  {
    code: "PRW", canonicalName: "White prawn", chineseName: "白虾", malayName: "Udang putih", localNames: ["prawns"],
    aliases: [{ text: "prawn", language: "EN" }, { text: "udang", language: "MS" }, { text: "vannamei", language: "EN" }, { text: "white shrimp", language: "EN" }, { text: "虾", language: "ZH" }, { text: "hei", language: "CANTONESE" }],
    scientificName: "Penaeus vannamei", category: "CRUSTACEAN", sizeKg: [0.015, 0.04], yieldPct: 60, storage: "CHILLED", freshnessHours: 36,
    substitutes: ["TPR"], demoCost: [11.0, 13.5], markupPct: 22,
  },
  {
    code: "TPR", canonicalName: "Tiger prawn", chineseName: "老虎虾", malayName: "Udang harimau", localNames: [],
    aliases: [{ text: "tiger prawn", language: "EN" }, { text: "black tiger", language: "EN" }, { text: "udang harimau", language: "MS" }, { text: "lao hu xia", language: "PINYIN" }],
    scientificName: "Penaeus monodon", category: "CRUSTACEAN", sizeKg: [0.03, 0.08], yieldPct: 60, storage: "CHILLED", freshnessHours: 36,
    substitutes: ["PRW"], demoCost: [22.0, 28.0], markupPct: 22,
  },
  {
    code: "FCR", canonicalName: "Flower crab", chineseName: "花蟹", malayName: "Ketam renjong", localNames: [],
    aliases: [{ text: "blue swimmer crab", language: "EN" }, { text: "ketam renjong", language: "MS" }, { text: "hua xie", language: "PINYIN" }, { text: "renjong", language: "MS" }],
    scientificName: "Portunus pelagicus", category: "CRUSTACEAN", sizeKg: [0.15, 0.4], yieldPct: 35, storage: "CHILLED", freshnessHours: 24,
    substitutes: ["MCR"], demoCost: [14.0, 17.0], markupPct: 25,
  },
  {
    code: "MCR", canonicalName: "Mud crab", chineseName: "青蟹", malayName: "Ketam bakau", localNames: ["sri lankan crab"],
    aliases: [{ text: "mud crab", language: "EN" }, { text: "ketam bakau", language: "MS" }, { text: "sri lanka crab", language: "EN" }, { text: "qing xie", language: "PINYIN" }],
    scientificName: "Scylla serrata", category: "CRUSTACEAN", sizeKg: [0.4, 1.5], yieldPct: 35, storage: "LIVE", freshnessHours: 72,
    substitutes: ["FCR"], demoCost: [32.0, 42.0], markupPct: 25,
  },
  {
    code: "YTS", canonicalName: "Yellowstripe scad", chineseName: "黄带鲹", malayName: "Ikan selar kuning", localNames: ["selar"],
    aliases: [{ text: "selar", language: "MS" }, { text: "selar kuning", language: "MS" }, { text: "yellowtail scad", language: "EN" }],
    scientificName: "Selaroides leptolepis", category: "FISH", sizeKg: [0.05, 0.15], yieldPct: 65, storage: "CHILLED", freshnessHours: 30,
    substitutes: ["IMK"], demoCost: [3.8, 4.8], markupPct: 32,
  },
  {
    code: "WHR", canonicalName: "Wolf herring", chineseName: "西刀鱼", malayName: "Ikan parang", localNames: ["parang"],
    aliases: [{ text: "parang", language: "MS" }, { text: "ikan parang", language: "MS" }, { text: "dorab", language: "EN" }],
    scientificName: "Chirocentrus dorab", category: "FISH", sizeKg: [0.5, 2], yieldPct: 55, storage: "CHILLED", freshnessHours: 36,
    substitutes: ["SPM"], demoCost: [6.0, 7.2], markupPct: 28,
  },
  {
    code: "TIL", canonicalName: "Red tilapia", chineseName: "红非洲鱼", malayName: "Ikan tilapia merah", localNames: [],
    aliases: [{ text: "tilapia", language: "EN" }, { text: "red tilapia", language: "EN" }, { text: "fei zhou yu", language: "PINYIN" }],
    scientificName: "Oreochromis spp.", category: "FISH", sizeKg: [0.4, 1], yieldPct: 45, storage: "CHILLED", freshnessHours: 60,
    substitutes: ["BAR"], demoCost: [5.0, 6.2], markupPct: 30,
  },
  {
    code: "SAL", canonicalName: "Atlantic salmon", chineseName: "三文鱼", malayName: "Ikan salmon", localNames: [],
    aliases: [{ text: "salmon", language: "EN" }, { text: "norway salmon", language: "EN" }, { text: "san wen yu", language: "PINYIN" }],
    scientificName: "Salmo salar", category: "FISH", sizeKg: [3, 6], yieldPct: 60, storage: "CHILLED", freshnessHours: 120,
    substitutes: [], demoCost: [17.0, 21.0], markupPct: 20,
  },
  {
    code: "MUS", canonicalName: "Green mussel", chineseName: "青口", malayName: "Kupang hijau", localNames: [],
    aliases: [{ text: "mussel", language: "EN" }, { text: "mussels", language: "EN" }, { text: "kupang", language: "MS" }, { text: "qing kou", language: "PINYIN" }],
    scientificName: "Perna viridis", category: "MOLLUSC", sizeKg: [0.02, 0.06], yieldPct: 30, storage: "LIVE", freshnessHours: 48,
    substitutes: ["CLM"], demoCost: [4.5, 6.0], markupPct: 30,
  },
  {
    code: "CLM", canonicalName: "Lala clam", chineseName: "啦啦", malayName: "Lala", localNames: ["lala"],
    aliases: [{ text: "lala", language: "MS" }, { text: "clam", language: "EN" }, { text: "clams", language: "EN" }],
    scientificName: "Meretrix spp.", category: "MOLLUSC", sizeKg: [0.01, 0.03], yieldPct: 30, storage: "LIVE", freshnessHours: 48,
    substitutes: ["MUS"], demoCost: [4.0, 5.5], markupPct: 32,
  },
  {
    code: "HTL", canonicalName: "Hairtail (ribbonfish)", chineseName: "带鱼", malayName: "Ikan selayur", localNames: ["ribbon fish"],
    aliases: [{ text: "selayur", language: "MS" }, { text: "ribbonfish", language: "EN" }, { text: "hairtail", language: "EN" }, { text: "dai yu", language: "PINYIN" }],
    scientificName: "Trichiurus lepturus", category: "FISH", sizeKg: [0.2, 1], yieldPct: 60, storage: "CHILLED", freshnessHours: 36,
    substitutes: ["WHR"], demoCost: [5.5, 7.0], markupPct: 28,
  },
];

/** Build a matcher dictionary directly from the catalogue (used by tests and the seed). */
export function catalogueDictionary(idFor: (code: string) => string = (c) => c) {
  return SPECIES_CATALOGUE.map((s) => ({
    speciesId: idFor(s.code),
    code: s.code,
    canonicalName: s.canonicalName,
    names: [
      { text: s.canonicalName, kind: "CANONICAL" as const },
      ...(s.chineseName ? [{ text: s.chineseName, kind: "CHINESE" as const }] : []),
      ...(s.malayName ? [{ text: s.malayName, kind: "MALAY" as const }] : []),
      ...s.localNames.map((t) => ({ text: t, kind: "LOCAL" as const })),
      ...s.aliases.map((a) => ({ text: a.text, kind: "ALIAS" as const })),
      ...(s.scientificName ? [{ text: s.scientificName, kind: "SCIENTIFIC" as const }] : []),
    ],
  }));
}
