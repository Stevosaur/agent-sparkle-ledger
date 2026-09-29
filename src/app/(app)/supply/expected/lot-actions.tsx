"use client";
import { useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/app/action-button";
import { markLandedAction, updateEtaAction } from "@/app/actions";

/** Inline "Update ETA" and "Mark landed" controls for one inbound lot. */
export function ExpectedLotActions({ lotId, lotNumber, eta, status, canEta, canLand }: { lotId: string; lotNumber: string; eta: string | null; status: string; canEta: boolean; canLand: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(eta ?? "");
  const [reason, setReason] = useState("");
  const { pending, exec } = useAction();

  if (!canEta && !canLand) return null;
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        {canEta && (
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid={`eta-toggle-${lotNumber}`}>
            <Clock /> ETA
          </Button>
        )}
        {canLand && status === "EXPECTED" && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => exec(() => markLandedAction(lotId))} data-testid={`mark-landed-${lotNumber}`}>
            Mark landed
          </Button>
        )}
      </div>
      {open && (
        <form
          className="flex flex-wrap items-center justify-end gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^\d{2}:\d{2}$/.test(value)) return;
            exec(() => updateEtaAction(lotId, value, reason.trim() || undefined), { onOk: () => setOpen(false) });
          }}
        >
          <Input type="time" value={value} onChange={(e) => setValue(e.target.value)} className="h-8 w-[104px] text-xs" aria-label={`New ETA for ${lotNumber}`} required />
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" maxLength={200} className="h-8 w-40 text-xs" aria-label="Reason" />
          <Button size="sm" variant="primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </form>
      )}
    </div>
  );
}
