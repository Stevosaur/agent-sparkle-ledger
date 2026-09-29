"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertOctagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/input";
import { useAction } from "@/components/app/action-button";
import { openRecallAction } from "@/app/actions";

export function RecallButton({ lotNumber }: { lotNumber: string }) {
  const [reason, setReason] = useState("");
  const [sev, setSev] = useState<"PRECAUTIONARY" | "CLASS_II" | "CLASS_I">("PRECAUTIONARY");
  const { pending, exec } = useAction();
  const router = useRouter();
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="danger" data-testid="open-recall"><AlertOctagon /> Recall mode</Button></DialogTrigger>
      <DialogContent title={`Open recall for ${lotNumber}`} description="Places a hold on on-hand affected stock and drafts a customer contact list. Nothing is sent to customers without approval.">
        <div className="space-y-3">
          <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Supplier notified possible histamine risk in this batch" /></Field>
          <Field label="Severity">
            <Select value={sev} onChange={(e) => setSev(e.target.value as typeof sev)}>
              <option value="PRECAUTIONARY">Precautionary</option>
              <option value="CLASS_II">Class II</option>
              <option value="CLASS_I">Class I</option>
            </Select>
          </Field>
          <Button variant="danger" className="w-full" disabled={pending || reason.trim().length < 5} onClick={() => exec(() => openRecallAction(lotNumber, reason, sev), { onOk: (r) => router.push(`/trace/recall/${(r.data as { id: string }).id}`) })}>Open recall case</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
