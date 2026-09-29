import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Info } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { customer, customerInvoice, customerInvoiceLine } from "@/lib/db/schema";
import { sgtDateStr } from "@/lib/domain/time";
import { PageHeader, Empty } from "@/components/ui/misc";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { date, kgNum, sgd } from "@/lib/format";
import { arAgeing } from "../_data";
import { Pager, pageOf } from "../_pager";
import { AgeingCards, FilterChips } from "../_ui";
import { InvoiceActions, CreateInvoiceButton } from "./invoice-actions";

export const metadata = { title: "Invoices" };

const LIMIT = 50;
const TYPES = ["INVOICE", "CREDIT_NOTE"] as const;
const STATUSES = ["ISSUED", "SENT", "PAID", "DRAFT", "VOID"] as const;
const PEPPOL = ["NOT_SENT", "MOCK_TRANSMITTED", "QUEUED", "DELIVERED", "FAILED"] as const;

function PeppolBadge({ status }: { status: string }) {
  if (status === "MOCK_TRANSMITTED") return <Badge tone="ai" title="InvoiceNow payload prepared by the mock provider. Nothing was sent to the Peppol network or IRAS.">Mock — not transmitted</Badge>;
  if (status === "NOT_SENT") return <Badge tone="neutral">Not sent</Badge>;
  if (status === "DELIVERED") return <Badge tone="ok">Delivered</Badge>;
  return <StatusBadge status={status} />;
}

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ type?: string; status?: string; peppol?: string; page?: string }> }) {
  const app = await requireApp("finance.view");
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const type = TYPES.find((t) => t === sp.type);
  const status = STATUSES.find((t) => t === sp.status);
  const peppol = PEPPOL.find((t) => t === sp.peppol);
  const today = sgtDateStr(app.now);
  const orig = alias(customerInvoice, "orig");

  const where = and(
    eq(customerInvoice.orgId, app.org.id),
    type ? eq(customerInvoice.type, type) : sql`true`,
    status ? eq(customerInvoice.status, status) : sql`true`,
    peppol ? eq(customerInvoice.peppolStatus, peppol) : sql`true`,
  );
  const [invoices, [{ total: filteredCount }], ageing, uninvoiced] = await Promise.all([
    db
      .select({ inv: customerInvoice, c: { id: customer.id, name: customer.name, peppolId: customer.peppolId }, orig: { id: orig.id, invoiceNumber: orig.invoiceNumber, invoiceDate: orig.invoiceDate } })
      .from(customerInvoice)
      .innerJoin(customer, eq(customer.id, customerInvoice.customerId))
      .leftJoin(orig, eq(orig.id, customerInvoice.creditNoteForId))
      .where(where)
      .orderBy(desc(customerInvoice.invoiceDate), desc(customerInvoice.invoiceNumber))
      .limit(LIMIT)
      .offset((page - 1) * LIMIT),
    db.select({ total: sql<number>`count(*)::int` }).from(customerInvoice).where(where),
    arAgeing(app.org.id, today),
    db.execute(sql`
      SELECT so.id, so.so_number, so.market_date, so.status, c.name AS customer,
        SUM(CASE WHEN sol.delivered_kg > 0 THEN sol.delivered_kg WHEN sol.picked_kg > 0 THEN sol.picked_kg ELSE sol.allocated_kg END) AS kg,
        SUM((CASE WHEN sol.delivered_kg > 0 THEN sol.delivered_kg WHEN sol.picked_kg > 0 THEN sol.picked_kg ELSE sol.allocated_kg END) * sol.price_per_kg) AS value
      FROM sales_order so
      JOIN customer c ON c.id = so.customer_id
      JOIN sales_order_line sol ON sol.sales_order_id = so.id
      WHERE so.org_id = ${app.org.id} AND so.status = 'DELIVERED'
        AND NOT EXISTS (SELECT 1 FROM customer_invoice ci WHERE ci.org_id = ${app.org.id} AND ci.sales_order_id = so.id AND ci.type = 'INVOICE')
      GROUP BY so.id, so.so_number, so.market_date, so.status, c.name
      ORDER BY so.market_date DESC, so.so_number
      LIMIT 50`),
  ]);
  const invIds = invoices.filter((x) => x.inv.type === "INVOICE").map((x) => x.inv.id);
  const lines = invIds.length
    ? await db
        .select({ id: customerInvoiceLine.id, invoiceId: customerInvoiceLine.customerInvoiceId, description: customerInvoiceLine.description, quantityKg: customerInvoiceLine.quantityKg, unitPrice: customerInvoiceLine.unitPrice })
        .from(customerInvoiceLine)
        .where(and(eq(customerInvoiceLine.orgId, app.org.id), inArray(customerInvoiceLine.customerInvoiceId, invIds)))
    : [];
  const unRows = uninvoiced.rows as { id: string; so_number: string; market_date: string; status: string; customer: string; kg: string; value: string }[];
  const canWrite = app.can("finance.write");
  const params = { type: sp.type, status: sp.status, peppol: sp.peppol };
  const gstRate = Number(app.org.gstRatePct);

  return (
    <div>
      <PageHeader
        eyebrow="Finance · Accounts receivable"
        title="Customer invoices & credit notes"
        subtitle="Tax invoices are raised from delivered quantities with lot-referenced lines for traceability. Credit notes always reference the original invoice number and date."
      />

      <div className="mb-4 flex gap-3 rounded-xl border border-info/30 bg-info-soft px-4 py-3 text-xs leading-relaxed text-text-2">
        <Info className="mt-0.5 size-4 shrink-0 text-info" />
        <div>
          GST is charged at <span className="num font-semibold text-text">{gstRate.toFixed(2)}%</span>{app.org.gstRegistered ? "" : " — this organisation is currently marked as not GST-registered, so no GST is added"}. The rate is configurable in{" "}
          {app.can("settings.manage") ? <Link href="/settings" className="text-accent hover:underline">Settings</Link> : "Settings"} and is stored on each invoice at issue.{" "}
          <span className="text-text">InvoiceNow (Peppol) runs through a mock provider</span> until an IMDA-accredited Access Point provider is connected — prepared documents are marked <em>Mock — not transmitted</em> and nothing reaches the Peppol network or IRAS.
        </div>
      </div>

      <AgeingCards a={ageing} label="AR" extra={`${ageing.count} invoice(s)${ageing.openCredits ? ` · ${sgd(ageing.openCredits)} in credit notes` : ""}`} />

      <Card className="mt-5">
        <CardHeader title="Delivered, not yet invoiced" subtitle="Orders marked delivered with no tax invoice. Quantities billed are the delivered weights." action={<Badge tone={unRows.length ? "surplus" : "ok"}>{unRows.length}</Badge>} />
        {unRows.length === 0 ? (
          <div className="p-4"><Empty title="Every delivered order has been invoiced" /></div>
        ) : (
          <Table>
            <THead>
              <tr><TH>Order</TH><TH>Customer</TH><TH>Market night</TH><TH align="right">Delivered kg</TH><TH align="right">Value ex GST</TH><TH align="right" /></tr>
            </THead>
            <tbody>
              {unRows.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap"><Link href={`/orders/${r.id}`} className="num text-accent hover:underline">{r.so_number}</Link></TD>
                  <TD className="text-text">{r.customer}</TD>
                  <TD className="whitespace-nowrap text-text-2">{date(r.market_date)}</TD>
                  <TD num>{kgNum(r.kg)}</TD>
                  <TD num className="text-text">{sgd(r.value)}</TD>
                  <TD align="right">{canWrite ? <CreateInvoiceButton salesOrderId={r.id} soNumber={r.so_number} /> : <span className="text-[11px] text-muted">finance.write needed</span>}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="mt-5 flex flex-col gap-2">
        <FilterChips base="/finance/invoices" param="type" value={type ?? "all"} params={params} options={[{ key: "all", label: "All documents" }, { key: "INVOICE", label: "Tax invoices" }, { key: "CREDIT_NOTE", label: "Credit notes" }]} />
        <div className="flex flex-wrap gap-2">
          <FilterChips base="/finance/invoices" param="status" value={status ?? "all"} params={params} options={[{ key: "all", label: "Any status" }, { key: "ISSUED", label: "Issued" }, { key: "SENT", label: "Sent" }, { key: "PAID", label: "Paid" }]} />
          <FilterChips base="/finance/invoices" param="peppol" value={peppol ?? "all"} params={params} options={[{ key: "all", label: "Any InvoiceNow" }, { key: "NOT_SENT", label: "Not sent" }, { key: "MOCK_TRANSMITTED", label: "Mock prepared" }]} />
        </div>
      </div>

      <Card className="mt-3 overflow-hidden">
        <Table className="min-w-[1180px]" data-testid="invoices-table">
          <THead>
            <tr>
              <TH>Type</TH>
              <TH>Number</TH>
              <TH>Customer</TH>
              <TH>Date</TH>
              <TH>Due</TH>
              <TH align="right">Subtotal</TH>
              <TH align="right">GST %</TH>
              <TH align="right">GST</TH>
              <TH align="right">Total</TH>
              <TH>Status</TH>
              <TH>InvoiceNow</TH>
              <TH align="right">Actions</TH>
            </tr>
          </THead>
          <tbody>
            {invoices.map(({ inv, c, orig: o }) => {
              const cn = inv.type === "CREDIT_NOTE";
              const overdue = !cn && !["PAID", "VOID"].includes(inv.status) && inv.dueDate && inv.dueDate < today;
              return (
                <TR key={inv.id}>
                  <TD>{cn ? <Badge tone="spike">Credit note</Badge> : <Badge tone="neutral">Invoice</Badge>}</TD>
                  <TD className="whitespace-nowrap">
                    <span className="num font-medium text-text">{inv.invoiceNumber}</span>
                    {cn && o?.id && <div className="num text-[11px] text-muted">against {o.invoiceNumber} · {date(o.invoiceDate)}</div>}
                  </TD>
                  <TD className="max-w-[200px]">
                    <div className="truncate text-text">{c.name}</div>
                    {inv.salesOrderId && <Link href={`/orders/${inv.salesOrderId}`} className="text-[11px] text-muted hover:text-accent">view order</Link>}
                  </TD>
                  <TD className="whitespace-nowrap text-text-2">{date(inv.invoiceDate)}</TD>
                  <TD className={overdue ? "whitespace-nowrap font-medium text-short" : "whitespace-nowrap text-text-2"}>{cn ? "—" : date(inv.dueDate)}{overdue && <span className="ml-1 text-[10px] uppercase">overdue</span>}</TD>
                  <TD num className="text-text-2">{cn ? `−${sgd(inv.subtotal)}` : sgd(inv.subtotal)}</TD>
                  <TD num className="text-text-2">{Number(inv.gstRatePct).toFixed(0)}%</TD>
                  <TD num className="text-text-2">{cn ? `−${sgd(inv.gstAmount)}` : sgd(inv.gstAmount)}</TD>
                  <TD num className={cn ? "font-semibold text-spike" : "font-semibold text-text"}>{cn ? `−${sgd(inv.total)}` : sgd(inv.total)}</TD>
                  <TD><StatusBadge status={inv.status} /></TD>
                  <TD><PeppolBadge status={inv.peppolStatus} /></TD>
                  <TD align="right">
                    <InvoiceActions
                      id={inv.id}
                      number={inv.invoiceNumber}
                      invoiceDate={inv.invoiceDate}
                      customer={c.name}
                      type={inv.type}
                      status={inv.status}
                      peppolStatus={inv.peppolStatus}
                      total={Number(inv.total)}
                      gstRatePct={Number(inv.gstRatePct)}
                      lines={lines.filter((l) => l.invoiceId === inv.id).map((l) => ({ id: l.id, description: l.description, quantityKg: Number(l.quantityKg), unitPrice: Number(l.unitPrice) }))}
                      canWrite={canWrite}
                    />
                  </TD>
                </TR>
              );
            })}
            {invoices.length === 0 && <tr><td colSpan={12} className="px-4 py-10 text-center text-sm text-muted">No documents match these filters.</td></tr>}
          </tbody>
        </Table>
        <Pager base="/finance/invoices" params={params} page={page} pageSize={LIMIT} total={filteredCount} />
      </Card>
      <p className="mt-3 text-[11px] text-muted">
        Newest first. Customer payments recorded here are bookkeeping entries only — PasarCatch does not collect funds.
      </p>
    </div>
  );
}
