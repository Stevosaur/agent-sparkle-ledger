"use client";
import { useState } from "react";
import { useAction } from "@/components/app/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toggleAutomationRuleAction } from "@/app/actions";
import { cn } from "@/lib/utils";

type Props = { id: string; ruleKey: string; name: string; enabled: boolean; params: Record<string, unknown>; locked: boolean; canEdit: boolean; templatedActions: { key: string; label: string }[] };

export function RuleControls(p: Props) {
  const { pending, exec } = useAction();
  const [maxAmount, setMaxAmount] = useState(String(p.params.maxAmount ?? ""));
  const [actions, setActions] = useState<string[]>(Array.isArray(p.params.actions) ? (p.params.actions as string[]) : []);
  const editable = p.canEdit && !p.locked;
  const paramsFor = (): Record<string, unknown> => {
    if (p.ruleKey === "AUTO_PO_UNDER_LIMIT") return { ...p.params, maxAmount: Math.max(0, Number(maxAmount) || 0) };
    if (p.ruleKey === "AUTO_TEMPLATED_MESSAGES") return { ...p.params, actions };
    return p.params;
  };
  const paramsDirty = JSON.stringify(paramsFor()) !== JSON.stringify(p.params);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={p.enabled}
          aria-label={`${p.enabled ? "Disable" : "Enable"} ${p.name}`}
          disabled={!editable || pending}
          onClick={() => {
            if (!p.enabled && !window.confirm(`Enable “${p.name}”? Matching agent actions will then execute without a human approving each one.`)) return;
            exec(() => toggleAutomationRuleAction(p.id, !p.enabled, paramsFor()));
          }}
          className={cn("relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50", p.enabled ? "border-ok bg-ok" : "border-border-strong bg-panel-3")}
          data-testid={`rule-toggle-${p.ruleKey}`}
        >
          <span className={cn("absolute top-0.5 rounded-full bg-white shadow transition-all", p.enabled ? "left-[22px]" : "left-0.5")} style={{ width: 18, height: 18 }} />
        </button>
        <span className={cn("text-xs font-medium", p.enabled ? "text-ok" : "text-muted")}>{p.enabled ? "Enabled" : "Disabled"}</span>
        {p.locked && <span className="text-[11px] text-muted">Always requires approval — cannot be automated.</span>}
        {!p.canEdit && !p.locked && <span className="text-[11px] text-muted">Owner or admin can change this.</span>}
      </div>

      {p.ruleKey === "AUTO_PO_UNDER_LIMIT" && (
        <label className="block text-xs text-muted">
          Auto-approve purchase orders up to (S$, ex GST)
          <div className="mt-1 flex gap-2">
            <Input type="number" min={0} max={100000} step={10} value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} disabled={!editable || pending} className="num h-8 w-36 text-xs" />
          </div>
        </label>
      )}
      {p.ruleKey === "AUTO_TEMPLATED_MESSAGES" && (
        <div>
          <div className="mb-1 text-xs text-muted">Templated messages that may send without approval</div>
          <div className="flex flex-wrap gap-2">
            {p.templatedActions.map((a) => (
              <label key={a.key} className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs", actions.includes(a.key) ? "border-accent/50 text-text" : "border-border text-text-2")}>
                <input type="checkbox" disabled={!editable || pending} checked={actions.includes(a.key)} onChange={(e) => setActions(e.target.checked ? [...actions, a.key] : actions.filter((x) => x !== a.key))} className="accent-[var(--accent)]" />
                {a.label}
              </label>
            ))}
          </div>
        </div>
      )}
      {editable && paramsDirty && (
        <div className="flex gap-2">
          <Button size="sm" variant="primary" disabled={pending} onClick={() => exec(() => toggleAutomationRuleAction(p.id, p.enabled, paramsFor()))}>Save parameters</Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setMaxAmount(String(p.params.maxAmount ?? "")); setActions(Array.isArray(p.params.actions) ? (p.params.actions as string[]) : []); }}>Reset</Button>
        </div>
      )}
    </div>
  );
}
