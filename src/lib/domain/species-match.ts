/**
 * Species normalisation: fuzzy-match messy supplier names ("batang", "马鲛鱼", "ang go li", "prawns")
 * against an organisation's species master and learned aliases.
 *
 * Deterministic and explainable. Returns a ranked list with confidence in [0,1].
 */

export type SpeciesDictionaryEntry = {
  speciesId: string;
  code: string;
  canonicalName: string;
  /** Names this species can be called: canonical, Chinese, Malay, local names, learned aliases. */
  names: { text: string; kind: "CANONICAL" | "CHINESE" | "MALAY" | "LOCAL" | "ALIAS" | "SCIENTIFIC"; learned?: boolean }[];
};

export type SpeciesCandidate = {
  speciesId: string;
  code: string;
  canonicalName: string;
  matchedOn: string;
  method: "EXACT" | "EXACT_COMPACT" | "CJK" | "TOKEN" | "FUZZY";
  confidence: number;
};

export type SpeciesMatchResult = {
  input: string;
  best: SpeciesCandidate | null;
  alternatives: SpeciesCandidate[];
  /** True when the best match is not confident enough to auto-apply without human confirmation. */
  needsConfirmation: boolean;
};

export const CONFIRM_THRESHOLD = 0.8;

const CJK = /[㐀-鿿]/;

export function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9㐀-鿿\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const compact = (s: string) => s.replace(/\s+/g, "");

/** Very light English singularisation for seafood words ("prawns" → "prawn", "fishes" → "fish"). */
function singular(s: string): string {
  return s
    .split(" ")
    .map((w) => (w.length > 4 && w.endsWith("es") && /(sh|ch|ss|x)es$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");
}

/** Jaro-Winkler similarity in [0,1]. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  if (!la || !lb) return 0;
  const range = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const aM = new Array(la).fill(false);
  const bM = new Array(lb).fill(false);
  let matches = 0;
  for (let i = 0; i < la; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(i + range + 1, lb);
    for (let j = lo; j < hi; j++) {
      if (bM[j] || a[i] !== b[j]) continue;
      aM[i] = bM[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < la; i++) {
    if (!aM[i]) continue;
    while (!bM[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const m = matches;
  const jaro = (m / la + m / lb + (m - t / 2) / m) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, la, lb); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

function scoreAgainst(input: string, name: string): { score: number; method: SpeciesCandidate["method"] } {
  const a = normaliseName(input);
  const b = normaliseName(name);
  if (!a || !b) return { score: 0, method: "FUZZY" };
  if (a === b) return { score: 0.98, method: "EXACT" };
  if (singular(a) === singular(b)) return { score: 0.96, method: "EXACT" };
  if (compact(a) === compact(b) || compact(singular(a)) === compact(singular(b))) return { score: 0.95, method: "EXACT_COMPACT" };
  if (CJK.test(a) || CJK.test(b)) {
    // Chinese names: substring containment is strong evidence (e.g. "马鲛" within "马鲛鱼").
    const ca = compact(a);
    const cb = compact(b);
    if (ca.length >= 2 && cb.length >= 2 && (ca.includes(cb) || cb.includes(ca))) return { score: 0.9, method: "CJK" };
    return { score: 0, method: "CJK" };
  }
  const at = singular(a).split(" ");
  const bt = singular(b).split(" ");
  // Generic single-word input contained in a multi-word name ("mackerel" in "spanish mackerel") is ambiguous by nature.
  if (at.length === 1 && bt.length > 1 && bt.includes(at[0])) return { score: 0.62, method: "TOKEN" };
  if (bt.length === 1 && at.length > 1 && at.includes(bt[0]) && bt[0].length >= 5) return { score: 0.8, method: "TOKEN" };
  const jw = jaroWinkler(compact(singular(a)), compact(singular(b)));
  // Penalise very short strings where fuzzy similarity is unreliable.
  const lenPenalty = Math.min(a.length, b.length) < 4 ? 0.15 : 0;
  // Only near-identical spellings ("batangg", "angoli") earn a usable fuzzy score.
  const scaled = jw >= 0.88 ? jw * 0.9 : jw * 0.6;
  return { score: Math.max(0, scaled - lenPenalty), method: "FUZZY" };
}

/**
 * Match one input string against the dictionary. Learned (organisation-confirmed) aliases get a small boost.
 */
export function matchSpecies(input: string, dict: SpeciesDictionaryEntry[], limit = 4): SpeciesMatchResult {
  const perSpecies = new Map<string, SpeciesCandidate>();
  for (const entry of dict) {
    for (const n of entry.names) {
      const { score, method } = scoreAgainst(input, n.text);
      const boosted = Math.min(0.99, score + (n.learned && score >= 0.9 ? 0.01 : 0));
      const prev = perSpecies.get(entry.speciesId);
      if (!prev || boosted > prev.confidence) {
        perSpecies.set(entry.speciesId, {
          speciesId: entry.speciesId,
          code: entry.code,
          canonicalName: entry.canonicalName,
          matchedOn: n.text,
          method,
          confidence: Math.round(boosted * 1000) / 1000,
        });
      }
    }
  }
  const ranked = [...perSpecies.values()].filter((c) => c.confidence >= 0.5).sort((x, y) => y.confidence - x.confidence);
  let best = ranked[0] ?? null;
  const alternatives = ranked.slice(1, limit).filter((c) => c.confidence >= 0.55);
  // If the runner-up is close, the match is ambiguous; lower confidence so a human confirms.
  if (best && alternatives[0] && best.confidence - alternatives[0].confidence < 0.05) {
    best = { ...best, confidence: Math.min(best.confidence, 0.65) };
  }
  if (best && best.confidence < 0.7) {
    return { input, best, alternatives, needsConfirmation: true };
  }
  return { input, best, alternatives, needsConfirmation: !best || best.confidence < CONFIRM_THRESHOLD };
}

/**
 * Scan free text for the best species mention using n-grams of the given words.
 * Returns the span that produced the best match.
 */
export function findSpeciesInWords(words: string[], dict: SpeciesDictionaryEntry[]): (SpeciesMatchResult & { span: string }) | null {
  let bestRes: (SpeciesMatchResult & { span: string }) | null = null;
  for (let n = Math.min(4, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const span = words.slice(i, i + n).join(" ");
      if (span.length < 2) continue;
      const res = matchSpecies(span, dict);
      if (!res.best) continue;
      // Prefer longer spans on ties (e.g. "golden snapper" over "snapper").
      const score = res.best.confidence + n * 0.001;
      const bestScore = bestRes?.best ? bestRes.best.confidence + bestRes.span.split(" ").length * 0.001 : -1;
      if (score > bestScore) bestRes = { ...res, span };
    }
  }
  return bestRes;
}
