"use client";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useAction } from "@/components/app/action-button";
import { overrideForecastAction } from "@/app/actions";
import { kg } from "@/lib/format";

export function OverrideForecast({ lineId, label, forecastKg, lowKg, highKg, currentOverride }: { lineId: string; label: string; forecastKg: number; lowKg: number; highKg: number; currentOverride: number | null }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(currentOverride ?? forecastKg));
  const [reason, setReason] = useState("");
  const { pending, exec } = useAction();
  const n = Number(value);
  const ok = n > 0 && reason.trim().length >= 2;
  const outside = n > 0 && (n < lowKg || n > highKg);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" data-testid="override-forecast-btn"><Pencil /> {currentOverride !== null ? "Edit" : "Override"}</Button>
      </DialogTrigger>
      <DialogContent title="Override forecast" description={label}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ok) return;
            exec(() => overrideForecastAction(lineId, n, reason.trim()), { onOk: () => setOpen(false) });
          }}
        >
          <div className="rounded-lg bg-panel-2 p-3 text-xs text-muted">
            Model forecast <span className="num font-semibold text-text">{kg(forecastKg)}</span> · 80% range <span className="num text-text-2">{kg(lowKg)} – {kg(highKg)}</span>
          </div>
          <Field label="Your forecast (kg)" hint={outside ? "Outside the model's 80% range — make sure the reason explains why." : undefined}>
            <Input className="num" type="number" inputMode="decimal" step="0.1" min="0.1" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          </Field>
          <Field label="Reason (required, kept in the audit trail)">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. Restaurant told us they have a 60-pax banquet on Friday" required />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!ok || pending} data-testid="override-forecast-submit">{pending ? "Saving…" : "Save override"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
