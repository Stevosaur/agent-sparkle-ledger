import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MessageCircle, Phone, Ship, Sprout, Star } from "lucide-react";
import { z } from "zod";
import { requireApp } from "@/lib/auth/session";
import { vendorProfile } from "@/lib/services/vendors";
import { vendorDetail } from "@/lib/services/queries-ops";
import { timelineFor } from "@/lib/services/queries";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Dl, Empty, PageHeader } from "@/components/ui/misc";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { date, dateTime, kg, kgNum, perKg, sgd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CountryTag, DocTypeLabel, METRICS, ManualNote, countryName, daysBetween, licenceStatus, metricTone, relDays, tierTone, toneText, vendorTypeLabel } from "../_shared";

export const metadata = { title: "Vendor Profile" };

export default async function VendorProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const app = await requireApp("vendors.view");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const [p, d, timeline] = await Promise.all([vendorProfile(app.org.id, id, app.marketDate), vendorDetail(app.org.id, id), timelineFor(app.org.id, [id], 40)]);
  if (!p) notFound();
  const v = p.vendor;
  // vendorProfile() does not include RFQ response time; fill it from quote records for this vendor.
  const metrics = { ...p.metrics, avgResponseMinutes: p.metrics.avgResponseMinutes ?? d.avgResponseMinutes };
  const tonight = app.marketDate;

  return (
    <div>
      <Link href="/vendors" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-text"><ArrowLeft className="size-3.5" /> Vendor directory</Link>
      <PageHeader
        eyebrow={<span className="flex items-center gap-2">{vendorTypeLabel(v.type)} · <span className="num">{v.code}</span></span>}
        title={<span className="flex flex-wrap items-center gap-2">{v.name} <CountryTag code={v.country} /> <Badge tone={tierTone(v.relationshipTier)}>{v.relationshipTier}</Badge>{!v.active && <Badge tone="short">Inactive</Badge>}</span>}
        subtitle={[v.region, countryName(v.country), v.address].filter(Boolean).join(" · ")}
        actions={app.can("procurement.view") ? <Link href={`/procurement/purchase-orders?vendor=${v.id}`} className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm text-text-2 hover:bg-panel-2">Purchase orders</Link> : undefined}
      />

      <Card className="mb-4">
        <CardHeader
          title="Scorecard"
          subtitle={`${p.metrics.receipts} receipt(s) over the last 90 nights. Each metric stands alone — there is deliberately no overall score.`}
          action={<Link href="/vendors/performance" className="text-xs text-accent">Compare vendors →</Link>}
        />
        <CardBody>
          {p.metrics.receipts === 0 && <p className="mb-3 text-xs text-muted">No receiving records in the last 90 nights — delivery metrics will appear after the first goods receipt.</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" data-testid="vendor-kpis">
            {METRICS.map((m) => {
              const val = metrics[m.key];
              const tone = metricTone(m, val);
              return (
                <div key={m.key} className="rounded-lg border border-border bg-panel-2/50 p-3" title={m.help}>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{m.label}</div>
                  <div className={cn("num mt-1 text-lg font-semibold", tone ? toneText[tone] : "text-text")}>{m.fmt(val)}</div>
                  <div className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-muted">{m.help}</div>
                </div>
              );
            })}
            <div className="rounded-lg border border-border bg-panel-2/50 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Payment terms</div>
              <div className="num mt-1 text-lg font-semibold text-text">{v.paymentTermsDays === 0 ? "COD" : `${v.paymentTermsDays} days`}</div>
              <div className="mt-0.5 text-[10px] text-muted">{v.gstRegistered ? `GST registered${v.gstRegNo ? ` · ${v.gstRegNo}` : ""}` : "Not GST registered"}</div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardHeader title="Performance by species" subtitle="A supplier can be excellent for one species and poor for another. Computed per species from the same receiving records." />
        {p.bySpecies.length === 0 ? (
          <CardBody><Empty title="No species-level history yet" /></CardBody>
        ) : (
          <Table className="min-w-[980px]" data-testid="vendor-species-table">
            <THead>
              <tr>
                <TH>Species</TH>
                <TH align="right">Receipts</TH>
                {METRICS.filter((m) => !["avgResponseMinutes", "documentCompletenessPct"].includes(m.key)).map((m) => <TH key={m.key} align="right" title={m.help}>{m.short}</TH>)}
              </tr>
            </THead>
            <tbody>
              {[...p.bySpecies].sort((a, b) => b.metrics.receipts - a.metrics.receipts).map(({ species: s, metrics: sm }) => (
                <TR key={s!.id}>
                  <TD><Link href={`/market/${s!.id}`} className="font-medium text-text hover:text-accent">{s!.canonicalName}</Link><div className="text-[10px] text-muted">{s!.code}</div></TD>
                  <TD num className="text-text-2">{sm.receipts}</TD>
                  {METRICS.filter((m) => !["avgResponseMinutes", "documentCompletenessPct"].includes(m.key)).map((m) => {
                    const t = metricTone(m, sm[m.key]);
                    return <TD key={m.key} num className={t ? toneText[t] : "text-text-2"}>{m.fmt(sm[m.key])}</TD>;
                  })}
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Contacts" subtitle={`Preferred channel: ${v.preferredChannel.toLowerCase()}`} />
          <CardBody className="space-y-3">
            {d.contacts.length === 0 && <p className="text-xs text-muted">No contacts on file.</p>}
            {d.contacts.map((c) => (
              <div key={c.id} className="rounded-md border border-border px-3 py-2">
                <div className="flex items-center gap-1.5 text-sm font-medium text-text">{c.name}{c.isPrimary && <Star className="size-3 fill-surplus text-surplus" aria-label="Primary contact" />}</div>
                {c.role && <div className="text-[11px] text-muted">{c.role}{c.preferredLanguage && ` · ${c.preferredLanguage.toUpperCase()}`}</div>}
                <div className="mt-1 space-y-0.5 text-xs text-text-2">
                  {c.whatsapp && <div className="num flex items-center gap-1.5"><MessageCircle className="size-3 text-ok" />{c.whatsapp}</div>}
                  {c.phone && c.phone !== c.whatsapp && <div className="num flex items-center gap-1.5"><Phone className="size-3 text-muted" />{c.phone}</div>}
                  {c.email && <div className="flex items-center gap-1.5 break-all"><Mail className="size-3 text-muted" />{c.email}</div>}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Vessels & farms" />
          <CardBody className="space-y-3">
            {d.vessels.length + d.farms.length === 0 && <p className="text-xs text-muted">No vessels or farms registered for this vendor.</p>}
            {d.vessels.map((x) => (
              <div key={x.id} className="rounded-md border border-border px-3 py-2">
                <div className="flex items-center gap-1.5 text-sm font-medium text-text"><Ship className="size-3.5 text-info" />{x.name} <CountryTag code={x.flagCountry} className="h-4" /></div>
                <Dl className="mt-1.5 text-xs" items={[["Registration", <span key="r" className="num">{x.registrationNo ?? "—"}</span>], ["Licence", <span key="l" className="num">{x.licenceNo ?? "—"}</span>], ["Home port", x.homePort], ["Gear", x.gearType], ["Capacity", x.capacityKg ? kg(x.capacityKg, 0) : "—"]]} />
              </div>
            ))}
            {d.farms.map((x) => (
              <div key={x.id} className="rounded-md border border-border px-3 py-2">
                <div className="flex items-center gap-1.5 text-sm font-medium text-text"><Sprout className="size-3.5 text-ok" />{x.name} <CountryTag code={x.country} className="h-4" /></div>
                <Dl className="mt-1.5 text-xs" items={[["Type", x.farmType.replaceAll("_", " ").toLowerCase()], ["Location", x.location], ["Licence", <span key="l" className="num">{x.licenceNo ?? "—"}</span>]]} />
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Species capability" subtitle="What this vendor typically supplies" />
          <CardBody className="space-y-1.5">
            {d.capabilities.length === 0 && <p className="text-xs text-muted">No capabilities recorded.</p>}
            {d.capabilities.map((c) => (
              <div key={c.speciesId} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-panel-2">
                <span className="text-sm text-text">{c.name}</span>
                <span className="num text-[11px] text-muted">
                  {c.typicalKg ? `~${kgNum(c.typicalKg, 0)} kg/night` : ""}
                  {c.sizeMinKg && c.sizeMaxKg ? ` · ${Number(c.sizeMinKg)}–${Number(c.sizeMaxKg)} kg` : ""}
                </span>
              </div>
            ))}
            {v.notes && <p className="mt-2 border-t border-border pt-2 text-xs text-muted">{v.notes}</p>}
          </CardBody>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader title="Licences & documents" subtitle="Expiry relative to tonight" action={<Link href="/vendors/documents" className="text-xs text-accent">All vendors →</Link>} />
        <CardBody className="space-y-3">
          <ManualNote />
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Licences</h4>
              {p.licences.length === 0 && <p className="text-xs text-muted">No licences on file.</p>}
              <div className="space-y-1.5">
                {p.licences.map((l) => {
                  const st = licenceStatus(l.validTo, tonight);
                  return (
                    <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-text">{l.licenceType}</div>
                        <div className="num text-[11px] text-muted">{l.licenceNo} · {l.issuer}</div>
                      </div>
                      <div className="text-right">
                        <StatusBadge status={st} />
                        <div className="num mt-0.5 text-[10px] text-muted">{l.validTo ? `${date(l.validTo)} · ${relDays(daysBetween(tonight, l.validTo))}` : "no expiry"}</div>
                      </div>
                      <Badge tone="neutral" className="text-[10px]">{l.verificationMode.replaceAll("_", " ")}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Documents</h4>
              {p.docs.length === 0 && <p className="text-xs text-muted">No documents on file.</p>}
              <div className="space-y-1.5">
                {p.docs.map((doc) => (
                  <div key={doc.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-text">{doc.title}</div>
                      <div className="num text-[11px] text-muted"><DocTypeLabel t={doc.docType} />{doc.referenceNo && ` · ${doc.referenceNo}`}</div>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={doc.status} />
                      <div className="num mt-0.5 text-[10px] text-muted">{doc.expiresAt ? `${date(doc.expiresAt)} · ${relDays(daysBetween(tonight, doc.expiresAt))}` : "no expiry"}</div>
                    </div>
                    <Badge tone="neutral" className="text-[10px]">{doc.integrationMode.replaceAll("_", " ")}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="mb-4 grid gap-4 2xl:grid-cols-2">
        <Card>
          <CardHeader title="Recent lots" subtitle="Latest 15 parent lots from this vendor" />
          {d.lots.length === 0 ? (
            <CardBody><Empty title="No lots yet" /></CardBody>
          ) : (
            <Table>
              <THead><tr><TH>Lot</TH><TH>Night</TH><TH>Species</TH><TH align="right">Declared</TH><TH align="right">Received</TH><TH align="right">Cost</TH><TH>Status</TH></tr></THead>
              <tbody>
                {d.lots.map((l) => (
                  <TR key={l.id}>
                    <TD><Link href={`/supply/lots/${l.id}`} className="num whitespace-nowrap text-xs font-medium text-accent hover:underline">{l.lotNumber}</Link></TD>
                    <TD className="whitespace-nowrap text-xs text-text-2">{date(l.marketDate)}</TD>
                    <TD className="text-xs text-text">{l.canonicalSpeciesName ?? l.supplierSpeciesName ?? "—"}{l.qualityGrade && <span className="ml-1 text-muted">· {l.qualityGrade}</span>}</TD>
                    <TD num className="text-xs text-text-2">{kgNum(l.quantityDeclaredKg)}</TD>
                    <TD num className="text-xs text-text">{kgNum(l.quantityReceivedKg)}</TD>
                    <TD num className="text-xs text-text-2">{perKg(l.agreedCostPerKg ?? l.askingPricePerKg, l.currency)}</TD>
                    <TD><StatusBadge status={l.status} /></TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Recent purchase orders" />
          {d.pos.length === 0 ? (
            <CardBody><Empty title="No purchase orders yet" /></CardBody>
          ) : (
            <Table>
              <THead><tr><TH>PO</TH><TH>Night</TH><TH>Source</TH><TH align="right">Lines</TH><TH align="right">kg</TH><TH align="right">Total</TH><TH>Status</TH></tr></THead>
              <tbody>
                {d.pos.map(({ po, lines, kg: k }) => (
                  <TR key={po.id}>
                    <TD><Link href={`/procurement/purchase-orders/${po.id}`} className="num whitespace-nowrap text-xs font-medium text-accent hover:underline">{po.poNumber}</Link></TD>
                    <TD className="whitespace-nowrap text-xs text-text-2">{date(po.marketDate)}</TD>
                    <TD className="text-[11px] text-muted">{po.source.replaceAll("_", " ").toLowerCase()}</TD>
                    <TD num className="text-xs text-text-2">{lines}</TD>
                    <TD num className="text-xs text-text-2">{kgNum(k, 0)}</TD>
                    <TD num className="text-xs text-text">{sgd(po.total, po.currency)}</TD>
                    <TD><StatusBadge status={po.status} /></TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title="Messages" subtitle={`Latest ${d.messages.length} message(s) with this vendor${v.whatsappNumber ? ` · ${v.whatsappNumber}` : ""}`} />
          <CardBody className="max-h-[560px] space-y-2 overflow-y-auto bg-bg/40" data-testid="vendor-messages">
            {d.messages.length === 0 && <Empty title="No messages yet" />}
            {d.messages.map((m) => {
              const out = m.direction === "OUTBOUND";
              return (
                <div key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[85%] rounded-xl border px-3 py-2", out ? "rounded-br-sm border-accent/30 bg-accent-soft" : "rounded-bl-sm border-border bg-panel-2")}>
                    <p className="whitespace-pre-wrap break-words text-sm text-text">{m.body}</p>
                    {m.transcription && <p className="mt-1 border-t border-border pt-1 text-xs italic text-muted">Voice note: {m.transcription}</p>}
                    <div className="mt-1 flex flex-wrap items-center justify-end gap-1.5 text-[10px] text-muted">
                      <span>{m.channel === "WHATSAPP_SIMULATOR" ? "WhatsApp (simulator)" : m.channel.replaceAll("_", " ").toLowerCase()}</span>
                      <span className="num">{dateTime(m.at)}</span>
                      {m.status !== "RECEIVED" && m.status !== "SENT" && <StatusBadge status={m.status} className="px-1 py-0 text-[9px]" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Audit timeline" subtitle="Latest 40 changes touching this vendor" />
          <CardBody className="max-h-[560px] overflow-y-auto">
            {timeline.length === 0 && <Empty title="No audit events yet" />}
            <ol className="relative space-y-3 border-l border-border pl-4">
              {timeline.map((e) => (
                <li key={e.id} className="relative">
                  <span className={cn("absolute -left-[21px] top-1.5 size-2 rounded-full", e.actorType === "AGENT" ? "bg-ai" : e.actorType === "USER" ? "bg-info" : "bg-muted")} />
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                    <span className="num">{dateTime(e.at)}</span>
                    <span>·</span>
                    <span className="text-text-2">{e.actorLabel}</span>
                    <Badge tone={e.actorType === "AGENT" ? "ai" : "neutral"} className="px-1 py-0 text-[9px]">{e.action.replaceAll("_", " ")}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-text">{e.summary}</p>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>
      <p className="mt-3 text-[11px] text-muted">Vendor record last updated {dateTime(v.updatedAt)} SGT.</p>
    </div>
  );
}
