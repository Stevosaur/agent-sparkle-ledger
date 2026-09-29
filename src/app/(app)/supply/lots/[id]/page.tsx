import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { and, asc, eq } from "drizzle-orm";
import { GitBranch } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { allocation, catchLot, catchLotDocument, customer, farm, goodsReceiptLine, message, purchaseOrder, purchaseOrderLine, qualityInspection, salesOrder, salesOrderLine, species, temperatureReading, vendor, vessel } from "@/lib/db/schema";
import { timelineFor } from "@/lib/services/queries";
import { toDraftView } from "@/lib/services/lot-views";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Dl, PageHeader, AiMark } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Timeline } from "@/components/app/timeline";
import { DraftReview } from "@/components/supply/draft-review";
import { LotActions } from "./lot-actions";
import { date, kg, perKg, time, titleCase } from "@/lib/format";

export default async function LotPage({ params }: { params: Promise<{ id: string }> }) {
  const app = await requireApp("supply.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [lot] = await db.select().from(catchLot).where(and(eq(catchLot.id, id), eq(catchLot.orgId, app.org.id)));
  if (!lot) notFound();
  const [[v], [vs], [fm], [sp], children, [parent], [msg], po, receipts, inspections, temps, allocs, docs, spp] = await Promise.all([
    lot.vendorId ? db.select().from(vendor).where(eq(vendor.id, lot.vendorId)) : Promise.resolve([]),
    lot.vesselId ? db.select().from(vessel).where(eq(vessel.id, lot.vesselId)) : Promise.resolve([]),
    lot.farmId ? db.select().from(farm).where(eq(farm.id, lot.farmId)) : Promise.resolve([]),
    lot.speciesId ? db.select().from(species).where(eq(species.id, lot.speciesId)) : Promise.resolve([]),
    db.select().from(catchLot).where(eq(catchLot.parentLotId, lot.id)).orderBy(asc(catchLot.lotNumber)),
    lot.parentLotId ? db.select().from(catchLot).where(eq(catchLot.id, lot.parentLotId)) : Promise.resolve([]),
    lot.intakeMessageId ? db.select().from(message).where(eq(message.id, lot.intakeMessageId)) : Promise.resolve([]),
    lot.purchaseOrderLineId ? db.select({ po: purchaseOrder, pol: purchaseOrderLine }).from(purchaseOrderLine).innerJoin(purchaseOrder, eq(purchaseOrder.id, purchaseOrderLine.purchaseOrderId)).where(eq(purchaseOrderLine.id, lot.purchaseOrderLineId)) : Promise.resolve([]),
    db.select().from(goodsReceiptLine).where(eq(goodsReceiptLine.lotId, lot.id)),
    db.select().from(qualityInspection).where(eq(qualityInspection.lotId, lot.id)),
    db.select().from(temperatureReading).where(eq(temperatureReading.lotId, lot.id)),
    db.select({ a: allocation, c: customer, so: salesOrder }).from(allocation).innerJoin(salesOrderLine, eq(salesOrderLine.id, allocation.salesOrderLineId)).innerJoin(salesOrder, eq(salesOrder.id, salesOrderLine.salesOrderId)).innerJoin(customer, eq(customer.id, salesOrder.customerId)).where(eq(allocation.lotId, lot.id)),
    db.select().from(catchLotDocument).where(eq(catchLotDocument.lotId, lot.id)),
    db.select({ id: species.id, name: species.canonicalName }).from(species).where(eq(species.orgId, app.org.id)).orderBy(species.canonicalName),
  ]);
  const events = await timelineFor(app.org.id, [lot.id, ...children.map((c) => c.id), ...(po[0] ? [po[0].po.id] : [])]);
  const qr = await QRCode.toString(lot.lotNumber, { type: "svg", margin: 1, color: { dark: "#0b1220", light: "#ffffff" } });
  const bought = !!lot.purchaseOrderLineId;
  const inbound = lot.status === "EXPECTED" || lot.status === "LANDED";
  const late = lot.originalEta && lot.expectedArrivalAt && lot.expectedArrivalAt.getTime() - lot.originalEta.getTime() > 30 * 60000;

  return (
    <div>
      <PageHeader
        eyebrow={<Link href="/supply/lots" className="hover:underline">Catch lot</Link>}
        title={<span className="num">{lot.lotNumber}</span>}
        subtitle={`${sp?.canonicalName ?? lot.supplierSpeciesName ?? "Unmapped species"} · ${v?.name ?? "No vendor"} · ${date(lot.marketDate)} market`}
        actions={
          <>
            <StatusBadge status={lot.status} />
            {lot.confirmation === "DRAFT" && <Badge tone="surplus">Draft</Badge>}
            {!bought && lot.confirmation === "CONFIRMED" && inbound && <Badge tone="info">Offer — not bought</Badge>}
            {late && <Badge tone="late">Late</Badge>}
            <Link href={`/trace/${lot.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-text hover:bg-panel-2"><GitBranch className="size-4" /> Trace chain</Link>
          </>
        }
      />
      <div className="mb-4">
        <LotActions lotId={lot.id} status={lot.status} availableKg={Number(lot.quantityAvailableKg)} canReceive={app.can("ops.receive")} canSupply={app.can("supply.write")} />
      </div>

      {(!bought && inbound) && (
        <div className="mb-4">
          <DraftReview lot={toDraftView(lot, v?.name ?? null)} species={spp} canBuy={app.can("po.approve")} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_260px]">
        <Card>
          <CardHeader title="Quantities" />
          <CardBody>
            <Dl items={[
              ["Declared", <span key="d" className="num">{kg(lot.quantityDeclaredKg)}</span>],
              ["Received", <span key="r" className="num">{kg(lot.quantityReceivedKg)}</span>],
              ["Rejected", <span key="j" className="num">{kg(lot.quantityRejectedKg)}</span>],
              ["Available", <span key="a" className="num font-semibold">{kg(lot.quantityAvailableKg)}</span>],
              ["Allocated", <span key="al" className="num">{kg(lot.quantityAllocatedKg)}</span>],
              ["Size", lot.sizeMinKg ? <span key="s" className="num">{Math.round(Number(lot.sizeMinKg) * 1000)}–{Math.round(Number(lot.sizeMaxKg ?? lot.sizeMinKg) * 1000)} g</span> : "—"],
              ["Grade", lot.qualityGrade ?? "—"],
              ["Processing", titleCase(lot.processingState)],
              ["Temp at receiving", lot.temperatureAtReceivingC ? <span key="t" className={`num ${Number(lot.temperatureAtReceivingC) > app.org.settings.receivingTempMaxC ? "text-short" : ""}`}>{lot.temperatureAtReceivingC}°C</span> : "—"],
              ["Asking / agreed", <span key="p" className="num">{perKg(lot.askingPricePerKg, lot.currency)} / {perKg(lot.agreedCostPerKg, lot.currency)}</span>],
            ]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Origin" />
          <CardBody>
            <Dl items={[
              ["Vendor", v ? <Link key="v" href={`/vendors/${v.id}`} className="text-accent">{v.name}</Link> : "—"],
              ["Vessel / farm", vs ? `${vs.name} (${vs.registrationNo})` : fm ? `${fm.name} (${fm.farmType.replaceAll("_", " ").toLowerCase()})` : "—"],
              ["Source", [lot.sourceLocation, lot.sourceCountry].filter(Boolean).join(", ") || "—"],
              ["Landing", lot.landingLocation ?? "—"],
              ["Scientific name", sp?.scientificName ? <i key="sn">{sp.scientificName}</i> : "—"],
              ["Supplier wording", lot.supplierSpeciesName ? `“${lot.supplierSpeciesName}”` : "—"],
              ["ETA", <span key="e" className="num">{time(lot.expectedArrivalAt)}{late ? ` (was ${time(lot.originalEta)})` : ""}</span>],
              ["Received at", <span key="ra" className="num">{time(lot.receivedTime)}</span>],
              ["Purchase order", po[0] ? <Link key="po" href={`/procurement/purchase-orders/${po[0].po.id}`} className="num text-accent">{po[0].po.poNumber}</Link> : "Not purchased"],
              ["Compliance refs", Object.entries(lot.compliance ?? {}).filter(([k]) => k !== "mode").map(([k, val]) => `${k}: ${val}`).join(" · ") || (docs.length ? docs.map((d) => `${d.docType} ${d.referenceNo}`).join(" · ") : "—")],
            ]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Lot label" subtitle="Scan at receiving" />
          <CardBody className="flex flex-col items-center gap-2">
            <div className="w-40 rounded-md bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} />
            <div className="num text-xs text-text">{lot.lotNumber}</div>
            <div className="text-[11px] text-muted">{sp?.canonicalName} · {kg(lot.quantityReceivedKg ?? lot.quantityDeclaredKg)}</div>
          </CardBody>
        </Card>
      </div>

      {msg && (
        <Card className="mt-4">
          <CardHeader title={<span className="flex items-center gap-2"><AiMark /> Source message</span>} subtitle={`${msg.channel.replaceAll("_", " ").toLowerCase()} · ${time(msg.at)} · parsed by the Catch Intake Agent (confidence ${lot.intakeConfidence ? Math.round(Number(lot.intakeConfidence) * 100) : "?"}%)`} />
          <CardBody><p className="whitespace-pre-line rounded-lg bg-panel-2 p-3 text-sm text-text">{msg.body}</p></CardBody>
        </Card>
      )}

      {(parent || children.length > 0) && (
        <Card className="mt-4">
          <CardHeader title="Genealogy" subtitle="Parent → child lots created by processing" />
          <CardBody className="space-y-2 text-sm">
            {parent && <p>Parent: <Link href={`/supply/lots/${parent.id}`} className="num text-accent">{parent.lotNumber}</Link> ({titleCase(parent.processingState)})</p>}
            {children.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
                <Link href={`/supply/lots/${c.id}`} className="num text-accent">{c.lotNumber}</Link>
                <span className="text-text-2">{titleCase(c.processingState)}</span>
                <span className="num ml-auto text-text">{kg(c.quantityDeclaredKg)}</span>
                <StatusBadge status={c.status} />
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Receiving & quality" />
          <CardBody>
            {receipts.length === 0 ? <p className="text-xs text-muted">Not received yet.</p> : (
              <Table>
                <THead><tr><TH>Declared</TH><TH align="right">Received</TH><TH align="right">Rejected</TH><TH>Reason</TH><TH align="right">Temp</TH><TH>Grade</TH></tr></THead>
                <tbody>{receipts.map((r) => (
                  <TR key={r.id}><TD num>{kg(r.declaredKg)}</TD><TD num>{kg(r.receivedKg)}</TD><TD num>{kg(r.rejectedKg)}</TD><TD>{r.rejectionReason ? titleCase(r.rejectionReason) : "—"}</TD><TD num className={Number(r.temperatureC) > app.org.settings.receivingTempMaxC ? "text-short" : ""}>{r.temperatureC ?? "—"}°C</TD><TD>{r.qualityGrade}</TD></TR>
                ))}</tbody>
              </Table>
            )}
            {inspections.filter((i) => i.notes).map((i) => <p key={i.id} className="mt-2 text-xs text-muted">Inspector note: {i.notes}</p>)}
            {temps.length > 0 && <p className="mt-2 text-xs text-muted">{temps.length} temperature reading(s), {temps.filter((t) => t.isException).length} exception(s).</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Allocations" subtitle="Which buyers receive this lot" />
          <CardBody>
            {allocs.length === 0 ? <p className="text-xs text-muted">Not allocated.</p> : (
              <Table>
                <THead><tr><TH>Customer</TH><TH>Order</TH><TH align="right">kg</TH><TH>Status</TH></tr></THead>
                <tbody>{allocs.map(({ a, c, so }) => (
                  <TR key={a.id}><TD>{c.name}</TD><TD><Link href={`/orders/${so.id}`} className="num text-accent">{so.soNumber}</Link></TD><TD num>{kg(a.quantityKg)}</TD><TD><StatusBadge status={a.status} /></TD></TR>
                ))}</tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Activity" subtitle="Every change — human or AI — with source and before/after" />
        <CardBody><Timeline events={events} /></CardBody>
      </Card>
    </div>
  );
}

