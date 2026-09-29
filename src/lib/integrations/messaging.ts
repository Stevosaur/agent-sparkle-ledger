/**
 * Messaging adapters. WhatsApp is the INPUT layer: inbound messages arrive via the Cloud API webhook
 * (or the in-app simulator) and are parsed by the Catch Intake Agent. Outbound messages go through
 * this adapter and are subject to approval (EXTERNAL_COMMUNICATION risk class).
 *
 * VERIFIED FACT (Meta docs, via docs/research-notes.md): webhook verification uses hub.mode/hub.verify_token/hub.challenge;
 * payloads are signed with X-Hub-Signature-256 = HMAC-SHA256(app secret, raw body); messages are sent with
 * POST https://graph.facebook.com/<version>/<PHONE_NUMBER_ID>/messages.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { MessagingProvider } from "./types";

export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const got = header.slice(7);
  if (got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got, "hex"), Buffer.from(expected, "hex"));
}

class WhatsAppCloudProvider implements MessagingProvider {
  kind = "MESSAGING";
  provider = "WhatsApp Cloud API";
  status = "CONNECTED" as const;
  description = "Meta WhatsApp Business Cloud API (webhook in /api/webhooks/whatsapp).";
  constructor(private token: string, private phoneNumberId: string, private version = process.env.WHATSAPP_GRAPH_VERSION ?? "v23.0") {}
  async send({ to, body }: { to: string; body: string }) {
    try {
      const res = await fetch(`https://graph.facebook.com/${this.version}/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/[^\d]/g, ""), type: "text", text: { body } }),
      });
      if (!res.ok) return { status: "FAILED" as const, error: `HTTP ${res.status}` };
      const j = (await res.json()) as { messages?: { id: string }[] };
      return { status: "SENT" as const, externalId: j.messages?.[0]?.id };
    } catch {
      return { status: "FAILED" as const, error: "network" };
    }
  }
}

class WhatsAppSimulatorProvider implements MessagingProvider {
  kind = "MESSAGING";
  provider = "WhatsApp simulator";
  status = "MOCK" as const;
  description = "No Meta credentials configured. Outbound messages are recorded in-app (MOCK_SENT) and never leave the system.";
  note = "Replace by setting WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN.";
  async send() {
    return { status: "MOCK_SENT" as const, externalId: `sim_${crypto.randomUUID()}` };
  }
}

class MockChannel implements MessagingProvider {
  constructor(public kind: string, public provider: string) {}
  status = "MOCK" as const;
  description = "Adapter stub — messages are recorded in-app only.";
  async send() {
    return { status: "MOCK_SENT" as const, externalId: `mock_${crypto.randomUUID()}` };
  }
}

export function getWhatsApp(): MessagingProvider {
  const t = process.env.WHATSAPP_ACCESS_TOKEN;
  const p = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return t && p ? new WhatsAppCloudProvider(t, p) : new WhatsAppSimulatorProvider();
}
export const getSms = (): MessagingProvider => new MockChannel("SMS", "SMS gateway (not configured)");
export const getEmail = (): MessagingProvider => new MockChannel("EMAIL", "Email (not configured)");
