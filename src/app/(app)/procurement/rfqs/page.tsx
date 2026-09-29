import Link from "next/link";
import { Lock, ShieldCheck } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { rfqsWithQuotes, speciesOptions, vendorOptionsWithCapabilities } from "@/lib/services/queries-procurement";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Empty, PageHeader, Stat } from "@/components/ui/misc";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { kg, kgNum, perKg, time, date, dateTime } from "@/lib/format";
import { NewRfqDialog, RecordReplyForm } from "./rfq-forms";

export const metadata = { title: "RFQs" };

export default async function RfqsPage({ searchParams }: { searchParams: Promise<{ species?: string; qty?: string }> }) {
  const app = await requireApp("procurement.view");
  const { species: preselect, qty } = await searchParams;
  const initialQty = qty && Number(qty) > 0 && Number(qty) < 100000 ? Number(qty) : null;
  const canWrite = app.can("procurement.write");
  const [rfqs, sps, vend] = await Promise.all([rfqsWithQuotes(app.org.id), speciesOptions(app.org.id), vendorOptionsWithCapabilities(app.org.id)]);
  const vendorName = new Map(vend.vendors.map((v) => [v.id, v.name]));
  const tonight = rfqs.filter((r) => r.r.marketDate === app.marketDate);
  const awaiting = rfqs.filter((r) => r.r.status === "PENDING_APPROVAL").length;
  const quotesTonight = tonight.reduce((a, r) => a + r.quotes.length, 0);

  return (
    <div>
      <PageHeader
        eyebrow={`Procurement · ${date(app.marketDate)}`}
        title="Requests for Quotation"
        subtitle="Ask suppliers for a price when tonight's offers don't cover demand. Replies are parsed into quotes, which the procurement agent then scores alongside declared lots."
        actions={
          canWrite ? (
            <NewRfqDialog
              initialQty={initialQty}
              initialSpeciesId={preselect && sps.some((s) => s.id === preselect) ? preselect : null}
              species={sps.map((s) => ({ id: s.id, name: s.name, localName: s.localNames[0] ?? null, sizeMinG: s.typicalSizeMinKg ? Math.round(Number(s.typicalSizeMinKg) * 1000) : null, sizeMaxG: s.typicalSizeMaxKg ? Math.round(Number(s.typicalSizeMaxKg) * 1000) : null }))}
              vendors={vend.vendors.map((v) => ({ id: v.id, name: v.name, tier: v.relationshipTier, hasWhatsapp: !!v.whatsappNumber }))}
              capabilities={vend.capabilities.map((c) => ({ vendorId: c.vendorId, speciesId: c.speciesId, typicalKg: c.typicalKgPerNight ? Number(c.typicalKgPerNight) : null }))}
            />
          ) : undefined
        }
      />

      <div className="mb-4 flex items-start gap-3 rounded-xl border border-info/30 bg-info-soft px-4 py-3 text-xs text-text-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-info" />
        <p>
          <span className="font-semibold text-text">Nothing is sent to suppliers until a person approves it.</span> Each RFQ creates an <span className="font-semibold">external communication</span> approval in the{" "}
          <Link href="/ai/approvals" className="text-accent hover:underline">Approval Inbox</Link>. Target and maximum prices stay internal and are never included in the message.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="RFQs tonight" value={tonight.length} sub={`${rfqs.length} in recent history`} />
        <Stat label="Awaiting approval" value={awaiting} sub="drafted, not yet sent" tone={awaiting ? "surplus" : undefined} href="/ai/approvals" />
        <Stat label="Sent" value={rfqs.filter((r) => r.r.status === "SENT").length} sub="waiting for replies" tone="info" />
        <Stat label="Quotes tonight" value={quotesTonight} sub="parsed from supplier replies" tone={quotesTonight ? "ok" : undefined} />
      </div>

      <div className="mt-4 space-y-3">
        {rfqs.length === 0 && (
          <Empty title="No RFQs yet">
            {canWrite ? "Create an RFQ when a species is short and no supplier offer covers it. The Recommendations page links straight here for each shortage." : "RFQs created by the procurement team will appear here."}
          </Empty>
        )}
        {rfqs.map(({ r, sp, quotes, approval }) => {
          const invited = r.vendorIds.map((id) => ({ id, name: vendorName.get(id) ?? "Unknown vendor" }));
          const max = r.maxPricePerKg ? Number(r.maxPricePerKg) : null;
          const quotedKg = quotes.reduce((a, q) => a + Number(q.ql?.quantityKg ?? 0), 0);
          return (
            <Card key={r.id} data-testid="rfq-card">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="num text-sm font-semibold text-text">{r.rfqNumber}</span>
                    <span className="text-sm text-text">{kgNum(r.quantityKg)} kg {sp.canonicalName}</span>
                    <StatusBadge status={r.status} />
                    {r.marketDate !== app.marketDate && <Badge>{date(r.marketDate)}</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
                    {r.sizeMinKg && <span className="num">{Math.round(Number(r.sizeMinKg) * 1000)}–{Math.round(Number(r.sizeMaxKg ?? r.sizeMinKg) * 1000)} g</span>}
                    {r.deliverBy && <span>deliver by <span className="num text-text-2">{time(r.deliverBy)}</span></span>}
                    <span>by {r.createdBy ?? "—"} · {dateTime(r.createdAt)}</span>
                    {approval && (
                      <span>
                        approval <StatusBadge status={approval.status} className="ml-0.5" />
                        {approval.decidedBy && <> by {approval.decidedBy}</>}
                      </span>
                    )}
                  </div>
                </div>
                {(r.targetPricePerKg || r.maxPricePerKg) && (
                  <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted" title="Internal only — never shared with suppliers">
                    <Lock className="size-3" />
                    target <span className="num text-text-2">{perKg(r.targetPricePerKg)}</span>
                    <span className="text-border-strong">|</span>
                    max <span className="num text-text-2">{perKg(r.maxPricePerKg)}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5">
                <span className="mr-1 text-[11px] uppercase tracking-wide text-muted">Invited</span>
                {invited.map((v) => {
                  const replied = quotes.some((q) => q.v.id === v.id);
                  return (
                    <Link key={v.id} href={`/vendors/${v.id}`} className={`rounded border px-1.5 py-0.5 text-[11px] hover:border-accent ${replied ? "border-ok/40 text-ok" : "border-border text-text-2"}`}>
                      {v.name}{replied && " ✓"}
                    </Link>
                  );
                })}
              </div>
              {quotes.length > 0 ? (
                <Table className="min-w-[640px]">
                  <THead>
                    <tr>
                      <TH>Supplier</TH>
                      <TH align="right">Quantity</TH>
                      <TH align="right">Price</TH>
                      <TH align="right">Size</TH>
                      <TH align="right">ETA</TH>
                      <TH align="right">Replied in</TH>
                      <TH>Status</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {quotes.map(({ q, ql, v }) => {
                      const over = max !== null && ql && Number(ql.pricePerKg) > max;
                      return (
                        <TR key={q.id + (ql?.id ?? "")}>
                          <TD className="font-medium text-text">{v.name}</TD>
                          <TD num className="text-text">{ql ? kg(ql.quantityKg) : "—"}</TD>
                          <TD num className={over ? "font-semibold text-short" : "text-text"}>{ql ? perKg(ql.pricePerKg) : "—"}</TD>
                          <TD num className="text-text-2">{ql?.sizeMinKg ? `${Math.round(Number(ql.sizeMinKg) * 1000)}–${Math.round(Number(ql.sizeMaxKg ?? ql.sizeMinKg) * 1000)} g` : "—"}</TD>
                          <TD num className="text-text-2">{time(q.etaAt)}</TD>
                          <TD num className="text-muted">{q.respondedInMinutes !== null ? `${q.respondedInMinutes} min` : "—"}</TD>
                          <TD>
                            <div className="flex flex-wrap gap-1">
                              <StatusBadge status={q.status} />
                              {over && <Badge tone="short">Above max</Badge>}
                            </div>
                          </TD>
                        </TR>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border text-xs">
                      <td className="px-3 py-2 text-muted">{quotes.length} quote{quotes.length === 1 ? "" : "s"}</td>
                      <td className="num px-3 py-2 text-right font-semibold text-text">{kgNum(quotedKg)} / {kgNum(r.quantityKg)} kg</td>
                      <td colSpan={5} />
                    </tr>
                  </tfoot>
                </Table>
              ) : (
                <p className="border-t border-border px-4 py-3 text-xs text-muted">{r.status === "PENDING_APPROVAL" || r.status === "DRAFT" ? "Not sent yet — approve it in the Approval Inbox to message suppliers." : "No replies recorded yet."}</p>
              )}
              {canWrite && invited.length > 0 && !["CLOSED", "AWARDED", "CANCELLED"].includes(r.status) && (
                <div className="border-t border-border px-4 py-3">
                  <RecordReplyForm rfqId={r.id} vendors={invited} />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
