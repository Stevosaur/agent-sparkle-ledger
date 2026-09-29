/**
 * Integration interfaces. Every external dependency sits behind one of these so a mock can be swapped
 * for the real provider without touching agents or UI. Status is always reported honestly:
 * CONNECTED (live credentials), MOCK (simulated, clearly labelled), NOT_CONNECTED.
 */
export type IntegrationStatus = "CONNECTED" | "NOT_CONNECTED" | "MOCK";

export interface ProviderInfo {
  kind: string;
  provider: string;
  status: IntegrationStatus;
  description: string;
  /** VERIFIED FACT / PRODUCT ASSUMPTION / FUTURE INTEGRATION note shown in settings. */
  note?: string;
}

export interface MessagingProvider extends ProviderInfo {
  send(msg: { to: string; body: string; template?: string }): Promise<{ status: "SENT" | "MOCK_SENT" | "FAILED"; externalId?: string; error?: string }>;
}

export interface RoutingProvider extends ProviderInfo {
  /** Road distance/time between two points. Implementations must never throw — fall back to an estimate. */
  leg(a: { lat: number; lng: number }, b: { lat: number; lng: number }): Promise<{ km: number; minutes: number; estimated: boolean }>;
}

export interface WeatherProvider extends ProviderInfo {
  twoHourOutlook(): Promise<{ area: string; forecast: string }[] | null>;
}

export interface InvoiceNowProvider extends ProviderInfo {
  transmit(doc: InvoiceNowDocument): Promise<{ status: "MOCK_TRANSMITTED" | "QUEUED" | "FAILED"; messageId: string; payload: unknown }>;
}

export type InvoiceNowDocument = {
  type: "INVOICE" | "CREDIT_NOTE";
  number: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  supplier: { name: string; uen: string | null; gstRegNo: string | null; peppolId: string | null };
  buyer: { name: string; uen?: string | null; peppolId: string | null };
  lines: { description: string; quantity: string; unitCode: "KGM"; unitPrice: string; lineTotal: string; taxCategory: string; taxPct: string }[];
  subtotal: string;
  taxTotal: string;
  total: string;
  precedingInvoiceRef?: string | null;
};

export interface GovernmentPermitProvider extends ProviderInfo {
  /** Format-level validation only. No government system is queried. */
  checkReference(kind: "CCP" | "TRADENET" | "SFA_LICENCE" | "HEALTH_CERT" | "CATCH_CERT", ref: string): { mode: "MANUAL"; formatOk: boolean; message: string };
}

export interface AccountingProvider extends ProviderInfo {
  exportJournal(entries: { date: string; account: string; debit: string; credit: string; memo: string }[]): Promise<{ status: "MOCK_EXPORTED"; csv: string }>;
}

export interface PaymentProvider extends ProviderInfo {
  recordPayout(p: { amount: string; currency: string; reference: string; method: string }): Promise<{ status: "MOCK_RECORDED"; reference: string }>;
}

export interface StorageProvider extends ProviderInfo {
  put(file: { bytes: Uint8Array; mimeType: string; originalName?: string }, folder: string): Promise<{ key: string; size: number }>;
  get(key: string): Promise<{ bytes: Uint8Array; mimeType: string } | null>;
}
