"use client";
import { useState } from "react";
import { Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/app/action-button";
import { planRoutesAction } from "@/app/actions";

export function PlanRoutesForm({ defaultDeparture, disabledReason }: { defaultDeparture: string; disabledReason?: string }) {
  const [dep, setDep] = useState(defaultDeparture);
  const { pending, exec } = useAction();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!/^\d{2}:\d{2}$/.test(dep)) return;
        exec(() => planRoutesAction(dep));
      }}
    >
      <label className="text-xs text-muted">
        <span className="mb-1 block font-medium">Departure (SGT)</span>
        <Input type="time" value={dep} onChange={(e) => setDep(e.target.value)} required className="h-11 w-[150px] text-base" aria-label="Departure time" data-testid="plan-departure" />
      </label>
      <Button type="submit" variant="primary" size="lg" disabled={pending || !!disabledReason} title={disabledReason} data-testid="plan-routes">
        <Route /> {pending ? "Planning…" : "Generate routes"}
      </Button>
    </form>
  );
}
