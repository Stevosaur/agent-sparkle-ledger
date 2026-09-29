import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, X } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { traceLot } from "@/lib/services/trace";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/misc";
import { Timeline } from "@/components/app/timeline";
import { RecallButton } from "./recall-button";
import { date, kg, perKg, sgd, time, titleCase } from "@/lib/format";

export default async function TraceLot({ params }: { params: Promise<{ lotId: string }> }) {
  const app = await requireApp("trace.view");
  const { lotId } = await params;
  const t = await traceLot(app.org.id, lotId);
  if (!t) notFound();
  const { root } = t;
  const complete = t.completeness.filter((c) => c.ok).length;
  const children = t.lots.filter((l) => l.id !== root.id);
  const shipments = [...new Map(t.deliveries.map((d) => [d.sh.id, d])).values()];

  const Stage = ({ n, title, children: c, empty }: { n: number; title: string; children?: React.ReactNode; empty?: boolean }) => (
    <div className="relative min-w-[210px] flex-1">
      <div className="mb-2 flex items-center gap-2">
        <span className={`num flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${empty ? "bg-panel-3 text-muted" : "bg-accent text-accent-fg"}`}>{n}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</span>
      </div>
      <div className={`space-y-2 rounded-xl border p-3 text-sm ${empty ? "border-dashed border-border text-muted" : "border-border bg-panel"}`}>{c}</div>
    </div>
  );

  return (
    <div>
      <PageHeader
        eyebrow={<Link href="/trace" className="hover:underline">Traceability</Link>}
        title={<span className="num">{root.lotNumber}</span>}
        subtitle={`${t.species?.canonicalName ?? "?"} · ${date(root.marketDate)} · ${t.lots.length} lot(s) in this family · ${t.customers.length} customer(s)`}
        actions={
          <>
            <Badge tone={complete === t.completeness.length ? "ok" : "surplus"}>Traceability {complete}/{t.completeness.length}</Badge>
            <Link href={`/supply/lots/${root.id}`} className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm text-text hover:bg-panel-2">Lot record</Link>
            {app.can("recall.manage") && <RecallButton lotNumber={root.lotNumber} />}
          </>
        }
      />

      <div className="flex gap-3 overflow-x-auto pb-2" data-testid="trace-chain">
        <Stage n={1} title="Supplier">
          <div className="font-medium text-text">{t.vendor ? <Link href={`/vendors/${t.vendor.id}`} className="hover:text-accent">{t.vendor.name}</Link> : "Unknown"}</div>
          <div className="text-xs text-muted">{t.vessel ? `Vessel ${t.vessel.name} · ${t.vessel.registrationNo}` : t.farm ? `Farm ${t.farm.name}` : t.vendor?.type.replaceAll("_", " ").toLowerCase()}</div>
          <div className="text-xs text-muted">{[root.sourceLocation, root.sourceCountry].filter(Boolean).join(", ")}</div>
          {t.po && <div className="text-xs"><Link href={`/procurement/purchase-orders/${t.po.po.id}`} className="num text-accent">{t.po.po.poNumber}</Link> · {kg(t.po.pol.quantityKg)} @ {perKg(t.po.pol.pricePerKg)}</div>}
        </Stage>
        <ArrowRight className="mt-9 size-4 shrink-0 text-muted" />
        <Stage n={2} title="Receiving" empty={!t.receipts.length}>
          {t.receipts.length ? t.receipts.map((r) => (
            <div key={r.grl.id}>
              <div className="num text-text">{kg(r.grl.receivedKg)} <span className="text-xs text-muted">of {kg(r.grl.declaredKg)} declared</span></div>
              <div className="num text-xs text-muted">{r.gr.grnNumber} · {time(r.gr.receivedAt)} · grade {r.grl.qualityGrade} · <span className={Number(r.grl.temperatureC) > 4 ? "text-short" : ""}>{r.grl.temperatureC}°C</span></div>
              {Number(r.grl.rejectedKg) > 0 && <div className="text-xs text-short">Rejected {kg(r.grl.rejectedKg)} ({titleCase(r.grl.rejectionReason ?? "")})</div>}
            </div>
          )) : "Not received yet"}
        </Stage>
        <ArrowRight className="mt-9 size-4 shrink-0 text-muted" />
        <Stage n={3} title="Processing" empty={!children.length}>
          {children.length ? children.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <Link href={`/trace/${c.id}`} className="num text-xs text-accent">{c.lotNumber.split("-").slice(-2).join("-")}</Link>
              <span className="text-xs text-text-2">{titleCase(c.processingState)}</span>
              <span className="num ml-auto text-xs text-text">{kg(c.quantityDeclaredKg)}</span>
            </div>
          )) : "Sold whole — no processing"}
          {t.transformations.filter((x) => x.transformationType === "WASTE").map((w) => <div key={w.id} className="num text-xs text-muted">Waste {kg(w.inputKg)}</div>)}
        </Stage>
        <ArrowRight className="mt-9 size-4 shrink-0 text-muted" />
        <Stage n={4} title="Allocation → customers" empty={!t.customers.length}>
          {t.customers.length ? t.customers.map((c) => (
            <div key={c.customerId}>
              <div className="flex items-center gap-2"><span className="text-text">{c.name}</span><span className="num ml-auto text-text">{kg(c.kg)}</span></div>
              <div className="num text-[11px] text-muted">{c.orders.join(", ")}</div>
            </div>
          )) : "Not allocated yet"}
        </Stage>
        <ArrowRight className="mt-9 size-4 shrink-0 text-muted" />
        <Stage n={5} title="Delivery" empty={!shipments.length}>
          {shipments.length ? t.deliveries.map((d) => (
            <div key={d.st.id} className="text-xs">
              <span className="num text-text">{d.sh.shipmentNumber}</span> · stop {d.st.sequence} · <StatusBadge status={d.st.status} />
              <div className="num text-muted">{d.st.podAt ? `POD ${d.st.podName} ${time(d.st.podAt)}` : `ETA ${time(d.st.plannedArrivalAt)}`}</div>
            </div>
          )) : "Not dispatched yet"}
        </Stage>
        <ArrowRight className="mt-9 size-4 shrink-0 text-muted" />
        <Stage n={6} title="Invoices" empty={!t.supplierInvoices.length && !t.customerInvoices.length}>
          {t.supplierInvoices.map((s) => (
            <div key={s.id} className="text-xs"><Link href={`/finance/reconciliation/${s.id}`} className="num text-accent">{s.invoiceNumber}</Link> <span className="text-muted">supplier · {sgd(s.total)}</span> <StatusBadge status={s.matchStatus} /></div>
          ))}
          {t.customerInvoices.map((c) => (
            <div key={c.id} className="text-xs"><span className="num text-text">{c.invoiceNumber}</span> <span className="text-muted">{c.type === "CREDIT_NOTE" ? "credit note" : "customer"} · {sgd(c.total)}</span></div>
          ))}
          {!t.supplierInvoices.length && !t.customerInvoices.length && "No invoices yet"}
        </Stage>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Complete chain of custody" subtitle="Every recorded event across this lot, its child lots, purchase order, orders and invoices" />
          <CardBody><Timeline events={t.timeline} showDate /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Traceability completeness" />
          <CardBody className="space-y-2">
            {t.completeness.map((c) => (
              <div key={c.item} className="flex items-center gap-2 text-sm">
                {c.ok ? <Check className="size-4 text-ok" /> : <X className="size-4 text-short" />}
                <span className={c.ok ? "text-text-2" : "text-text"}>{c.item}</span>
              </div>
            ))}
            <p className="pt-2 text-[11px] text-muted">Import documents (CCP, health certificates) are MANUAL references — PasarCatch does not query SFA or TradeNet.</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
