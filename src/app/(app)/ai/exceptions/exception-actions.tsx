"use client";
import { useState } from "react";
import { Check, Eye } from "lucide-react";
import { ActionButton, useAction } from "@/components/app/action-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { acknowledgeExceptionAction, resolveExceptionAction } from "@/app/actions/exceptions";

export function ExceptionActions({ id, title, status, canAck, canResolve }: { id: string; title: string; status: string; canAck: boolean; canResolve: boolean }) {
  return (
    <div className="flex shrink-0 gap-1.5">
      {status === "OPEN" && canAck && (
        <ActionButton size="sm" variant="ghost" action={() => acknowledgeExceptionAction(id)}>
          <Eye /> Acknowledge
        </ActionButton>
      )}
      {canResolve && <ResolveDialog id={id} title={title} />}
    </div>
  );
}

function ResolveDialog({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const { pending, exec } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary"><Check /> Resolve</Button>
      </DialogTrigger>
      <DialogContent title="Resolve exception" description={title}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            exec(() => resolveExceptionAction(id, note.trim()), { onOk: () => { setOpen(false); setNote(""); } });
          }}
        >
          <Field label="Resolution note" hint="What was done — recorded in the audit trail with your name.">
            <Textarea required minLength={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending || note.trim().length < 3}>{pending ? "Resolving…" : "Resolve"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
