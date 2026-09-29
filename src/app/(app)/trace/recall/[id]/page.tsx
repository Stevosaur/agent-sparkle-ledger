import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/auth/session";
import { getRecall } from "@/lib/services/trace";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { PageHeader, Stat } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { ContactForm } from "./contact-form";
import { dateTime, kg } from "@/lib/format";

export default async function RecallCase({ params }: { params: Promise<{ id: string }> }) {
  const app = await requireApp("trace.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const r = await getRecall(app.org.id, id);
  if (!r) notFound();
  const onHand = r.lots.reduce((a, x) => a + Number(x.ral.quantityOnHandKg), 0);
  const shipped = r.customers.reduce((a, x) => a + Number(x.rac.quantityKg), 0);
  return (
    <div>
      <PageHeader
        eyebrow={<Link href="/trace/recall" className="hover:underline">Recall</Link>}
        title={<span className="flex items-center gap-3"><span className="num">{r.rc.caseNumber}</span><Badge tone="short">RECALL MODE</Badge></span>}
        subtitle={`${r.rc.reason} — opened ${dateTime(r.rc.openedAt)} by ${r.rc.openedBy}`}
        actions={<><StatusBadge status={r.rc.status} /><Link href={`/trace/${r.root.id}`} className="num text-sm text-accent">{r.root.lotNumber}</Link></>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Lots affected" value={r.lots.length} />
        <Stat label="On hand (held)" value={kg(onHand)} tone="late" />
        <Stat label="Customers affected" value={r.customers.length} tone={r.customers.length ? "short" : "ok"} />
        <Stat label="Quantity shipped" value={kg(shipped)} tone={shipped ? "short" : undefined} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Potentially affected customers" subtitle="Draft contact list — status updates only after approval" />
          <CardBody className="p-0">
            <Table>
              <THead><tr><TH>Customer</TH><TH>Phone</TH><TH align="right">Qty</TH><TH>Lots</TH><TH>Orders</TH><TH>Contact</TH></tr></THead>
              <tbody>
                {r.customers.map(({ rac, c }) => (
                  <TR key={rac.id}>
                    <TD>{c.name}</TD>
                    <TD className="num text-xs text-muted">{c.phone ?? "—"}</TD>
                    <TD num>{kg(rac.quantityKg)}</TD>
                    <TD className="num text-[11px] text-muted">{rac.lotNumbers.map((l) => l.split("-").slice(-2).join("-")).join(", ")}</TD>
                    <TD className="num text-[11px] text-muted">{rac.salesOrderNumbers.join(", ")}</TD>
                    <TD><StatusBadge status={rac.contactStatus} /></TD>
                  </TR>
                ))}
                {r.customers.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-xs text-muted">No stock from this lot has reached customers.</td></tr>}
              </tbody>
            </Table>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Affected lots" />
          <CardBody className="p-0">
            <Table>
              <THead><tr><TH>Lot</TH><TH>Relation</TH><TH align="right">On hand</TH><TH>Hold</TH></tr></THead>
              <tbody>
                {r.lots.map(({ ral, l }) => (
                  <TR key={ral.id}>
                    <TD><Link href={`/trace/${l.id}`} className="num text-accent">{l.lotNumber}</Link></TD>
                    <TD>{ral.relation.toLowerCase()}</TD>
                    <TD num>{kg(ral.quantityOnHandKg)}</TD>
                    <TD>{ral.holdPlaced ? <Badge tone="late">Hold</Badge> : "—"}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      </div>
      {app.can("recall.manage") && r.customers.length > 0 && (
        <Card className="mt-4">
          <CardHeader title="Customer notice (draft)" subtitle="Approval required before any message is sent" />
          <CardBody>
            <ContactForm
              recallCaseId={r.rc.id}
              disabled={r.rc.status !== "OPEN"}
              defaultBody={`Dear {customer}, as a precaution we are recalling seafood from lot(s) {lots} ({kg} kg delivered to you). Please set it aside and do not sell or serve it. We will collect it and issue a full credit. Reason: ${r.rc.reason}. — Selat Fresh Seafood`}
            />
          </CardBody>
        </Card>
      )}
      <p className="mt-4 text-[11px] text-muted">Regulatory notification: PasarCatch does not notify the Singapore Food Agency. Record any regulator reference manually once reported through official channels.</p>
    </div>
  );
}
