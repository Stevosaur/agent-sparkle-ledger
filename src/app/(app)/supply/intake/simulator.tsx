"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAction } from "@/components/app/action-button";
import { simulateMessageAction } from "@/app/actions";
import { cn } from "@/lib/utils";

type Parsed = {
  vendor: { name: string; confidence: number; matchedOn: string } | null;
  etaLocal: string | null;
  etaConfidence: number;
  lines: { supplierSpeciesName: string; canonicalName: string | null; quantityKg: number | null; quantityIsEstimate: boolean; sizeMinKg: number | null; sizeMaxKg: number | null; askingPricePerKg: number | null; currency: string; confidence: { species: number; quantity: number; size: number | null; price: number | null }; speciesAlternatives: { canonicalName: string; confidence: number }[]; priceCondition?: string }[];
  notes: string[];
  ambiguousFields: string[];
  overallConfidence: number;
};
type Bubble = { dir: "in" | "out"; text: string; at: string };

const TEMPLATES = [
  "Tonight 65kg batang, around 600-800g, asking 8.80. Boat reach 1.30.",
  "Can give 40kg batang 1-2kg size @ 8.50, reach 2.45",
  "Boat arriving 1.30am. Today got 80kg batang around 700g, 45kg ang go li, 30kg squid. Batang asking 8.80.",
  "Ah Seng boat tonight 2am maybe 60kg batang 600-800g and 20kg prawns. Batang $9 if take all.",
  "马鲛鱼 50 kati RM 38/kg 3点到",
];

const pctTone = (c: number | null | undefined) => (c === null || c === undefined ? "text-muted" : c >= 0.85 ? "text-ok" : c >= 0.7 ? "text-surplus" : "text-short");

type SR = { start: () => void; stop: () => void; lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void };

export function Simulator({ vendors, defaultVendorId }: { vendors: { id: string; name: string; whatsapp: string | null }[]; defaultVendorId?: string }) {
  const [vendorId, setVendorId] = useState(defaultVendorId ?? vendors[0]?.id ?? "");
  const [text, setText] = useState(TEMPLATES[0]);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState(false);
  const recRef = useRef<SR | null>(null);
  const { pending, exec } = useAction();
  const vendor = vendors.find((v) => v.id === vendorId);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 1e6, behavior: "smooth" });
  }, [bubbles]);

  function toggleMic() {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) {
      alert("Voice input needs a browser with the Web Speech API (e.g. Chrome). Server-side voice-note transcription is a P1 integration.");
      return;
    }
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-SG";
    rec.interimResults = false;
    rec.onresult = (e) => {
      setText(Array.from(e.results).map((r) => r[0].transcript).join(" "));
      setVoice(true);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  function send() {
    const body = text.trim();
    if (!body) return;
    const now = new Date().toISOString();
    setBubbles((b) => [...b, { dir: "in", text: body, at: now }]);
    setParsed(null);
    exec(
      () => simulateMessageAction({ vendorId: vendorId || null, body, channel: voice ? "VOICE" : "WHATSAPP_SIMULATOR", transcription: voice ? body : null }),
      {
        onOk: (r) => {
          const d = r.data as { confirmation: string; parsed: Parsed; mode: string };
          setParsed(d.parsed);
          setMode(d.mode);
          setBubbles((b) => [...b, { dir: "out", text: d.confirmation, at: new Date().toISOString() }]);
          setVoice(false);
        },
      },
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      {/* Phone */}
      <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-[28px] border border-border-strong bg-[#0b141a] shadow-2xl">
        <div className="flex items-center gap-3 bg-[#1f2c34] px-4 py-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-[#2a3942] text-xs font-semibold text-white">{vendor?.name.slice(0, 2).toUpperCase() ?? "??"}</div>
          <div className="min-w-0 flex-1">
            <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="h-7 border-0 bg-transparent px-0 text-sm font-semibold text-white focus:ring-0" data-testid="sim-vendor">
              <option value="">Unknown number</option>
              {vendors.map((v) => <option key={v.id} value={v.id} className="bg-panel text-text">{v.name}</option>)}
            </Select>
            <div className="num text-[11px] text-[#8696a0]">{vendor?.whatsapp ?? "+65 •••• ••••"} · WhatsApp simulator</div>
          </div>
        </div>
        <div ref={scroller} className="h-[360px] space-y-2 overflow-y-auto bg-[#0b141a] p-3">
          <div className="mx-auto w-fit rounded bg-[#182229] px-2 py-1 text-[10px] text-[#8696a0]">Messages go to the Catch Intake Agent · simulator (no real WhatsApp)</div>
          {bubbles.map((b, i) => (
            <div key={i} className={cn("max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[13px] leading-snug text-[#e9edef]", b.dir === "in" ? "bg-[#202c33]" : "ml-auto bg-[#005c4b]")}>
              {b.dir === "out" && <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-[#53bdeb]"><Sparkles className="size-3" /> PasarCatch</div>}
              {b.text}
            </div>
          ))}
          {pending && <div className="live-dot ml-auto w-fit rounded-lg bg-[#005c4b] px-3 py-2 text-xs text-[#e9edef]">Reading your message…</div>}
        </div>
        <div className="space-y-2 bg-[#1f2c34] p-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {TEMPLATES.map((t) => (
              <button key={t} onClick={() => setText(t)} className="shrink-0 rounded-full border border-[#2a3942] px-2.5 py-1 text-[11px] text-[#8696a0] hover:text-white">{t.slice(0, 26)}…</button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <Textarea value={text} onChange={(e) => { setText(e.target.value); setVoice(false); }} rows={3} className="min-h-0 flex-1 border-0 bg-[#2a3942] text-[13px] text-white" data-testid="sim-text" />
            <div className="flex flex-col gap-2">
              <button onClick={toggleMic} className={cn("flex size-11 items-center justify-center rounded-full", listening ? "bg-short text-white" : "bg-[#2a3942] text-[#8696a0]")} aria-label="Speak">{listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}</button>
              <button onClick={send} disabled={pending} className="flex size-11 items-center justify-center rounded-full bg-[#00a884] text-white disabled:opacity-50" aria-label="Send" data-testid="sim-send"><Send className="size-5" /></button>
            </div>
          </div>
        </div>
      </div>

      {/* Extraction */}
      <div className="rounded-xl border border-border bg-panel">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Sparkles className="size-4 text-accent" />
          <h3 className="text-sm font-semibold text-text">Catch Intake Agent — structured extraction</h3>
          {mode && <Badge tone="ai" className="ml-auto">{mode === "LLM" ? "Claude structured output + species matcher" : "Deterministic parser (MOCK mode)"}</Badge>}
        </div>
        {!parsed ? (
          <div className="p-6 text-sm text-muted">
            Send a message from the simulator. The agent extracts vendor, ETA, species (normalised against your species master), quantity, size, asking price and currency — and flags <em>only</em> the ambiguous fields for a human to check. Draft lots appear below for confirmation.
          </div>
        ) : (
          <div className="space-y-4 p-4" data-testid="extraction">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Vendor" value={parsed.vendor?.name ?? "Unknown"} conf={parsed.vendor?.confidence} hint={parsed.vendor ? `matched on ${parsed.vendor.matchedOn}` : "needs review"} />
              <Field label="ETA (SGT)" value={parsed.etaLocal ?? "—"} conf={parsed.etaLocal ? parsed.etaConfidence : 0} />
              <Field label="Lines" value={String(parsed.lines.length)} />
              <Field label="Overall confidence" value={`${Math.round(parsed.overallConfidence * 100)}%`} conf={parsed.overallConfidence} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="text-[11px] uppercase tracking-wide text-muted"><th className="py-1.5 text-left">Supplier said</th><th className="text-left">Species</th><th className="text-right">Qty</th><th className="text-right">Size</th><th className="text-right">Asking</th></tr></thead>
                <tbody>
                  {parsed.lines.map((l, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-2 text-text-2">“{l.supplierSpeciesName}”</td>
                      <td>
                        <div className="text-text">{l.canonicalName ?? <span className="text-short">unmatched</span>} <span className={cn("num text-xs", pctTone(l.confidence.species))}>{Math.round(l.confidence.species * 100)}%</span></div>
                        {l.confidence.species < 0.8 && l.speciesAlternatives.length > 0 && <div className="text-[11px] text-surplus">or: {l.speciesAlternatives.map((a) => a.canonicalName).join(", ")}</div>}
                      </td>
                      <td className="num text-right text-text">{l.quantityKg ?? "—"} kg{l.quantityIsEstimate && <span className="block text-[10px] text-muted">estimated</span>}</td>
                      <td className="num text-right text-text-2">{l.sizeMinKg ? `${Math.round(l.sizeMinKg * 1000)}–${Math.round((l.sizeMaxKg ?? l.sizeMinKg) * 1000)} g` : "—"}</td>
                      <td className="num text-right text-text">{l.askingPricePerKg ? `${l.currency === "SGD" ? "S$" : l.currency + " "}${l.askingPricePerKg.toFixed(2)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.ambiguousFields.length > 0 ? (
              <p className="rounded-md border border-surplus/30 bg-surplus-soft px-3 py-2 text-xs text-surplus">Flagged for human review: {parsed.ambiguousFields.join(", ")}. Everything else was extracted confidently.</p>
            ) : (
              <p className="rounded-md border border-ok/30 bg-ok-soft px-3 py-2 text-xs text-ok">No ambiguous fields. A procurement manager just needs to confirm.</p>
            )}
            {parsed.notes.length > 0 && <ul className="list-disc pl-5 text-xs text-muted">{parsed.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, conf, hint }: { label: string; value: string; conf?: number; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-panel-2 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="num mt-1 text-sm font-semibold text-text">{value}</div>
      <div className={cn("num text-[11px]", pctTone(conf))}>{conf !== undefined ? `${Math.round(conf * 100)}% confidence` : hint}</div>
      {hint && conf !== undefined && <div className="text-[10px] text-muted">{hint}</div>}
    </div>
  );
}
