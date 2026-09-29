/**
 * Event → agent wiring. Agents react to domain events instead of polling.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { catchLot, shipment, shipmentStop, customer, vendor } from "@/lib/db/schema";
import { on } from "./bus";
import { runProcurementAgent } from "@/lib/agents/procurement";
import { runAllocationAgent, runApReconciliation, runReceivingQualityAgent } from "@/lib/agents/operations";
import { notify, raiseException } from "@/lib/services/common";
import { fmtTime, minutesBetween } from "@/lib/domain/time";

export function registerHandlers() {
  // New/confirmed catch or new demand or quotes → re-evaluate supply vs demand for that night.
  const reprocure = async (e: { orgId: string; payload: Record<string, unknown>; id: string; occurredAt: Date }) => {
    const marketDate = e.payload.marketDate as string | undefined;
    if (!marketDate) return;
    await runProcurementAgent(e.orgId, marketDate, "EVENT", { triggerEventId: e.id, speciesId: (e.payload.speciesId as string) ?? undefined, at: e.occurredAt });
  };
  on("CATCH_DECLARED", async (e) => {
    const [lot] = await db.select().from(catchLot).where(eq(catchLot.id, e.payload.lotId as string));
    if (lot?.vendorId) {
      await notify(db, e.orgId, { audience: "SUPPLIER", vendorId: lot.vendorId, title: "Catch declaration received", body: `Your ${lot.canonicalSpeciesName ?? "catch"} declaration (${lot.lotNumber}) was received.`, href: "/supplier", at: e.occurredAt });
    }
    await reprocure(e);
  });
  on("QUOTE_RECEIVED", reprocure);
  on("DEMAND_UPDATED", async (e) => reprocure({ ...e, payload: { marketDate: e.payload.marketDate } }));

  on("VESSEL_ETA_UPDATED", async (e) => {
    const [lot] = await db.select().from(catchLot).where(eq(catchLot.id, e.payload.lotId as string));
    if (!lot?.originalEta || !lot.expectedArrivalAt) return;
    const delay = minutesBetween(lot.originalEta, lot.expectedArrivalAt);
    if (delay > 30) {
      const [v] = lot.vendorId ? await db.select({ name: vendor.name }).from(vendor).where(eq(vendor.id, lot.vendorId)) : [];
      await raiseException(db, e.orgId, {
        type: "LATE_VESSEL", severity: delay > 90 ? "HIGH" : "MEDIUM",
        title: `${v?.name ?? "Vessel"} late: ETA ${fmtTime(lot.originalEta)} → ${fmtTime(lot.expectedArrivalAt)}`,
        detail: `Lots from this ${lot.vesselId ? "vessel" : "supplier"} are now ${delay} min late (e.g. ${lot.lotNumber}, ${lot.canonicalSpeciesName}). Allocation and dispatch timing at risk.`,
        entityType: "catch_lot", entityId: lot.id, href: `/supply/expected`, dedupeKey: `LATE:${lot.vesselId ?? lot.vendorId ?? lot.id}:${lot.marketDate}`, at: e.occurredAt,
      });
      await notify(db, e.orgId, { audience: "OPERATIONS", title: `Vessel ETA changed to ${fmtTime(lot.expectedArrivalAt)}`, body: `${lot.lotNumber} delayed ${delay} min.`, href: `/supply/expected`, at: e.occurredAt });
    }
    await runProcurementAgent(e.orgId, lot.marketDate, "EVENT", { triggerEventId: e.id, speciesId: lot.speciesId ?? undefined, at: e.occurredAt });
  });

  on("LOT_RECEIVED", async (e) => {
    await runReceivingQualityAgent(e.orgId, e.payload.lotId as string, e.id, e.occurredAt);
    if (e.payload.speciesId && e.payload.marketDate) await runAllocationAgent(e.orgId, e.payload.marketDate as string, e.payload.speciesId as string, "EVENT", { triggerEventId: e.id, at: e.occurredAt });
  });

  on("INVOICE_RECEIVED", async (e) => {
    await runApReconciliation(e.orgId, e.payload.supplierInvoiceId as string, e.id, e.occurredAt);
  });

  on("SHIPMENT_DISPATCHED", async (e) => {
    const [sh] = await db.select().from(shipment).where(eq(shipment.id, e.payload.shipmentId as string));
    const stops = await db.select({ st: shipmentStop, c: customer }).from(shipmentStop).innerJoin(customer, eq(customer.id, shipmentStop.customerId)).where(eq(shipmentStop.shipmentId, sh.id));
    for (const s of stops) await notify(db, e.orgId, { audience: "BUYER", customerId: s.c.id, title: "Your order is on the way", body: `${sh.shipmentNumber} departed; ETA ${fmtTime(s.st.plannedArrivalAt)}.`, at: e.occurredAt });
  });
}
