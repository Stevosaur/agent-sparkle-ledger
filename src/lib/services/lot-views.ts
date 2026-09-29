import type { DraftLotView } from "@/components/supply/draft-review";
import type { catchLot } from "@/lib/db/schema";
import { sgtParts } from "@/lib/domain/time";

export function toDraftView(l: typeof catchLot.$inferSelect, vendorName: string | null): DraftLotView {
  const eta = l.expectedArrivalAt ? sgtParts(l.expectedArrivalAt) : null;
  return {
    id: l.id,
    lotNumber: l.lotNumber,
    vendorName,
    supplierSpeciesName: l.supplierSpeciesName,
    speciesId: l.speciesId,
    quantityKg: Number(l.quantityDeclaredKg),
    sizeMinKg: l.sizeMinKg ? Number(l.sizeMinKg) : null,
    sizeMaxKg: l.sizeMaxKg ? Number(l.sizeMaxKg) : null,
    askingPricePerKg: l.askingPricePerKg ? Number(l.askingPricePerKg) : null,
    etaLocal: eta ? `${String(eta.hour).padStart(2, "0")}:${String(eta.minute).padStart(2, "0")}` : null,
    confidence: l.intakeConfidence ? Number(l.intakeConfidence) : null,
    fieldConfidence: l.fieldConfidence ?? null,
    ambiguous: l.ambiguousFields,
    confirmation: l.confirmation,
    bought: !!l.purchaseOrderLineId,
  };
}
