"use client";
import { useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { ActionButton, useAction } from "@/components/app/action-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { approveInvoiceExceptionAction, approvePaymentAction } from "@/app/actions";
import { sgd } from "@/lib/format";
import { RecordPaymentDialog } from "../../bills/bill-actions";

export function ReconActions(p: { id: string; invoiceNumber: string; vendor: string; total: number; matchStatus: string; paymentStatus: string; canApprove: boolean; canWrite: boolean }) {
  const matchedOk = ["MATCHED", "MATCH_WITHIN_TOLERANCE", "APPROVED_EXCEPTION"].includes(p.matchStatus);
  return (
    <>
      {p.canApprove && (p.matchStatus === "EXCEPTION" || p.matchStatus === "UNMATCHED") && <ApproveExceptionDialog id={p.id} invoiceNumber={p.invoiceNumber} />}
      {p.canApprove && matchedOk && p.paymentStatus === "UNPAID" && (
        <ActionButton variant="primary" action={() => approvePaymentAction(p.id)} confirm={`Approve ${p.invoiceNumber} (${sgd(p.total)}) for payment?`}>
          <CheckCircle2 /> Approve for payment
        </ActionButton>
      )}
      {p.canWrite && matchedOk && p.paymentStatus !== "PAID" && <RecordPaymentDialog id={p.id} invoiceNumber={p.invoiceNumber} total={p.total} direction="AP" vendor={p.vendor} />}
      {!matchedOk && p.paymentStatus === "UNPAID" && <span className="text-xs text-muted">Payment is blocked until the exception is resolved.</span>}
    </>
  );
}

function ApproveExceptionDialog({ id, invoiceNumber }: { id: string; invoiceNumber: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const { pending, exec } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary"><ShieldCheck /> Approve exception</Button>
      </DialogTrigger>
      <DialogContent title={`Approve exception on ${invoiceNumber}`} description="Accept the invoice as billed despite the variance. This is a financial decision and is recorded in the audit trail with your name and reason.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            exec(() => approveInvoiceExceptionAction(id, note.trim()), { onOk: () => setOpen(false) });
          }}
        >
          <Field label="Reason (required)" hint="e.g. “Supplier agreed credit of 4.9 kg on next invoice” or “Weighed wet at jetty — accepted per contract”.">
            <Textarea required minLength={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="danger" disabled={pending || note.trim().length < 3}>{pending ? "Approving…" : "Approve exception"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
