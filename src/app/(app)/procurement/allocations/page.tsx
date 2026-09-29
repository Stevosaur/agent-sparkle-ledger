import Link from "next/link";
import { requireApp } from "@/lib/auth/session";
import { getMarket } from "@/lib/services/market";
import { allocationsForSpecies } from "@/lib/services/queries";
import { POLICY_LABELS, type AllocationPolicy } from "@/lib/domain/allocation";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Empty, PageHeader } from "@/components/ui/misc";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { ActionButton } from "@/components/app/action-button";
import { releaseAllocationAction } from "@/app/actions";
import { kgNum, time, date, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AllocationWorkbench } from "./workbench";

export const metadata = { title: "Allocations" };

const POLICIES = Object.keys(POLICY_LABELS) as AllocationPolicy[];

export default async function AllocationsPage({ searchParams }: { searchParams: Promise<{ species?: string }> }) {
  const app = await requireApp("procurement.view");
  const { species: wanted } = await searchParams;
  const market = await getMarket(app.org.id, app.marketDate);
  const rows = market
    .filter((r) => r.demandKg > 0 || r.availableKg > 0)
    .sort((a, b) => Number(b.unallocatedDemandKg > 0 && b.availableKg > 0) - Number(a.unallocatedDemandKg > 0 && a.availableKg > 0) || b.unallocatedDemandKg - a.unallocatedDemandKg);
  const selected = rows.find((r) => r.speciesId === wanted) ?? rows.find((r) => r.unallocatedDemandKg > 0 && r.availableKg > 0) ?? rows[0] ?? null;
  const existing = selected ? await allocationsForSpecies(app.org.id, app.marketDate, selected.speciesId) : [];
  const defaultPolicy = (POLICIES.includes(app.org.settings.defaultAllocationPolicy as AllocationPolicy) ? app.org.settings.defaultAllocationPolicy : "PRIORITY") as AllocationPolicy;
  const canWrite = app.can("procurement.write");
  const existingKg = existing.reduce((a, x) => a + Number(x.a.quantityKg), 0);

  return (
    <div>
      <PageHeader
        eyebrow={`Procurement · ${date(app.marketDate)}`}
        title="Allocation Workbench"
        subtitle="Share landed stock across buyer orders under a clear policy. Preview any policy live, confirm when you're happy, and release unpicked allocations if plans change."
      />

      {rows.length === 0 ? (
        <Empty title="Nothing to allocate tonight">Allocation opens once lots are received and buyers have confirmed orders.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <Card className="min-w-0 self-start lg:sticky lg:top-4">
            <CardHeader title="Species" subtitle="Available stock vs open demand" />
            <nav className="flex gap-1.5 overflow-x-auto p-2 lg:max-h-[70vh] lg:flex-col lg:overflow-y-auto" aria-label="Species">
              {rows.map((r) => {
                const active = r.speciesId === selected?.speciesId;
                const ready = r.unallocatedDemandKg > 0 && r.availableKg > 0;
                return (
                  <Link
                    key={r.speciesId}
                    href={`/procurement/allocations?species=${r.speciesId}`}
                    className={cn("min-w-[170px] shrink-0 rounded-md border px-3 py-2 lg:min-w-0", active ? "border-accent bg-accent-soft" : "border-transparent hover:bg-panel-2")}
                    data-testid={`alloc-species-${r.code}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-xs font-medium", active ? "text-accent" : "text-text")}>{r.name}</span>
                      {ready && <span className="size-1.5 shrink-0 rounded-full bg-accent" title="Stock and open demand" />}
                    </div>
                    <div className="num mt-0.5 flex justify-between text-[10px]">
                      <span className={r.availableKg > 0 ? "text-ok" : "text-muted"}>{kgNum(r.availableKg)} avail</span>
                      <span className={r.unallocatedDemandKg > 0 ? "text-text-2" : "text-muted"}>{kgNum(r.unallocatedDemandKg)} open</span>
                    </div>
                  </Link>
                );
              })}
            </nav>
          </Card>

          {selected && (
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="text-base font-semibold text-text">{selected.name}</span>
                <Badge tone={selected.balance === "SHORTAGE" ? "short" : selected.balance === "SURPLUS" ? "surplus" : "ok"} className="num">{selected.statusLabel}</Badge>
                <span className="num">{kgNum(selected.landedKg)} kg landed · {kgNum(selected.expectedKg)} kg still expected · {kgNum(selected.allocatedKg)} / {kgNum(selected.demandKg)} kg allocated</span>
                <Link href={`/market/${selected.speciesId}`} className="ml-auto text-accent">Species detail →</Link>
              </div>

              <AllocationWorkbench
                key={selected.speciesId}
                speciesId={selected.speciesId}
                speciesName={selected.name}
                defaultPolicy={defaultPolicy}
                policies={POLICIES.map((p) => ({ key: p, label: POLICY_LABELS[p] }))}
                canWrite={canWrite}
                canConfirmSubstitute={app.can("orders.write")}
              />

              <Card>
                <CardHeader title="Existing allocations" subtitle={existing.length ? `${existing.length} allocation(s), ${kgNum(existingKg)} kg reserved tonight` : undefined} />
                {existing.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-muted">No {selected.name.toLowerCase()} allocated yet tonight.</p>
                ) : (
                  <Table className="min-w-[720px]">
                    <THead>
                      <tr>
                        <TH>Buyer</TH>
                        <TH>Order</TH>
                        <TH>Lot</TH>
                        <TH align="right">Kg</TH>
                        <TH>Policy</TH>
                        <TH>Status</TH>
                        <TH align="right">When</TH>
                        {canWrite && <TH />}
                      </tr>
                    </THead>
                    <tbody>
                      {existing.map(({ a, l, c, so }) => (
                        <TR key={a.id}>
                          <TD className="font-medium text-text">{c.name}</TD>
                          <TD><Link href={`/orders/${so.id}`} className="num text-accent hover:underline">{so.soNumber}</Link></TD>
                          <TD><Link href={`/supply/lots/${l.id}`} className="num whitespace-nowrap text-text-2 hover:text-accent">{l.lotNumber}</Link></TD>
                          <TD num className="font-semibold text-text">{kgNum(a.quantityKg)}</TD>
                          <TD className="text-xs text-text-2">{POLICY_LABELS[a.policy] ?? titleCase(a.policy)}{a.agentRunId && <Badge tone="ai" className="ml-1.5">Agent</Badge>}</TD>
                          <TD><StatusBadge status={a.status} /></TD>
                          <TD num className="text-xs text-muted">{time(a.createdAt)}{a.confirmedBy && <div className="font-sans">{a.confirmedBy}</div>}</TD>
                          {canWrite && (
                            <TD className="text-right">
                              {a.status === "CONFIRMED" && (
                                <ActionButton size="sm" variant="ghost" action={releaseAllocationAction.bind(null, a.id)} confirm={`Release ${kgNum(a.quantityKg)} kg from ${c.name} back to available stock?`} data-testid="release-allocation">
                                  Release
                                </ActionButton>
                              )}
                            </TD>
                          )}
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
