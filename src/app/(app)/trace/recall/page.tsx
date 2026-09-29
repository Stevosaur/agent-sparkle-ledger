import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireApp } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { catchLot, recallCase } from "@/lib/db/schema";
import { PageHeader, Empty } from "@/components/ui/misc";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { dateTime } from "@/lib/format";

export const metadata = { title: "Recall" };

export default async function RecallList() {
  const app = await requireApp("trace.view");
  const cases = await db.select({ rc: recallCase, l: catchLot }).from(recallCase).innerJoin(catchLot, eq(catchLot.id, recallCase.rootLotId)).where(eq(recallCase.orgId, app.org.id)).orderBy(desc(recallCase.openedAt));
  return (
    <div>
      <PageHeader eyebrow="Traceability" title="Recall" subtitle="Open a recall from any lot in the Lot Explorer. PasarCatch finds every child lot, customer and quantity affected, places holds on stock still on hand, and drafts a contact list — customers are never notified without approval." actions={<Link href="/trace" className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg">Find a lot</Link>} />
      {cases.length === 0 ? <Empty title="No recall cases">Good. When you need one, it takes seconds.</Empty> : (
        <div className="rounded-xl border border-border bg-panel">
          <Table>
            <THead><tr><TH>Case</TH><TH>Root lot</TH><TH>Reason</TH><TH>Severity</TH><TH>Status</TH><TH>Opened</TH></tr></THead>
            <tbody>
              {cases.map(({ rc, l }) => (
                <TR key={rc.id}>
                  <TD><Link href={`/trace/recall/${rc.id}`} className="num text-accent">{rc.caseNumber}</Link></TD>
                  <TD className="num">{l.lotNumber}</TD>
                  <TD className="max-w-80 truncate">{rc.reason}</TD>
                  <TD><Badge tone={rc.severity === "CLASS_I" ? "short" : rc.severity === "CLASS_II" ? "late" : "surplus"}>{rc.severity.replace("_", " ")}</Badge></TD>
                  <TD><StatusBadge status={rc.status} /></TD>
                  <TD className="num text-xs text-muted">{dateTime(rc.openedAt)} · {rc.openedBy}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
