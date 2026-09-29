import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { z } from "zod";
import { requireApp } from "@/lib/auth/session";
import { purchaseOrderDetail } from "@/lib/services/queries-procurement";
import { timelineFor } from "@/lib/services/queries";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { AiMark, Bar, Dl, PageHeader } from "@/components/ui/misc";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { ActionButton } from "@/components/app/action-button";
import { simulateSupplierInvoiceAction } from "@/app/actions";
import { kg, kgNum, perKg, sgd, time, date, dateTime, titleCase } from "@/lib/format";
import { AuditTimeline } from "../../../orders/audit-timeline";

export const metadata = { title: "Purchase Order" };

const SOURCE: Record<string, string> = { MANUAL: "Manual", AI_RECOMMENDATION: "AI recommendation", RFQ: "RFQ", CATCH_DECLARATION: "Catch declaration" };

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const app = await requireApp("procurement.view");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const d = await purchaseOrderDetail(app.org.id, id);
  if (!d) notFound();
  const { po, v, lines, receipts, invoices, approval } = d;
  const lotIds = lines.map((l) => l.lot?.id).filter((x): x is string => !!x);
  const events = await timelineFor(app.org.id, [po.id, ...lotIds], 60);

  const orderedKg = lines.reduce((a, l) => a + Number(l.pol.quantityKg), 0);
  const receivedKg = lines.reduce((a, l) => a + Number(l.pol.receivedKg), 0);
  const receivedValue = lines.reduce((a, l) => a + Number(l.pol.receivedKg) * Number(l.pol.pricePerKg), 0);

  // Goods receipts come back one row per receipt line; group them.
  const grs = new Map<string, { gr: (typeof receipts)[number]["gr"]; lines: (typeof receipts)[number][] }>();
  for (const r of receipts) {
    const g = grs.get(r.gr.id) ?? { gr: r.gr, lines: [] };
    if (r.grl) g.lines.push(r);
    grs.set(r.gr.id, g);
  }
  const canSimulate = app.can("finance.write") && po.status !== "CANCELLED";

  return (
    <div>
      <Link href="/procurement/purchase-orders" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-text"><ArrowLeft className="size-3.5" /> Purchase orders</Link>
      <PageHeader
        eyebrow={`Purchase order · market night ${date(po.marketDate)}`}
        title={<span className="flex flex-wrap items-center gap-3"><span className="num">{po.poNumber}</span><StatusBadge status={po.status} />{po.source === "AI_RECOMMENDATION" && <Badge tone="ai">AI recommended</Badge>}</span>}
        subtitle={<>To <Link href={`/vendors/${v.id}`} className="text-text hover:text-accent">{v.name}</Link> · {SOURCE[po.source] ?? titleCase(po.source)} · created by {po.createdBy ?? "—"} {dateTime(po.createdAt)}</>}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="Lines" subtitle="Each line is linked to the lot it created or bought, so every kilogram is traceable." />
            <Table className="min-w-[760px]">
              <THead>
                <tr>
                  <TH>Species</TH>
                  <TH>Lot</TH>
                  <TH align="right">Ordered</TH>
                  <TH align="right">Received</TH>
                  <TH align="right">Price</TH>
                  <TH align="right">Line total</TH>
                </tr>
              </THead>
              <tbody>
                {lines.map(({ pol, sp, lot }) => {
                  const q = Number(pol.quantityKg);
                  const r = Number(pol.receivedKg);
                  const variance = r > 0 && q > 0 ? ((r - q) / q) * 100 : null;
                  return (
                    <TR key={pol.id}>
                      <TD>
                        <div className="text-text">{sp.canonicalName}</div>
                        {pol.sizeMinKg && <div className="num text-[11px] text-muted">{Math.round(Number(pol.sizeMinKg) * 1000)}–{Math.round(Number(pol.sizeMaxKg ?? pol.sizeMinKg) * 1000)} g</div>}
                      </TD>
                      <TD>
                        {lot ? (
                          <span className="flex items-center gap-2">
                            <Link href={`/supply/lots/${lot.id}`} className="num whitespace-nowrap text-accent hover:underline">{lot.lotNumber}</Link>
                            <StatusBadge status={lot.status} />
                          </span>
                        ) : <span className="text-muted">—</span>}
                      </TD>
                      <TD num className="text-text">{kgNum(q)}</TD>
                      <TD num>
                        <div className={r > 0 ? "text-text" : "text-muted"}>{kgNum(r)}</div>
                        {variance !== null && Math.abs(variance) >= 0.5 && <div className={`text-[11px] ${Math.abs(variance) > 5 ? "text-short" : "text-muted"}`}>{variance > 0 ? "+" : ""}{variance.toFixed(1)}%</div>}
                      </TD>
                      <TD num className="text-text-2">{perKg(pol.pricePerKg, po.currency)}</TD>
                      <TD num className="text-text">{sgd(pol.lineTotal, po.currency)}</TD>
                    </TR>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border text-xs">
                  <td colSpan={2} className="px-3 py-1.5 text-muted">Subtotal</td>
                  <td className="num px-3 py-1.5 text-right font-semibold text-text">{kgNum(orderedKg)}</td>
                  <td className="num px-3 py-1.5 text-right font-semibold text-text">{kgNum(receivedKg)}</td>
                  <td />
                  <td className="num px-3 py-1.5 text-right text-text">{sgd(po.subtotal, po.currency)}</td>
                </tr>
                <tr className="text-xs">
                  <td colSpan={5} className="px-3 py-1 text-right text-muted">GST {Number(po.gstRatePct)}%</td>
                  <td className="num px-3 py-1 text-right text-text">{sgd(po.gstAmount, po.currency)}</td>
                </tr>
                <tr className="text-sm">
                  <td colSpan={5} className="px-3 py-2 text-right font-semibold text-text">Total</td>
                  <td className="num px-3 py-2 text-right font-semibold text-text">{sgd(po.total, po.currency)}</td>
                </tr>
              </tfoot>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Goods receipts" subtitle="Weighed at the receiving bay." />
            <CardBody className="space-y-3">
              {grs.size === 0 && <p className="text-xs text-muted">Nothing received yet{po.expectedAt ? ` — expected ${time(po.expectedAt)}` : ""}.</p>}
              {[...grs.values()].map(({ gr, lines: gl }) => (
                <div key={gr.id} className="rounded-lg border border-border">
                  <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
                    <span className="num font-semibold text-text">{gr.grnNumber}</span>
                    <span className="text-muted">received {dateTime(gr.receivedAt)}{gr.receivedBy ? ` by ${gr.receivedBy}` : ""}</span>
                  </div>
                  <Table className="min-w-[620px] text-xs">
                    <THead>
                      <tr><TH>Lot</TH><TH align="right">Declared</TH><TH align="right">Received</TH><TH align="right">Accepted</TH><TH align="right">Temp</TH><TH>Grade</TH><TH align="right">Late</TH></tr>
                    </THead>
                    <tbody>
                      {gl.map(({ grl, lot }) => grl && (
                        <TR key={grl.id}>
                          <TD>{lot ? <Link href={`/supply/lots/${lot.id}`} className="num whitespace-nowrap text-accent hover:underline">{lot.lotNumber}</Link> : "—"}</TD>
                          <TD num className="text-text-2">{kgNum(grl.declaredKg)}</TD>
                          <TD num className="text-text">{kgNum(grl.receivedKg)}</TD>
                          <TD num className="text-text">{kgNum(grl.acceptedKg)}{Number(grl.rejectedKg) > 0 && <span className="ml-1 text-short">−{kgNum(grl.rejectedKg)}</span>}</TD>
                          <TD num className={grl.temperatureC !== null && Number(grl.temperatureC) > app.org.settings.receivingTempMaxC ? "text-short" : "text-text-2"}>{grl.temperatureC !== null ? `${Number(grl.temperatureC).toFixed(1)}°C` : "—"}</TD>
                          <TD>{grl.qualityGrade ? <Badge tone={grl.qualityGrade === "A" ? "ok" : grl.qualityGrade === "REJECT" ? "short" : "surplus"}>{grl.qualityGrade}</Badge> : "—"}{grl.rejectionReason && <Badge tone="short" className="ml-1">{titleCase(grl.rejectionReason)}</Badge>}</TD>
                          <TD num className={grl.arrivedLateMinutes && grl.arrivedLateMinutes > 0 ? "text-late" : "text-muted"}>{grl.arrivedLateMinutes ? `${grl.arrivedLateMinutes} min` : "—"}</TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Audit timeline" subtitle="Everything that happened to this PO and its lots." />
            <CardBody><AuditTimeline events={events} /></CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Summary" />
            <CardBody className="space-y-3">
              <div>
                <div className="num flex justify-between text-xs"><span className="text-muted">Received</span><span className="text-text">{kgNum(receivedKg)} / {kgNum(orderedKg)} kg</span></div>
                <Bar value={receivedKg} max={orderedKg} tone={receivedKg >= orderedKg * 0.95 ? "ok" : receivedKg > 0 ? "surplus" : "accent"} className="mt-1.5 h-2" />
              </div>
              <Dl
                items={[
                  ["Vendor", <Link key="v" href={`/vendors/${v.id}`} className="text-accent hover:underline">{v.name}</Link>],
                  ["Payment terms", `${v.paymentTermsDays} days`],
                  ["Expected", po.expectedAt ? time(po.expectedAt) : "—"],
                  ["Value received", <span key="rv" className="num">{sgd(receivedValue, po.currency)}</span>],
                  ["Approved by", po.approvedBy ? `${po.approvedBy} · ${dateTime(po.approvedAt)}` : "—"],
                  ...(po.notes ? [["Notes", po.notes] as [string, string]] : []),
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Approval" subtitle={approval ? undefined : "Created directly by a user with purchase authority."} />
            {approval && (
              <CardBody className="space-y-2">
                <div className="flex flex-wrap items-center gap-2"><AiMark /><span className="text-sm font-medium text-text">{approval.title}</span></div>
                <pre className="num whitespace-pre-wrap rounded-lg bg-panel-2 p-2.5 text-xs text-text-2">{approval.summary}</pre>
                <Dl
                  className="text-xs"
                  items={[
                    ["Status", <StatusBadge key="s" status={approval.status} />],
                    ["Requested", `${approval.requestedBy} · ${dateTime(approval.requestedAt)}`],
                    ["Decided by", approval.decidedBy ? `${approval.decidedBy} · ${dateTime(approval.decidedAt)}` : "—"],
                    ...(approval.decisionNote ? [["Note", approval.decisionNote] as [string, string]] : []),
                    ...(approval.modifications ? [["Modified", "Quantities/prices changed at approval"] as [string, string]] : []),
                  ]}
                />
              </CardBody>
            )}
          </Card>

          <Card>
            <CardHeader title="Supplier invoices" subtitle="Three-way match: PO × goods receipt × invoice." />
            <CardBody className="space-y-2">
              {invoices.length === 0 && <p className="text-xs text-muted">No invoice received for this PO yet.</p>}
              {invoices.map((inv) => (
                <Link key={inv.id} href={`/finance/reconciliation/${inv.id}`} className="block rounded-lg border border-border px-3 py-2 hover:bg-panel-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="num text-sm font-medium text-text">{inv.invoiceNumber}</span>
                    <span className="num text-sm text-text">{sgd(inv.total, inv.currency)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                    <StatusBadge status={inv.matchStatus} />
                    <StatusBadge status={inv.paymentStatus} />
                    <span>{date(inv.invoiceDate)} · {titleCase(inv.source)}</span>
                  </div>
                </Link>
              ))}
            </CardBody>
          </Card>

          {canSimulate && (
            <Card className="border-dashed">
              <CardHeader title={<span className="flex items-center gap-2"><FlaskConical className="size-4 text-spike" /> Demo: simulate supplier invoice</span>} subtitle="Creates a fake supplier invoice for this PO so you can watch the AP reconciliation agent match it. Not a real document." />
              <CardBody className="flex flex-col gap-2">
                <ActionButton variant="secondary" size="lg" confirm={invoices.length ? "This PO already has a supplier invoice. Simulate another one?" : undefined} action={simulateSupplierInvoiceAction.bind(null, po.id, true)} data-testid="simulate-invoice-received">
                  Bill received weight ({kg(receivedKg)})
                </ActionButton>
                <ActionButton variant="outline" size="lg" confirm={invoices.length ? "This PO already has a supplier invoice. Simulate another one?" : undefined} action={simulateSupplierInvoiceAction.bind(null, po.id, false)} data-testid="simulate-invoice-declared">
                  Bill declared weight ({kg(orderedKg)})
                </ActionButton>
                <p className="text-[11px] text-muted">Billing declared weight when less was received should raise a quantity exception in reconciliation.</p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
