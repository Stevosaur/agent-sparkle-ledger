"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/app/action-button";
import { completeStopAction } from "@/app/actions";

/** Proof-of-delivery: name of the person who received the goods, then complete the stop. */
export function CompleteStopForm({ stopId, customer, testId }: { stopId: string; customer: string; testId: string }) {
  const [name, setName] = useState("");
  const { pending, exec } = useAction();
  return (
    <form
      className="flex w-full flex-wrap gap-1.5 sm:w-auto"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        exec(() => completeStopAction(stopId, name.trim()), { onOk: () => setName("") });
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Received by (POD name)" maxLength={80} required className="h-10 min-w-0 flex-1 sm:w-48" aria-label={`Proof of delivery name for ${customer}`} data-testid={`pod-${testId}`} />
      <Button type="submit" variant="success" className="h-10" disabled={pending || !name.trim()} data-testid={`complete-${testId}`}>
        {pending ? "Saving…" : "Complete delivery"}
      </Button>
    </form>
  );
}
