import Link from "next/link";
import { Smartphone } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { lotsWithContext, receiptsForNight } from "@/lib/services/queries-ops";
import { PageHeader, Stat, Empty } from "@/components/ui/misc";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { LiveRefresh } from "@/components/app/live-refresh";
import { date, kg, kgNum, time } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Receiving" };

export default async function ReceivingPage() {
  const app = await requireApp("ops.view");
  const [inbound, receipts] = await Promise.all([lotsWithContext(app.org.id, app.marketDate, { statuses: ["EXPECTED", "LANDED"] }), receiptsForNight(app.org.id, app.marketDate)]);
  const tempMax = app.org.settings.receivingTempMaxC;
  const varAlert = app.org.settings.weightVarianceAlertPct;
  const canReceive = app.can("ops.receive");
  const now = app.now.getTime();

  const bought = inbound.filter((x) => x.l.purchaseOrderLineId);
  const landed = inbound.filter((x) => x.l.status === "LANDED");
  const recvKg = receipts.reduce((a, r) => a + Number(r.grl.receivedKg), 0);
  const rejKg = receipts.reduce((a, r) => a + Number(r.grl.rejectedKg), 0);
  const tempEx = receipts.filter((r) => r.grl.temperatureC !== null && Number(r.grl.temperatureC) > tempMax).length;

  return (
    <div>
      <LiveRefresh seconds={15} />
      <PageHeader
        eyebrow={`Operations · ${date(app.marketDate)}`}
        title="Receiving desk"
        subtitle={`Weigh, inspect and temperature-check every lot as it lands. Weight variance is flagged beyond ±${varAlert}%; temperature above ${tempMax}°C is an exception.`}
        actions={canReceive ? <Link href="/receive" className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-5 text-sm font-semibold text-accent-fg"><Smartphone className="size-4" /> Open mobile receiving</Link> : undefined}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="To receive" value={inbound.length} sub={`${landed.length} landed · ${bought.length} bought`} tone={landed.length ? "info" : undefined} />
        <Stat label="Received tonight" value={kg(recvKg, 0)} sub={`${receipts.length} receipt line(s)`} tone="ok" />
        <Stat label="Rejected" value={kg(rejKg, 1)} sub={recvKg ? `${((rejKg / recvKg) * 100).toFixed(1)}% of received` : "—"} tone={rejKg > 0 ? "short" : undefined} />
        <Stat label="Temp exceptions" value={tempEx} sub={`> ${tempMax}°C at receiving`} tone={tempEx ? "short" : "ok"} />
      </div>

      <Card className="mb-4">
        <CardHeader title="Expected & landed" subtitle="In ETA order. Landed lots are at the bay and should be received first." />
        {inbound.length === 0 ? (
          <div className="p-4"><Empty title="Nothing waiting to be received">All declared lots for tonight have been received.</Empty></div>
        ) : (
          <Table className="min-w-[900px]" data-testid="receiving-queue">
            <THead><tr><TH>ETA</TH><TH>Lot</TH><TH>Vendor</TH><TH>Species</TH><TH align="right">Declared</TH><TH>Deal</TH><TH>Status</TH><TH align="right"> </TH></tr></THead>
            <tbody>
              {[...inbound].sort((a, b) => (a.l.status === "LANDED" ? 0 : 1) - (b.l.status === "LANDED" ? 0 : 1) || (a.l.expectedArrivalAt?.getTime() ?? Infinity) - (b.l.expectedArrivalAt?.getTime() ?? Infinity)).map((x) => {
                const overdue = x.l.status === "EXPECTED" && x.l.expectedArrivalAt && x.l.expectedArrivalAt.getTime() < now - 15 * 60000;
                const lateMin = x.l.originalEta && x.l.expectedArrivalAt ? Math.round((x.l.expectedArrivalAt.getTime() - x.l.originalEta.getTime()) / 60000) : 0;
                return (
                  <TR key={x.l.id}>
                    <TD>
                      <div className={cn("num font-semibold", overdue ? "text-short" : lateMin > 30 ? "text-late" : "text-text")}>{time(x.l.expectedArrivalAt)}</div>
                      {overdue ? <div className="text-[10px] text-short">overdue</div> : lateMin > 30 ? <div className="num text-[10px] text-late">+{lateMin}min</div> : null}
                    </TD>
                    <TD><Link href={`/supply/lots/${x.l.id}`} className="num whitespace-nowrap text-xs text-accent hover:underline">{x.l.lotNumber}</Link></TD>
                    <TD className="text-xs text-text-2">{x.v?.name ?? "—"}{(x.vs?.name || x.fm?.name) && <div className="text-[10px] text-muted">{x.vs?.name ?? x.fm?.name}</div>}</TD>
                    <TD className="text-sm text-text">{x.l.canonicalSpeciesName ?? x.l.supplierSpeciesName ?? "—"}</TD>
                    <TD num className="text-text">{kgNum(x.l.quantityDeclaredKg)}</TD>
                    <TD>{x.l.purchaseOrderLineId ? <Badge tone="ok">Bought</Badge> : <Badge tone="info">Offer</Badge>}</TD>
                    <TD><div className="flex gap-1"><StatusBadge status={x.l.status} />{x.l.confirmation === "DRAFT" && <Badge tone="surplus">Draft</Badge>}</div></TD>
                    <TD className="text-right">
                      {canReceive ? (
                        <Link href={`/receive?lot=${x.l.id}`} className={cn("inline-flex h-9 items-center rounded-md px-4 text-sm font-semibold", x.l.status === "LANDED" ? "bg-accent text-accent-fg" : "border border-border text-text hover:bg-panel-2")} data-testid={`receive-${x.l.lotNumber}`}>Receive</Link>
                      ) : null}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Received tonight" subtitle="Declared vs actual weight from goods receipts. Newest first." />
        {receipts.length === 0 ? (
          <div className="p-4"><Empty title="No receipts yet tonight" /></div>
        ) : (
          <Table className="min-w-[1080px]" data-testid="receiving-done">
            <THead><tr><TH>Time</TH><TH>GRN</TH><TH>Lot</TH><TH>Vendor</TH><TH>Species</TH><TH align="right">Declared</TH><TH align="right">Actual</TH><TH align="right">Variance</TH><TH align="right">Rejected</TH><TH align="right">Temp</TH><TH align="center">Grade</TH><TH>By</TH></tr></THead>
            <tbody>
              {receipts.map((r) => {
                const dec = Number(r.grl.declaredKg);
                const act = Number(r.grl.receivedKg);
                const v = dec > 0 ? ((act - dec) / dec) * 100 : null;
                const vTone = v === null ? "text-muted" : Math.abs(v) > varAlert ? "text-short" : Math.abs(v) > varAlert / 2 ? "text-surplus" : "text-ok";
                const t = r.grl.temperatureC === null ? null : Number(r.grl.temperatureC);
                const rej = Number(r.grl.rejectedKg);
                return (
                  <TR key={r.grl.id}>
                    <TD className="num text-xs text-text-2">{time(r.gr.receivedAt)}{r.grl.arrivedLateMinutes && r.grl.arrivedLateMinutes > 30 ? <div className="text-[10px] text-late">+{r.grl.arrivedLateMinutes}min late</div> : null}</TD>
                    <TD className="num whitespace-nowrap text-[11px] text-muted">{r.gr.grnNumber}</TD>
                    <TD><Link href={`/supply/lots/${r.l.id}`} className="num whitespace-nowrap text-xs text-accent hover:underline">{r.l.lotNumber}</Link></TD>
                    <TD className="text-xs text-text-2">{r.v?.name ?? "—"}</TD>
                    <TD className="text-sm text-text">{r.l.species ?? "—"}</TD>
                    <TD num className="text-text-2">{kgNum(dec)}</TD>
                    <TD num className="font-semibold text-text">{kgNum(act)}</TD>
                    <TD num className={cn("font-semibold", vTone)}>{v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`}</TD>
                    <TD num>
                      {rej > 0 ? <><span className="text-short">{kgNum(rej)}</span>{r.grl.rejectionReason && <div className="text-[10px] text-muted">{r.grl.rejectionReason.replaceAll("_", " ").toLowerCase()}</div>}</> : <span className="text-muted">0.0</span>}
                    </TD>
                    <TD num className={cn(t !== null && t > tempMax ? "font-semibold text-short" : "text-text-2")}>{t === null ? "—" : `${t.toFixed(1)}°C`}</TD>
                    <TD align="center">{r.grl.qualityGrade ? <Badge tone={r.grl.qualityGrade === "A" ? "ok" : r.grl.qualityGrade === "B" ? "info" : r.grl.qualityGrade === "C" ? "surplus" : "short"}>{r.grl.qualityGrade}</Badge> : "—"}</TD>
                    <TD className="max-w-[140px] truncate text-xs text-muted">{r.gr.receivedBy ?? "—"}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
