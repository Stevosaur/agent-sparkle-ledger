"use client";
import Link from "next/link";
import { useState } from "react";
import { Banknote, CheckCircle2 } from "lucide-react";
import { ActionButton, useAction } from "@/components/app/action-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { approvePaymentAction, recordPaymentAction } from "@/app/actions";
import { sgd } from "@/lib/format";

const METHODS = [
  { key: "PAYNOW", label: "PayNow" },
  { key: "GIRO", label: "GIRO" },
  { key: "BANK_TRANSFER", label: "Bank transfer" },
  { key: "CHEQUE", label: "Cheque" },
  { key: "CASH", label: "Cash" },
] as const;
type Method = (typeof METHODS)[number]["key"];

const PAYABLE_MATCH = ["MATCHED", "MATCH_WITHIN_TOLERANCE", "APPROVED_EXCEPTION"];

export function BillActions(p: { id: string; invoiceNumber: string; vendor: string; total: number; matchStatus: string; paymentStatus: string; canApprove: boolean; canWrite: boolean }) {
  const matchedOk = PAYABLE_MATCH.includes(p.matchStatus);
  if (p.paymentStatus === "PAID") return <span className="text-[11px] text-muted">Settled</span>;
  return (
    <div className="flex justify-end gap-1.5">
      {!matchedOk && (
        <Link href={`/finance/reconciliation/${p.id}`} className="inline-flex h-8 items-center rounded-md border border-short/40 px-3 text-xs font-medium text-short hover:bg-short-soft">Review match</Link>
      )}
      {matchedOk && p.paymentStatus === "UNPAID" && p.canApprove && (
        <ActionButton size="sm" variant="secondary" action={() => approvePaymentAction(p.id)} confirm={`Approve ${p.invoiceNumber} from ${p.vendor} (${sgd(p.total)}) for payment?`}>
          <CheckCircle2 /> Approve
        </ActionButton>
      )}
      {matchedOk && p.canWrite && <RecordPaymentDialog {...p} direction="AP" />}
    </div>
  );
}

export function RecordPaymentDialog({ id, invoiceNumber, total, direction, vendor }: { id: string; invoiceNumber: string; total: number; direction: "AP" | "AR"; vendor: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(total.toFixed(2));
  const [method, setMethod] = useState<Method>("PAYNOW");
  const { pending, exec } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost"><Banknote /> Record paid</Button>
      </DialogTrigger>
      <DialogContent title={`Record payment · ${invoiceNumber}`} description={`${direction === "AP" ? "Paid to" : "Received from"} ${vendor}`}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            exec(() => recordPaymentAction(direction, id, Number(amount), method), { onOk: () => setOpen(false) });
          }}
        >
          <div className="rounded-lg border border-surplus/30 bg-surplus-soft px-3 py-2 text-xs text-surplus">
            Records only — no funds move. Make the actual payment in your bank or PayNow app, then record it here for reconciliation.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (S$)" hint={`Invoice total ${sgd(total)}`}>
              <Input type="number" step="0.01" min="0.01" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} className="num" />
            </Field>
            <Field label="Method">
              <Select value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                {METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending || !(Number(amount) > 0)}>{pending ? "Recording…" : "Record payment"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
