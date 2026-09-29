"use client";
import Link from "next/link";
import { useState } from "react";
import { Clock, Scissors, ScanLine, Anchor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ActionButton, useAction } from "@/components/app/action-button";
import { markLandedAction, transformLotAction, updateEtaAction } from "@/app/actions";

export function LotActions({ lotId, status, availableKg, canReceive, canSupply }: { lotId: string; status: string; availableKg: number; canReceive: boolean; canSupply: boolean }) {
  const [eta, setEta] = useState("");
  const { pending, exec } = useAction();
  const inbound = status === "EXPECTED" || status === "LANDED";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {inbound && canReceive && (
        <Button asChild variant="primary"><Link href={`/receive?lot=${lotId}`} data-testid="receive-lot"><ScanLine /> Receive</Link></Button>
      )}
      {status === "EXPECTED" && canReceive && <ActionButton action={() => markLandedAction(lotId)}><Anchor /> Mark landed</ActionButton>}
      {inbound && canSupply && (
        <div className="flex items-center gap-1">
          <Input value={eta} onChange={(e) => setEta(e.target.value)} placeholder="New ETA HH:MM" className="num h-9 w-32" />
          <Button disabled={pending || !/^\d{2}:\d{2}$/.test(eta)} onClick={() => exec(() => updateEtaAction(lotId, eta, "Updated from lot page"))}><Clock /> ETA</Button>
        </div>
      )}
      {availableKg > 0 && canReceive && <TransformDialog lotId={lotId} availableKg={availableKg} />}
    </div>
  );
}

function TransformDialog({ lotId, availableKg }: { lotId: string; availableKg: number }) {
  const [outs, setOuts] = useState([{ processingState: "CLEANED" as const, kg: "" }]);
  const [waste, setWaste] = useState("");
  const [open, setOpen] = useState(false);
  const { pending, exec } = useAction();
  const total = outs.reduce((a, o) => a + (Number(o.kg) || 0), 0) + (Number(waste) || 0);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Scissors /> Process lot</Button></DialogTrigger>
      <DialogContent title="Process into child lots" description={`Each output becomes a traceable child lot. Available: ${availableKg.toFixed(1)} kg.`}>
        <div className="space-y-2">
          {outs.map((o, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px] gap-2">
              <Select value={o.processingState} onChange={(e) => setOuts(outs.map((x, j) => (j === i ? { ...x, processingState: e.target.value as "CLEANED" } : x)))}>
                {["WHOLE", "GUTTED", "CLEANED", "FILLETED", "PORTIONED", "FROZEN"].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
              </Select>
              <Input inputMode="decimal" placeholder="kg" value={o.kg} onChange={(e) => setOuts(outs.map((x, j) => (j === i ? { ...x, kg: e.target.value } : x)))} className="num" />
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setOuts([...outs, { processingState: "CLEANED", kg: "" }])}>+ Add output</Button>
          <div className="grid grid-cols-[1fr_120px] items-center gap-2">
            <span className="text-sm text-muted">Waste / trim (kg)</span>
            <Input inputMode="decimal" value={waste} onChange={(e) => setWaste(e.target.value)} className="num" />
          </div>
          <p className={`num text-xs ${total > availableKg ? "text-short" : "text-muted"}`}>Total {total.toFixed(1)} / {availableKg.toFixed(1)} kg</p>
          <Button variant="primary" className="w-full" disabled={pending || total <= 0 || total > availableKg}
            onClick={() => exec(() => transformLotAction(lotId, outs.filter((o) => Number(o.kg) > 0).map((o) => ({ processingState: o.processingState, kg: Number(o.kg) })), Number(waste) || 0), { onOk: () => setOpen(false) })}>
            Create child lots
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
