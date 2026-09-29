import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { requireApp } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { catchLot, vendor } from "@/lib/db/schema";
import { MobileHeader } from "@/components/mobile/mobile-header";
import { ReceiveFlow } from "./receive-flow";

export const metadata = { title: "Receive" };

export default async function ReceivePage({ searchParams }: { searchParams: Promise<{ lot?: string }> }) {
  const app = await requireApp("ops.receive");
  const sp = await searchParams;
  const rows = await db
    .select({ l: catchLot, v: vendor })
    .from(catchLot)
    .leftJoin(vendor, eq(vendor.id, catchLot.vendorId))
    .where(and(eq(catchLot.orgId, app.org.id), eq(catchLot.marketDate, app.marketDate), inArray(catchLot.status, ["EXPECTED", "LANDED"]), isNotNull(catchLot.purchaseOrderLineId), isNull(catchLot.parentLotId)))
    .orderBy(asc(catchLot.expectedArrivalAt));
  const lots = rows.map(({ l, v }) => ({
    id: l.id,
    lotNumber: l.lotNumber,
    species: l.canonicalSpeciesName ?? l.supplierSpeciesName ?? "?",
    vendor: v?.name ?? "—",
    declaredKg: Number(l.quantityDeclaredKg),
    eta: l.expectedArrivalAt?.toISOString() ?? null,
    status: l.status,
    size: l.sizeMinKg ? `${Math.round(Number(l.sizeMinKg) * 1000)}–${Math.round(Number(l.sizeMaxKg ?? l.sizeMinKg) * 1000)} g` : null,
  }));
  return (
    <div className="min-h-dvh bg-bg">
      <MobileHeader title="Receiving" back="/operations/receiving" demo={app.org.isDemo} right={<span className="text-xs text-muted">{app.user.name}</span>} />
      <ReceiveFlow lots={lots} initialLotId={sp.lot ?? null} tempMax={app.org.settings.receivingTempMaxC} />
    </div>
  );
}
