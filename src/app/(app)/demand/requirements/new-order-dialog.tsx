"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { useAction } from "@/components/app/action-button";
import { createSalesOrderAction } from "@/app/actions";
import { sgd } from "@/lib/format";

type Customer = { id: string; code: string; name: string; priorityTier: number };
type Species = { id: string; code: string; name: string; localName: string | null; indicativeSell: number | null };
type Line = { key: number; speciesId: string; requestedKg: string; pricePerKg: string };

export function NewOrderDialog({ customers, species, marketDateLabel }: { customers: Customer[]; species: Species[]; marketDateLabel: string }) {
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [lines, setLines] = useState<Line[]>([{ key: 1, speciesId: "", requestedKg: "", pricePerKg: "" }]);
  const { pending, exec } = useAction();
  const byId = useMemo(() => new Map(species.map((s) => [s.id, s])), [species]);

  const valid = customerId && lines.length > 0 && lines.every((l) => l.speciesId && Number(l.requestedKg) > 0 && Number(l.pricePerKg) > 0);
  const total = lines.reduce((a, l) => a + (Number(l.requestedKg) || 0) * (Number(l.pricePerKg) || 0), 0);
  const totalKg = lines.reduce((a, l) => a + (Number(l.requestedKg) || 0), 0);

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const reset = () => {
    setCustomerId("");
    setLines([{ key: 1, speciesId: "", requestedKg: "", pricePerKg: "" }]);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="primary" data-testid="new-order-btn"><Plus /> New order</Button>
      </DialogTrigger>
      <DialogContent title="New buyer order" description={`Confirmed order for tonight's market (${marketDateLabel}). Recorded as a phone order.`} wide>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            exec(
              () => createSalesOrderAction({ customerId, lines: lines.map((l) => ({ speciesId: l.speciesId, requestedKg: Number(l.requestedKg), pricePerKg: Number(l.pricePerKg) })) }),
              { onOk: () => { setOpen(false); reset(); } },
            );
          }}
        >
          <Field label="Customer">
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required data-testid="new-order-customer">
              <option value="">Select a buyer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name} · {c.code}{c.priorityTier === 1 ? " · priority" : ""}</option>
              ))}
            </Select>
          </Field>

          <div>
            <div className="mb-1 hidden grid-cols-[1fr_110px_120px_36px] gap-2 text-xs font-medium text-muted sm:grid">
              <span>Species</span><span>Quantity (kg)</span><span>Price (S$/kg)</span><span />
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={l.key} className="grid grid-cols-2 gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_110px_120px_36px] sm:border-0 sm:p-0">
                  <Select
                    className="col-span-2 sm:col-span-1"
                    aria-label={`Species line ${i + 1}`}
                    value={l.speciesId}
                    onChange={(e) => {
                      const sp = byId.get(e.target.value);
                      update(l.key, { speciesId: e.target.value, pricePerKg: l.pricePerKg || (sp?.indicativeSell ? sp.indicativeSell.toFixed(2) : "") });
                    }}
                  >
                    <option value="">Species…</option>
                    {species.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}{s.localName ? ` (${s.localName})` : ""}</option>
                    ))}
                  </Select>
                  <Input aria-label="Quantity kg" className="num" type="number" inputMode="decimal" step="0.1" min="0.1" placeholder="kg" value={l.requestedKg} onChange={(e) => update(l.key, { requestedKg: e.target.value })} />
                  <Input aria-label="Price per kg" className="num" type="number" inputMode="decimal" step="0.01" min="0.01" placeholder="S$/kg" value={l.pricePerKg} onChange={(e) => update(l.key, { pricePerKg: e.target.value })} />
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="col-span-2 w-full sm:col-span-1 sm:w-9">
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setLines((ls) => [...ls, { key: Math.max(...ls.map((x) => x.key)) + 1, speciesId: "", requestedKg: "", pricePerKg: "" }])}>
              <Plus /> Add line
            </Button>
            <p className="mt-1 text-[11px] text-muted">Price defaults to tonight&apos;s indicative sell price where one exists. Adjust to the agreed price.</p>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted">
              <span className="num text-sm font-semibold text-text">{totalKg.toFixed(1)} kg</span> · <span className="num text-sm font-semibold text-text">{sgd(total)}</span> before GST
            </div>
            <Button type="submit" variant="primary" size="lg" disabled={!valid || pending} data-testid="new-order-submit">
              {pending ? "Saving…" : "Confirm order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
