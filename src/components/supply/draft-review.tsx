"use client";
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Check, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useAction } from "@/components/app/action-button";
import { confirmLotAction } from "@/app/actions";
import { cn } from "@/lib/utils";

export type DraftLotView = {
  id: string;
  lotNumber: string;
  vendorName: string | null;
  supplierSpeciesName: string | null;
  speciesId: string | null;
  quantityKg: number;
  sizeMinKg: number | null;
  sizeMaxKg: number | null;
  askingPricePerKg: number | null;
  etaLocal: string | null;
  confidence: number | null;
  fieldConfidence: Record<string, number> | null;
  ambiguous: string[];
  confirmation: "DRAFT" | "CONFIRMED";
  bought: boolean;
};

const confTone = (c: number | undefined) => (c === undefined ? "text-muted" : c >= 0.85 ? "text-ok" : c >= 0.7 ? "text-surplus" : "text-short");

/** Review a draft lot: only ambiguous fields are highlighted; one tap to confirm as an offer or confirm & buy. */
export function DraftReview({ lot, species, canBuy }: { lot: DraftLotView; species: { id: string; name: string }[]; canBuy: boolean }) {
  const { pending, exec } = useAction();
  const [speciesId, setSpeciesId] = useState(lot.speciesId ?? "");
  const [qty, setQty] = useState(String(lot.quantityKg));
  const [price, setPrice] = useState(lot.askingPricePerKg ? String(lot.askingPricePerKg) : "");
  const [eta, setEta] = useState(lot.etaLocal ?? "");
  const amb = new Set(lot.ambiguous);
  const edits = () => ({
    speciesId: speciesId || undefined,
    quantityKg: Number(qty),
    askingPricePerKg: price ? Number(price) : null,
    etaLocal: eta || null,
  });
  const fc = lot.fieldConfidence ?? {};
  const box = (field: string) => cn(amb.has(field) && "border-surplus ring-1 ring-surplus/40");
  return (
    <div className="rounded-xl border border-border bg-panel p-4" data-testid={`draft-${lot.lotNumber}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/supply/lots/${lot.id}`} className="num text-sm font-semibold text-text hover:text-accent">{lot.lotNumber}</Link>
        <Badge tone={lot.confirmation === "DRAFT" ? "surplus" : "info"}>{lot.confirmation === "DRAFT" ? "Draft" : "Offer"}</Badge>
        {lot.vendorName && <span className="text-xs text-muted">{lot.vendorName}</span>}
        {lot.confidence !== null && <span className={cn("num ml-auto text-xs", confTone(lot.confidence))}>AI confidence {Math.round(lot.confidence * 100)}%</span>}
      </div>
      {lot.supplierSpeciesName && <p className="mt-1 text-xs text-muted">Supplier wrote: “<span className="text-text-2">{lot.supplierSpeciesName}</span>”</p>}
      {amb.size > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-surplus"><AlertTriangle className="size-3.5" /> Check: {[...amb].join(", ")}</p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-[11px] text-muted">Species <span className={confTone(fc.species)}>{fc.species ? `${Math.round(fc.species * 100)}%` : ""}</span>
          <Select value={speciesId} onChange={(e) => setSpeciesId(e.target.value)} className={box("species")} data-testid="draft-species">
            <option value="">Choose…</option>
            {species.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </label>
        <label className="text-[11px] text-muted">Quantity (kg) <span className={confTone(fc.quantity)}>{fc.quantity ? `${Math.round(fc.quantity * 100)}%` : ""}</span>
          <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className={cn("num", box("quantity"))} />
        </label>
        <label className="text-[11px] text-muted">Price (S$/kg) <span className={confTone(fc.price)}>{fc.price ? `${Math.round(fc.price * 100)}%` : ""}</span>
          <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="—" className={cn("num", box("price"))} />
        </label>
        <label className="text-[11px] text-muted">ETA (SGT) <span className={confTone(fc.eta)}>{fc.eta ? `${Math.round(fc.eta * 100)}%` : ""}</span>
          <Input value={eta} onChange={(e) => setEta(e.target.value)} placeholder="HH:MM" className={cn("num", box("eta"))} />
        </label>
      </div>
      {(lot.sizeMinKg || lot.sizeMaxKg) && <p className="num mt-2 text-xs text-muted">Size {Math.round((lot.sizeMinKg ?? 0) * 1000)}–{Math.round((lot.sizeMaxKg ?? lot.sizeMinKg ?? 0) * 1000)} g</p>}
      {!lot.bought && (
        <div className="mt-3 flex flex-wrap gap-2">
          {canBuy && (
            <Button variant="primary" size="lg" disabled={pending || !speciesId || !price} data-testid={`confirm-buy-${lot.lotNumber}`} onClick={() => exec(() => confirmLotAction(lot.id, edits(), true))}>
              <ShoppingCart /> Confirm &amp; buy
            </Button>
          )}
          <Button variant="secondary" size="lg" disabled={pending || !speciesId} data-testid={`confirm-offer-${lot.lotNumber}`} onClick={() => exec(() => confirmLotAction(lot.id, edits(), false))}>
            <Check /> {lot.confirmation === "DRAFT" ? "Confirm as offer" : "Save changes"}
          </Button>
        </div>
      )}
    </div>
  );
}
