import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { vendorCompliance } from "@/lib/services/queries-ops";
import { PageHeader, Stat } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { date, dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CountryTag, DocTypeLabel, daysBetween, licenceStatus, relDays } from "../_shared";

export const metadata = { title: "Vendor Documentation" };

const STATUSES = ["VALID", "EXPIRING", "EXPIRED", "MISSING", "PENDING_REVIEW"] as const;
type Status = (typeof STATUSES)[number];

export default async function VendorDocumentsPage({ searchParams }: { searchParams: Promise<{ status?: string; kind?: string }> }) {
  const app = await requireApp("vendors.view");
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as Status) ? (sp.status as Status) : undefined;
  const kind = sp.kind === "licence" || sp.kind === "document" ? sp.kind : undefined;
  const tonight = app.marketDate;
  const { docs, licences } = await vendorCompliance(app.org.id);

  const all = [
    ...licences.map(({ l, v }) => ({
      id: l.id, kind: "licence" as const, v, title: l.licenceType, type: null as string | null, ref: l.licenceNo, issuer: l.issuer, from: l.validFrom, to: l.validTo,
      status: licenceStatus(l.validTo, tonight) as Status, mode: l.verificationMode, verified: l.verifiedBy ? `${l.verifiedBy}${l.verifiedAt ? ` · ${dateTime(l.verifiedAt)}` : ""}` : null,
    })),
    ...docs.map(({ d, v }) => ({
      id: d.id, kind: "document" as const, v, title: d.title, type: d.docType as string | null, ref: d.referenceNo, issuer: null as string | null, from: d.issuedAt, to: d.expiresAt,
      status: d.status as Status, mode: d.integrationMode, verified: null as string | null,
    })),
  ];
  // Most urgent first: expired/missing, then by expiry date.
  const rank: Record<Status, number> = { EXPIRED: 0, MISSING: 1, EXPIRING: 2, PENDING_REVIEW: 3, VALID: 4 };
  const rows = all
    .filter((r) => (!status || r.status === status) && (!kind || r.kind === kind))
    .sort((a, b) => rank[a.status] - rank[b.status] || (a.to ?? "9999").localeCompare(b.to ?? "9999") || a.v.name.localeCompare(b.v.name));
  const n = (s: Status) => all.filter((r) => r.status === s && (!kind || r.kind === kind)).length;
  const q = (patch: { status?: string; kind?: string }) => {
    const p = new URLSearchParams();
    const next = { status, kind, ...patch };
    if (next.status) p.set("status", next.status);
    if (next.kind) p.set("kind", next.kind);
    const s = p.toString();
    return s ? `/vendors/documents?${s}` : "/vendors/documents";
  };
  const chip = (active: boolean) => cn("rounded-md border px-2.5 py-1 text-xs", active ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2 hover:bg-panel-2");

  return (
    <div>
      <PageHeader eyebrow="Vendors" title="Compliance Documentation" subtitle={`Supplier licences, health certificates, import permits and catch certificates. Expiry is measured against tonight's market (${date(tonight)}).`} />

      <div className="mb-4 flex gap-3 rounded-xl border border-surplus/30 bg-surplus-soft px-4 py-3" role="note" data-testid="manual-banner">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-surplus" />
        <div className="text-sm">
          <div className="font-semibold text-surplus">Manual records — not verified with any government system</div>
          <p className="mt-0.5 text-xs text-text-2">PasarCatch has no direct integration with SFA, TradeNet or Singapore Customs; references are entered manually from supplier paperwork. Items marked FUTURE INTEGRATION are placeholders for a connection that does not exist yet. Always check originals before relying on them.</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Expired" value={n("EXPIRED")} tone={n("EXPIRED") ? "short" : "ok"} href={q({ status: "EXPIRED" })} />
        <Stat label="Missing" value={n("MISSING")} tone={n("MISSING") ? "short" : "ok"} href={q({ status: "MISSING" })} />
        <Stat label="Expiring ≤30d" value={n("EXPIRING")} tone={n("EXPIRING") ? "surplus" : "ok"} href={q({ status: "EXPIRING" })} />
        <Stat label="Pending review" value={n("PENDING_REVIEW")} tone={n("PENDING_REVIEW") ? "info" : undefined} href={q({ status: "PENDING_REVIEW" })} />
        <Stat label="Valid" value={n("VALID")} tone="ok" href={q({ status: "VALID" })} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Link href={q({ status: undefined })} className={chip(!status)}>All <span className="num ml-1 text-muted">{all.filter((r) => !kind || r.kind === kind).length}</span></Link>
        {STATUSES.map((s) => <Link key={s} href={q({ status: s })} className={chip(status === s)}>{s.replaceAll("_", " ").toLowerCase()} <span className="num ml-1 text-muted">{n(s)}</span></Link>)}
        <span className="mx-1 h-4 w-px bg-border" />
        <Link href={q({ kind: undefined })} className={chip(!kind)}>Licences + documents</Link>
        <Link href={q({ kind: "licence" })} className={chip(kind === "licence")}>Licences</Link>
        <Link href={q({ kind: "document" })} className={chip(kind === "document")}>Documents</Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-panel">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm" data-testid="documents-table">
            <thead className="bg-panel-2">
              <tr className="text-[11px] uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 text-left font-semibold">Vendor</th>
                <th className="px-3 py-2.5 text-left font-semibold">Item</th>
                <th className="px-3 py-2.5 text-left font-semibold">Reference</th>
                <th className="px-3 py-2.5 text-left font-semibold">Valid from</th>
                <th className="px-3 py-2.5 text-left font-semibold">Expires</th>
                <th className="px-3 py-2.5 text-left font-semibold">Status</th>
                <th className="px-4 py-2.5 text-left font-semibold">Mode</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = daysBetween(tonight, r.to);
                return (
                  <tr key={`${r.kind}-${r.id}`} className="border-t border-border hover:bg-panel-2">
                    <td className="px-4 py-2.5">
                      <Link href={`/vendors/${r.v.id}`} className="flex items-center gap-2 hover:text-accent">
                        <CountryTag code={r.v.country} />
                        <span className="font-medium text-text">{r.v.name}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-text">{r.title}</div>
                      <div className="text-[11px] text-muted">{r.kind === "licence" ? `Licence · ${r.issuer}` : <DocTypeLabel t={r.type ?? "OTHER"} />}</div>
                    </td>
                    <td className="num px-3 py-2.5 text-xs text-text-2">{r.ref ?? <span className="text-muted">—</span>}{r.verified && <div className="text-[10px] text-muted">checked by {r.verified}</div>}</td>
                    <td className="num whitespace-nowrap px-3 py-2.5 text-xs text-text-2">{r.from ? date(r.from) : "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="num whitespace-nowrap text-xs text-text">{r.to ? date(r.to) : "—"}</div>
                      <div className={cn("num text-[10px]", d === null ? "text-muted" : d < 0 ? "text-short" : d <= 30 ? "text-surplus" : "text-muted")}>{relDays(d)}</div>
                    </td>
                    <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-2.5"><Badge tone={r.mode === "MANUAL" ? "neutral" : "info"}>{r.mode.replaceAll("_", " ")}</Badge></td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">Nothing matches this filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted">Document status is as recorded by staff. Licence status is derived from its validity dates (expiring = within 30 days of tonight).</p>
    </div>
  );
}
