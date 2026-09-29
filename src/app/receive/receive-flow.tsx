"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CloudOff, QrCode, Search, Thermometer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoInput } from "@/components/mobile/photo-input";
import { receiveLotAction } from "@/app/actions";
import { cn } from "@/lib/utils";
import { time } from "@/lib/format";

type Lot = { id: string; lotNumber: string; species: string; vendor: string; declaredKg: number; eta: string | null; status: string; size: string | null };
type Payload = Parameters<typeof receiveLotAction>[0];
const QUEUE_KEY = "pc_receive_queue";
const REASONS = ["UNDERWEIGHT", "POOR_QUALITY", "TEMPERATURE", "WRONG_SIZE", "WRONG_SPECIES", "DAMAGED", "LATE", "OTHER"] as const;

function readQueue(): Payload[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function ReceiveFlow({ lots, initialLotId, tempMax }: { lots: Lot[]; initialLotId: string | null; tempMax: number }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Lot | null>(lots.find((l) => l.id === initialLotId) ?? null);
  const [weight, setWeight] = useState("");
  const [temp, setTemp] = useState<string>("");
  const [grade, setGrade] = useState<"A" | "B" | "C" | "REJECT">("A");
  const [rejectKg, setRejectKg] = useState("");
  const [reason, setReason] = useState<(typeof REASONS)[number] | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState<number | null>(() => (initialLotId ? Date.now() : null));
  const [done, setDone] = useState<{ lotNumber: string; secs: number; variance: string } | null>(null);
  const [queued, setQueued] = useState(0);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Offline outbox: replay queued receipts when connectivity returns.
  useEffect(() => {
    const flush = async () => {
      const qd = readQueue();
      setQueued(qd.length);
      if (!qd.length || !navigator.onLine) return;
      const left: Payload[] = [];
      for (const p of qd) {
        try {
          const r = await receiveLotAction(p);
          if (!r.ok && !/already received/i.test(r.error)) left.push(p);
        } catch {
          left.push(p);
        }
      }
      localStorage.setItem(QUEUE_KEY, JSON.stringify(left));
      setQueued(left.length);
      if (left.length < qd.length) {
        toast.success(`Synced ${qd.length - left.length} offline receipt(s)`);
        router.refresh();
      }
    };
    window.addEventListener("online", flush);
    void flush();
    return () => window.removeEventListener("online", flush);
  }, [router]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? lots.filter((l) => `${l.lotNumber} ${l.species} ${l.vendor}`.toLowerCase().includes(s)) : lots;
  }, [q, lots]);

  function pick(l: Lot) {
    setSel(l);
    setWeight("");
    setTemp("");
    setGrade("A");
    setRejectKg("");
    setReason(null);
    setPhoto(null);
    setDone(null);
    setStarted(Date.now());
  }

  async function scan() {
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!BD || !navigator.mediaDevices) {
      toast.error("QR scanning isn't supported in this browser — search the lot number instead.");
      return;
    }
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      const det = new BD({ formats: ["qr_code"] });
      const stop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setScanning(false);
      };
      const loop = async () => {
        if (!v.srcObject) return;
        const codes = await det.detect(v).catch(() => []);
        const code = codes[0]?.rawValue;
        if (code) {
          const lot = lots.find((l) => l.lotNumber === code || code.includes(l.lotNumber));
          stop();
          if (lot) pick(lot);
          else toast.error(`Lot ${code} isn't expected tonight`);
          return;
        }
        requestAnimationFrame(loop);
      };
      void loop();
    } catch {
      setScanning(false);
      toast.error("Camera unavailable");
    }
  }

  async function submit(accept: boolean) {
    if (!sel) return;
    const w = Number(weight);
    if (!(w >= 0) || weight === "") return toast.error("Enter the weighed quantity");
    const payload: Payload = {
      lotId: sel.id,
      receivedKg: w,
      rejectedKg: accept ? Number(rejectKg) || 0 : w,
      rejectionReason: accept ? (Number(rejectKg) > 0 ? reason ?? "OTHER" : null) : reason ?? "POOR_QUALITY",
      temperatureC: temp === "" ? null : Number(temp),
      qualityGrade: accept ? grade : "REJECT",
      photoKey: photo,
    };
    setBusy(true);
    const secs = started ? Math.round((Date.now() - started) / 1000) : 0;
    try {
      if (!navigator.onLine) throw new Error("offline");
      const r = await receiveLotAction(payload);
      if (!r.ok) {
        toast.error(r.error);
        setBusy(false);
        return;
      }
      const variance = ((w - sel.declaredKg) / sel.declaredKg) * 100;
      setDone({ lotNumber: sel.lotNumber, secs, variance: `${variance > 0 ? "+" : ""}${variance.toFixed(1)}%` });
      router.refresh();
    } catch {
      const qd = readQueue();
      qd.push(payload);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(qd));
      setQueued(qd.length);
      setDone({ lotNumber: sel.lotNumber, secs, variance: "queued offline" });
      toast.message("Saved offline — will sync automatically");
    }
    setBusy(false);
    setSel(null);
  }

  const tempWarn = temp !== "" && Number(temp) > tempMax;
  const variance = sel && weight ? ((Number(weight) - sel.declaredKg) / sel.declaredKg) * 100 : null;

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-4">
      {queued > 0 && <div className="mb-3 flex items-center gap-2 rounded-lg border border-surplus/30 bg-surplus-soft px-3 py-2 text-xs text-surplus"><CloudOff className="size-4" /> {queued} receipt(s) waiting to sync</div>}
      {done && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-ok/30 bg-ok-soft p-4" data-testid="receive-done">
          <CheckCircle2 className="size-8 text-ok" />
          <div>
            <div className="num text-sm font-semibold text-text">{done.lotNumber} received</div>
            <div className="num text-xs text-muted">{done.variance} vs declared · {done.secs}s</div>
          </div>
        </div>
      )}

      {!sel && (
        <>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Lot no, species, supplier" className="h-14 w-full rounded-xl border border-border bg-panel-2 pl-11 pr-3 text-base text-text focus:border-accent focus:outline-none" data-testid="receive-search" />
            </div>
            <Button size="xl" variant="primary" onClick={scan} aria-label="Scan QR"><QrCode className="!size-6" /></Button>
          </div>
          {scanning && (
            <div className="relative mt-3 overflow-hidden rounded-xl border border-border">
              <video ref={videoRef} className="w-full" muted playsInline />
              <button onClick={() => { (videoRef.current?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop()); setScanning(false); }} className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white"><X className="size-5" /></button>
            </div>
          )}
          <div className="mt-4 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Expected tonight · {filtered.length}</div>
            {filtered.map((l) => (
              <button key={l.id} onClick={() => pick(l)} className="flex w-full items-center gap-3 rounded-xl border border-border bg-panel p-4 text-left active:bg-panel-2" data-testid={`receive-pick-${l.lotNumber}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold text-text">{l.species}</div>
                  <div className="truncate text-xs text-muted">{l.vendor} · <span className="num">{l.lotNumber.slice(-9)}</span></div>
                </div>
                <div className="text-right">
                  <div className="num text-lg font-semibold text-text">{l.declaredKg.toFixed(1)}<span className="text-xs text-muted"> kg</span></div>
                  <div className="num text-xs text-muted">ETA {time(l.eta)}</div>
                </div>
              </button>
            ))}
            {filtered.length === 0 && <p className="py-8 text-center text-sm text-muted">Nothing waiting to be received.</p>}
          </div>
        </>
      )}

      {sel && (
        <div className="space-y-4" data-testid="receive-form">
          <div className="rounded-xl border border-border bg-panel p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-semibold text-text">{sel.species}</div>
                <div className="text-xs text-muted">{sel.vendor} · {sel.size ?? "size n/a"}</div>
                <div className="num text-xs text-muted">{sel.lotNumber}</div>
              </div>
              <button onClick={() => setSel(null)} className="rounded-full p-2 text-muted" aria-label="Cancel"><X className="size-5" /></button>
            </div>
            <div className="num mt-2 text-sm text-text-2">Declared <span className="font-semibold text-text">{sel.declaredKg.toFixed(1)} kg</span></div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Weighed (kg)</span>
            <input autoFocus inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.0" className="num h-20 w-full rounded-xl border border-border bg-panel-2 px-4 text-center text-4xl font-semibold text-text focus:border-accent focus:outline-none" data-testid="receive-weight" />
            {variance !== null && <span className={cn("num mt-1 block text-center text-sm", Math.abs(variance) >= 5 ? "text-short" : "text-muted")}>{variance > 0 ? "+" : ""}{variance.toFixed(1)}% vs declared</span>}
          </label>

          <div>
            <span className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted"><Thermometer className="size-3.5" /> Core temp °C</span>
            <div className="grid grid-cols-6 gap-2">
              {["0", "1", "2", "3", "4", "6"].map((t) => (
                <button key={t} onClick={() => setTemp(t)} className={cn("num h-14 rounded-xl border text-lg font-semibold", temp === t ? "border-accent bg-accent-soft text-accent" : "border-border bg-panel-2 text-text", Number(t) > tempMax && "text-short")}>{t === "6" ? "6+" : t}</button>
              ))}
            </div>
            <input inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value.replace(/[^\d.-]/g, ""))} placeholder="or type e.g. 2.4" className={cn("num mt-2 h-12 w-full rounded-xl border bg-panel-2 px-4 text-center text-lg text-text focus:outline-none", tempWarn ? "border-short" : "border-border")} data-testid="receive-temp" />
            {tempWarn && <p className="mt-1 text-center text-xs text-short">Above {tempMax}°C — a temperature exception will be raised</p>}
          </div>

          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Quality</span>
            <div className="grid grid-cols-3 gap-2">
              {(["A", "B", "C"] as const).map((g) => (
                <button key={g} onClick={() => setGrade(g)} className={cn("h-14 rounded-xl border text-xl font-bold", grade === g ? "border-accent bg-accent-soft text-accent" : "border-border bg-panel-2 text-text")} data-testid={`grade-${g}`}>{g}</button>
              ))}
            </div>
          </div>

          <details className="rounded-xl border border-border bg-panel p-3">
            <summary className="cursor-pointer text-sm text-text-2">Partial rejection</summary>
            <input inputMode="decimal" value={rejectKg} onChange={(e) => setRejectKg(e.target.value.replace(/[^\d.]/g, ""))} placeholder="kg rejected" className="num mt-2 h-12 w-full rounded-xl border border-border bg-panel-2 px-4 text-lg text-text" />
            <div className="mt-2 flex flex-wrap gap-2">
              {REASONS.map((r) => <button key={r} onClick={() => setReason(r)} className={cn("rounded-lg border px-3 py-2 text-xs", reason === r ? "border-short bg-short-soft text-short" : "border-border text-text-2")}>{r.replaceAll("_", " ").toLowerCase()}</button>)}
            </div>
          </details>

          <PhotoInput folder="receiving" onUploaded={setPhoto} />

          <div className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-[1fr_2fr] gap-2 border-t border-border bg-bg/95 p-3 backdrop-blur" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
            <Button size="xl" variant="danger" disabled={busy} onClick={() => { if (!reason) setReason("POOR_QUALITY"); void submit(false); }}>Reject</Button>
            <Button size="xl" variant="success" disabled={busy || !weight} onClick={() => submit(true)} data-testid="receive-accept">{busy ? "Saving…" : "Accept"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
