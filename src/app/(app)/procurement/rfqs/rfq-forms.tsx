"use client";
import { useMemo, useState } from "react";
import { Lock, MessageSquareReply, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAction } from "@/components/app/action-button";
import { createRfqAction, recordQuoteReplyAction } from "@/app/actions";
import { cn } from "@/lib/utils";

type SpeciesOpt = { id: string; name: string; localName: string | null; sizeMinG: number | null; sizeMaxG: number | null };
type VendorOpt = { id: string; name: string; tier: string; hasWhatsapp: boolean };
type Capability = { vendorId: string; speciesId: string; typicalKg: number | null };

export function NewRfqDialog({ species, vendors, capabilities, initialSpeciesId, initialQty }: { species: SpeciesOpt[]; vendors: VendorOpt[]; capabilities: Capability[]; initialSpeciesId?: string | null; initialQty?: number | null }) {
  const initSp = species.find((s) => s.id === initialSpeciesId);
  const [open, setOpen] = useState(!!initialSpeciesId);
  const [speciesId, setSpeciesId] = useState(initialSpeciesId ?? "");
  const [qty, setQty] = useState(initialQty ? String(Math.ceil(initialQty)) : "");
  const [sizeMin, setSizeMin] = useState(initSp?.sizeMinG ? String(initSp.sizeMinG) : "");
  const [sizeMax, setSizeMax] = useState(initSp?.sizeMaxG ? String(initSp.sizeMaxG) : "");
  const [deliverBy, setDeliverBy] = useState("04:30");
  const [target, setTarget] = useState("");
  const [max, setMax] = useState("");
  const [allVendors, setAllVendors] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const { pending, exec } = useAction();

  const capable = useMemo(() => new Map(capabilities.filter((c) => c.speciesId === speciesId).map((c) => [c.vendorId, c])), [capabilities, speciesId]);
  const list = allVendors || !speciesId ? vendors : vendors.filter((v) => capable.has(v.id));
  const chosen = picked.filter((id) => list.some((v) => v.id === id));
  const priceErr = target && max && Number(target) > Number(max) ? "Target should not exceed maximum" : null;
  const sizeErr = sizeMin && sizeMax && Number(sizeMin) > Number(sizeMax) ? "Min size exceeds max" : null;
  const valid = speciesId && Number(qty) > 0 && chosen.length > 0 && !priceErr && !sizeErr && (!deliverBy || /^([01]\d|2[0-3]):[0-5]\d$/.test(deliverBy));

  const pickSpecies = (id: string) => {
    setSpeciesId(id);
    setPicked([]);
    const sp = species.find((s) => s.id === id);
    setSizeMin(sp?.sizeMinG ? String(sp.sizeMinG) : "");
    setSizeMax(sp?.sizeMaxG ? String(sp.sizeMaxG) : "");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" data-testid="new-rfq-btn"><Plus /> New RFQ</Button>
      </DialogTrigger>
      <DialogContent title="New request for quotation" description="The RFQ is drafted now and sent to suppliers only after it is approved in the Approval Inbox." wide>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            exec(
              () => createRfqAction({ speciesId, quantityKg: Number(qty), sizeMinG: sizeMin ? Number(sizeMin) : null, sizeMaxG: sizeMax ? Number(sizeMax) : null, deliverBy: deliverBy || null, targetPrice: target ? Number(target) : null, maxPrice: max ? Number(max) : null, vendorIds: chosen }),
              { onOk: () => setOpen(false) },
            );
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <Field label="Species">
              <Select value={speciesId} onChange={(e) => pickSpecies(e.target.value)} required data-testid="rfq-species">
                <option value="">Select species…</option>
                {species.map((s) => <option key={s.id} value={s.id}>{s.name}{s.localName ? ` (${s.localName})` : ""}</option>)}
              </Select>
            </Field>
            <Field label="Quantity (kg)">
              <Input className="num" type="number" inputMode="decimal" min="0.1" step="0.1" value={qty} onChange={(e) => setQty(e.target.value)} required data-testid="rfq-qty" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Size min (g)" hint={sizeErr ?? undefined}><Input className="num" type="number" min="1" value={sizeMin} onChange={(e) => setSizeMin(e.target.value)} /></Field>
            <Field label="Size max (g)"><Input className="num" type="number" min="1" value={sizeMax} onChange={(e) => setSizeMax(e.target.value)} /></Field>
            <Field label="Deliver by (SGT)"><Input className="num" type="time" value={deliverBy} onChange={(e) => setDeliverBy(e.target.value)} /></Field>
          </div>
          <div className="rounded-lg border border-border bg-panel-2/60 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-text-2"><Lock className="size-3.5" /> Internal price boundaries — never shared with suppliers</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Target (S$/kg)"><Input className="num" type="number" inputMode="decimal" min="0.01" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
              <Field label="Maximum (S$/kg)" hint={priceErr ?? "Quotes above this are flagged and never auto-accepted."}><Input className="num" type="number" inputMode="decimal" min="0.01" step="0.01" value={max} onChange={(e) => setMax(e.target.value)} /></Field>
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted">Suppliers <span className="num">({chosen.length} selected)</span></span>
              <label className="flex items-center gap-1.5 text-xs text-text-2">
                <input type="checkbox" className="accent-[var(--accent)]" checked={allVendors} onChange={(e) => setAllVendors(e.target.checked)} /> Show all vendors
              </label>
            </div>
            {!speciesId ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted">Pick a species to see suppliers who can supply it.</p>
            ) : list.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted">No vendor has this species on file as a capability. Tick “Show all vendors” to choose from everyone.</p>
            ) : (
              <div className="grid max-h-56 gap-1.5 overflow-y-auto sm:grid-cols-2">
                {list.map((v) => {
                  const on = chosen.includes(v.id);
                  const cap = capable.get(v.id);
                  return (
                    <button
                      type="button"
                      key={v.id}
                      onClick={() => setPicked((p) => (on ? p.filter((x) => x !== v.id) : [...p, v.id]))}
                      className={cn("flex min-h-11 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-xs", on ? "border-accent bg-accent-soft text-text" : "border-border text-text-2 hover:bg-panel-2")}
                      aria-pressed={on}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{v.name}</span>
                        <span className="block text-[10px] text-muted">{cap?.typicalKg ? `~${cap.typicalKg} kg/night` : cap ? "capable" : "no capability on file"}{!v.hasWhatsapp && " · no WhatsApp"}</span>
                      </span>
                      {v.tier === "PREFERRED" && <Badge tone="ok">Pref</Badge>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-muted">Creates a draft and a SEND_RFQ approval (external communication).</p>
            <Button type="submit" variant="primary" size="lg" disabled={!valid || pending} data-testid="rfq-submit">{pending ? "Drafting…" : "Draft RFQ for approval"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RecordReplyForm({ rfqId, vendors }: { rfqId: string; vendors: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? "");
  const [text, setText] = useState("");
  const { pending, exec } = useAction();
  if (!open)
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} data-testid="record-reply-btn"><MessageSquareReply /> Record supplier reply</Button>
    );
  return (
    <form
      className="grid gap-2 rounded-lg border border-border bg-panel-2/60 p-3 sm:grid-cols-[200px_1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        if (!vendorId || text.trim().length < 3) return;
        exec(() => recordQuoteReplyAction(rfqId, vendorId, text.trim()), { onOk: () => { setText(""); setOpen(false); } });
      }}
    >
      <Select aria-label="Supplier" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
        {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </Select>
      <Textarea aria-label="Supplier reply" className="min-h-9 py-1.5" rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder='Paste the reply, e.g. "can give 30kg @ 9.10 reach 4am"' maxLength={1000} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending || text.trim().length < 3} data-testid="record-reply-submit">{pending ? "Parsing…" : "Parse & record"}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
