import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ArrowRight } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { membership, user } from "@/lib/db/schema";
import { ROLES } from "@/lib/auth/rbac";
import { sgtParts } from "@/lib/domain/time";
import { PageHeader, Dl } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { date, time } from "@/lib/format";
import { DemoClock, SettingsForm, type SettingsValues } from "./settings-form";

export const metadata = { title: "Organisation settings" };

export default async function SettingsPage() {
  const app = await requireApp("settings.manage");
  const s = app.org.settings;
  const members = await db
    .select({ m: membership, u: { name: user.name, email: user.email } })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(eq(membership.orgId, app.org.id))
    .orderBy(asc(membership.roleKey), asc(user.name));

  const initial: SettingsValues = {
    dispatchCutoff: s.dispatchCutoff,
    defaultAllocationPolicy: s.defaultAllocationPolicy,
    gstRegistered: app.org.gstRegistered,
    gstRatePct: Number(app.org.gstRatePct),
    receivingTempMaxC: s.receivingTempMaxC,
    weightVarianceAlertPct: s.weightVarianceAlertPct,
    surplusDiscountFloorPct: s.surplusDiscountFloorPct,
    tolQtyPct: s.invoiceTolerance.qtyPct,
    tolPricePct: s.invoiceTolerance.pricePct,
    tolAmountAbs: s.invoiceTolerance.amountAbs,
    weights: { ...s.procurementWeights },
  };
  const p = sgtParts(app.now);
  const nowMinutes = ((p.hour < 12 ? p.hour + 24 : p.hour) - 12) * 60 + p.minute;
  const features = Object.entries(app.org.features ?? {});

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Organisation" subtitle={`${app.org.name} · site ${app.org.siteCode}${app.org.uen ? ` · UEN ${app.org.uen}` : ""}. Changes apply to every agent and screen immediately and are recorded in the audit trail.`} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <SettingsForm initial={initial} />

        <div className="space-y-4">
          {app.org.isDemo && (
            <Card className="border-surplus/40">
              <CardHeader title={<span className="flex items-center gap-2">Demo clock <Badge tone="surplus">DEMO</Badge></span>} subtitle={`Market night ${date(app.marketDate)}`} />
              <CardBody>
                <DemoClock nowLabel={time(app.now)} nowMinutes={nowMinutes} />
                <p className="mt-3 text-[11px] leading-relaxed text-muted">
                  Jump ahead to see the night unfold — e.g. 04:15 for the surplus agent, 05:30 for dispatch. The demo clock only moves forward and only exists in DEMO workspaces; real workspaces always run on Singapore wall-clock time.
                </p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Plans & billing (future)" subtitle="Read-only. Billing is not yet enabled." />
            <CardBody className="space-y-3">
              <Dl className="text-xs" items={[["Plan", <Badge key="p" tone="info">{app.org.plan}</Badge>], ["Currency", app.org.baseCurrency], ["Time zone", app.org.timezone], ["GST reg. no.", app.org.gstRegNo ?? "—"]]} />
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Feature flags</div>
                {features.length === 0 ? <p className="text-xs text-muted">Default features for the {app.org.plan.toLowerCase()} plan.</p> : (
                  <div className="flex flex-wrap gap-1.5">
                    {features.map(([k, on]) => <Badge key={k} tone={on ? "ok" : "neutral"} mono>{on ? "✓" : "–"} {k}</Badge>)}
                  </div>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="More settings" />
            <CardBody className="space-y-1">
              {[["/settings/species", "Species Master"], ["/settings/integrations", "Integrations"], ["/settings/automation", "Automation rules"]].map(([h, l]) => (
                <Link key={h} href={h} className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-text-2 hover:bg-panel-2 hover:text-text">{l} <ArrowRight className="size-3.5" /></Link>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="mt-4 overflow-hidden">
        <CardHeader title="Members" subtitle={`${members.length} people with access to ${app.org.name}. Roles follow least privilege; changing roles is managed by PasarCatch support for now.`} />
        <Table className="min-w-[640px]">
          <THead><tr><TH>Name</TH><TH>Email</TH><TH>Role</TH><TH>Title</TH><TH>Scope</TH></tr></THead>
          <tbody>
            {members.map(({ m, u }) => (
              <TR key={m.id}>
                <TD className="text-text">{u.name}{m.userId === app.user.id && <span className="ml-1.5 text-[11px] text-muted">(you)</span>}</TD>
                <TD className="text-text-2">{u.email}</TD>
                <TD><Badge tone={m.roleKey === "OWNER" || m.roleKey === "ADMIN" ? "accent" : "neutral"} title={ROLES[m.roleKey]?.description}>{ROLES[m.roleKey]?.name ?? m.roleKey}</Badge></TD>
                <TD className="text-text-2">{m.title ?? "—"}</TD>
                <TD className="text-xs text-muted">{m.vendorId ? "Own vendor only" : m.customerId ? "Own customer only" : "Organisation"}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
