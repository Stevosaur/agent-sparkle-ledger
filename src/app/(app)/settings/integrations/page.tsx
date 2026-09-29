import { redirect } from "next/navigation";
import { Landmark, ShieldCheck, Webhook } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { integrationStatuses } from "@/lib/integrations/registry";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";

export const metadata = { title: "Integrations" };

const STATUS: Record<string, { label: string; tone: Tone }> = {
  CONNECTED: { label: "Connected", tone: "ok" },
  NOT_CONNECTED: { label: "Not connected", tone: "neutral" },
  MOCK: { label: "Mock mode", tone: "ai" },
};

/** Environment variables that enable each integration — names only, values are never read into the page. */
const ENV: Record<string, { vars: string[]; how: string }> = {
  AIProvider: { vars: ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL (optional)"], how: "Set an Anthropic API key to run agents on Claude; without it deterministic engines run in mock mode." },
  "MessagingProvider · WhatsApp": { vars: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"], how: "WhatsApp Cloud API credentials from Meta Business. Until set, the in-app simulator is used." },
  "MessagingProvider · SMS": { vars: [], how: "No SMS gateway integrated yet — messages are simulated." },
  "MessagingProvider · Email": { vars: [], how: "No email provider integrated yet — messages are simulated." },
  RoutingProvider: { vars: ["ONEMAP_EMAIL", "ONEMAP_PASSWORD"], how: "OneMap (SLA) account for road routing; otherwise straight-line estimates." },
  WeatherProvider: { vars: ["WEATHER_ENABLED", "DATAGOV_API_KEY (optional)"], how: "data.gov.sg real-time 2-hour forecast." },
  InvoiceNowProvider: { vars: [], how: "Requires a contract with an IMDA-accredited Peppol Access Point provider. Documents are prepared locally and marked “Mock — not transmitted”." },
  GovernmentPermitProvider: { vars: [], how: "No public API exists. Permit and licence references are entered manually." },
  AccountingProvider: { vars: [], how: "CSV journal export. Xero / QuickBooks connectors are future integrations." },
  PaymentProvider: { vars: [], how: "Payments are recorded manually. No funds are moved by PasarCatch." },
  StorageProvider: { vars: ["STORAGE_DIR"], how: "Local file storage for photos and documents; S3-compatible storage is a future integration." },
};

export default async function IntegrationsPage() {
  const app = await requireApp();
  if (!app.can("settings.manage") && !app.can("ai.view")) redirect("/forbidden?need=settings.manage");
  const list = integrationStatuses();
  // Presence check only — values are never read into the page.
  const webhookOn = Boolean(process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN);
  const counts = { CONNECTED: 0, MOCK: 0, NOT_CONNECTED: 0 } as Record<string, number>;
  for (const i of list) counts[i.status] = (counts[i.status] ?? 0) + 1;

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Integrations"
        subtitle="Every external dependency sits behind an interface, so a mock can be swapped for a live provider without changing agents or screens."
        actions={<div className="flex gap-1.5">{(["CONNECTED", "MOCK", "NOT_CONNECTED"] as const).map((k) => <Badge key={k} tone={STATUS[k].tone}>{counts[k] ?? 0} {STATUS[k].label}</Badge>)}</div>}
      />
      <div className="mb-4 flex gap-3 rounded-xl border border-border bg-panel-2 px-4 py-3 text-xs leading-relaxed text-text-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" />
        <span>Status is reported honestly: an integration shows <b className="text-ok">Connected</b> only when live credentials are configured on the server. Simulated providers always show <b className="text-ai">Mock mode</b> and are never shown as connected. Credentials are server environment variables — only their names appear here, never their values.</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2" data-testid="integrations">
        {list.map((i) => {
          const st = STATUS[i.status] ?? { label: i.status, tone: "neutral" as Tone };
          const env = ENV[i.interfaceName];
          return (
            <Card key={i.interfaceName} className="flex flex-col">
              <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <div className="num text-[11px] text-muted">{i.interfaceName}</div>
                  <div className="text-sm font-semibold text-text">{i.provider}</div>
                </div>
                <Badge tone={st.tone} data-testid={`integration-status-${i.kind}`}>{st.label}</Badge>
              </div>
              <CardBody className="flex-1 space-y-2 text-xs">
                <p className="text-text-2">{i.description}</p>
                {i.note && <p className="text-muted">{i.note}</p>}
                {env && (
                  <div className="rounded-md bg-panel-2 px-3 py-2">
                    <div className="text-muted">{env.how}</div>
                    {env.vars.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {env.vars.map((v) => <code key={v} className="num rounded border border-border bg-panel px-1.5 py-0.5 text-[10px] text-text-2">{v}</code>)}
                      </div>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Webhook className="size-4 text-accent" /> WhatsApp webhook</span>} subtitle="Configure this callback in your Meta app once WhatsApp credentials are set." action={<Badge tone={webhookOn ? "ok" : "neutral"}>{webhookOn ? "Enabled" : "Disabled"}</Badge>} />
          <CardBody className="space-y-2 text-xs">
            <div className="flex items-center gap-2"><span className="w-24 text-muted">Callback path</span><code className="num rounded border border-border bg-panel-2 px-2 py-1 text-text">/api/webhooks/whatsapp</code></div>
            <div className="flex items-center gap-2"><span className="w-24 text-muted">Verify token</span><code className="num rounded border border-border bg-panel-2 px-2 py-1 text-text-2">WHATSAPP_VERIFY_TOKEN</code></div>
            <div className="flex items-center gap-2"><span className="w-24 text-muted">Signature</span><span className="text-text-2">X-Hub-Signature-256, checked with <code className="num">WHATSAPP_APP_SECRET</code></span></div>
            <p className="text-muted">The endpoint returns 404 until both WHATSAPP_APP_SECRET and WHATSAPP_VERIFY_TOKEN are configured. Prefix the path with your public app URL. Inbound supplier messages are matched to vendors by phone number and parsed by the Catch Intake Agent into draft lots.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Landmark className="size-4 text-surplus" /> Government systems</span>} subtitle="MANUAL / FUTURE INTEGRATION" />
          <CardBody className="space-y-2 text-xs">
            {[
              ["SFA licensing & food safety", "Licence numbers and certificates are recorded and uploaded manually on vendor profiles."],
              ["TradeNet / CCP import permits", "Permits are obtained via a declaring agent or approved front-end software; PasarCatch stores the reference numbers you enter."],
              ["Singapore Customs", "No direct integration. References are format-checked only — never verified with a government system."],
              ["IRAS / InvoiceNow", "Via a Peppol Access Point provider once contracted (see InvoiceNowProvider above)."],
            ].map(([t, d]) => (
              <div key={t} className="flex gap-3 rounded-md border border-border px-3 py-2">
                <Badge tone="surplus" className="h-fit">Manual</Badge>
                <div><div className="font-medium text-text">{t}</div><div className="text-muted">{d}</div></div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
