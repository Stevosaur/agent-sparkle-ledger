import { getAI } from "./ai";
import { getEmail, getSms, getWhatsApp } from "./messaging";
import { getRouting } from "./routing";
import { getWeather } from "./weather";
import { getInvoiceNow } from "./invoicenow";
import { getAccounting, getPayments, getPermits } from "./other";
import { getStorage } from "./storage";
import type { ProviderInfo } from "./types";

/** Honest status of every integration, for Settings → Integrations. Never reports a mock as connected. */
export function integrationStatuses(): (ProviderInfo & { interfaceName: string })[] {
  const ai = getAI();
  return [
    { interfaceName: "AIProvider", ...pick(ai), note: ai.live ? `Model: ${ai.model}` : "Deterministic engines active (MOCK MODE)." },
    { interfaceName: "MessagingProvider · WhatsApp", ...pick(getWhatsApp()) },
    { interfaceName: "MessagingProvider · SMS", ...pick(getSms()) },
    { interfaceName: "MessagingProvider · Email", ...pick(getEmail()) },
    { interfaceName: "RoutingProvider", ...pick(getRouting()) },
    { interfaceName: "WeatherProvider", ...pick(getWeather()) },
    { interfaceName: "InvoiceNowProvider", ...pick(getInvoiceNow()) },
    { interfaceName: "GovernmentPermitProvider", ...pick(getPermits()) },
    { interfaceName: "AccountingProvider", ...pick(getAccounting()) },
    { interfaceName: "PaymentProvider", ...pick(getPayments()) },
    { interfaceName: "StorageProvider", ...pick(getStorage()) },
  ];
}

function pick(p: ProviderInfo): ProviderInfo {
  return { kind: p.kind, provider: p.provider, status: p.status, description: p.description, note: p.note };
}
