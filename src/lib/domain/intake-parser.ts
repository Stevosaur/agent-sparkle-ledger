/**
 * Deterministic catch-declaration parser.
 *
 * Turns messy supplier messages such as
 *   "Tonight 65kg batang, around 600-800g, asking 8.80. Boat reach 1.30."
 * into structured draft catch lines, with per-field confidence and a list of ambiguous fields.
 *
 * This is the MOCK-mode Catch Intake Agent and also the validation backstop for the LLM path:
 * LLM output is always re-normalised against the species master by the same matcher.
 */
import { findSpeciesInWords, normaliseName, type SpeciesDictionaryEntry, type SpeciesMatchResult } from "./species-match";

export type VendorDictionaryEntry = { vendorId: string; name: string; aliases: string[] };

export type ParsedCatchLine = {
  supplierSpeciesName: string;
  speciesId: string | null;
  speciesCode: string | null;
  canonicalName: string | null;
  speciesAlternatives: { speciesId: string; canonicalName: string; confidence: number }[];
  quantityKg: number | null;
  quantityIsEstimate: boolean;
  quantityUnitNote?: string;
  sizeMinKg: number | null;
  sizeMaxKg: number | null;
  askingPricePerKg: number | null;
  currency: "SGD" | "MYR" | "IDR";
  priceCondition?: string;
  processingState?: "WHOLE" | "GUTTED" | "CLEANED" | "LIVE" | "FROZEN";
  freshOrFrozen?: "FRESH" | "FROZEN" | "LIVE";
  confidence: { species: number; quantity: number; size: number | null; price: number | null };
};

export type ParsedCatchDeclaration = {
  vendor: { vendorId: string; name: string; confidence: number; matchedOn: string } | null;
  etaLocal: string | null; // "HH:MM" SGT on the market night
  etaConfidence: number;
  dayOffset: number; // 0 = tonight's market, 1 = tomorrow's
  lines: ParsedCatchLine[];
  notes: string[];
  ambiguousFields: string[];
  overallConfidence: number;
};

type Span = { start: number; end: number };
type QtyMention = Span & { kg: number; estimate: boolean; unitNote?: string };
type SizeMention = Span & { minKg: number; maxKg: number; exact: boolean };
type PriceMention = Span & { price: number; currency: "SGD" | "MYR" | "IDR"; condition?: string; explicit: boolean };

const KATI_KG = 0.6048; // Singapore/Malaysia kati (catty) ≈ 604.8 g

const STOP = new Set([
  "tonight", "today", "tmr", "tomorrow", "got", "have", "has", "boat", "reach", "arrive", "arriving", "arrival", "eta", "maybe", "around",
  "about", "approx", "abt", "est", "estimated", "asking", "ask", "price", "and", "also", "plus", "with", "the", "a", "if", "take", "all",
  "each", "per", "pc", "pcs", "size", "sell", "selling", "at", "can", "fresh", "frozen", "live", "only", "left", "still", "some", "lot",
  "landing", "land", "will", "come", "coming", "by", "this", "morning", "night", "am", "pm", "kg", "kgs", "g", "sgd", "rm", "my", "our",
  "catch", "for", "you", "u", "boss", "lah", "leh", "ok", "okay", "pls", "please", "confirm", "need", "want", "or", "to", "from",
  "gutted", "cleaned", "whole", "dozen", "ready", "early", "late", "abt", "roughly", "total", "another", "more", "less", "than", "is", "are",
]);

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function overlaps(a: Span, spans: Span[]) {
  return spans.some((s) => a.start < s.end && s.start < a.end);
}

/** Sentence boundaries: periods not inside numbers, semicolons, newlines, !, ?. */
function sentenceIndex(text: string): number[] {
  const idx: number[] = new Array(text.length).fill(0);
  let s = 0;
  for (let i = 0; i < text.length; i++) {
    idx[i] = s;
    const c = text[i];
    const isDecimalPoint = c === "." && /\d/.test(text[i - 1] ?? "") && /\d/.test(text[i + 1] ?? "");
    if ((c === "." && !isDecimalPoint) || c === ";" || c === "\n" || c === "!" || c === "?") s++;
  }
  return idx;
}

function wordsIn(text: string): { w: string; start: number; end: number }[] {
  const out: { w: string; start: number; end: number }[] = [];
  const re = /[a-zA-Z㐀-鿿][a-zA-Z㐀-鿿']*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ w: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  return out;
}

export function parseCatchMessage(
  raw: string,
  opts: { species: SpeciesDictionaryEntry[]; vendors?: VendorDictionaryEntry[]; senderVendorId?: string | null },
): ParsedCatchDeclaration {
  const text = raw.replace(/ /g, " ").replace(/[–—]/g, "-").replace(/，/g, ",").replace(/。/g, ". ");
  const lower = text.toLowerCase();
  const notes: string[] = [];
  const consumed: Span[] = [];

  // ---- prices (identified first so "8.80" / "9.20" are never read as clock times) ----
  const prices: PriceMention[] = [];
  const priceRes: { re: RegExp; explicit: boolean }[] = [
    { re: /(s\$|\$|sgd|rm|myr|rp|idr)\s*(\d{1,4}(?:\.\d{1,2})?)(\s*(?:\/|per|a)\s*(?:kg|kilo))?/g, explicit: true },
    { re: /\b(asking|ask|price|selling|sell|@|going\s+at|offer)\s*(?:s\$|\$|sgd|rm)?\s*(\d{1,4}(?:\.\d{1,2})?)(\s*(?:\/|per|a)\s*(?:kg|kilo))?/g, explicit: true },
    { re: /\b(\d{1,4}(?:\.\d{1,2})?)\s*(?:\/|per|a)\s*(?:kg|kilo)\b/g, explicit: true },
  ];
  for (const { re, explicit } of priceRes) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower))) {
      const span = { start: m.index, end: m.index + m[0].length };
      if (overlaps(span, consumed)) continue;
      const numStr = m[2] ?? m[1];
      const price = Number(numStr);
      if (!Number.isFinite(price) || price <= 0) continue;
      const cur = /rm|myr/.test(m[0]) ? "MYR" : /rp|idr/.test(m[0]) ? "IDR" : "SGD";
      const after = lower.slice(span.end, span.end + 30);
      const cond = /^\s*(if|when)\s+(take|takes|buy|u take|you take)\s+(all|everything|whole lot)/.exec(after);
      prices.push({ ...span, price, currency: cur, explicit, condition: cond ? "Price applies if buyer takes the full quantity" : undefined });
      consumed.push(span);
    }
  }

  // ---- ETA ----
  let etaLocal: string | null = null;
  let etaConfidence = 0;
  const timeRes: { re: RegExp; conf: number }[] = [
    { re: /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/g, conf: 0.95 },
    { re: /\b(?:reach|reaching|arrive|arriving|arrival|eta|land|landing|dock|docking|come|coming|by|at|around|sampai|tiba|deliver|delivery)\s+(?:about\s+|around\s+|maybe\s+)?(\d{1,2})[:.](\d{2})\b/g, conf: 0.88 },
    { re: /\b(?:reach|reaching|arrive|arriving|arrival|eta|land|landing|dock|docking|sampai|tiba)\s+(?:about\s+|around\s+|maybe\s+)?(\d{1,2})\b(?![.:\d]|\s*(?:kg|g|kati))/g, conf: 0.7 },
    { re: /\b(\d{1,2})[:](\d{2})\b/g, conf: 0.7 },
    { re: /(\d{1,2})\s*[点點](半|\d{1,2}分?)?/g, conf: 0.85 },
  ];
  for (const { re, conf } of timeRes) {
    if (etaLocal) break;
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower))) {
      const span = { start: m.index, end: m.index + m[0].length };
      if (overlaps(span, consumed)) continue;
      let h = Number(m[1]);
      const min = m[2] === "半" ? 30 : m[2] && /^\d{1,2}分?$/.test(m[2]) ? parseInt(m[2], 10) : 0;
      const ampm = m[3];
      if (min > 59 || h > 23) continue;
      let c = conf;
      if (ampm === "pm" && h < 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
      if (!ampm && h === 12) {
        h = 0; // "12.30" at a night market almost always means 00:30
        c = Math.min(c, 0.6);
      }
      etaLocal = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      etaConfidence = c;
      consumed.push(span);
      break;
    }
  }
  if (/\bmidnight\b/.test(lower) && !etaLocal) {
    etaLocal = "00:00";
    etaConfidence = 0.85;
  }

  // ---- sizes in grams / per-piece kg ----
  const sizes: SizeMention[] = [];
  const sizeRes: RegExp[] = [
    /(\d+(?:\.\d+)?)\s*(?:-|to|~)\s*(\d+(?:\.\d+)?)\s*(g|gm|gms|gram|grams)\b/g,
    /(\d+(?:\.\d+)?)\s*(?:-|to|~)\s*(\d+(?:\.\d+)?)\s*(kg|kilo)s?\s*(?:each|per\s*(?:pc|piece|fish|tail)|\/\s*pc|pc|size|up)\b/g,
    /\bsize\s*(\d+(?:\.\d+)?)\s*(?:-|to|~)\s*(\d+(?:\.\d+)?)\s*(g|gm|kg)?\b/g,
    /(?:around|about|approx|abt|~)?\s*(\d+(?:\.\d+)?)\s*(g|gm|gms|gram|grams)\b()/g,
    /(\d+(?:\.\d+)?)\s*(kg|kilo)s?\s*(?:each|per\s*(?:pc|piece|fish|tail)|\/\s*pc)\b()/g,
  ];
  for (const re of sizeRes) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower))) {
      const span = { start: m.index, end: m.index + m[0].length };
      if (overlaps(span, consumed)) continue;
      let a: number;
      let b: number;
      let unit: string;
      let exact = true;
      if (m[3] !== undefined && m[3] !== "" && /\d/.test(m[2] ?? "")) {
        a = Number(m[1]);
        b = Number(m[2]);
        unit = m[3];
      } else if (/\d/.test(m[2] ?? "") && m[3] === undefined) {
        a = Number(m[1]);
        b = Number(m[2]);
        unit = a > 20 ? "g" : "kg";
      } else {
        a = b = Number(m[1]);
        unit = m[2];
        exact = !/around|about|approx|abt|~/.test(m[0]);
      }
      const f = unit.startsWith("g") ? 0.001 : 1;
      const lo = Math.min(a, b) * f;
      const hi = Math.max(a, b) * f;
      if (a === b && exact === false) {
        // "around 700g" → ±15% band
        sizes.push({ ...span, minKg: round3(lo * 0.85), maxKg: round3(hi * 1.15), exact: false });
      } else sizes.push({ ...span, minKg: round3(lo), maxKg: round3(hi), exact });
      consumed.push(span);
    }
  }

  // ---- quantities ----
  const qtys: QtyMention[] = [];
  const qtyRe = /(\d+(?:\.\d+)?)(?:\s*(?:-|to)\s*(\d+(?:\.\d+)?))?\s*(kg|kgs|kilo|kilos|kilogram|kilograms|公斤|kati|katis|catty|catties|斤)(?![a-z])/g;
  let qm: RegExpExecArray | null;
  while ((qm = qtyRe.exec(lower))) {
    const span = { start: qm.index, end: qm.index + qm[0].length };
    if (overlaps(span, consumed)) continue;
    const lo = Number(qm[1]);
    const hi = qm[2] ? Number(qm[2]) : lo;
    let value = (lo + hi) / 2;
    const isKati = /kati|catty|catties|斤/.test(qm[3]);
    let unitNote: string | undefined;
    if (isKati) {
      value = value * KATI_KG;
      unitNote = `Converted ${qm[1]}${qm[2] ? "-" + qm[2] : ""} kati at ${KATI_KG} kg/kati`;
    }
    const before = lower.slice(Math.max(0, span.start - 18), span.start);
    const estimate = !!qm[2] || /(maybe|around|about|approx|abt|est|estimated|~|roughly|up to)\s*$/.test(before) || isKati;
    qtys.push({ ...span, kg: round3(value), estimate, unitNote });
    consumed.push(span);
  }

  // ---- bare decimal prices ("Batang 8.60, merah 11.20") once times, sizes and quantities are consumed ----
  {
    const re = /(?<![\d.:])(\d{1,3}\.\d{2})(?!\d|[.:]\d|\s*(?:kg|g|gm|am|pm|kati))/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower))) {
      const span = { start: m.index, end: m.index + m[0].length };
      if (overlaps(span, consumed)) continue;
      prices.push({ ...span, price: Number(m[1]), currency: /\brm\b|myr/.test(lower) ? "MYR" : "SGD", explicit: false });
      consumed.push(span);
    }
  }

  // ---- species mentions (words not consumed by numbers/units) ----
  const words = wordsIn(text).filter((w) => !overlaps(w, consumed) && !STOP.has(w.w));
  const sent = sentenceIndex(text);

  type Line = { q: QtyMention; match: (SpeciesMatchResult & { span: string }) | null; spanStart: number; sentence: number };
  const lines: Line[] = [];
  for (let i = 0; i < qtys.length; i++) {
    const q = qtys[i];
    const nextQ = qtys[i + 1]?.start ?? text.length;
    // Species words after the quantity, up to the next quantity or sentence end.
    const after = words.filter((w) => w.start >= q.end && w.start < nextQ && sent[w.start] === sent[q.start]).slice(0, 4);
    let match = after.length ? findSpeciesInWords(after.map((w) => w.w), opts.species) : null;
    let spanStart = after[0]?.start ?? q.end;
    if (!match?.best || match.best.confidence < 0.6) {
      // Try words just before the quantity ("batang 65kg").
      const prevQEnd = qtys[i - 1]?.end ?? 0;
      const before = words.filter((w) => w.end <= q.start && w.start >= prevQEnd && sent[w.start] === sent[q.start]).slice(-3);
      const bm = before.length ? findSpeciesInWords(before.map((w) => w.w), opts.species) : null;
      if (bm?.best && (!match?.best || bm.best.confidence > match.best.confidence)) {
        match = bm;
        spanStart = before[0].start;
      }
    }
    lines.push({ q, match, spanStart, sentence: sent[q.start] });
  }

  // Species mentioned without a quantity (e.g. "Batang asking 8.80") — used to associate prices/sizes.
  const speciesOnlyMentions: { speciesId: string; sentence: number; start: number }[] = [];
  const bySentence = new Map<number, typeof words>();
  for (const w of words) {
    if (lines.some((l) => l.match && w.start >= l.spanStart && w.start <= l.spanStart + (l.match.span.length + 1))) continue;
    const arr = bySentence.get(sent[w.start]) ?? [];
    arr.push(w);
    bySentence.set(sent[w.start], arr);
  }
  for (const [s, ws] of bySentence) {
    // n-gram windows so multi-word names ("ngoh her", "ang go li") are recognised without a quantity
    const taken = new Set<number>();
    for (let n = Math.min(3, ws.length); n >= 1; n--) {
      for (let i = 0; i + n <= ws.length; i++) {
        if ([...Array(n).keys()].some((k) => taken.has(i + k))) continue;
        const win = ws.slice(i, i + n);
        if (win.some((w, k) => k > 0 && w.start - win[k - 1].end > 2)) continue;
        const m = findSpeciesInWords([win.map((w) => w.w).join(" ")], opts.species);
        if (m?.best && m.best.confidence >= 0.85) {
          speciesOnlyMentions.push({ speciesId: m.best.speciesId, sentence: s, start: win[0].start });
          for (let k = 0; k < n; k++) taken.add(i + k);
        }
      }
    }
  }

  function lineFor(pos: number, sentence: number, isFree: (i: number) => boolean = () => true): number {
    // 1) a species named in the same sentence, preferring the closest mention BEFORE the value
    const mentions = speciesOnlyMentions
      .filter((m) => m.sentence === sentence)
      .sort((a, b) => {
        const da = a.start <= pos ? pos - a.start : 10000 + a.start - pos;
        const dbb = b.start <= pos ? pos - b.start : 10000 + b.start - pos;
        return da - dbb;
      });
    for (const mention of mentions) {
      const idx = lines.findIndex((l, i) => l.match?.best?.speciesId === mention.speciesId && isFree(i));
      if (idx >= 0) return idx;
    }
    // 2) nearest preceding line in the same sentence
    for (let i = lines.length - 1; i >= 0; i--) if (lines[i].q.start <= pos && lines[i].sentence === sentence && isFree(i)) return i;
    if (lines.length === 1) return isFree(0) ? 0 : -1;
    // 3) last line of the previous sentence, else first following line in this sentence
    for (let i = lines.length - 1; i >= 0; i--) if (lines[i].q.start <= pos && lines[i].sentence === sentence - 1 && isFree(i)) return i;
    return lines.findIndex((l, i) => l.q.start > pos && l.sentence === sentence && isFree(i));
  }

  const out: ParsedCatchLine[] = lines.map((l) => {
    const best = l.match?.best ?? null;
    return {
      supplierSpeciesName: l.match?.span ?? "",
      speciesId: best?.speciesId ?? null,
      speciesCode: best?.code ?? null,
      canonicalName: best?.canonicalName ?? null,
      speciesAlternatives: (l.match?.alternatives ?? []).map((a) => ({ speciesId: a.speciesId, canonicalName: a.canonicalName, confidence: a.confidence })),
      quantityKg: l.q.kg,
      quantityIsEstimate: l.q.estimate,
      quantityUnitNote: l.q.unitNote,
      sizeMinKg: null,
      sizeMaxKg: null,
      askingPricePerKg: null,
      currency: "SGD",
      confidence: { species: best?.confidence ?? 0, quantity: l.q.estimate ? 0.8 : 0.95, size: null, price: null },
    };
  });

  for (const s of sizes) {
    const i = lineFor(s.start, sent[s.start], (k) => out[k]?.sizeMinKg === null);
    if (i < 0 || !out[i]) continue;
    out[i].sizeMinKg = s.minKg;
    out[i].sizeMaxKg = s.maxKg;
    out[i].confidence.size = s.exact ? 0.9 : 0.8;
  }

  const unassignedPrices: PriceMention[] = [];
  for (const p of prices) {
    const i = lineFor(p.start, sent[p.start], (k) => out[k]?.askingPricePerKg === null);
    if (i < 0 || !out[i]) {
      unassignedPrices.push(p);
      continue;
    }
    out[i].askingPricePerKg = p.price;
    out[i].currency = p.currency;
    out[i].priceCondition = p.condition;
    const sentenceHasSpecies = speciesOnlyMentions.some((m) => m.sentence === sent[p.start]) || lines[i].sentence === sent[p.start];
    out[i].confidence.price = sentenceHasSpecies || out.length === 1 ? 0.92 : 0.7;
    if (p.condition) notes.push(`${out[i].canonicalName ?? out[i].supplierSpeciesName}: ${p.condition.toLowerCase()}.`);
  }
  if (unassignedPrices.length) notes.push(`Price ${unassignedPrices.map((p) => p.price.toFixed(2)).join(", ")} could not be tied to a species.`);

  // processing / freshness hints (apply to all lines when stated once)
  const proc = /\blive\b/.test(lower) ? "LIVE" : /\bfrozen\b/.test(lower) ? "FROZEN" : /\bgutted\b/.test(lower) ? "GUTTED" : /\bcleaned\b/.test(lower) ? "CLEANED" : undefined;
  if (proc) for (const l of out) {
    l.processingState = proc as ParsedCatchLine["processingState"];
    l.freshOrFrozen = proc === "LIVE" ? "LIVE" : proc === "FROZEN" ? "FROZEN" : "FRESH";
  }
  for (const l of out) if (l.quantityUnitNote) notes.push(l.quantityUnitNote);

  // ---- day ----
  const dayOffset = /\b(tomorrow|tmr|tmrw|tml)\b/.test(lower) ? 1 : 0;

  // ---- vendor ----
  let vendor: ParsedCatchDeclaration["vendor"] = null;
  if (opts.senderVendorId && opts.vendors) {
    const v = opts.vendors.find((x) => x.vendorId === opts.senderVendorId);
    if (v) vendor = { vendorId: v.vendorId, name: v.name, confidence: 0.99, matchedOn: "sender number" };
  }
  if (!vendor && opts.vendors) {
    const nl = ` ${normaliseName(text)} `;
    let bestLen = 0;
    for (const v of opts.vendors) {
      for (const a of [v.name, ...v.aliases]) {
        const na = normaliseName(a);
        if (na.length >= 4 && nl.includes(` ${na} `) && na.length > bestLen) {
          bestLen = na.length;
          vendor = { vendorId: v.vendorId, name: v.name, confidence: na === normaliseName(v.name) ? 0.95 : 0.85, matchedOn: a };
        }
      }
    }
  }

  // ---- ambiguity & overall confidence ----
  const ambiguous: string[] = [];
  out.forEach((l, i) => {
    const tag = out.length > 1 ? `lines[${i}].` : "";
    if (l.confidence.species < 0.8) ambiguous.push(`${tag}species`);
    if (l.quantityKg === null) ambiguous.push(`${tag}quantity`);
    if (l.confidence.price !== null && l.confidence.price < 0.75) ambiguous.push(`${tag}price`);
  });
  if (!etaLocal) ambiguous.push("eta");
  else if (etaConfidence < 0.75) ambiguous.push("eta");
  if (!vendor) ambiguous.push("vendor");
  if (out.length === 0) ambiguous.push("lines");

  const lineConf = out.map((l) => Math.min(l.confidence.species, l.confidence.quantity));
  const core = lineConf.length ? Math.min(...lineConf) : 0;
  const extras = [etaLocal ? etaConfidence : 0.5, vendor?.confidence ?? 0.6];
  const overallConfidence = clamp01(Math.round((core * 0.7 + (extras.reduce((a, b) => a + b, 0) / extras.length) * 0.3) * 1000) / 1000);

  return { vendor, etaLocal, etaConfidence, dayOffset, lines: out, notes, ambiguousFields: ambiguous, overallConfidence };
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

/** Human-readable confirmation text, as a supplier would see it on WhatsApp. */
export function confirmationText(p: ParsedCatchDeclaration): string {
  const parts: string[] = ["Detected:"];
  for (const l of p.lines) {
    parts.push(`• ${l.canonicalName ?? `“${l.supplierSpeciesName}” (species?)`}`);
    if (l.quantityKg !== null) parts.push(`  ${l.quantityKg}kg${l.quantityIsEstimate ? " estimated" : ""}`);
    if (l.sizeMinKg !== null) parts.push(`  ${Math.round(l.sizeMinKg * 1000)}–${Math.round((l.sizeMaxKg ?? l.sizeMinKg) * 1000)}g`);
    if (l.askingPricePerKg !== null) parts.push(`  ${l.currency === "SGD" ? "S$" : l.currency + " "}${l.askingPricePerKg.toFixed(2)}/kg`);
  }
  if (p.etaLocal) parts.push(`ETA ${p.etaLocal}`);
  parts.push("", "Confirm?");
  return parts.join("\n");
}
