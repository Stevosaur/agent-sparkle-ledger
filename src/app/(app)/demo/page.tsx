import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { requireApp } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { auditEvent } from "@/lib/db/schema";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Timeline } from "@/components/app/timeline";
import { ClockButtons } from "./clock";
import { addDays, atMarketTime } from "@/lib/domain/time";
import { date } from "@/lib/format";

export const metadata = { title: "Demo guide" };

const STEPS: [string, string, string][] = [
  ["Supplier sends a WhatsApp", "/supply/intake", "Send the pre-filled Ah Seng message: “Tonight 65kg batang, around 600-800g, asking 8.80. Boat reach 1.30.” (or use the Supplier app preview)."],
  ["AI drafts the catch lot", "/supply/intake", "The Catch Intake Agent extracts species, quantity, size, price and ETA and creates a draft lot — only ambiguous fields are flagged."],
  ["Procurement manager confirms", "/supply/intake", "Press “Confirm & buy”. A PO is created at the asking price and the lot joins committed supply."],
  ["It appears on Tonight's Market", "/market", "Batang demand still exceeds supply — the row reads SHORT and the Procurement Agent raises a shortage."],
  ["A second supplier offers stock", "/supply/intake", "Pick Nelayan Jaya Johor in the simulator and send “Can give 40kg batang 1-2kg size @ 8.50, reach 2.45”. Confirm it as an offer (not a purchase)."],
  ["The Procurement Agent recommends", "/ai/approvals", "It scores the offer (price, reliability, quality, ETA…) and proposes a PO that waits in the Approval Inbox."],
  ["The manager approves", "/ai/approvals", "Approve (or Modify). The system executes: PO created, lot committed, audit event recorded."],
  ["The seafood arrives", "/receive", "On a phone: pick the Ah Seng lot, enter the actual weight (e.g. 61.2), temperature and grade, Accept. Under 20 seconds."],
  ["Allocation engine distributes supply", "/ai/approvals", "Receiving triggers the Allocation Agent; approve its proposal, or use Procurement → Allocations to try other policies."],
  ["Orders move into picking", "/operations/picking", "Generate the pick list, then Pick & pack each order."],
  ["A delivery route is produced", "/operations/routes", "Generate routes (departure 05:30). Runs respect vehicle capacity and delivery windows."],
  ["The goods are dispatched", "/operations/dispatch", "Dispatch each run; buyers are notified."],
  ["The supplier invoice arrives", "/procurement/purchase-orders", "Open the Ah Seng PO and “Simulate supplier invoice — bill declared weight”."],
  ["Three-way matching", "/finance/reconciliation", "The AP Reconciliation Agent flags the quantity discrepancy and potential overbilling."],
  ["Trace the lot end-to-end", "/trace", "Search the lot number: supplier → receiving → processing → allocation → customer → delivery → invoice."],
];

export default async function DemoGuide() {
  const app = await requireApp();
  const last = addDays(app.marketDate, -1);
  const story = await db
    .select()
    .from(auditEvent)
    .where(and(eq(auditEvent.orgId, app.org.id), sql`${auditEvent.at} >= ${atMarketTime(last, "22:00")}`, sql`${auditEvent.at} <= ${atMarketTime(last, "07:40")}`, sql`${auditEvent.action} IN ('LOT_DRAFTED','LOT_CONFIRMED','PO_APPROVED','ETA_UPDATED','LOT_RECEIVED','LOT_TRANSFORMED','APPROVAL_GRANTED','PICKING_STARTED','ROUTE_PLANNED','SHIPMENT_DISPATCHED','DISCOUNT_APPROVED','INVOICE_MATCHED','DELIVERY_COMPLETED')`))
    .orderBy(asc(auditEvent.at))
    .limit(400);
  // Keep the narrative readable: one event per action per quarter-hour.
  const seen = new Set<string>();
  const condensed = story.filter((e) => {
    const k = `${e.action}:${Math.floor(e.at.getTime() / 900000)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return (
    <div>
      <PageHeader eyebrow="DEMO DATA — fictional workspace" title="Demo guide" subtitle="The workspace runs on a labelled demo clock that starts at 01:10 on tonight's market night. Last night's full overnight story is already recorded; tonight is in progress so you can drive the core flow live." />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title="Live script — the definition-of-done story" subtitle={`Tonight · ${date(app.marketDate)}`} />
          <CardBody>
            <ol className="space-y-3">
              {STEPS.map(([t, href, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-fg">{i + 1}</span>
                  <div>
                    <Link href={href} className="text-sm font-semibold text-text hover:text-accent">{t} →</Link>
                    <p className="text-xs text-muted">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
        <div className="space-y-4">
          {app.org.isDemo && app.can("settings.manage") && (
            <Card>
              <CardHeader title="Demo clock" subtitle="Jump forward to show time-based agents (surplus at 04:15, routes at 05:00, finance at 07:00)" />
              <CardBody><ClockButtons /></CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Suggested questions for the AI command bar" subtitle="Press ⌘K" />
            <CardBody className="space-y-1 text-sm text-text-2">
              <p>“How much batang are we short tonight?”</p>
              <p>“Who has supplied threadfin cheapest over the last 30 days?”</p>
              <p>“Allocate today&apos;s seabass.”</p>
              <p>“What seafood is likely to go unsold today?”</p>
              <p>“Which invoices don&apos;t match receiving?”</p>
            </CardBody>
          </Card>
        </div>
      </div>
      <Card className="mt-4">
        <CardHeader title={`Last night's story · ${date(last)}`} subtitle="23:15 declarations → 00:10 forecast → 00:30 shortages → 01:05 ETA change → 02:00 receiving (8% short) → 02:20 reallocation → 03:00 picking → 04:15 surplus → 04:30 discount approved → 05:00 routes → 05:30 trucks depart → 07:00 three-way matching" />
        <CardBody><Timeline events={condensed.reverse()} showDate /></CardBody>
      </Card>
    </div>
  );
}
