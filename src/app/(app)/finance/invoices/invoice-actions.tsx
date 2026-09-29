"use client";
import { useState } from "react";
import { FileMinus2, FilePlus2, Send } from "lucide-react";
import { ActionButton, useAction } from "@/components/app/action-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { createCustomerInvoiceAction, creditNoteAction, transmitInvoiceNowAction } from "@/app/actions";
import { date, kgNum, perKg, sgd } from "@/lib/format";
import { RecordPaymentDialog } from "../bills/bill-actions";

type Line = { id: string; description: string; quantityKg: number; unitPrice: number };

export function CreateInvoiceButton({ salesOrderId, soNumber }: { salesOrderId: string; soNumber: string }) {
  return (
    <ActionButton size="sm" variant="secondary" action={() => createCustomerInvoiceAction(salesOrderId)} confirm={`Issue a tax invoice for ${soNumber} from delivered quantities?`}>
      <FilePlus2 /> Create invoice
    </ActionButton>
  );
}

export function InvoiceActions(p: { id: string; number: string; invoiceDate: string; customer: string; type: string; status: string; peppolStatus: string; total: number; gstRatePct: number; lines: Line[]; canWrite: boolean }) {
  if (!p.canWrite) return null;
  const canPrepare = p.status !== "VOID" && p.status !== "DRAFT" && (p.peppolStatus === "NOT_SENT" || p.peppolStatus === "FAILED");
  return (
    <div className="flex justify-end gap-1.5">
      {canPrepare && (
        <ActionButton size="sm" variant="ghost" action={() => transmitInvoiceNowAction(p.id)} title="Build the InvoiceNow (Peppol PINT-SG) document via the mock Access Point — nothing is transmitted">
          <Send /> Prepare InvoiceNow
        </ActionButton>
      )}
      {p.type === "INVOICE" && p.status !== "VOID" && p.lines.length > 0 && <CreditNoteDialog {...p} />}
      {p.type === "INVOICE" && !["PAID", "VOID", "DRAFT"].includes(p.status) && <RecordPaymentDialog id={p.id} invoiceNumber={p.number} total={p.total} direction="AR" vendor={p.customer} />}
    </div>
  );
}

function CreditNoteDialog({ id, number, invoiceDate, customer, lines, gstRatePct }: { id: string; number: string; invoiceDate: string; customer: string; lines: Line[]; gstRatePct: number }) {
  const [open, setOpen] = useState(false);
  const [lineId, setLineId] = useState(lines[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const { pending, exec } = useAction();
  const line = lines.find((l) => l.id === lineId);
  const q = Number(qty);
  const sub = line && q > 0 ? Math.round(q * line.unitPrice * 100) / 100 : 0;
  const gst = Math.round(sub * gstRatePct) / 100;
  const valid = line && q > 0 && q <= line.quantityKg && reason.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost"><FileMinus2 /> Credit note</Button>
      </DialogTrigger>
      <DialogContent title={`Credit note against ${number}`} description={`${customer} · original invoice dated ${date(invoiceDate)}. The credit note will reference this invoice number and date.`}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            exec(() => creditNoteAction(id, lineId, q, reason.trim()), { onOk: () => { setOpen(false); setQty(""); setReason(""); } });
          }}
        >
          <Field label="Invoice line">
            <Select value={lineId} onChange={(e) => setLineId(e.target.value)}>
              {lines.map((l) => <option key={l.id} value={l.id}>{l.description} — {kgNum(l.quantityKg)} kg @ {perKg(l.unitPrice)}</option>)}
            </Select>
          </Field>
          <Field label="Quantity to credit (kg)" hint={line ? `Up to ${kgNum(line.quantityKg)} kg invoiced on this line.` : undefined}>
            <Input type="number" step="0.001" min="0.001" max={line?.quantityKg} inputMode="decimal" required value={qty} onChange={(e) => setQty(e.target.value)} className="num" />
          </Field>
          <Field label="Reason" hint="Shown on the credit note, e.g. “2 kg rejected at delivery — soft flesh”.">
            <Textarea required minLength={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="num rounded-lg bg-panel-2 px-3 py-2 text-xs text-text-2">
            Credit {sgd(sub)} + GST {gstRatePct.toFixed(0)}% {sgd(gst)} = <span className="font-semibold text-text">{sgd(sub + gst)}</span>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending || !valid}>{pending ? "Issuing…" : "Issue credit note"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
