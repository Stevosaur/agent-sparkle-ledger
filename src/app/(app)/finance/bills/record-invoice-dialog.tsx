"use client";
import { useMemo, useState } from "react";
import { FilePlus2, Plus, Trash2 } from "lucide-react";
import { useAction } from "@/components/app/action-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { recordSupplierInvoiceAction } from "@/app/actions";
import { sgd } from "@/lib/format";

type Line = { speciesId: string; description: string; quantityKg: string; unitPrice: string };
type PoOption = { id: string; poNumber: string; vendorId: string; marketDate: string; lines: { speciesId: string; description: string; quantityKg: number; unitPrice: number }[] };

const blank: Line = { speciesId: "", description: "", quantityKg: "", unitPrice: "" };

export function RecordInvoiceDialog({ vendors, pos, species, defaultDate }: { vendors: { id: string; name: string; gstRegistered: boolean; paymentTermsDays: number }[]; pos: PoOption[]; species: { id: string; name: string }[]; defaultDate: string }) {
  const [open, setOpen] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [poId, setPoId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(defaultDate);
  const [lines, setLines] = useState<Line[]>([{ ...blank }]);
  const { pending, exec } = useAction();

  const vendorPos = pos.filter((p) => p.vendorId === vendorId);
  const v = vendors.find((x) => x.id === vendorId);
  const subtotal = useMemo(() => lines.reduce((a, l) => a + (Number(l.quantityKg) || 0) * (Number(l.unitPrice) || 0), 0), [lines]);
  const valid = vendorId && invoiceNumber.trim() && /^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) && lines.length > 0 && lines.every((l) => l.description.trim() && Number(l.quantityKg) > 0 && Number(l.unitPrice) > 0);

  const reset = () => {
    setVendorId(""); setPoId(""); setInvoiceNumber(""); setInvoiceDate(defaultDate); setLines([{ ...blank }]);
  };
  const pickPo = (id: string) => {
    setPoId(id);
    const po = pos.find((p) => p.id === id);
    if (po) setLines(po.lines.map((l) => ({ speciesId: l.speciesId, description: l.description, quantityKg: String(l.quantityKg), unitPrice: String(l.unitPrice) })));
  };
  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="primary"><FilePlus2 /> Record supplier invoice</Button>
      </DialogTrigger>
      <DialogContent wide title="Record supplier invoice" description="Enter the bill as the supplier issued it. It is matched against the PO and goods receipt automatically.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            exec(
              () => recordSupplierInvoiceAction({
                vendorId, purchaseOrderId: poId || null, invoiceNumber: invoiceNumber.trim(), invoiceDate,
                lines: lines.map((l) => ({ speciesId: l.speciesId || null, description: l.description.trim(), quantityKg: Number(l.quantityKg), unitPrice: Number(l.unitPrice) })),
              }),
              { onOk: () => { setOpen(false); reset(); } },
            );
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vendor">
              <Select required value={vendorId} onChange={(e) => { setVendorId(e.target.value); setPoId(""); }}>
                <option value="">Select vendor…</option>
                {vendors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </Field>
            <Field label="Purchase order (optional)" hint={vendorId && !vendorPos.length ? "No POs for this vendor in the last 14 nights." : "Choosing a PO pre-fills lines with received weights."}>
              <Select value={poId} onChange={(e) => pickPo(e.target.value)} disabled={!vendorId}>
                <option value="">No PO referenced</option>
                {vendorPos.map((p) => <option key={p.id} value={p.id}>{p.poNumber} · night of {p.marketDate}</option>)}
              </Select>
            </Field>
            <Field label="Supplier invoice number" hint="Must be unique per vendor — duplicates are rejected.">
              <Input required maxLength={40} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="e.g. AS-20931" className="num" />
            </Field>
            <Field label="Invoice date">
              <Input type="date" required value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </Field>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-muted">Lines</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setLines([...lines, { ...blank }])} disabled={lines.length >= 50}><Plus /> Add line</Button>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1.1fr_1.3fr_0.7fr_0.7fr_auto] sm:border-0 sm:p-0">
                  <Select aria-label="Species" value={l.speciesId} onChange={(e) => setLine(i, { speciesId: e.target.value, description: l.description || species.find((s) => s.id === e.target.value)?.name || "" })}>
                    <option value="">Species…</option>
                    {species.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                  <Input aria-label="Description" required maxLength={120} placeholder="Description" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                  <Input aria-label="Quantity kg" required type="number" step="0.001" min="0.001" inputMode="decimal" placeholder="kg" value={l.quantityKg} onChange={(e) => setLine(i, { quantityKg: e.target.value })} className="num" />
                  <Input aria-label="Unit price S$/kg" required type="number" step="0.0001" min="0.01" inputMode="decimal" placeholder="S$/kg" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} className="num" />
                  <Button type="button" size="icon" variant="ghost" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 /></Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <div className="num text-xs text-muted">
              Subtotal <span className="font-semibold text-text">{sgd(subtotal)}</span>
              {v && <span className="ml-2">{v.gstRegistered ? "· GST added at org rate" : "· vendor not GST-registered, no GST"} · due in {v.paymentTermsDays} days</span>}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={pending || !valid}>{pending ? "Recording…" : "Record & match"}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
