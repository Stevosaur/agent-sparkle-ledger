import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { getDashboardKpis } from "@/lib/services/market";
import { lotsForNight, openExceptions, pendingApprovals, recentAgentRuns, shipmentsForNight } from "@/lib/services/queries";
import { toApprovalView } from "@/lib/services/views";
import { AGENTS } from "@/lib/agents/runtime";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Empty, PageHeader, Stat, AiMark } from "@/components/ui/misc";
import { ApprovalCard } from "@/components/app/approval-card";
import { LiveRefresh } from "@/components/app/live-refresh";
import { kg, kgNum, time, date } from "@/lib/format";
import { atMarketTime, sgtParts } from "@/lib/domain/time";

const greeting = (h: number) => (h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const app = await requireApp();
  const [k, approvals, exceptions, lots, runs, ships] = await Promise.all([
    getDashboardKpis(app.org.id, app.marketDate),
    pendingApprovals(app.org.id, 4),
    openExceptions(app.org.id),
    lotsForNight(app.org.id, app.marketDate),
    recentAgentRuns(app.org.id, 8),
    shipmentsForNight(app.org.id, app.marketDate),
  ]);
  const rows = [...k.rows].sort((a, b) => a.gapKg - b.gapKg);
  const maxKg = Math.max(1, ...rows.map((r) => Math.max(r.supplyKg + r.offeredKg, r.demandKg)));
  const shortages = rows.filter((r) => r.balance === "SHORTAGE");
  const surplus = rows.filter((r) => r.balance === "SURPLUS").sort((a, b) => b.gapKg - a.gapKg);
  const vendorEx = exceptions.filter((e) => ["WEIGHT_VARIANCE", "TEMPERATURE", "LATE_VESSEL", "QUALITY", "DOCUMENT_EXPIRY"].includes(e.type));
  const stops = ships.flatMap((s) => s.stops);
  const delivered = stops.filter((s) => s.st.status === "DELIVERED").length;

  // Arrival timeline 22:00 → 06:00
  const t0 = atMarketTime(app.marketDate, "22:00").getTime();
  const span = 8 * 3600000;
  const inbound = lots.filter((x) => x.l.expectedArrivalAt && x.l.purchaseOrderLineId);
  const byVendor = new Map<string, typeof inbound>();
  for (const x of inbound) byVendor.set(x.v?.name ?? "Unknown", [...(byVendor.get(x.v?.name ?? "Unknown") ?? []), x]);
  const nowPos = Math.max(0, Math.min(100, ((app.now.getTime() - t0) / span) * 100));

  return (
    <div>
      <LiveRefresh seconds={30} />
      <PageHeader
        eyebrow={`Tonight's market · ${date(app.marketDate)}`}
        title={`${greeting(sgtParts(app.now).hour)}, ${app.user.name.split(" ")[0]}`}
        subtitle="Live supply, demand and exceptions for tonight's trading. Every AI recommendation waits for your approval."
        actions={<Link href="/market" className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg">Open Tonight&apos;s Market <ArrowRight className="size-4" /></Link>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7" data-testid="kpis">
        <Stat label="Expected supply" value={kg(k.expectedSupplyKg, 0)} sub={k.offeredKg ? `+${kgNum(k.offeredKg, 0)} kg offered` : "committed + landed"} href="/supply/expected" />
        <Stat label="Confirmed demand" value={kg(k.confirmedDemandKg, 0)} sub="buyer orders" href="/demand/requirements" />
        <Stat label="Shortages" value={`${k.shortages} species`} sub={k.shortageKg ? `${kgNum(k.shortageKg, 0)} kg short` : "none"} tone={k.shortages ? "short" : "ok"} href="/market?f=short" />
        <Stat label="At-risk surplus" value={kg(k.atRiskSurplusKg, 0)} sub="beyond demand" tone={k.atRiskSurplusKg > 0 ? "surplus" : undefined} href="/market?f=surplus" />
        <Stat label="Inbound vessels" value={k.inboundVessels} sub="vessels, farms & trucks" href="/supply/expected" />
        <Stat label="Deliveries planned" value={k.deliveriesPlanned} sub={stops.length ? `${delivered} delivered` : "routes not generated"} href="/operations/routes" />
        <Stat label="Need attention" value={k.exceptions + k.pendingApprovals} sub={`${k.pendingApprovals} approvals · ${k.exceptions} exceptions`} tone={k.exceptions + k.pendingApprovals ? "late" : "ok"} href="/ai/approvals" />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader title="Supply vs demand by species" subtitle="Committed supply (bar) vs confirmed demand (marker). Sorted by largest shortage." action={<Link href="/market" className="text-xs text-accent">Market →</Link>} />
          <CardBody className="space-y-2.5">
            {rows.length === 0 && <Empty title="No supply or demand recorded yet tonight" />}
            {rows.map((r) => {
              const s = (r.supplyKg / maxKg) * 100;
              const o = (r.offeredKg / maxKg) * 100;
              const d = (r.demandKg / maxKg) * 100;
              const tone = r.balance === "SHORTAGE" ? "bg-short" : r.balance === "SURPLUS" ? "bg-surplus" : "bg-ok";
              return (
                <Link key={r.speciesId} href={`/market/${r.speciesId}`} className="grid grid-cols-[120px_1fr_104px] items-center gap-3 rounded-md px-1 py-0.5 hover:bg-panel-2 sm:grid-cols-[170px_1fr_120px]">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-text">{r.name}</div>
                    {r.localName && <div className="truncate text-[10px] text-muted">{r.localName}</div>}
                  </div>
                  <div className="relative h-3.5 rounded bg-panel-3">
                    <div className={`absolute inset-y-0 left-0 rounded ${tone} opacity-80`} style={{ width: `${s}%` }} />
                    {o > 0 && <div className="absolute inset-y-0 rounded border border-dashed border-text-2/50" style={{ left: `${s}%`, width: `${o}%` }} title="Offered, not bought" />}
                    <div className="absolute -inset-y-1 w-0.5 bg-text" style={{ left: `${d}%` }} title={`Demand ${r.demandKg} kg`} />
                  </div>
                  <div className={`num text-right text-[11px] font-semibold ${r.balance === "SHORTAGE" ? "text-short" : r.balance === "SURPLUS" ? "text-surplus" : "text-ok"}`}>{r.statusLabel}</div>
                </Link>
              );
            })}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-accent" /> AI recommendations</span>} subtitle="Awaiting your approval" action={<Link href="/ai/approvals" className="text-xs text-accent">All {k.pendingApprovals} →</Link>} />
            <CardBody className="space-y-3">
              {approvals.length === 0 && <Empty title="Nothing waiting for approval" />}
              {approvals.slice(0, 2).map((a) => <ApprovalCard key={a.a.id} a={toApprovalView(a)} compact />)}
              {approvals.length > 2 && <Link href="/ai/approvals" className="block text-center text-xs text-accent">+{approvals.length - 2} more in the Approval Inbox</Link>}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader title="Inbound arrival timeline" subtitle="Purchased supply by ETA, 22:00 → 06:00 SGT. Orange = revised later than originally declared." action={<Link href="/supply/expected" className="text-xs text-accent">Expected catch →</Link>} />
        <CardBody>
          <div className="relative ml-[150px] mb-2 flex justify-between text-[10px] text-muted num">
            {["22:00", "23:00", "00:00", "01:00", "02:00", "03:00", "04:00", "05:00", "06:00"].map((t) => <span key={t}>{t}</span>)}
          </div>
          <div className="space-y-1.5">
            {[...byVendor.entries()].map(([name, xs]) => (
              <div key={name} className="grid grid-cols-[140px_1fr] items-center gap-2.5">
                <div className="truncate text-xs text-text-2">{name}</div>
                <div className="relative h-6 rounded bg-panel-2">
                  <div className="absolute inset-y-0 w-px bg-accent" style={{ left: `${nowPos}%` }} />
                  {xs.map((x) => {
                    const pos = Math.max(0, Math.min(99, ((x.l.expectedArrivalAt!.getTime() - t0) / span) * 100));
                    const orig = x.l.originalEta ? Math.max(0, Math.min(99, ((x.l.originalEta.getTime() - t0) / span) * 100)) : pos;
                    const late = x.l.originalEta && x.l.expectedArrivalAt && x.l.expectedArrivalAt.getTime() - x.l.originalEta.getTime() > 30 * 60000;
                    const received = !["EXPECTED", "LANDED"].includes(x.l.status);
                    return (
                      <Link key={x.l.id} href={`/supply/lots/${x.l.id}`} title={`${x.l.lotNumber} · ${x.l.canonicalSpeciesName} ${Number(x.l.quantityDeclaredKg)} kg · ETA ${time(x.l.expectedArrivalAt)}`}>
                        {late && <span className="absolute top-1/2 h-px -translate-y-1/2 border-t border-dashed border-late" style={{ left: `${orig}%`, width: `${pos - orig}%` }} />}
                        <span className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${received ? "border-ok bg-ok" : late ? "border-late bg-late-soft" : "border-info bg-info-soft"}`} style={{ left: `${pos}%` }} />
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
            {byVendor.size === 0 && <Empty title="No purchased supply scheduled yet" />}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-ok" /> received</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2 border-info" /> expected</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2 border-late" /> late (ETA revised)</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-px bg-accent" /> now</span>
          </div>
        </CardBody>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Shortage alerts" action={<Badge tone="short">{shortages.length}</Badge>} />
          <CardBody className="space-y-2">
            {shortages.length === 0 && <p className="text-xs text-muted">No shortages. Supply covers confirmed demand.</p>}
            {shortages.map((r) => (
              <Link key={r.speciesId} href={`/market/${r.speciesId}`} className="flex items-center justify-between rounded-md border border-border px-3 py-2 hover:bg-panel-2">
                <span className="text-sm text-text">{r.name}</span>
                <span className="num text-sm font-semibold text-short">−{kgNum(-r.gapKg, 0)} kg</span>
              </Link>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Surplus alerts" action={<Badge tone="surplus">{surplus.length}</Badge>} />
          <CardBody className="space-y-2">
            {surplus.length === 0 && <p className="text-xs text-muted">Nothing at risk of going unsold.</p>}
            {surplus.map((r) => (
              <Link key={r.speciesId} href={`/market/${r.speciesId}`} className="flex items-center justify-between rounded-md border border-border px-3 py-2 hover:bg-panel-2">
                <span className="text-sm text-text">{r.name}</span>
                <span className="num text-sm font-semibold text-surplus">+{kgNum(r.gapKg, 0)} kg</span>
              </Link>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Vendor exceptions" action={<Link href="/ai/exceptions" className="text-xs text-accent">All →</Link>} />
          <CardBody className="space-y-2">
            {vendorEx.length === 0 && <p className="text-xs text-muted">No open vendor exceptions.</p>}
            {vendorEx.slice(0, 6).map((e) => (
              <Link key={e.id} href={e.href ?? "/ai/exceptions"} className="block rounded-md border border-border px-3 py-2 hover:bg-panel-2">
                <div className="flex items-center gap-2"><StatusBadge status={e.type} /><span className="num ml-auto text-[10px] text-muted">{time(e.openedAt)}</span></div>
                <div className="mt-1 text-xs text-text">{e.title}</div>
              </Link>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Delivery status" subtitle={ships.length ? `${ships.length} run(s), ${stops.length} stops` : "Routes are generated after picking (≈05:00)"} action={<Link href="/operations/routes" className="text-xs text-accent">Route board →</Link>} />
          <CardBody className="space-y-2">
            {ships.length === 0 && <Empty title="No delivery runs yet tonight">Generate routes from Operations → Routes once orders are packed.</Empty>}
            {ships.map((s) => (
              <div key={s.sh.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
                <span className="num text-xs font-semibold text-text">{s.sh.shipmentNumber}</span>
                <span className="text-xs text-muted">{s.v?.name} · {s.stops.length} stops · {kg(s.sh.totalKg, 0)}</span>
                <span className="ml-auto"><StatusBadge status={s.sh.status} /></span>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Agent activity" subtitle="Observable, auditable agent runs" action={<Link href="/ai/activity" className="text-xs text-accent">All →</Link>} />
          <CardBody className="space-y-1.5">
            {runs.map((r) => (
              <Link key={r.id} href={`/ai/activity?run=${r.id}`} className="flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-panel-2">
                <span className="num w-11 shrink-0 pt-0.5 text-[11px] text-muted">{time(r.startedAt)}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><AiMark /><span className="text-xs font-medium text-text">{AGENTS[r.agent as keyof typeof AGENTS] ?? r.agent}</span><StatusBadge status={r.status} /></div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">{r.summary}</p>
                </div>
              </Link>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
