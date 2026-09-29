import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { search, type SearchHit } from "@/lib/services/search";
import { PageHeader, Empty } from "@/components/ui/misc";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Search" };

const ORDER = ["Late supply", "Late delivery", "Species", "Lot", "Vendor", "Customer", "PO", "SO", "Supplier invoice", "Invoice", "Document"];
const LABEL: Record<string, string> = { PO: "Purchase orders", SO: "Sales orders", Lot: "Lots", Species: "Species", Vendor: "Vendors", Customer: "Customers", "Supplier invoice": "Supplier invoices", Invoice: "Customer invoices", Document: "Vendor documents", "Late supply": "Late supply", "Late delivery": "Late deliveries" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const app = await requireApp();
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const hits = q.length >= 2 ? await search(app.org.id, q, 100) : [];
  const groups = new Map<string, SearchHit[]>();
  for (const h of hits) groups.set(h.type, [...(groups.get(h.type) ?? []), h]);
  const ordered = [...groups.entries()].sort((a, b) => (ORDER.indexOf(a[0]) + 100) % 100 - (ORDER.indexOf(b[0]) + 100) % 100);

  return (
    <div>
      <PageHeader eyebrow="Search" title={q ? <>Results for “{q}”</> : "Search"} subtitle="Species (including Chinese, Malay and local names), vendors, vessels, customers, lots, orders, POs, invoices and documents. Try a lot number like 0048, a local name like batang, or “late”." />
      <form method="get" action="/search" className="mb-5 flex max-w-2xl gap-2" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={q} autoFocus maxLength={80} placeholder="Search PasarCatch…" aria-label="Search" className="h-10 w-full rounded-md border border-border bg-panel-2 pl-9 pr-3 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none" data-testid="search-input" />
        </div>
        <Button type="submit" variant="primary" size="lg" className="h-10">Search</Button>
      </form>

      {!q && <Empty title="Type at least two characters to search" />}
      {q && q.length < 2 && <Empty title="Type at least two characters to search" />}
      {q.length >= 2 && hits.length === 0 && <Empty title={`Nothing found for “${q}”`}>Check the spelling, try a local name, or search a document number without its prefix.</Empty>}

      {hits.length > 0 && (
        <>
          <p className="mb-3 text-xs text-muted">{hits.length} result{hits.length === 1 ? "" : "s"} in {groups.size} group{groups.size === 1 ? "" : "s"}</p>
          <div className="grid items-start gap-4 lg:grid-cols-2" data-testid="search-results">
            {ordered.map(([type, list]) => (
              <Card key={type} className="overflow-hidden">
                <CardHeader title={LABEL[type] ?? type} action={<span className="num text-xs text-muted">{list.length}</span>} />
                <ul className="divide-y divide-border">
                  {list.map((h) => (
                    <li key={h.type + h.id + h.title}>
                      <Link href={h.href} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-panel-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-text group-hover:text-accent">{h.title}</div>
                          {h.subtitle && <div className="truncate text-xs text-muted">{h.subtitle}</div>}
                        </div>
                        <ArrowUpRight className="size-3.5 shrink-0 text-muted group-hover:text-accent" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
