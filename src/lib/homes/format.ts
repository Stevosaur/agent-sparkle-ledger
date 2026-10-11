import { formatSgd } from "@/lib/format";
import type { ListingKind, ListingType } from "./types";

/** Client-safe display helpers for listings. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "2026-09-03T20:00:00Z" -> "4 Sep 2026" in Singapore time (UTC+8). Formatted by hand rather than with
 * Intl so server HTML and client renders always agree.
 */
export function formatListedDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const d = new Date(t + 8 * 3600_000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** S$650,000 for sales, S$3,200/mo for rentals. */
export function formatAsking(price: number | null | undefined, type: ListingType): string {
  if (price == null) return "—";
  return type === "rent" ? `${formatSgd(price)}/mo` : formatSgd(price);
}

export const KIND_LABEL: Record<ListingKind, [key: string, fallback: string]> = {
  hdb: ["homes.kind.hdb", "HDB flat"],
  condo: ["homes.kind.condo", "Condo / EC"],
  landed: ["homes.kind.landed", "Landed"],
};

export const TYPE_LABEL: Record<ListingType, [key: string, fallback: string]> = {
  sale: ["homes.type.sale", "For sale"],
  rent: ["homes.type.rent", "For rent"],
};
