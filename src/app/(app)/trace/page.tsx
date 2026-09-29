import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { Search } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { catchLot, vendor } from "@/lib/db/schema";
import { findLotByNumberOrId } from "@/lib/services/lots";
import { PageHeader, Empty } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { addDays } from "@/lib/domain/time";
import { date, kg } from "@/lib/format";

export const metadata = { title: "Lot Explorer" };

export default async function TracePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const app = await requireApp("trace.view");
  const q = (await searchParams).q?.trim();
  let notFoundMsg = false;
  if (q) {
    const lot = await findLotByNumberOrId(app.org.id, q);
    if (lot) redirect(`/trace/${lot.id}`);
    notFoundMsg = true;
  }
  const recent = await db
    .select({ l: catchLot, v: vendor })
    .from(catchLot)
    .leftJoin(vendor, eq(vendor.id, catchLot.vendorId))
    .where(and(eq(catchLot.orgId, app.org.id), gte(catchLot.marketDate, addDays(app.marketDate, -1)), isNull(catchLot.parentLotId)))
    .orderBy(desc(catchLot.marketDate), desc(catchLot.lotNumber))
    .limit(40);
  return (
    <div>
      <PageHeader eyebrow="Traceability" title="Lot Explorer" subtitle="One step back, one step forward — and everything in between. Enter a lot number (full or partial, e.g. 0048) to see supplier → receiving → processing → allocation → customer → delivery → invoice." />
      <form className="mb-5 flex max-w-xl gap-2" action="/trace">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={q} placeholder="LOT-JFP-20260929-0048" className="num h-11 w-full rounded-md border border-border bg-panel-2 pl-9 pr-3 text-sm text-text focus:border-accent focus:outline-none" data-testid="trace-input" autoFocus />
        </div>
        <button className="h-11 rounded-md bg-accent px-5 text-sm font-semibold text-accent-fg" data-testid="trace-submit">Trace</button>
      </form>
      {notFoundMsg && <p className="mb-4 text-sm text-short">No lot matches “{q}”.</p>}
      <div className="rounded-xl border border-border bg-panel">
        {recent.length === 0 ? <Empty title="No lots yet" /> : (
          <Table>
            <THead><tr><TH>Lot</TH><TH>Night</TH><TH>Species</TH><TH>Vendor</TH><TH align="right">Qty</TH><TH>Status</TH></tr></THead>
            <tbody>
              {recent.map(({ l, v }) => (
                <TR key={l.id}>
                  <TD><Link href={`/trace/${l.id}`} className="num text-accent">{l.lotNumber}</Link></TD>
                  <TD className="text-xs text-muted">{date(l.marketDate)}</TD>
                  <TD>{l.canonicalSpeciesName ?? l.supplierSpeciesName}</TD>
                  <TD className="text-text-2">{v?.name}</TD>
                  <TD num>{kg(l.quantityReceivedKg ?? l.quantityDeclaredKg)}</TD>
                  <TD><StatusBadge status={l.status} /></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
