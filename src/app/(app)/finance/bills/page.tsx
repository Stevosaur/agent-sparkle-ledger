import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { requireApp } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { purchaseOrder, purchaseOrderLine, species, supplierInvoice, vendor } from "@/lib/db/schema";
import { addDays, sgtDateStr } from "@/lib/domain/time";
import { PageHeader } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { date, sgd } from "@/lib/format";
import { apAgeing, matchStatusCounts } from "../_data";
import { Pager, pageOf } from "../_pager";
import { AgeingCards, FilterChips, MatchBadge, PaymentBadge } from "../_ui";
import { RecordInvoiceDialog } from "./record-invoice-dialog";
import { BillActions } from "./bill-actions";

export const metadata = { title: "Bills" };

const MATCH = ["EXCEPTION", "UNMATCHED", "MATCH_WITHIN_TOLERANCE", "APPROVED_EXCEPTION", "MATCHED"] as const;
const PAY = ["UNPAID", "APPROVED_FOR_PAYMENT", "PAID", "ON_HOLD"] as const;
const LIMIT = 50;

export default async function BillsPage({ searchParams }: { searchParams: Promise<{ match?: string; pay?: string; vendor?: string; page?: string }> }) {
  const app = await requireApp("finance.view");
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const match = MATCH.find((m) => m === sp.match);
  const pay = PAY.find((p) => p === sp.pay);
  const vendorId = sp.vendor && /^[0-9a-f-]{36}$/i.test(sp.vendor) ? sp.vendor : undefined;
  const today = sgtDateStr(app.now);

  const where = and(
    eq(supplierInvoice.orgId, app.org.id),
    match ? eq(supplierInvoice.matchStatus, match) : sql`true`,
    pay ? eq(supplierInvoice.paymentStatus, pay) : sql`true`,
    vendorId ? eq(supplierInvoice.vendorId, vendorId) : sql`true`,
  );
  const [bills, [{ total: filteredCount }], ageing, counts, vendors, pos, sps] = await Promise.all([
    db
      .select({ si: supplierInvoice, v: vendor, po: { id: purchaseOrder.id, poNumber: purchaseOrder.poNumber } })
      .from(supplierInvoice)
      .innerJoin(vendor, eq(vendor.id, supplierInvoice.vendorId))
      .leftJoin(purchaseOrder, eq(purchaseOrder.id, supplierInvoice.purchaseOrderId))
      .where(where)
      .orderBy(sql`CASE ${supplierInvoice.matchStatus} WHEN 'EXCEPTION' THEN 0 WHEN 'UNMATCHED' THEN 1 ELSE 2 END`, desc(supplierInvoice.invoiceDate), desc(supplierInvoice.receivedAt))
      .limit(LIMIT)
      .offset((page - 1) * LIMIT),
    db.select({ total: sql<number>`count(*)::int` }).from(supplierInvoice).where(where),
    apAgeing(app.org.id, today),
    matchStatusCounts(app.org.id),
    db.select({ id: vendor.id, name: vendor.name, gstRegistered: vendor.gstRegistered, paymentTermsDays: vendor.paymentTermsDays }).from(vendor).where(and(eq(vendor.orgId, app.org.id), eq(vendor.active, true))).orderBy(asc(vendor.name)),
    db
      .select({ id: purchaseOrder.id, poNumber: purchaseOrder.poNumber, vendorId: purchaseOrder.vendorId, marketDate: purchaseOrder.marketDate })
      .from(purchaseOrder)
      .where(and(eq(purchaseOrder.orgId, app.org.id), gte(purchaseOrder.marketDate, addDays(app.marketDate, -14)), sql`${purchaseOrder.status} NOT IN ('CANCELLED','DRAFT')`))
      .orderBy(desc(purchaseOrder.marketDate), desc(purchaseOrder.poNumber)),
    db.select({ id: species.id, name: species.canonicalName }).from(species).where(and(eq(species.orgId, app.org.id), eq(species.active, true))).orderBy(asc(species.canonicalName)),
  ]);
  const poLines = pos.length
    ? await db
        .select({ poId: purchaseOrderLine.purchaseOrderId, speciesId: purchaseOrderLine.speciesId, name: species.canonicalName, qty: purchaseOrderLine.quantityKg, received: purchaseOrderLine.receivedKg, price: purchaseOrderLine.pricePerKg })
        .from(purchaseOrderLine)
        .innerJoin(species, eq(species.id, purchaseOrderLine.speciesId))
        .where(and(eq(purchaseOrderLine.orgId, app.org.id), inArray(purchaseOrderLine.purchaseOrderId, pos.map((p) => p.id))))
    : [];
  const poOptions = pos.map((p) => ({
    ...p,
    lines: poLines.filter((l) => l.poId === p.id).map((l) => ({ speciesId: l.speciesId, description: l.name, quantityKg: Number(l.received) > 0 ? Number(l.received) : Number(l.qty), unitPrice: Number(l.price) })),
  }));

  const params = { match: sp.match, pay: sp.pay, vendor: vendorId };
  const canWrite = app.can("finance.write");
  const canApprove = app.can("finance.approve");
  const vendorName = vendorId ? vendors.find((v) => v.id === vendorId)?.name : undefined;

  return (
    <div>
      <PageHeader
        eyebrow="Finance · Accounts payable"
        title="Supplier bills"
        subtitle="Every supplier invoice is three-way matched against its purchase order and goods receipt before it can be approved for payment. Duplicate invoice numbers from the same vendor are rejected."
        actions={canWrite ? <RecordInvoiceDialog vendors={vendors} pos={poOptions} species={sps} defaultDate={today} /> : undefined}
      />

      <AgeingCards a={ageing} label="AP" />

      <div className="mt-5 flex flex-col gap-2">
        <FilterChips
          base="/finance/bills"
          param="match"
          value={match ?? "all"}
          params={params}
          options={[{ key: "all", label: "All matches" }, ...MATCH.map((m) => ({ key: m, label: m === "UNMATCHED" ? "Not matched" : m === "MATCH_WITHIN_TOLERANCE" ? "Within tolerance" : m === "APPROVED_EXCEPTION" ? "Approved exception" : m.charAt(0) + m.slice(1).toLowerCase(), count: counts(m).count }))]}
        />
        <FilterChips
          base="/finance/bills"
          param="pay"
          value={pay ?? "all"}
          params={params}
          options={[{ key: "all", label: "Any payment status" }, { key: "UNPAID", label: "Unpaid" }, { key: "APPROVED_FOR_PAYMENT", label: "Approved to pay" }, { key: "PAID", label: "Paid" }, { key: "ON_HOLD", label: "On hold" }]}
        />
        {vendorName && (
          <div className="flex items-center gap-2 text-xs text-muted">
            Vendor: <Badge tone="info">{vendorName}</Badge>
            <Link href={`/finance/bills?${new URLSearchParams(Object.entries({ match: sp.match, pay: sp.pay }).filter(([, v]) => v) as [string, string][]).toString()}`} className="text-accent">Clear</Link>
          </div>
        )}
      </div>

      <Card className="mt-3 overflow-hidden">
        <Table className="min-w-[1100px]" data-testid="bills-table">
          <THead>
            <tr>
              <TH>Vendor</TH>
              <TH>Invoice no.</TH>
              <TH>PO</TH>
              <TH>Invoice date</TH>
              <TH>Due</TH>
              <TH align="right">Subtotal</TH>
              <TH align="right">GST</TH>
              <TH align="right">Total</TH>
              <TH>Match</TH>
              <TH>Payment</TH>
              <TH align="right">Actions</TH>
            </tr>
          </THead>
          <tbody>
            {bills.map(({ si, v, po }) => {
              const overdue = si.paymentStatus !== "PAID" && si.dueDate && si.dueDate < today;
              return (
                <TR key={si.id}>
                  <TD className="max-w-[180px]">
                    <Link href={`/finance/bills?${new URLSearchParams({ ...(sp.match ? { match: sp.match } : {}), ...(sp.pay ? { pay: sp.pay } : {}), vendor: v.id }).toString()}`} className="font-medium text-text hover:text-accent">{v.name}</Link>
                    <div className="text-[11px] text-muted">{si.source.toLowerCase()}{v.gstRegistered ? " · GST reg." : ""}</div>
                  </TD>
                  <TD className="whitespace-nowrap"><Link href={`/finance/reconciliation/${si.id}`} className="num text-accent hover:underline">{si.invoiceNumber}</Link></TD>
                  <TD className="whitespace-nowrap">{po?.id ? <Link href={`/procurement/purchase-orders/${po.id}`} className="num text-text-2 hover:text-accent">{po.poNumber}</Link> : <span className="text-xs text-short">No PO</span>}</TD>
                  <TD className="whitespace-nowrap text-text-2">{date(si.invoiceDate)}</TD>
                  <TD className={overdue ? "whitespace-nowrap font-medium text-short" : "whitespace-nowrap text-text-2"}>{date(si.dueDate)}{overdue && <span className="ml-1 text-[10px] uppercase">overdue</span>}</TD>
                  <TD num className="text-text-2">{sgd(si.subtotal)}</TD>
                  <TD num className="text-text-2">{sgd(si.gstAmount)}</TD>
                  <TD num className="font-semibold text-text">{sgd(si.total)}</TD>
                  <TD><Link href={`/finance/reconciliation/${si.id}`}><MatchBadge status={si.matchStatus} /></Link></TD>
                  <TD><PaymentBadge status={si.paymentStatus} /></TD>
                  <TD align="right">
                    <BillActions id={si.id} invoiceNumber={si.invoiceNumber} vendor={v.name} total={Number(si.total)} matchStatus={si.matchStatus} paymentStatus={si.paymentStatus} canApprove={canApprove} canWrite={canWrite} />
                  </TD>
                </TR>
              );
            })}
            {bills.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-10 text-center text-sm text-muted">No supplier invoices match these filters.</td></tr>
            )}
          </tbody>
        </Table>
        <Pager base="/finance/bills" params={params} page={page} pageSize={LIMIT} total={filteredCount} />
      </Card>
      <p className="mt-3 text-[11px] text-muted">
        Exceptions first, then newest. Recording a payment only records it in PasarCatch — no funds are moved. GST is applied at the organisation rate ({Number(app.org.gstRatePct).toFixed(0)}%) for GST-registered vendors only.
      </p>
    </div>
  );
}
