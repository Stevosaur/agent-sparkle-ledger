"use client";
import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useAction } from "@/components/app/action-button";
import { requestRecallContactsAction } from "@/app/actions";

export function ContactForm({ recallCaseId, defaultBody, disabled }: { recallCaseId: string; defaultBody: string; disabled: boolean }) {
  const [body, setBody] = useState(defaultBody);
  const { pending, exec } = useAction();
  return (
    <div className="space-y-2">
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} disabled={disabled} />
      <p className="text-[11px] text-muted">Placeholders: {"{customer}"}, {"{lots}"}, {"{kg}"}. This creates a COMPLIANCE approval — nothing is sent until someone with recall permission approves it.</p>
      <Button variant="primary" disabled={pending || disabled} onClick={() => exec(() => requestRecallContactsAction(recallCaseId, body))}><Send /> Request approval to contact customers</Button>
    </div>
  );
}
