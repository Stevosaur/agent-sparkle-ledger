"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, CheckCircle2, Keyboard, Mic, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoInput } from "@/components/mobile/photo-input";
import { supplierConfirmAction, supplierDeclareAction, supplierRfqReplyAction } from "@/app/actions";
import { cn } from "@/lib/utils";
import { time } from "@/lib/format";

type Lot = { id: string; lotNumber: string; species: string; declaredKg: number; receivedKg: number | null; price: number | null; status: string; confirmation: string; bought: boolean; poNumber: string | null; boughtKg: number | null; eta: string | null };
type SR = { start: () => void; stop: () => void; lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void };

export function SupplierApp({ vendor, preview, vendors, buyerName, lots, rfqs, notes }: { vendor: { id: string; name: string }; preview: boolean; vendors: { id: string; name: string }[]; buyerName: string; lots: Lot[]; rfqs: { id: string; number: string; species: string; kg: number; deliverBy: string | null }[]; notes: { id: string; title: string; body: string }[] }) {
  const router = useRouter();
  const [step, setStep] = useState<"home" | "choose" | "type" | "confirm" | "done">("home");
  const [text, setText] = useState("");
  const [voice, setVoice] = useState(false);
  const [listening, setListening] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ lotIds: string[]; confirmation: string } | null>(null);
  const rec = useRef<SR | null>(null);
  const previewId = preview ? vendor.id : null;

  function speak() {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const C = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    setStep("type");
    if (!C) {
      toast.message("Voice isn't available in this browser — please type instead.");
      return;
    }
    const r = new C();
    r.lang = "en-SG";
    r.interimResults = false;
    r.onresult = (e) => {
      setText(Array.from(e.results).map((x) => x[0].transcript).join(" "));
      setVoice(true);
    };
    r.onend = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  }

  async function send() {
    setBusy(true);
    const r = await supplierDeclareAction({ body: text, transcription: voice ? text : null, photoKey: photo, previewVendorId: previewId });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setResult(r.data as { lotIds: string[]; confirmation: string });
    setStep("confirm");
  }

  async function confirm() {
    if (!result) return;
    setBusy(true);
    const r = await supplierConfirmAction(result.lotIds, previewId);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setStep("done");
    router.refresh();
  }

  const statusText = (l: Lot) =>
    l.status === "REJECTED" ? { t: "Rejected at receiving", c: "text-short" }
    : l.receivedKg !== null ? { t: `Received ${l.receivedKg.toFixed(1)} kg`, c: "text-ok" }
    : l.bought ? { t: `${buyerName} bought ${l.boughtKg?.toFixed(1)} kg @ S$${l.price?.toFixed(2)}`, c: "text-ok" }
    : l.confirmation === "DRAFT" ? { t: "Please confirm", c: "text-surplus" }
    : { t: "Sent to buyer — waiting", c: "text-info" };

  return (
    <div className="mx-auto max-w-md px-4 pb-10 pt-4">
      {preview && (
        <div className="mb-3 rounded-lg border border-border bg-panel-2 p-3 text-xs text-muted">
          Preview of the supplier app as
          <select className="ml-1 rounded border border-border bg-panel px-1 py-0.5 text-text" value={vendor.id} onChange={(e) => router.push(`/supplier?vendor=${e.target.value}`)}>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
      )}

      {step === "home" && (
        <>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Today&apos;s catch</h2>
          <button onClick={() => setStep("choose")} className="mt-3 flex h-24 w-full items-center justify-center gap-3 rounded-2xl bg-accent text-2xl font-bold text-accent-fg active:brightness-90" data-testid="declare-catch">
            <Plus className="size-8" /> DECLARE CATCH
          </button>
          <div className="mt-5 space-y-2">
            {lots.length === 0 && <p className="py-6 text-center text-sm text-muted">Nothing declared yet today.</p>}
            {lots.map((l) => {
              const s = statusText(l);
              return (
                <div key={l.id} className="rounded-xl border border-border bg-panel p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-semibold text-text">{l.species}</span>
                    <span className="num text-lg font-semibold text-text">{l.declaredKg.toFixed(0)} kg</span>
                  </div>
                  <div className={cn("mt-1 text-sm font-medium", s.c)}>{s.t}</div>
                  <div className="num mt-1 text-xs text-muted">{l.lotNumber.slice(-9)}{l.eta ? ` · ETA ${time(l.eta)}` : ""}{l.poNumber ? ` · ${l.poNumber}` : ""}</div>
                </div>
              );
            })}
          </div>
          {lots.some((l) => l.bought && l.receivedKg === null) && (
            <div className="mt-4 rounded-xl border border-border bg-panel-2 p-4 text-sm text-text-2">
              <div className="mb-1 font-semibold text-text">Delivery instructions</div>
              Bring to <b>Jurong Fishery Port — Receiving bay 1</b>. Tell the receiver your lot number (last 4 digits). Night desk answers on this WhatsApp number.
            </div>
          )}
          {rfqs.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Buyer requests</h3>
              {rfqs.map((r) => <RfqReply key={r.id} r={r} previewId={previewId} />)}
            </div>
          )}
          {notes.length > 0 && (
            <div className="mt-4 space-y-1">
              {notes.map((n) => <p key={n.id} className="text-xs text-muted">✓ {n.body}</p>)}
            </div>
          )}
        </>
      )}

      {step === "choose" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-text">How do you want to tell us?</h2><button onClick={() => setStep("home")} aria-label="Close"><X className="size-6 text-muted" /></button></div>
          <BigChoice icon={<Mic className="size-8" />} label="Speak" sub="Say it like you would on the phone" onClick={speak} />
          <BigChoice icon={<Keyboard className="size-8" />} label="Type" sub="e.g. 65kg batang 600-800g 8.80 reach 1.30" onClick={() => setStep("type")} testid="choose-type" />
          <div className="rounded-2xl border border-border bg-panel p-4">
            <div className="mb-2 flex items-center gap-3 text-lg font-semibold text-text"><Camera className="size-8 text-accent" /> Take photo</div>
            <PhotoInput folder="catch" label="Add a photo of the catch" onUploaded={(k) => { setPhoto(k); if (k) setStep("type"); }} />
          </div>
        </div>
      )}

      {step === "type" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-text">What did you catch?</h2><button onClick={() => setStep("home")} aria-label="Close"><X className="size-6 text-muted" /></button></div>
          {listening && <p className="live-dot text-sm text-short">● Listening…</p>}
          {photo && <p className="text-xs text-ok">Photo attached ✓ — now say or type what&apos;s in it.</p>}
          <textarea autoFocus value={text} onChange={(e) => { setText(e.target.value); setVoice(false); }} rows={5} placeholder="Tonight 65kg batang, around 600-800g, asking 8.80. Boat reach 1.30." className="w-full rounded-2xl border border-border bg-panel-2 p-4 text-lg text-text focus:border-accent focus:outline-none" data-testid="supplier-text" />
          <Button size="xl" variant="primary" className="w-full" disabled={busy || text.trim().length < 3} onClick={send} data-testid="supplier-send">{busy ? "Reading…" : "Send"}</Button>
        </div>
      )}

      {step === "confirm" && result && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-text">Is this right?</h2>
          <pre className="whitespace-pre-wrap rounded-2xl border border-border bg-panel p-5 text-lg leading-relaxed text-text" data-testid="supplier-confirmation">{result.confirmation.replace(/\n\nConfirm\?$/, "")}</pre>
          <div className="grid grid-cols-2 gap-3">
            <Button size="xl" variant="secondary" onClick={() => setStep("type")}>Change</Button>
            <Button size="xl" variant="success" disabled={busy} onClick={confirm} data-testid="supplier-confirm">Confirm</Button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="flex flex-col items-center py-16 text-center">
          <CheckCircle2 className="size-20 text-ok" />
          <h2 className="mt-4 text-2xl font-bold text-text">Done</h2>
          <p className="mt-2 text-sm text-muted">{buyerName} has your catch. We&apos;ll message you when it&apos;s bought.</p>
          <Button size="xl" variant="secondary" className="mt-8 w-full" onClick={() => { setText(""); setPhoto(null); setResult(null); setStep("home"); }}>Back to today</Button>
        </div>
      )}
    </div>
  );
}

function BigChoice({ icon, label, sub, onClick, testid }: { icon: React.ReactNode; label: string; sub: string; onClick: () => void; testid?: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-4 rounded-2xl border border-border bg-panel p-5 text-left active:bg-panel-2" data-testid={testid}>
      <span className="text-accent">{icon}</span>
      <span><span className="block text-xl font-semibold text-text">{label}</span><span className="block text-sm text-muted">{sub}</span></span>
    </button>
  );
}

function RfqReply({ r, previewId }: { r: { id: string; number: string; species: string; kg: number; deliverBy: string | null }; previewId: string | null }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="text-sm font-semibold text-text">Need {r.kg.toFixed(0)} kg {r.species.toLowerCase()}{r.deliverBy ? ` before ${time(r.deliverBy)}` : ""}</div>
      <div className="num text-xs text-muted">{r.number}</div>
      <div className="mt-2 flex gap-2">
        <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="e.g. 30kg @ 9.10 reach 4am" className="h-12 flex-1 rounded-xl border border-border bg-panel-2 px-3 text-sm text-text" />
        <Button size="lg" variant="primary" disabled={busy || reply.length < 3} onClick={async () => { setBusy(true); const x = await supplierRfqReplyAction(r.id, reply, previewId); setBusy(false); if (x.ok) toast.success(x.message ?? "Sent"); else toast.error(x.error); }}>Offer</Button>
      </div>
    </div>
  );
}
