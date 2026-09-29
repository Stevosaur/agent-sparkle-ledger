import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { agentAction, agentRun, approval, catchLot, goodsReceipt, goodsReceiptLine, opsException, purchaseOrder, purchaseOrderLine, species, supplierInvoice, supplierInvoiceLine, vendor } from "@/lib/db/schema";
import { timelineFor } from "@/lib/services/queries";
import { toApprovalView } from "@/lib/services/views";
import { getOrg } from "@/lib/services/common";
import { threeWayMatch, type MatchResult } from "@/lib/domain/matching";
import { PageHeader, Stat, Empty, Dl } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ApprovalCard } from "@/components/app/approval-card";
import { date, dateTime, kgNum, perKg, sgd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MatchBadge, PaymentBadge, MATCH_LABEL } from "../../_ui";
import { ReconActions } from "./recon-actions";

export const metadata = { title: "Invoice match" };

const signed = (v: number, fmt: (x: number) => string) => (Math.abs(v) < 0.0005 ? fmt(0) : `${v > 0 ? "+" : "−"}${fmt(Math.abs(v))}`);

export default async function ReconDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const app = await requireApp("finance.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [row] = await db
    .select({ si: supplierInvoice, v: vendor, po: purchaseOrder })
    .from(supplierInvoice)
    .innerJoin(vendor, eq(vendor.id, supplierInvoice.vendorId))
    .leftJoin(purchaseOrder, eq(purchaseOrder.id, supplierInvoice.purchaseOrderId))
    .where(and(eq(supplierInvoice.id, id), eq(supplierInvoice.orgId, app.org.id)));
  if (!row) notFound();
  const { si, v, po } = row;

  const [ilines, poLines, pending, exceptions, timeline, org] = await Promise.all([
    db.select().from(supplierInvoiceLine).where(and(eq(supplierInvoiceLine.supplierInvoiceId, si.id), eq(supplierInvoiceLine.orgId, app.org.id))),
    po
      ? db.select({ pol: purchaseOrderLine, sp: species }).from(purchaseOrderLine).innerJoin(species, eq(species.id, purchaseOrderLine.speciesId)).where(and(eq(purchaseOrderLine.purchaseOrderId, po.id), eq(purchaseOrderLine.orgId, app.org.id)))
      : Promise.resolve([]),
    db
      .select({ a: approval, act: agentAction, run: agentRun })
      .from(approval)
      .leftJoin(agentAction, eq(agentAction.id, approval.agentActionId))
      .leftJoin(agentRun, eq(agentRun.id, agentAction.agentRunId))
      .where(and(eq(approval.orgId, app.org.id), eq(approval.kind, "APPROVE_INVOICE_EXCEPTION"), eq(approval.status, "PENDING"), sql`${approval.payload}->>'supplierInvoiceId' = ${si.id}`)),
    db.select().from(opsException).where(and(eq(opsException.orgId, app.org.id), eq(opsException.entityId, si.id))),
    timelineFor(app.org.id, [si.id, ...(po ? [po.id] : [])], 60),
    getOrg(db, app.org.id),
  ]);
  const receipts = poLines.length
    ? await db
        .select({ grl: goodsReceiptLine, gr: { grnNumber: goodsReceipt.grnNumber, receivedAt: goodsReceipt.receivedAt, receivedBy: goodsReceipt.receivedBy }, lot: { id: catchLot.id, lotNumber: catchLot.lotNumber } })
        .from(goodsReceiptLine)
        .innerJoin(goodsReceipt, eq(goodsReceipt.id, goodsReceiptLine.goodsReceiptId))
        .innerJoin(catchLot, eq(catchLot.id, goodsReceiptLine.lotId))
        .where(and(eq(goodsReceiptLine.orgId, app.org.id), inArray(goodsReceiptLine.purchaseOrderLineId, poLines.map((p) => p.pol.id))))
        .orderBy(asc(goodsReceipt.receivedAt))
    : [];

  // Stored result from the AP Reconciliation Agent; if not yet matched, compute a read-only preview with the same engine.
  const stored = si.matchResult as unknown as MatchResult | null;
  const gstRate = v.gstRegistered ? org.gstRatePct : "0";
  const result: MatchResult =
    stored ??
    threeWayMatch({
      poLines: poLines.map(({ pol, sp }) => ({ poLineId: pol.id, speciesId: pol.speciesId, description: sp.canonicalName, quantityKg: pol.quantityKg, pricePerKg: pol.pricePerKg })),
      receipts: receipts.map((r) => ({ poLineId: r.grl.purchaseOrderLineId, speciesId: poLines.find((p) => p.pol.id === r.grl.purchaseOrderLineId)?.pol.speciesId ?? "", acceptedKg: r.grl.acceptedKg })),
      invoiceLines: ilines.map((l) => ({ invoiceLineId: l.id, poLineId: l.purchaseOrderLineId, speciesId: l.speciesId, description: l.description, quantityKg: l.quantityKg, unitPrice: l.unitPrice, lineTotal: l.lineTotal })),
      invoiceSubtotal: si.subtotal,
      invoiceGst: si.gstAmount,
      gstRatePct: gstRate,
      tolerance: org.settings.invoiceTolerance,
    });
  const tol = org.settings.invoiceTolerance;
  const overEx = Number(result.potentialOverbillingExGst);
  const overInc = Number(result.potentialOverbillingIncGst);
  const expectedTotal = result.lines.reduce((a, l) => a + Number(l.expectedAmount), 0);
  const billedTotal = result.lines.reduce((a, l) => a + Number(l.billedAmount), 0);
  const lotFor = (poLineId: string | null) => {
    if (!poLineId) return [];
    const pl = poLines.find((p) => p.pol.id === poLineId);
    const fromGrn = receipts.filter((r) => r.grl.purchaseOrderLineId === poLineId);
    const lots = new Map<string, { id: string; lotNumber: string; grn?: string }>();
    for (const r of fromGrn) lots.set(r.lot.id, { id: r.lot.id, lotNumber: r.lot.lotNumber, grn: r.gr.grnNumber });
    if (pl?.pol.lotId && !lots.has(pl.pol.lotId)) lots.set(pl.pol.lotId, { id: pl.pol.lotId, lotNumber: "PO lot" });
    return [...lots.values()];
  };
  const matchedOk = ["MATCHED", "MATCH_WITHIN_TOLERANCE", "APPROVED_EXCEPTION"].includes(si.matchStatus);
  const headline =
    si.matchStatus === "EXCEPTION" || (!stored && result.status === "EXCEPTION")
      ? `${result.summary}${overInc > 0 && overInc !== overEx ? ` (${sgd(overInc)} incl. GST)` : ""}`
      : result.summary;

  return (
    <div>
      <Link href="/finance/reconciliation" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-accent"><ArrowLeft className="size-3.5" /> Reconciliation</Link>
      <PageHeader
        eyebrow={<span className="flex items-center gap-2">Three-way match · <span className="num">{si.invoiceNumber}</span></span>}
        title={<span className="flex flex-wrap items-center gap-3">{v.name} <MatchBadge status={si.matchStatus} data-testid="match-status" className="text-xs" /></span>}
        subtitle={<>Invoice dated {date(si.invoiceDate)}, due {date(si.dueDate)} · received {dateTime(si.receivedAt)} via {si.source.toLowerCase()}{po && <> · against <Link href={`/procurement/purchase-orders/${po.id}`} className="num text-accent hover:underline">{po.poNumber}</Link> (night of {date(po.marketDate)})</>}</>}
        actions={<ReconActions id={si.id} invoiceNumber={si.invoiceNumber} vendor={v.name} total={Number(si.total)} matchStatus={si.matchStatus} paymentStatus={si.paymentStatus} canApprove={app.can("finance.approve")} canWrite={app.can("finance.write")} />}
      />

      <div className={cn("mb-4 rounded-xl border px-4 py-3", si.matchStatus === "EXCEPTION" ? "border-short/40 bg-short-soft" : matchedOk ? "border-ok/30 bg-ok-soft" : "border-border bg-panel-2")} data-testid="match-summary">
        <div className={cn("text-sm font-semibold", si.matchStatus === "EXCEPTION" ? "text-short" : matchedOk ? "text-ok" : "text-text")}>{headline}</div>
        <div className="mt-1 text-xs text-text-2">
          {!stored && <span className="mr-2 font-medium text-surplus">Preview — the AP Reconciliation Agent has not stored a match yet.</span>}
          Tolerance used: ±{tol.qtyPct}% quantity, ±{tol.pricePct}% unit price, S${tol.amountAbs} per line (Settings → invoice tolerance). GST {Number(gstRate).toFixed(0)}%{v.gstRegistered ? "" : " — vendor not GST-registered"}.
          {si.matchStatus === "APPROVED_EXCEPTION" && si.approvedBy && <> Exception approved by {si.approvedBy}.</>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Invoice total" value={sgd(si.total)} sub={`${sgd(si.subtotal)} + GST ${sgd(si.gstAmount)}`} />
        <Stat label="Billed ex GST" value={sgd(billedTotal)} sub={`${result.lines.length} line(s)`} />
        <Stat label="Expected ex GST" value={sgd(expectedTotal)} sub="received kg × PO price" />
        <Stat label="Overbilling ex GST" value={sgd(overEx)} sub={`${sgd(overInc)} incl. GST${v.gstRegistered ? "" : " (no GST — vendor not registered)"}`} tone={overEx > 0 ? "short" : "ok"} />
        <Stat label="Payment" value={<PaymentBadge status={si.paymentStatus} />} sub={si.approvedBy ? `approved by ${si.approvedBy}` : "not approved"} />
      </div>

      <Card className="mt-4 overflow-hidden">
        <CardHeader title="PO ⇄ goods receipt ⇄ invoice, per line" subtitle="Variances are billed minus received (quantity) and billed minus PO (price). Expected amount = received kg × PO price." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm" data-testid="match-lines">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-muted">
                <th rowSpan={2} className="border-b border-border px-3 py-2 text-left align-bottom font-semibold">Line</th>
                <th colSpan={2} className="border-b border-l border-border bg-panel-2 px-3 py-1.5 text-center font-semibold">Purchase order</th>
                <th className="border-b border-l border-border bg-panel-2 px-3 py-1.5 text-center font-semibold">Goods receipt</th>
                <th colSpan={2} className="border-b border-l border-border bg-panel-2 px-3 py-1.5 text-center font-semibold">Invoice</th>
                <th colSpan={2} className="border-b border-l border-border bg-panel-2 px-3 py-1.5 text-center font-semibold">Variance</th>
                <th colSpan={3} className="border-b border-l border-border bg-panel-2 px-3 py-1.5 text-center font-semibold">Amount ex GST</th>
                <th rowSpan={2} className="border-b border-l border-border px-3 py-2 text-left align-bottom font-semibold">Status</th>
              </tr>
              <tr className="text-[10px] uppercase tracking-wide text-muted">
                {["Ordered kg", "PO price", "Received kg", "Billed kg", "Billed price", "Qty", "Price", "Expected", "Billed", "Δ"].map((h, i) => (
                  <th key={h} className={cn("border-b border-border px-3 py-1.5 text-right font-semibold", [0, 2, 3, 5, 7].includes(i) && "border-l")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.lines.map((l, i) => {
                const qv = Number(l.qtyVarianceKg);
                const pv = Number(l.priceVariance);
                const av = Number(l.amountVariance);
                const lots = lotFor(l.poLineId);
                return (
                  <tr key={l.invoiceLineId ?? i} className={cn("border-b border-border/70 align-top", l.status === "EXCEPTION" && "bg-short-soft/40")}>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-text">{l.description}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {lots.map((lt) => <Link key={lt.id} href={`/supply/lots/${lt.id}`} className="num rounded border border-border px-1.5 py-px text-[10px] text-accent hover:border-accent">{lt.lotNumber}{lt.grn ? ` · ${lt.grn}` : ""}</Link>)}
                        {!l.poLineId && <span className="text-[11px] text-short">not on PO</span>}
                      </div>
                      {l.flags.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {l.flags.map((f) => <li key={f} className="text-[11px] text-short">• {f}</li>)}
                        </ul>
                      )}
                    </td>
                    <td className="num border-l border-border px-3 py-2.5 text-right text-text-2">{kgNum(l.orderedKg)}</td>
                    <td className="num px-3 py-2.5 text-right text-text-2">{perKg(l.poPrice)}</td>
                    <td className="num border-l border-border px-3 py-2.5 text-right text-text">{kgNum(l.receivedKg)}</td>
                    <td className="num border-l border-border px-3 py-2.5 text-right font-semibold text-text">{kgNum(l.billedKg)}</td>
                    <td className="num px-3 py-2.5 text-right text-text">{perKg(l.billedPrice)}</td>
                    <td className={cn("num whitespace-nowrap border-l border-border px-3 py-2.5 text-right", qv > 0 ? "font-semibold text-short" : qv < 0 ? "text-surplus" : "text-muted")}>
                      {signed(qv, (x) => `${kgNum(x)} kg`)}
                      {l.qtyVariancePct !== null && qv !== 0 && <div className="text-[10px]">{l.qtyVariancePct > 0 ? "+" : ""}{l.qtyVariancePct}%</div>}
                    </td>
                    <td className={cn("num px-3 py-2.5 text-right", pv > 0 ? "font-semibold text-short" : pv < 0 ? "text-surplus" : "text-muted")}>{signed(pv, (x) => sgd(x))}</td>
                    <td className="num border-l border-border px-3 py-2.5 text-right text-text-2">{sgd(l.expectedAmount)}</td>
                    <td className="num px-3 py-2.5 text-right text-text">{sgd(l.billedAmount)}</td>
                    <td className={cn("num px-3 py-2.5 text-right", av > 0 ? "font-semibold text-short" : av < 0 ? "text-surplus" : "text-muted")}>{signed(av, (x) => sgd(x))}</td>
                    <td className="border-l border-border px-3 py-2.5"><MatchBadge status={l.status} /></td>
                  </tr>
                );
              })}
              {result.lines.length === 0 && <tr><td colSpan={12} className="px-4 py-8 text-center text-sm text-muted">This invoice has no lines.</td></tr>}
            </tbody>
          </table>
        </div>
        {result.flags.length > 0 && (
          <div className="border-t border-border px-4 py-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Invoice-level flags</div>
            <ul className="space-y-0.5">{result.flags.map((f) => <li key={f} className="text-xs text-short">• {f}</li>)}</ul>
          </div>
        )}
      </Card>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          {pending.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Awaiting approval</h2>
              {pending.map((p) => <ApprovalCard key={p.a.id} a={toApprovalView(p)} />)}
            </div>
          )}
          <Card>
            <CardHeader title="Goods receipts" subtitle={po ? `Receipts recorded against ${po.poNumber}` : "No PO referenced — nothing to receive against"} />
            <CardBody className="space-y-2">
              {receipts.length === 0 && <Empty title={po ? "No goods received against this PO" : "No purchase order"}>{po ? "The invoice cannot fully match until the delivery is received." : "Bills without a PO are always held as exceptions."}</Empty>}
              {receipts.map((r) => (
                <div key={r.grl.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2 text-xs">
                  <span className="num font-semibold text-text">{r.gr.grnNumber}</span>
                  <Link href={`/supply/lots/${r.lot.id}`} className="num text-accent hover:underline">{r.lot.lotNumber}</Link>
                  <span className="num text-text-2">declared {kgNum(r.grl.declaredKg)} · received {kgNum(r.grl.receivedKg)} · accepted {kgNum(r.grl.acceptedKg)} kg</span>
                  {Number(r.grl.rejectedKg) > 0 && <Badge tone="short">{kgNum(r.grl.rejectedKg)} kg rejected{r.grl.rejectionReason ? ` · ${r.grl.rejectionReason.toLowerCase().replaceAll("_", " ")}` : ""}</Badge>}
                  {r.grl.temperatureC !== null && <span className="num text-muted">{Number(r.grl.temperatureC).toFixed(1)}°C</span>}
                  <span className="ml-auto text-muted">{dateTime(r.gr.receivedAt)}{r.gr.receivedBy ? ` · ${r.gr.receivedBy}` : ""}</span>
                </div>
              ))}
            </CardBody>
          </Card>
          {exceptions.length > 0 && (
            <Card>
              <CardHeader title="Linked exceptions" action={<Link href="/ai/exceptions" className="text-xs text-accent">Exceptions →</Link>} />
              <CardBody className="space-y-2">
                {exceptions.map((e) => (
                  <div key={e.id} className="rounded-md border border-border px-3 py-2">
                    <div className="flex items-center gap-2"><StatusBadge status={e.severity} /><StatusBadge status={e.status} /><span className="ml-auto text-[11px] text-muted">{dateTime(e.openedAt)}</span></div>
                    <div className="mt-1 text-xs text-text">{e.title}</div>
                    {e.resolutionNote && <div className="mt-1 text-[11px] text-muted">Resolved by {e.resolvedBy}: {e.resolutionNote}</div>}
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Documents" />
            <CardBody>
              <Dl
                items={[
                  ["Supplier invoice", <span key="i" className="num">{si.invoiceNumber}</span>],
                  ["Purchase order", po ? <Link key="p" href={`/procurement/purchase-orders/${po.id}`} className="num inline-flex items-center gap-1 text-accent hover:underline">{po.poNumber} <ExternalLink className="size-3" /></Link> : "—"],
                  ["PO status", po ? <StatusBadge key="s" status={po.status} /> : "—"],
                  ["Vendor terms", `${v.paymentTermsDays} days${v.gstRegistered ? ` · GST reg. ${v.gstRegNo ?? ""}` : " · not GST-registered"}`],
                  ["Match status", MATCH_LABEL[si.matchStatus] ?? si.matchStatus],
                ]}
              />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="Audit timeline" subtitle="Invoice and purchase order events, newest first" />
          <CardBody>
            {timeline.length === 0 && <Empty title="No events recorded" />}
            <ol className="relative space-y-3 border-l border-border pl-4">
              {timeline.map((e) => (
                <li key={e.id} className="relative">
                  <span className={cn("absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-panel", e.actorType === "AGENT" ? "bg-ai" : e.actorType === "USER" ? "bg-ok" : "bg-muted")} />
                  <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                    <span className="num">{dateTime(e.at)}</span>
                    <span>·</span>
                    <span className="text-text-2">{e.actorLabel}</span>
                    <Badge tone={e.actorType === "AGENT" ? "ai" : "neutral"} className="text-[9px]">{e.action.replaceAll("_", " ")}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-text">{e.summary}</p>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
