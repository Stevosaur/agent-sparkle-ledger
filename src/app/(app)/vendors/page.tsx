import Link from "next/link";
import { Search, Ship, Sprout } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { vendorDirectory } from "@/lib/services/queries-ops";
import { PageHeader, Empty } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CountryTag, VENDOR_TYPES, countryName, tierTone, vendorTypeLabel } from "./_shared";

export const metadata = { title: "Vendor Directory" };

type SP = { type?: string; country?: string; q?: string };

function href(cur: SP, patch: Partial<SP>) {
  const p = new URLSearchParams();
  const next = { ...cur, ...patch };
  for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/vendors?${s}` : "/vendors";
}

export default async function VendorsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const app = await requireApp("vendors.view");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const all = await vendorDirectory(app.org.id);

  const matchesQ = (x: (typeof all)[number]) =>
    !q ||
    [x.vendor.name, x.vendor.code, x.vendor.region, x.vendor.notes, ...x.vessels.map((v) => v.name), ...x.farms.map((f) => f.name), ...x.capabilities.map((c) => c.name)]
      .filter(Boolean)
      .some((s) => s!.toLowerCase().includes(q));
  const rows = all.filter((x) => (!sp.type || x.vendor.type === sp.type) && (!sp.country || x.vendor.country === sp.country) && matchesQ(x));
  const countries = [...new Set(all.map((x) => x.vendor.country))].sort();
  const typeCount = (t: string) => all.filter((x) => x.vendor.type === t && (!sp.country || x.vendor.country === sp.country)).length;
  const countryCount = (c: string) => all.filter((x) => x.vendor.country === c && (!sp.type || x.vendor.type === sp.type)).length;

  const chip = (active: boolean) => cn("rounded-md border px-2.5 py-1 text-xs", active ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2 hover:bg-panel-2");

  return (
    <div>
      <PageHeader
        eyebrow="Vendors"
        title="Vendor Directory"
        subtitle="Vessels, farms, foreign fisheries, importers and service providers we buy from. Open a vendor for its scorecard, species performance, documents and message history."
        actions={
          <>
            <Link href="/vendors/performance" className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm text-text-2 hover:bg-panel-2">Performance</Link>
            <Link href="/vendors/documents" className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm text-text-2 hover:bg-panel-2">Documentation</Link>
          </>
        }
      />

      <form action="/vendors" className="mb-3 flex max-w-xl gap-2" role="search">
        {sp.type && <input type="hidden" name="type" value={sp.type} />}
        {sp.country && <input type="hidden" name="country" value={sp.country} />}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search name, code, vessel, farm, species…" className="pl-8" aria-label="Search vendors" data-testid="vendor-search" />
        </div>
        <Button type="submit" variant="secondary">Search</Button>
        {(sp.q || sp.type || sp.country) && <Link href="/vendors" className="inline-flex h-9 items-center px-2 text-xs text-muted hover:text-text">Clear</Link>}
      </form>

      <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Filter by type">
        <Link href={href(sp, { type: undefined })} className={chip(!sp.type)}>All types <span className="num ml-1 text-muted">{all.filter((x) => !sp.country || x.vendor.country === sp.country).length}</span></Link>
        {Object.entries(VENDOR_TYPES).map(([k, label]) => {
          const n = typeCount(k);
          if (!n && sp.type !== k) return null;
          return <Link key={k} href={href(sp, { type: k })} className={chip(sp.type === k)}>{label} <span className="num ml-1 text-muted">{n}</span></Link>;
        })}
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5" aria-label="Filter by country">
        <Link href={href(sp, { country: undefined })} className={chip(!sp.country)}>All countries</Link>
        {countries.map((c) => (
          <Link key={c} href={href(sp, { country: c })} className={cn(chip(sp.country === c), "inline-flex items-center gap-1.5")}>
            <CountryTag code={c} className="h-4 px-1" /> {countryName(c)} <span className="num text-muted">{countryCount(c)}</span>
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty title="No vendors match">Try a different search or clear the filters.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-panel">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm" data-testid="vendor-table">
              <thead className="bg-panel-2">
                <tr className="text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5 text-left font-semibold">Vendor</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Type</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Origin</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Vessels / farms</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Species capability</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Tier</th>
                  <th className="px-3 py-2.5 text-left font-semibold">GST</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Terms</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ vendor: v, capabilities, vessels, farms }) => (
                  <tr key={v.id} className={cn("group border-t border-border align-top hover:bg-panel-2", !v.active && "opacity-60")}>
                    <td className="px-4 py-2.5">
                      <Link href={`/vendors/${v.id}`} className="block" data-testid={`vendor-row-${v.code}`}>
                        <div className="font-medium text-text group-hover:text-accent">{v.name}</div>
                        <div className="num text-[11px] text-muted">{v.code}{!v.active && " · inactive"}{v.preferredChannel && ` · ${v.preferredChannel.toLowerCase()}`}</div>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-text-2">{vendorTypeLabel(v.type)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5"><CountryTag code={v.country} /><span className="text-xs text-text-2">{v.region ?? countryName(v.country)}</span></div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-text-2">
                      {vessels.length + farms.length === 0 && <span className="text-muted">—</span>}
                      {vessels.map((x) => <div key={x.id} className="flex items-center gap-1"><Ship className="size-3 text-info" />{x.name}{x.registrationNo && <span className="num text-muted">· {x.registrationNo}</span>}</div>)}
                      {farms.map((x) => <div key={x.id} className="flex items-center gap-1"><Sprout className="size-3 text-ok" />{x.name}</div>)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex max-w-[360px] flex-wrap gap-1">
                        {capabilities.length === 0 && <span className="text-xs text-muted">—</span>}
                        {capabilities.map((c) => (
                          <span key={c.speciesId} className="rounded border border-border bg-panel-2 px-1.5 py-0.5 text-[11px] text-text-2" title={c.typicalKg ? `~${Number(c.typicalKg)} kg/night` : undefined}>{c.name}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5"><Badge tone={tierTone(v.relationshipTier)}>{v.relationshipTier}</Badge></td>
                    <td className="px-3 py-2.5 text-xs">{v.gstRegistered ? <span className="text-ok">Registered</span> : <span className="text-muted">Not registered</span>}{v.gstRegNo && <div className="num text-[10px] text-muted">{v.gstRegNo}</div>}</td>
                    <td className="num px-4 py-2.5 text-right text-xs text-text-2">{v.paymentTermsDays === 0 ? "COD" : `${v.paymentTermsDays}d`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted">{rows.length} of {all.length} vendors. Species capability is what the vendor typically supplies, as recorded by procurement.</p>
    </div>
  );
}
