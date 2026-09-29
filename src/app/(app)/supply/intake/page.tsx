import Link from "next/link";
import { and, desc, eq, isNull, inArray } from "drizzle-orm";
import { requireApp } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { catchLot, message, species, vendor } from "@/lib/db/schema";
import { PageHeader, Section, Empty } from "@/components/ui/misc";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { DraftReview } from "@/components/supply/draft-review";
import { toDraftView } from "@/lib/services/lot-views";
import { Simulator } from "./simulator";
import { time } from "@/lib/format";

export const metadata = { title: "Catch Intake" };

export default async function IntakePage({ searchParams }: { searchParams: Promise<{ vendor?: string }> }) {
  const app = await requireApp("supply.write");
  const sp = await searchParams;
  const [vendors, spp, pending, msgs] = await Promise.all([
    db.select().from(vendor).where(and(eq(vendor.orgId, app.org.id), eq(vendor.active, true))).orderBy(vendor.name),
    db.select({ id: species.id, name: species.canonicalName }).from(species).where(eq(species.orgId, app.org.id)).orderBy(species.canonicalName),
    db
      .select({ l: catchLot, v: vendor })
      .from(catchLot)
      .leftJoin(vendor, eq(vendor.id, catchLot.vendorId))
      .where(and(eq(catchLot.orgId, app.org.id), eq(catchLot.marketDate, app.marketDate), isNull(catchLot.purchaseOrderLineId), inArray(catchLot.status, ["EXPECTED", "LANDED"]), isNull(catchLot.parentLotId)))
      .orderBy(desc(catchLot.createdAt)),
    db.select({ m: message, v: vendor }).from(message).leftJoin(vendor, eq(vendor.id, message.vendorId)).where(eq(message.orgId, app.org.id)).orderBy(desc(message.at)).limit(25),
  ]);
  const drafts = pending.filter((p) => p.l.confirmation === "DRAFT");
  const offers = pending.filter((p) => p.l.confirmation === "CONFIRMED");
  return (
    <div>
      <PageHeader
        eyebrow="Supply · Catch intake"
        title="Catch Intake"
        subtitle="WhatsApp is the input layer. Suppliers message the way they always do; the Catch Intake Agent turns it into draft catch lots, flagging only what's ambiguous. The simulator stands in for the WhatsApp Business Cloud API until Meta credentials are configured."
        actions={<Link href="/settings/integrations" className="text-xs text-accent">Integration status →</Link>}
      />
      <Simulator vendors={vendors.filter((v) => v.whatsappNumber).map((v) => ({ id: v.id, name: v.name, whatsapp: v.whatsappNumber }))} defaultVendorId={sp.vendor ?? vendors.find((v) => v.code === "V-AHSENG")?.id} />

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div>
          <Section title={`Awaiting confirmation · ${drafts.length}`}>
            <div className="space-y-3">
              {drafts.length === 0 && <Empty title="No draft lots waiting">New supplier messages will appear here as drafts.</Empty>}
              {drafts.map((d) => <DraftReview key={d.l.id} lot={toDraftView(d.l, d.v?.name ?? null)} species={spp} canBuy={app.can("po.approve")} />)}
            </div>
          </Section>
          <Section title={`Confirmed offers, not yet bought · ${offers.length}`}>
            <div className="space-y-3">
              {offers.length === 0 && <Empty title="No open offers">Offers the procurement agent can recommend appear here.</Empty>}
              {offers.map((d) => <DraftReview key={d.l.id} lot={toDraftView(d.l, d.v?.name ?? null)} species={spp} canBuy={app.can("po.approve")} />)}
            </div>
          </Section>
        </div>
        <Section title="Message log">
          <div className="divide-y divide-border rounded-xl border border-border bg-panel">
            {msgs.map(({ m, v }) => (
              <div key={m.id} className="px-4 py-2.5">
                <div className="flex items-center gap-2 text-[11px]">
                  <Badge tone={m.direction === "INBOUND" ? "info" : "ai"}>{m.direction === "INBOUND" ? "In" : "Out"}</Badge>
                  <span className="text-text-2">{v?.name ?? m.fromHandle ?? m.toHandle ?? "Unknown"}</span>
                  <span className="text-muted">{m.channel.replaceAll("_", " ").toLowerCase()}</span>
                  <span className="num ml-auto text-muted">{time(m.at)}</span>
                </div>
                <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-text">{m.body}</p>
                <div className="mt-1"><StatusBadge status={m.status} /></div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
