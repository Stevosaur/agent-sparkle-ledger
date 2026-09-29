import { and, desc, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireApp } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { catchLot, purchaseOrder, purchaseOrderLine, rfq, species, vendor, notification } from "@/lib/db/schema";
import { MobileHeader } from "@/components/mobile/mobile-header";
import { SupplierApp } from "./supplier-app";

export const metadata = { title: "Supplier" };

export default async function SupplierPage({ searchParams }: { searchParams: Promise<{ vendor?: string }> }) {
  const app = await requireApp();
  const sp = await searchParams;
  let vendorId = app.role === "SUPPLIER" ? app.membership.vendorId : null;
  const preview = app.role !== "SUPPLIER";
  if (preview) {
    if (!app.can("supply.write")) redirect("/dashboard");
    const [v] = sp.vendor
      ? await db.select().from(vendor).where(and(eq(vendor.id, sp.vendor), eq(vendor.orgId, app.org.id)))
      : await db.select().from(vendor).where(and(eq(vendor.orgId, app.org.id), eq(vendor.code, "V-AHSENG")));
    vendorId = v?.id ?? null;
  }
  if (!vendorId) redirect("/dashboard");
  const [v] = await db.select().from(vendor).where(eq(vendor.id, vendorId));
  const lots = await db
    .select({ l: catchLot, po: purchaseOrder, pol: purchaseOrderLine })
    .from(catchLot)
    .leftJoin(purchaseOrderLine, eq(purchaseOrderLine.id, catchLot.purchaseOrderLineId))
    .leftJoin(purchaseOrder, eq(purchaseOrder.id, purchaseOrderLine.purchaseOrderId))
    .where(and(eq(catchLot.orgId, app.org.id), eq(catchLot.vendorId, vendorId), eq(catchLot.marketDate, app.marketDate), sql`${catchLot.parentLotId} IS NULL`))
    .orderBy(desc(catchLot.createdAt));
  const rfqs = await db
    .select({ r: rfq, s: species })
    .from(rfq)
    .innerJoin(species, eq(species.id, rfq.speciesId))
    .where(and(eq(rfq.orgId, app.org.id), eq(rfq.marketDate, app.marketDate), sql`${vendorId} = ANY(${rfq.vendorIds})`, eq(rfq.status, "SENT")));
  const notes = await db.select().from(notification).where(and(eq(notification.orgId, app.org.id), eq(notification.audience, "SUPPLIER"), eq(notification.vendorId, vendorId))).orderBy(desc(notification.createdAt)).limit(5);
  const vendors = preview ? await db.select({ id: vendor.id, name: vendor.name }).from(vendor).where(and(eq(vendor.orgId, app.org.id), sql`${vendor.whatsappNumber} IS NOT NULL`)).orderBy(vendor.name) : [];

  return (
    <div className="min-h-dvh bg-bg">
      <MobileHeader title="PasarCatch" demo={app.org.isDemo} right={<span className="text-xs text-muted">{v.name}</span>} />
      <SupplierApp
        vendor={{ id: v.id, name: v.name }}
        preview={preview}
        vendors={vendors}
        buyerName={app.org.name.replace(" (DEMO)", "")}
        lots={lots.map(({ l, po, pol }) => ({
          id: l.id,
          lotNumber: l.lotNumber,
          species: l.canonicalSpeciesName ?? l.supplierSpeciesName ?? "?",
          declaredKg: Number(l.quantityDeclaredKg),
          receivedKg: l.quantityReceivedKg ? Number(l.quantityReceivedKg) : null,
          price: l.agreedCostPerKg ? Number(l.agreedCostPerKg) : l.askingPricePerKg ? Number(l.askingPricePerKg) : null,
          status: l.status,
          confirmation: l.confirmation,
          bought: !!pol,
          poNumber: po?.poNumber ?? null,
          boughtKg: pol ? Number(pol.quantityKg) : null,
          eta: l.expectedArrivalAt?.toISOString() ?? null,
        }))}
        rfqs={rfqs.map(({ r, s }) => ({ id: r.id, number: r.rfqNumber, species: s.canonicalName, kg: Number(r.quantityKg), deliverBy: r.deliverBy?.toISOString() ?? null }))}
        notes={notes.map((n) => ({ id: n.id, title: n.title, body: n.body }))}
      />
    </div>
  );
}
