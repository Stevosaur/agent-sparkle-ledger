import Link from "next/link";
import { requireApp } from "@/lib/auth/session";
import { PageHeader, Stat } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { date, kgNum, sgd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { matchStatusCounts, reconciliationList } from "../_data";
import { FilterChips, MatchBadge, PaymentBadge } from "../_ui";

export const metadata = { title: "Reconciliation" };

const VIEWS: Record<string, { label: string; statuses: string[] | null }> = {
  attention: { label: "Needs attention", statuses: ["EXCEPTION", "UNMATCHED"] },
  tolerance: { label: "Within tolerance", statuses: ["MATCH_WITHIN_TOLERANCE"] },
  approved: { label: "Approved exceptions", statuses: ["APPROVED_EXCEPTION"] },
  matched: { label: "Matched", statuses: ["MATCHED"] },
  any: { label: "All", statuses: null },
};

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const app = await requireApp("finance.view");
  const sp = await searchParams;
  const view = sp.view && VIEWS[sp.view] ? sp.view : "attention";
  const [counts, rows] = await Promise.all([matchStatusCounts(app.org.id), reconciliationList(app.org.id, VIEWS[view].statuses)]);
  const tol = app.org.settings.invoiceTolerance;
  const exc = counts("EXCEPTION");
  const cnt = (v: string) => (VIEWS[v].statuses ?? ["UNMATCHED", "MATCHED", "MATCH_WITHIN_TOLERANCE", "EXCEPTION", "APPROVED_EXCEPTION"]).reduce((a, s) => a + counts(s).count, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Finance · Three-way match"
        title="Reconciliation"
        subtitle="Purchase order ⇄ goods receipt ⇄ supplier invoice, line by line. The AP Reconciliation Agent matches every bill on arrival; anything outside tolerance is held until a finance approver resolves it."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="match-counts">
        <Stat label="Exceptions" value={exc.count} sub={exc.over > 0 ? `${sgd(exc.over)} potential overbilling ex GST` : "none open"} tone={exc.count ? "short" : "ok"} href="/finance/reconciliation?view=attention" />
        <Stat label="Not matched yet" value={counts("UNMATCHED").count} sub="awaiting the agent" href="/finance/reconciliation?view=attention" />
        <Stat label="Within tolerance" value={counts("MATCH_WITHIN_TOLERANCE").count} sub={`±${tol.qtyPct}% qty · ±${tol.pricePct}% price · S$${tol.amountAbs}`} tone="info" href="/finance/reconciliation?view=tolerance" />
        <Stat label="Approved exceptions" value={counts("APPROVED_EXCEPTION").count} sub={sgd(counts("APPROVED_EXCEPTION").total)} tone="spike" href="/finance/reconciliation?view=approved" />
        <Stat label="Matched exactly" value={counts("MATCHED").count} sub={sgd(counts("MATCHED").total)} tone="ok" href="/finance/reconciliation?view=matched" />
      </div>

      <div className="mt-5">
        <FilterChips base="/finance/reconciliation" param="view" value={view} params={{ view }} options={Object.entries(VIEWS).map(([k, v]) => ({ key: k, label: v.label, count: cnt(k) }))} />
      </div>

      <Card className="mt-3 overflow-hidden">
        <Table className="min-w-[1080px]" data-testid="recon-table">
          <THead>
            <tr>
              <TH>Invoice</TH>
              <TH>Vendor</TH>
              <TH>PO</TH>
              <TH>GRN coverage</TH>
              <TH align="right">Received kg</TH>
              <TH align="right">Billed kg</TH>
              <TH align="right">Δ kg</TH>
              <TH align="right">Total</TH>
              <TH align="right">Overbilling ex GST</TH>
              <TH>Match</TH>
              <TH>Payment</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => {
              const d = r.billedKg - r.receivedKg;
              const full = r.poLines > 0 && r.receivedLines >= r.poLines;
              return (
                <TR key={r.id} className={r.matchStatus === "EXCEPTION" ? "bg-short-soft/40" : undefined}>
                  <TD className="whitespace-nowrap">
                    <Link href={`/finance/reconciliation/${r.id}`} className="num font-medium text-accent hover:underline">{r.invoiceNumber}</Link>
                    <div className="text-[11px] text-muted">{date(r.invoiceDate)}</div>
                  </TD>
                  <TD className="max-w-[180px] truncate text-text">{r.vendor}</TD>
                  <TD className="whitespace-nowrap">{r.poId ? <Link href={`/procurement/purchase-orders/${r.poId}`} className="num text-text-2 hover:text-accent">{r.poNumber}</Link> : <span className="text-xs text-short">No PO</span>}</TD>
                  <TD className="whitespace-nowrap">
                    {r.poLines ? (
                      <span className={cn("num text-xs", full ? "text-ok" : r.receivedLines ? "text-surplus" : "text-short")}>{r.receivedLines}/{r.poLines} lines received</span>
                    ) : <span className="text-xs text-muted">—</span>}
                  </TD>
                  <TD num className="text-text-2">{kgNum(r.receivedKg)}</TD>
                  <TD num className="text-text">{kgNum(r.billedKg)}</TD>
                  <TD num className={Math.abs(d) < 0.0005 ? "text-muted" : d > 0 ? "font-semibold text-short" : "text-surplus"}>{Math.abs(d) < 0.0005 ? "0.0" : `${d > 0 ? "+" : "−"}${kgNum(Math.abs(d))}`}</TD>
                  <TD num className="text-text">{sgd(r.total)}</TD>
                  <TD num className={r.over && r.over > 0 ? "font-semibold text-short" : "text-muted"}>{r.over && r.over > 0 ? sgd(r.over) : "—"}</TD>
                  <TD><MatchBadge status={r.matchStatus} /></TD>
                  <TD><PaymentBadge status={r.paymentStatus} /></TD>
                </TR>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={11} className="px-4 py-10 text-center text-sm text-muted">{view === "attention" ? "Nothing needs attention — every bill matches its PO and goods receipt." : "No invoices in this view."}</td></tr>}
          </tbody>
        </Table>
      </Card>
      <p className="mt-3 text-[11px] text-muted">
        Received kg = accepted weight on goods receipts for the PO. Overbilling = billed amount above (received kg × PO price), summed over lines, before GST. Showing up to 120 rows, exceptions first. Tolerance is set in Settings.
      </p>
    </div>
  );
}
