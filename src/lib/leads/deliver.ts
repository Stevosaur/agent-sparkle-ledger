import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { site } from "@/lib/config/site";
import type { ValidLead } from "./schema";

/**
 * Lead delivery. A lead is stored in the Supabase `leads` table (service-role client; RLS blocks
 * anonymous inserts) and/or POSTed as JSON to LEADS_WEBHOOK_URL (CRM, Zapier, Slack relay ...).
 * With neither configured the endpoint answers 503 so the form can offer WhatsApp / e-mail instead.
 */

const WEBHOOK_TIMEOUT_MS = 5000;

export function leadsWebhookUrl(): string | null {
  const raw = process.env.LEADS_WEBHOOK_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function leadSinks(): { database: boolean; webhook: boolean } {
  return { database: createSupabaseAdminClient() !== null, webhook: leadsWebhookUrl() !== null };
}

export type DeliveryResult = { status: "disabled" } | { status: "delivered"; stored: boolean; forwarded: boolean } | { status: "failed" };

export async function deliverLead(lead: ValidLead, meta: { userId: string | null }): Promise<DeliveryResult> {
  const admin = createSupabaseAdminClient();
  const webhook = leadsWebhookUrl();
  if (!admin && !webhook) return { status: "disabled" };

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const row = {
    id,
    type: lead.type,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    message: lead.message,
    context: lead.context,
    user_id: meta.userId,
    status: "new",
    created_at: createdAt,
  };

  const tasks: Promise<"stored" | "forwarded" | null>[] = [];
  if (admin) {
    tasks.push(
      Promise.resolve(admin.from("leads").insert(row)).then(
        ({ error }) => {
          if (error) {
            console.error("[leads] insert failed:", error.code, error.message);
            return null;
          }
          return "stored" as const;
        },
        (err: unknown) => {
          console.error("[leads] insert threw:", err instanceof Error ? err.message : err);
          return null;
        },
      ),
    );
  }
  if (webhook) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const secret = process.env.LEADS_WEBHOOK_SECRET?.trim();
    if (secret) headers["X-Leads-Secret"] = secret;
    tasks.push(
      fetch(webhook, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...row, site: site.name, siteUrl: site.url }),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
        cache: "no-store",
      }).then(
        (res) => {
          if (!res.ok) {
            console.error("[leads] webhook responded", res.status);
            return null;
          }
          return "forwarded" as const;
        },
        (err: unknown) => {
          console.error("[leads] webhook failed:", err instanceof Error ? err.message : err);
          return null;
        },
      ),
    );
  }

  const outcomes = await Promise.all(tasks);
  const stored = outcomes.includes("stored");
  const forwarded = outcomes.includes("forwarded");
  return stored || forwarded ? { status: "delivered", stored, forwarded } : { status: "failed" };
}
