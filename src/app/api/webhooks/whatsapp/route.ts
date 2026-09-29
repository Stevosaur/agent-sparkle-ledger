/**
 * WhatsApp Business Cloud API webhook (INPUT LAYER).
 * - GET: Meta verification handshake (hub.mode / hub.verify_token / hub.challenge).
 * - POST: validates X-Hub-Signature-256 (HMAC-SHA256 of the raw body with the app secret), deduplicates by
 *   message id (idempotency via webhook_event unique key), routes to the organisation that owns the phone
 *   number id, and hands text/voice-transcript to the Catch Intake Agent.
 * Disabled (404) unless WHATSAPP_APP_SECRET and WHATSAPP_VERIFY_TOKEN are configured.
 */
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { organization, vendor, webhookEvent } from "@/lib/db/schema";
import { verifyMetaSignature } from "@/lib/integrations/messaging";
import { ingestSupplierMessage } from "@/lib/agents/catch-intake";
import { processPending } from "@/lib/events/bus";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";

export async function GET(req: Request) {
  const verify = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verify) return NextResponse.json({ error: "Not configured" }, { status: 404 });
  const u = new URL(req.url);
  if (u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === verify) {
    return new NextResponse(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

type WaPayload = {
  entry?: { changes?: { value?: { metadata?: { phone_number_id?: string }; messages?: { id: string; from: string; type: string; text?: { body: string }; timestamp?: string }[] } }[] }[];
};

export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 404 });
  const rl = rateLimit(`wa:${clientIp(req.headers)}`, 600, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  const raw = await req.text();
  if (raw.length > 512 * 1024) return NextResponse.json({ error: "Too large" }, { status: 413 });
  const valid = verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), secret);
  if (!valid) {
    log.warn("whatsapp webhook signature rejected");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let payload: WaPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  let processed = 0;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (!v?.messages) continue;
      // Route to the organisation whose settings/connection owns this phone number id (single-tenant default: the first non-demo org).
      const [org] = await db.select().from(organization).where(sql`${organization.features}->>'whatsappPhoneNumberId' = ${v.metadata?.phone_number_id ?? phoneNumberId ?? ""}`).limit(1);
      for (const m of v.messages) {
        // Idempotency: the unique (provider, external_id) key makes duplicate deliveries a no-op.
        const ins = await db
          .insert(webhookEvent)
          .values({ orgId: org?.id ?? null, provider: "whatsapp", externalId: m.id, signatureValid: true, payload: { type: m.type, from: "[redacted]" }, status: "RECEIVED" })
          .onConflictDoNothing()
          .returning({ id: webhookEvent.id });
        if (!ins.length) continue;
        if (!org || m.type !== "text" || !m.text?.body) {
          await db.update(webhookEvent).set({ status: org ? "PROCESSED" : "REJECTED", processedAt: new Date() }).where(eq(webhookEvent.id, ins[0].id));
          continue;
        }
        const [vend] = await db.select({ id: vendor.id }).from(vendor).where(sql`${vendor.orgId} = ${org.id} AND regexp_replace(coalesce(${vendor.whatsappNumber}, ''), '[^0-9]', '', 'g') = ${m.from.replace(/\D/g, "")}`).limit(1);
        try {
          await ingestSupplierMessage(org.id, { channel: "WHATSAPP", from: `+${m.from.replace(/\D/g, "")}`, body: m.text.body, vendorId: vend?.id ?? null, externalId: m.id }, "WEBHOOK");
          await db.update(webhookEvent).set({ status: "PROCESSED", processedAt: new Date() }).where(eq(webhookEvent.id, ins[0].id));
          processed++;
        } catch (e) {
          await db.update(webhookEvent).set({ status: "FAILED" }).where(eq(webhookEvent.id, ins[0].id));
          log.error("whatsapp ingest failed", { err: e instanceof Error ? e.message : String(e) });
        }
      }
    }
  }
  if (processed) await processPending(40);
  // Always 200 quickly for valid signatures so Meta doesn't retry already-recorded events.
  return NextResponse.json({ ok: true, processed });
}
