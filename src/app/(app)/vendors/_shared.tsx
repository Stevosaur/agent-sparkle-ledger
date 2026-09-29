import { cn } from "@/lib/utils";
import { pct, perKg } from "@/lib/format";
import type { VendorMetrics } from "@/lib/domain/vendor-metrics";
import type { Tone } from "@/components/ui/badge";

export const VENDOR_TYPES = {
  FISHING_VESSEL: "Fishing vessel",
  AQUACULTURE_FARM: "Aquaculture farm",
  FOREIGN_FISHERY: "Foreign fishery",
  IMPORTER: "Importer",
  WHOLESALER: "Wholesaler",
  PROCESSOR: "Processor",
  LOGISTICS_PROVIDER: "Logistics provider",
} as const;
export type VendorTypeKey = keyof typeof VENDOR_TYPES;
export const vendorTypeLabel = (t: string) => VENDOR_TYPES[t as VendorTypeKey] ?? t;

const COUNTRIES: Record<string, string> = { SG: "Singapore", MY: "Malaysia", ID: "Indonesia", TH: "Thailand", VN: "Vietnam", PH: "Philippines", NO: "Norway", AU: "Australia", CN: "China", JP: "Japan", IN: "India" };
export const countryName = (c: string) => COUNTRIES[c] ?? c;

export function CountryTag({ code, className }: { code: string; className?: string }) {
  return (
    <span title={countryName(code)} className={cn("num inline-flex h-5 items-center rounded border border-border-strong bg-panel-2 px-1.5 text-[10px] font-bold tracking-wider text-text-2", className)}>
      {code}
    </span>
  );
}

export const tierTone = (t: string): Tone => (t === "PREFERRED" ? "ok" : t === "PROBATION" ? "late" : "neutral");

/**
 * Metric definitions for scorecards. Each metric keeps its own threshold; there is no combined score.
 * `good`/`warn`: for higher-is-better metrics, value ≥ good → ok, ≥ warn → surplus, else short. Reversed when lowerIsBetter.
 */
export type MetricKey = Exclude<keyof VendorMetrics, "receipts">;
export const METRICS: { key: MetricKey; label: string; short: string; help: string; fmt: (v: number | null) => string; good?: number; warn?: number; lowerIsBetter?: boolean; abs?: boolean }[] = [
  { key: "onTimePct", label: "On-time arrival", short: "On-time", help: "Arrived within 30 min of expected time", fmt: (v) => pct(v, 1), good: 90, warn: 75 },
  { key: "fillRatePct", label: "Fill rate", short: "Fill", help: "Received kg ÷ ordered kg on PO lines", fmt: (v) => pct(v, 1), good: 95, warn: 85 },
  { key: "acceptedPct", label: "Accepted", short: "Accepted", help: "Accepted kg ÷ received kg", fmt: (v) => pct(v, 1), good: 97, warn: 92 },
  { key: "rejectionPct", label: "Rejection rate", short: "Reject", help: "Rejected kg ÷ received kg", fmt: (v) => pct(v, 1), good: 3, warn: 8, lowerIsBetter: true },
  { key: "avgWeightVariancePct", label: "Weight variance vs quoted", short: "Wt var", help: "Average (received − declared) ÷ declared", fmt: (v) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`), good: 2, warn: 5, lowerIsBetter: true, abs: true },
  { key: "avgQuotedPrice", label: "Avg quoted price", short: "Quoted", help: "Average asking price per kg", fmt: (v) => perKg(v) },
  { key: "avgFinalPrice", label: "Avg final price", short: "Final", help: "Average agreed PO price per kg", fmt: (v) => perKg(v) },
  { key: "gradeAPct", label: "Grade A share", short: "Grade A", help: "Receipts graded A at inspection", fmt: (v) => pct(v, 1), good: 70, warn: 45 },
  { key: "qualityConsistencyPct", label: "Quality consistency", short: "Consist.", help: "100% when every receipt is the same grade; falls as grades scatter", fmt: (v) => pct(v, 1), good: 80, warn: 60 },
  { key: "tempExceptionRatePct", label: "Temperature exceptions", short: "Temp ex", help: "Receipts above the receiving temperature limit", fmt: (v) => pct(v, 1), good: 2, warn: 8, lowerIsBetter: true },
  { key: "avgResponseMinutes", label: "Response time", short: "Response", help: "Average minutes to answer an RFQ", fmt: (v) => (v === null ? "—" : `${v} min`), good: 20, warn: 45, lowerIsBetter: true },
  { key: "documentCompletenessPct", label: "Document completeness", short: "Docs", help: "Valid or expiring documents ÷ documents on file", fmt: (v) => pct(v, 0), good: 100, warn: 80 },
];

export function metricTone(m: (typeof METRICS)[number], v: number | null): Tone | undefined {
  if (v === null || m.good === undefined || m.warn === undefined) return undefined;
  const x = m.abs ? Math.abs(v) : v;
  if (m.lowerIsBetter) return x <= m.good ? "ok" : x <= m.warn ? "surplus" : "short";
  return x >= m.good ? "ok" : x >= m.warn ? "surplus" : "short";
}

export const toneText: Record<string, string> = { ok: "text-ok", surplus: "text-surplus", short: "text-short", late: "text-late", info: "text-info" };

/** Whole days from `from` (YYYY-MM-DD) to `to` (YYYY-MM-DD). Negative = in the past. */
export function daysBetween(from: string, to: string | null) {
  if (!to) return null;
  return Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) - Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) / 86400000);
}

export function relDays(d: number | null) {
  if (d === null) return "no expiry";
  if (d === 0) return "expires tonight";
  if (d < 0) return `expired ${-d}d ago`;
  return `in ${d}d`;
}

/** Status of a licence from its validity window relative to tonight (licences carry no stored status). */
export function licenceStatus(validTo: string | null, tonight: string): "VALID" | "EXPIRING" | "EXPIRED" | "PENDING_REVIEW" {
  const d = daysBetween(tonight, validTo);
  if (d === null) return "PENDING_REVIEW";
  if (d < 0) return "EXPIRED";
  if (d <= 30) return "EXPIRING";
  return "VALID";
}

export function DocTypeLabel({ t }: { t: string }) {
  const map: Record<string, string> = { HEALTH_CERT: "Health certificate", IMPORT_PERMIT: "Import permit", CCP: "Cargo Clearance Permit", CATCH_CERT: "Catch certificate", EXPORT_REGISTRATION: "Export registration", INSURANCE: "Insurance", GST_CERT: "GST certificate", OTHER: "Other" };
  return <>{map[t] ?? t}</>;
}

export function ManualNote({ className }: { className?: string }) {
  return (
    <p className={cn("rounded-md border border-surplus/30 bg-surplus-soft px-3 py-2 text-[11px] text-surplus", className)}>
      <span className="font-bold">MANUAL — not verified with SFA/TradeNet.</span> References are entered by staff from supplier paperwork. PasarCatch has no direct integration with SFA, TradeNet or Singapore Customs.
    </p>
  );
}
