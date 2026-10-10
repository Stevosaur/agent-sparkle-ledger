import { HDB_FLAT_TYPES } from "@/lib/data/types";
import type { PropertyRef } from "@/lib/property-ref";
import { ALERTABLE_KINDS, TRACKABLE_KINDS, alertKindFor, normaliseRef, type AlertChannel, type AlertKind } from "./refs";

/** Request-body validation for the account APIs. Pure, so it is unit-tested and shared by client forms. */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string; field?: string };

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Earliest purchase month accepted for a tracked home. */
export const MIN_PURCHASE_MONTH = "1960-01";

export const AREA_SQM_RANGE = { min: 10, max: 10_000 } as const;
export const FLOOR_RANGE = { min: 1, max: 150 } as const;
export const PRICE_RANGE = { min: 1_000, max: 1_000_000_000 } as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Numbers may arrive as numbers or numeric strings ("1,250,000" is accepted). Empty -> null. */
export function parseOptionalNumber(v: unknown): number | null | undefined {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const cleaned = v.replace(/[,\s]/g, "").replace(/^S\$/i, "");
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return undefined;
    return Number(cleaned);
  }
  return undefined;
}

/** Positive safe integer id from a number or numeric string. */
export function parseId(v: unknown): number | null {
  const n = typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : v;
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** "YYYY-MM" within [min, max] (both inclusive, compared as strings). */
export function isValidMonth(v: string, min: string, max: string): boolean {
  return MONTH_RE.test(v) && v >= min && v <= max;
}

/** Current month in Singapore time as "YYYY-MM". */
export function currentMonthSg(now: Date = new Date()): string {
  const sg = new Date(now.getTime() + 8 * 3600_000);
  return `${sg.getUTCFullYear()}-${String(sg.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Trim and cap a free-text label; empty -> null. */
export function cleanLabel(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

/* ------------------------------------------------------------------ */
/* Watchlist                                                           */
/* ------------------------------------------------------------------ */

export function parseRefBody(body: unknown): Parsed<{ ref: PropertyRef; id: string }> {
  if (!isRecord(body)) return { ok: false, error: "invalid_body" };
  const n = normaliseRef(body.ref);
  return n ? { ok: true, value: n } : { ok: false, error: "invalid_ref", field: "ref" };
}

/* ------------------------------------------------------------------ */
/* Tracked homes                                                       */
/* ------------------------------------------------------------------ */

export interface TrackedHomeInput {
  ref: PropertyRef;
  refId: string;
  flatType: string | null;
  areaSqm: number | null;
  floor: number | null;
  purchasePrice: number | null;
  purchaseMonth: string | null;
}

/**
 * Validate a tracked-home body. HDB homes need a flat type (the estimate is the block's median for that
 * type); condos need a floor area (estimate = project median psf x area). Landed homes may omit the area
 * (the land area of the address's latest recorded sale is used).
 */
export function parseTrackedHomeInput(body: unknown, nowMonth: string = currentMonthSg()): Parsed<TrackedHomeInput> {
  if (!isRecord(body)) return { ok: false, error: "invalid_body" };
  const n = normaliseRef(body.ref);
  if (!n) return { ok: false, error: "invalid_ref", field: "ref" };
  if (!TRACKABLE_KINDS.includes(n.ref.kind)) return { ok: false, error: "unsupported_property", field: "ref" };

  let flatType: string | null = null;
  if (n.ref.kind === "hdb") {
    if (typeof body.flatType !== "string" || !(HDB_FLAT_TYPES as readonly string[]).includes(body.flatType)) {
      return { ok: false, error: "flat_type_required", field: "flatType" };
    }
    flatType = body.flatType;
  }

  const area = parseOptionalNumber(body.areaSqm);
  if (area === undefined || (area !== null && (area < AREA_SQM_RANGE.min || area > AREA_SQM_RANGE.max))) {
    return { ok: false, error: "invalid_area", field: "areaSqm" };
  }
  if (area === null && n.ref.kind === "condo") return { ok: false, error: "area_required", field: "areaSqm" };

  const floor = parseOptionalNumber(body.floor);
  if (floor === undefined || (floor !== null && (!Number.isInteger(floor) || floor < FLOOR_RANGE.min || floor > FLOOR_RANGE.max))) {
    return { ok: false, error: "invalid_floor", field: "floor" };
  }

  const price = parseOptionalNumber(body.purchasePrice);
  if (price === undefined || (price !== null && (price < PRICE_RANGE.min || price > PRICE_RANGE.max))) {
    return { ok: false, error: "invalid_price", field: "purchasePrice" };
  }

  let purchaseMonth: string | null = null;
  if (body.purchaseMonth !== undefined && body.purchaseMonth !== null && body.purchaseMonth !== "") {
    if (typeof body.purchaseMonth !== "string" || !isValidMonth(body.purchaseMonth, MIN_PURCHASE_MONTH, nowMonth)) {
      return { ok: false, error: "invalid_month", field: "purchaseMonth" };
    }
    purchaseMonth = body.purchaseMonth;
  }

  return {
    ok: true,
    value: {
      ref: n.ref,
      refId: n.id,
      flatType,
      areaSqm: area === null ? null : Math.round(area * 10) / 10,
      floor,
      purchasePrice: price === null ? null : Math.round(price),
      purchaseMonth,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Alerts                                                              */
/* ------------------------------------------------------------------ */

/** Channels that can deliver today. Email is in the schema but has no sender configured yet. */
export const AVAILABLE_ALERT_CHANNELS: readonly AlertChannel[] = ["telegram"];

function parseChannel(v: unknown): Parsed<AlertChannel> {
  if (v === undefined || v === null || v === "") return { ok: true, value: "telegram" };
  if (v === "telegram" || v === "email") {
    return AVAILABLE_ALERT_CHANNELS.includes(v) ? { ok: true, value: v } : { ok: false, error: "channel_unavailable", field: "channel" };
  }
  return { ok: false, error: "invalid_channel", field: "channel" };
}

export function parseAlertCreate(body: unknown): Parsed<{ ref: PropertyRef; refId: string; kind: AlertKind; channel: AlertChannel }> {
  if (!isRecord(body)) return { ok: false, error: "invalid_body" };
  const n = normaliseRef(body.ref);
  if (!n) return { ok: false, error: "invalid_ref", field: "ref" };
  if (!ALERTABLE_KINDS.includes(n.ref.kind)) return { ok: false, error: "unsupported_property", field: "ref" };
  const kind = alertKindFor(n.ref);
  if (body.kind !== undefined && body.kind !== kind) return { ok: false, error: "invalid_kind", field: "kind" };
  const channel = parseChannel(body.channel);
  if (!channel.ok) return channel;
  return { ok: true, value: { ref: n.ref, refId: n.id, kind, channel: channel.value } };
}

export function parseAlertUpdate(body: unknown): Parsed<{ id: number; active?: boolean; channel?: AlertChannel }> {
  if (!isRecord(body)) return { ok: false, error: "invalid_body" };
  const id = parseId(body.id);
  if (!id) return { ok: false, error: "invalid_id", field: "id" };
  const out: { id: number; active?: boolean; channel?: AlertChannel } = { id };
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return { ok: false, error: "invalid_active", field: "active" };
    out.active = body.active;
  }
  if (body.channel !== undefined) {
    const channel = parseChannel(body.channel);
    if (!channel.ok) return channel;
    out.channel = channel.value;
  }
  if (out.active === undefined && out.channel === undefined) return { ok: false, error: "nothing_to_update" };
  return { ok: true, value: out };
}

export function parseIdBody(body: unknown): Parsed<number> {
  if (!isRecord(body)) return { ok: false, error: "invalid_body" };
  const id = parseId(body.id);
  return id ? { ok: true, value: id } : { ok: false, error: "invalid_id", field: "id" };
}
