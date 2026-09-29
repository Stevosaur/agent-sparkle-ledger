import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { z } from "zod";
import { requireApp } from "@/lib/auth/session";
import { salesOrderDetail } from "@/lib/services/queries-procurement";
import { timelineFor } from "@/lib/services/queries";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Dl, PageHeader } from "@/components/ui/misc";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { ActionButton } from "@/components/app/action-button";
import { createCustomerInvoiceAction } from "@/app/actions";
import { kgNum, perKg, sgd, time, date, dateTime, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AuditTimeline } from "../audit-timeline";
import { PIPELINE, SOURCE_LABEL, SOURCE_TONE, lineFillStatus, stageOf } from "../labels";

export const metadata = { title: "Order" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const app = await requireApp("orders.view");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const d = await salesOrderDetail(app.org.id, id);
  if (!d) notFound();
  const isBuyer = app.role === "BUYER";
  if (isBuyer && d.so.customerId !== app.membership.customerId) notFound();
  const { so, c, lines, allocs, ships, invoices } = d;
  const events = isBuyer ? [] : await timelineFor(app.org.id, [so.id], 60);

  const byLine = new Map<string, typeof allocs>();
  for (const a of allocs) byLine.set(a.a.salesOrderLineId, [...(byLine.get(a.a.salesOrderLineId) ?? []), a]);
  const tot = (k: "requestedKg" | "allocatedKg" | "pickedKg" | "deliveredKg") => lines.reduce((a, x) => a + Number(x.l[k]), 0);
  const value = lines.reduce((a, x) => a + Number(x.l.requestedKg) * Number(x.l.pricePerKg), 0);
  const hasInvoice = invoices.some((i) => i.type === "INVOICE");
  const canInvoice = app.can("finance.write") && so.status === "DELIVERED" && !hasInvoice;
  const stageIdx = PIPELINE.indexOf(stageOf(so.status) as (typeof PIPELINE)[number]);
  const origName = new Map(lines.map((x) => [x.l.id, x.sp.canonicalName]));

  return (
    <div>
      <Link href={`/orders${so.marketDate !== app.marketDate ? `?night=${so.marketDate}` : ""}`} className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-text"><ArrowLeft className="size-3.5" /> Orders</Link>
      <PageHeader
        eyebrow={`Sales order · market night ${date(so.marketDate)}`}
        title={<span className="flex flex-wrap items-center gap-3"><span className="num">{so.soNumber}</span><StatusBadge status={so.status} /></span>}
        subtitle={<>{c.name} · <Badge tone={SOURCE_TONE[so.source] ?? "neutral"}>{SOURCE_LABEL[so.source] ?? so.source}</Badge> · confirmed {dateTime(so.confirmedAt)}</>}
        actions={canInvoice ? <ActionButton variant="primary" size="lg" action={createCustomerInvoiceAction.bind(null, so.id)} data-testid="create-invoice"><FileText /> Create invoice</ActionButton> : undefined}
      />

      {so.status !== "CANCELLED" && (
        <div className="mb-4 flex overflow-x-auto rounded-xl border border-border bg-panel" aria-label="Order progress">
          {PIPELINE.map((s, i) => (
            <div key={s} className={cn("flex min-w-[104px] flex-1 items-center gap-2 border-r border-border px-3 py-2.5 text-[11px] last:border-r-0", i < stageIdx ? "text-ok" : i === stageIdx ? "bg-accent-soft font-semibold text-accent" : "text-muted")}>
              <span className={cn("num inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]", i < stageIdx ? "border-ok bg-ok-soft" : i === stageIdx ? "border-accent" : "border-border")}>{i < stageIdx ? "✓" : i + 1}</span>
              {titleCase(s)}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="Lines" subtitle="Quantities through the pipeline. Lots link to their full trace (catch → receipt → buyer)." />
            <Table className="min-w-[820px]">
              <THead>
                <tr>
                  <TH>Species</TH>
                  <TH align="right">Requested</TH>
                  <TH align="right">Allocated</TH>
                  <TH align="right">Picked</TH>
                  <TH align="right">Delivered</TH>
                  <TH align="right">Price</TH>
                  <TH>Lots</TH>
                </tr>
              </THead>
              <tbody>
                {lines.map(({ l, sp }) => {
                  const st = lineFillStatus(l.requestedKg, l.allocatedKg);
                  const la = (byLine.get(l.id) ?? []).filter((a) => a.a.status !== "RELEASED");
                  return (
                    <TR key={l.id}>
                      <TD className="align-top">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-text">{sp.canonicalName}</span>
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </div>
                        {l.substituteForLineId && <div className="mt-0.5 text-[11px] text-info">Substitute for {origName.get(l.substituteForLineId) ?? "short line"} · {titleCase(l.substitutionStatus ?? "")}</div>}
                        {l.sizeMinKg && <div className="num text-[11px] text-muted">{Math.round(Number(l.sizeMinKg) * 1000)}–{Math.round(Number(l.sizeMaxKg ?? l.sizeMinKg) * 1000)} g</div>}
                      </TD>
                      <TD num className="align-top text-text">{kgNum(l.requestedKg)}</TD>
                      <TD num className={cn("align-top", Number(l.allocatedKg) > 0 ? "text-text" : "text-muted")}>{kgNum(l.allocatedKg)}</TD>
                      <TD num className={cn("align-top", Number(l.pickedKg) > 0 ? "text-text" : "text-muted")}>{kgNum(l.pickedKg)}</TD>
                      <TD num className={cn("align-top", Number(l.deliveredKg) > 0 ? "text-ok" : "text-muted")}>{kgNum(l.deliveredKg)}</TD>
                      <TD num className="align-top text-text-2">{perKg(l.pricePerKg)}</TD>
                      <TD className="align-top">
                        <div className="flex flex-col gap-1">
                          {la.length === 0 && <span className="text-xs text-muted">—</span>}
                          {la.map(({ a, lot, v }) => (
                            <div key={a.id} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                              {app.can("trace.view") ? <Link href={`/trace/${lot.id}`} className="num whitespace-nowrap text-accent hover:underline">{lot.lotNumber}</Link> : <span className="num whitespace-nowrap text-text-2">{lot.lotNumber}</span>}
                              <span className="num text-text-2">{kgNum(a.quantityKg)} kg</span>
                              <StatusBadge status={a.status} />
                              {v && !isBuyer && <span className="text-muted">{v.name}</span>}
                            </div>
                          ))}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border text-xs font-semibold text-text">
                  <td className="px-3 py-2">{lines.length} line{lines.length === 1 ? "" : "s"}</td>
                  <td className="num px-3 py-2 text-right">{kgNum(tot("requestedKg"))}</td>
                  <td className="num px-3 py-2 text-right">{kgNum(tot("allocatedKg"))}</td>
                  <td className="num px-3 py-2 text-right">{kgNum(tot("pickedKg"))}</td>
                  <td className="num px-3 py-2 text-right">{kgNum(tot("deliveredKg"))}</td>
                  <td className="num px-3 py-2 text-right">{sgd(value)}</td>
                  <td className="px-3 py-2 text-[11px] font-normal text-muted">order value before GST</td>
                </tr>
              </tfoot>
            </Table>
          </Card>

          {!isBuyer && (
            <Card>
              <CardHeader title="Audit timeline" />
              <CardBody><AuditTimeline events={events} /></CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Customer" action={c.priorityTier === 1 ? <Badge tone="spike">Priority</Badge> : undefined} />
            <CardBody>
              <Dl
                items={[
                  ["Name", c.name],
                  ["Type", titleCase(c.type)],
                  ["Delivery window", c.deliveryWindowStart ? <span className="num" key="w">{c.deliveryWindowStart}–{c.deliveryWindowEnd ?? ""}</span> : "—"],
                  ["Deliver by", <span className="num" key="d">{time(so.requestedDeliveryBy)}</span>],
                  ["Address", c.address ? `${c.address}${c.postalCode ? ` S(${c.postalCode})` : ""}` : "—"],
                  ["Contact", [c.contactName, c.phone].filter(Boolean).join(" · ") || "—"],
                  ["Credit terms", `${c.creditTermsDays} days`],
                  ...(so.notes ? [["Notes", so.notes] as [string, string]] : []),
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Delivery" />
            <CardBody className="space-y-3">
              {ships.length === 0 && <p className="text-xs text-muted">Not on a delivery run yet. Routes are planned after picking and packing.</p>}
              {ships.map(({ sh, st, v, d: drv }) => (
                <div key={st.id} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="num text-sm font-semibold text-text">{sh.shipmentNumber}</span>
                    <StatusBadge status={sh.status} />
                    <span className="text-xs text-muted">stop {st.sequence}</span>
                    <StatusBadge status={st.status} />
                  </div>
                  <Dl
                    className="text-xs"
                    items={[
                      ["Vehicle / driver", [v ? `${v.name} (${v.plate})` : null, drv?.name].filter(Boolean).join(" · ") || "—"],
                      ["Departure", <span className="num" key="dep">{time(sh.actualDepartureAt ?? sh.plannedDepartureAt)}{sh.actualDepartureAt ? "" : " planned"}</span>],
                      ["Planned arrival", <span className="num" key="pa">{time(st.plannedArrivalAt)}</span>],
                      ["Arrived", <span className="num" key="aa">{time(st.actualArrivalAt)}</span>],
                      ["Proof of delivery", st.podName ? `Signed by ${st.podName} · ${time(st.podAt)}` : "—"],
                    ]}
                  />
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Invoice" action={app.can("finance.view") && invoices.length > 0 ? <Link href="/finance/invoices" className="text-xs text-accent">All invoices →</Link> : undefined} />
            <CardBody className="space-y-2">
              {invoices.length === 0 && (
                <p className="text-xs text-muted">{so.status === "DELIVERED" ? (app.can("finance.write") ? "Delivered and ready to invoice." : "Delivered — finance will issue the invoice.") : "Invoiced after delivery, on delivered weight."}</p>
              )}
              {invoices.map((inv) => (
                <div key={inv.id} className="rounded-lg border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="num text-sm font-medium text-text">{inv.invoiceNumber}{inv.type === "CREDIT_NOTE" && <Badge tone="late" className="ml-2">Credit note</Badge>}</span>
                    <span className="num text-sm text-text">{sgd(inv.total, inv.currency)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                    <StatusBadge status={inv.status} />
                    {inv.peppolStatus !== "NOT_SENT" && <StatusBadge status={inv.peppolStatus} />}
                    <span>{date(inv.invoiceDate)}{inv.dueDate ? ` · due ${date(inv.dueDate)}` : ""}</span>
                  </div>
                  <div className="num mt-1 text-[11px] text-muted">{sgd(inv.subtotal)} + GST {Number(inv.gstRatePct)}% {sgd(inv.gstAmount)}</div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
