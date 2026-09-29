"use client";
import { useState } from "react";
import { Clock, Save } from "lucide-react";
import { ActionButton, useAction } from "@/components/app/action-button";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { setDemoClockAction, updateSettingsAction } from "@/app/actions";
import { cn } from "@/lib/utils";

export type SettingsValues = {
  dispatchCutoff: string;
  defaultAllocationPolicy: string;
  gstRegistered: boolean;
  gstRatePct: number;
  receivingTempMaxC: number;
  weightVarianceAlertPct: number;
  surplusDiscountFloorPct: number;
  tolQtyPct: number;
  tolPricePct: number;
  tolAmountAbs: number;
  weights: Record<string, number>;
};

const POLICIES = [
  { key: "PRIORITY", label: "Priority tier first" },
  { key: "PRO_RATA", label: "Pro-rata to requested kg" },
  { key: "FIRST_CONFIRMED", label: "First confirmed, first served" },
  { key: "MINIMUM_GUARANTEED", label: "Minimum guaranteed, then pro-rata" },
  { key: "MARGIN_MAX", label: "Maximise margin" },
  { key: "MANUAL_RANK", label: "Manual ranking" },
];
const WEIGHTS: { key: string; label: string; hint: string }[] = [
  { key: "price", label: "Price", hint: "Lower cost per kg" },
  { key: "reliability", label: "Reliability", hint: "Fill rate & on-time" },
  { key: "quality", label: "Quality", hint: "Grade A share, rejections" },
  { key: "freshness", label: "Freshness", hint: "Catch / harvest age" },
  { key: "eta", label: "ETA", hint: "Arrives before cut-off" },
  { key: "relationship", label: "Relationship", hint: "Preferred-vendor tier" },
];

export function SettingsForm({ initial, disabled }: { initial: SettingsValues; disabled?: boolean }) {
  const [v, setV] = useState(initial);
  const { pending, exec } = useAction();
  const set = <K extends keyof SettingsValues>(k: K, val: SettingsValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const wSum = Object.values(v.weights).reduce((a, b) => a + (Number(b) || 0), 0);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const num = (s: string) => (s === "" ? 0 : Number(s));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        exec(() => updateSettingsAction({ ...v, weights: Object.fromEntries(Object.entries(v.weights).map(([k, x]) => [k, Math.round(Number(x) * 100) / 100])) }));
      }}
      className="space-y-4"
    >
      <fieldset disabled={disabled || pending} className="space-y-4">
        <Card>
          <CardHeader title="Night operations" subtitle="Cut-offs and defaults used by agents and planners." />
          <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Dispatch cut-off (SGT)" hint="Trucks should leave by this time.">
              <Input type="time" value={v.dispatchCutoff} onChange={(e) => set("dispatchCutoff", e.target.value)} required className="num" />
            </Field>
            <Field label="Default allocation policy" hint="Used when splitting short supply across buyers.">
              <Select value={v.defaultAllocationPolicy} onChange={(e) => set("defaultAllocationPolicy", e.target.value)}>
                {POLICIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </Select>
            </Field>
            <Field label="Surplus max discount %" hint="Largest discount the Surplus agent may propose.">
              <Input type="number" min={0} max={60} step={1} value={v.surplusDiscountFloorPct} onChange={(e) => set("surplusDiscountFloorPct", num(e.target.value))} className="num" />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Receiving checks" subtitle="Thresholds that raise TEMPERATURE and WEIGHT_VARIANCE exceptions at the dock." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Receiving temperature max (°C)" hint="Chilled fish above this is flagged.">
              <Input type="number" min={-30} max={15} step={0.5} value={v.receivingTempMaxC} onChange={(e) => set("receivingTempMaxC", num(e.target.value))} className="num" />
            </Field>
            <Field label="Weight variance alert %" hint="Received vs declared weight.">
              <Input type="number" min={0} max={50} step={0.5} value={v.weightVarianceAlertPct} onChange={(e) => set("weightVarianceAlertPct", num(e.target.value))} className="num" />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Tax & invoice matching" subtitle="GST is stored on each invoice when issued. Tolerances decide when a supplier bill auto-matches." />
          <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex h-9 items-center gap-2.5 self-start rounded-md border border-border px-3 text-sm text-text sm:col-span-2 lg:col-span-1 lg:mt-5">
              <input type="checkbox" checked={v.gstRegistered} onChange={(e) => set("gstRegistered", e.target.checked)} className="size-4 accent-[var(--accent)]" />
              GST-registered organisation
            </label>
            <Field label="GST rate %" hint="Singapore standard rate is 9% from 1 Jan 2024.">
              <Input type="number" min={0} max={30} step={0.01} value={v.gstRatePct} onChange={(e) => set("gstRatePct", num(e.target.value))} className="num" disabled={!v.gstRegistered} />
            </Field>
            <div className="hidden lg:block" />
            <Field label="Quantity tolerance %" hint="Billed vs received kg.">
              <Input type="number" min={0} max={20} step={0.1} value={v.tolQtyPct} onChange={(e) => set("tolQtyPct", num(e.target.value))} className="num" />
            </Field>
            <Field label="Price tolerance %" hint="Billed vs PO unit price.">
              <Input type="number" min={0} max={20} step={0.1} value={v.tolPricePct} onChange={(e) => set("tolPricePct", num(e.target.value))} className="num" />
            </Field>
            <Field label="Amount tolerance (S$)" hint="Per invoice line.">
              <Input type="number" min={0} max={1000} step={0.5} value={v.tolAmountAbs} onChange={(e) => set("tolAmountAbs", num(e.target.value))} className="num" />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Procurement scoring weights"
            subtitle="How the Procurement Agent ranks competing supplier offers. Each weight is 0–1; they are normalised when scoring."
            action={<span className={cn("num text-xs", Math.abs(wSum - 1) < 0.001 ? "text-ok" : "text-surplus")}>Σ {wSum.toFixed(2)}{Math.abs(wSum - 1) < 0.001 ? "" : " (normalised)"}</span>}
          />
          <CardBody className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {WEIGHTS.map((w) => {
              const val = Number(v.weights[w.key] ?? 0);
              return (
                <div key={w.key}>
                  <div className="mb-1 flex items-baseline justify-between">
                    <label htmlFor={`w-${w.key}`} className="text-xs font-medium text-text">{w.label} <span className="font-normal text-muted">· {w.hint}</span></label>
                    <span className="num text-xs text-muted">{wSum > 0 ? `${Math.round((val / wSum) * 100)}%` : "—"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input id={`w-${w.key}`} type="range" min={0} max={1} step={0.05} value={val} onChange={(e) => set("weights", { ...v.weights, [w.key]: Number(e.target.value) })} className="h-1.5 flex-1 cursor-pointer accent-[var(--accent)]" />
                    <Input aria-label={`${w.label} weight`} type="number" min={0} max={1} step={0.05} value={val} onChange={(e) => set("weights", { ...v.weights, [w.key]: Math.max(0, Math.min(1, num(e.target.value))) })} className="num h-8 w-20 text-xs" />
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>
      </fieldset>

      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-3 border-t border-border bg-bg/95 px-1 py-3 backdrop-blur">
        {disabled ? <span className="text-xs text-muted">You can view but not change organisation settings.</span> : dirty ? <span className="text-xs text-surplus">Unsaved changes</span> : <span className="text-xs text-muted">All changes are audited.</span>}
        {!disabled && (
          <>
            <Button type="button" variant="ghost" disabled={!dirty || pending} onClick={() => setV(initial)}>Reset</Button>
            <Button type="submit" variant="primary" disabled={!dirty || pending}><Save /> {pending ? "Saving…" : "Save settings"}</Button>
          </>
        )}
      </div>
    </form>
  );
}

export function DemoClock({ nowLabel, nowMinutes }: { nowLabel: string; nowMinutes: number }) {
  // Minutes since 12:00 SGT on the market night so that 02:00 > 23:00.
  const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return ((h < 12 ? h + 24 : h) - 12) * 60 + m; };
  const stops = ["02:00", "03:00", "04:15", "05:00", "05:30", "07:00"];
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm text-text"><Clock className="size-4 text-accent" /> Demo clock is at <span className="num font-semibold">{nowLabel}</span> SGT</div>
      <div className="flex flex-wrap gap-2">
        {stops.map((t) => {
          const past = mins(t) <= nowMinutes;
          return (
            <ActionButton key={t} size="sm" variant={past ? "ghost" : "secondary"} disabled={past} action={() => setDemoClockAction(t)} confirm={`Move the demo clock forward to ${t} SGT? It cannot be moved back.`} className="num">
              {t}
            </ActionButton>
          );
        })}
      </div>
    </div>
  );
}
