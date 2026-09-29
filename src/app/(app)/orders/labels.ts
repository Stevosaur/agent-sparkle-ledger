import type { Tone } from "@/components/ui/badge";

/** Shared labels for sales-order screens (orders, buyer requirements). */
export const SOURCE_LABEL: Record<string, string> = {
  STANDING_ORDER: "Standing order",
  WHATSAPP: "WhatsApp",
  PHONE: "Phone",
  PORTAL: "Portal",
  MANUAL: "Manual",
};

export const SOURCE_TONE: Record<string, Tone> = {
  STANDING_ORDER: "neutral",
  WHATSAPP: "ok",
  PHONE: "info",
  PORTAL: "ai",
  MANUAL: "neutral",
};

/** Allocation status of a single order line, derived from requested vs allocated kg. */
export function lineFillStatus(requested: unknown, allocated: unknown): { label: string; tone: Tone } {
  const r = Number(requested);
  const a = Number(allocated);
  if (a <= 0) return { label: "Open", tone: "neutral" };
  if (a + 0.05 >= r) return { label: "Allocated", tone: "ok" };
  return { label: "Partial", tone: "surplus" };
}

export const PIPELINE = ["CONFIRMED", "ALLOCATED", "PICKING", "PACKED", "DISPATCHED", "DELIVERED", "INVOICED"] as const;
/** Map an order status onto its pipeline stage (part-allocated orders still sit in "confirmed"). */
export const stageOf = (status: string) => (status === "PARTIALLY_ALLOCATED" || status === "DRAFT" ? "CONFIRMED" : status);
