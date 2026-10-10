import type { NextRequest } from "next/server";
import { resolveProperty } from "@/lib/data/resolve";
import { parsePropertyRef, type PropertyKind } from "@/lib/property-ref";
import { site } from "@/lib/config/site";
import { dbError, errorJson, guardAccount, json, readJsonBody, rejectCrossOrigin } from "@/lib/account/http";
import { estimateHome } from "@/lib/account/estimate";
import { checkTrackedLimit, isWithinLimit, TRACKED_MAX, trackedHomesLimit } from "@/lib/account/limits";
import { parseId, parseIdBody, parseTrackedHomeInput } from "@/lib/account/validation";
import type { TrackedHomeView, TrackedListResponse } from "@/lib/account/types";

export const dynamic = "force-dynamic";

/**
 * Tracked homes on /my-property/ (feature "tracking.basic"; more than site.freeTrackedHomes needs
 * "tracking.unlimited", enforced here).
 *   GET                 -> { items (with estimated value series), limit }
 *   POST   { ref, flatType?, areaSqm?, floor?, purchasePrice?, purchaseMonth? } -> { item }
 *   PATCH  { id, flatType?, areaSqm?, floor?, purchasePrice?, purchaseMonth? }  -> { item }
 *   DELETE { id }       -> { ok }
 */

interface TrackedRow {
  id: number;
  ref: string;
  label: string | null;
  flat_type: string | null;
  area_sqm: number | string | null;
  floor: number | null;
  purchase_price: number | string | null;
  purchase_month: string | null;
  created_at: string;
}

const COLUMNS = "id, ref, label, flat_type, area_sqm, floor, purchase_price, purchase_month, created_at";

/** Postgres numeric arrives as a string from PostgREST. */
function num(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toView(row: TrackedRow): TrackedHomeView {
  const ref = parsePropertyRef(row.ref);
  const resolved = ref ? resolveProperty(ref) : null;
  const base = {
    id: Number(row.id),
    ref: row.ref,
    kind: (ref?.kind ?? "hdb") as PropertyKind,
    label: resolved?.label ?? row.label ?? row.ref,
    href: resolved?.href ?? null,
    flatType: row.flat_type,
    areaSqm: num(row.area_sqm),
    floor: row.floor,
    purchasePrice: num(row.purchase_price),
    purchaseMonth: row.purchase_month,
    createdAt: row.created_at,
  };
  const estimate = ref
    ? estimateHome({ ref, flatType: base.flatType, areaSqm: base.areaSqm, purchasePrice: base.purchasePrice, purchaseMonth: base.purchaseMonth })
    : ({ status: "unavailable", reason: "not-found" } as const);
  return { ...base, estimate };
}

export async function GET() {
  const guard = await guardAccount("tracking.basic");
  if (!guard.ok) return guard.response;
  const { supabase, viewer } = guard;
  const { data, error } = await supabase.from("tracked_homes").select(COLUMNS).eq("user_id", viewer.userId).order("id", { ascending: true }).limit(TRACKED_MAX);
  if (error) return dbError("tracked.list", error);
  const rows = (data ?? []) as TrackedRow[];
  const unlimited = Boolean(viewer.features["tracking.unlimited"]);
  const body: TrackedListResponse = {
    items: rows.map(toView),
    limit: { max: trackedHomesLimit(unlimited, site.freeTrackedHomes), used: rows.length, unlimited, freeLimit: site.freeTrackedHomes },
  };
  return json(body);
}

export async function POST(req: NextRequest) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  const guard = await guardAccount("tracking.basic");
  if (!guard.ok) return guard.response;
  const { supabase, viewer } = guard;

  const parsed = parseTrackedHomeInput(await readJsonBody(req));
  if (!parsed.ok) return errorJson(parsed.error, 400, parsed.field ? { field: parsed.field } : undefined);
  const input = parsed.value;
  const resolved = resolveProperty(input.ref);
  if (!resolved) return errorJson("not_found", 404, { field: "ref" });

  const unlimited = Boolean(viewer.features["tracking.unlimited"]);
  const { count, error: countError } = await supabase.from("tracked_homes").select("id", { count: "exact", head: true }).eq("user_id", viewer.userId);
  if (countError) return dbError("tracked.count", countError);
  const check = checkTrackedLimit(count ?? 0, unlimited, site.freeTrackedHomes);
  if (!check.allowed) {
    return check.reason === "plus_required"
      ? errorJson("plus_required", 402, { feature: "tracking.unlimited", level: "plus", limit: check.limit })
      : errorJson("limit_reached", 409, { limit: check.limit });
  }

  const { data: inserted, error } = await supabase
    .from("tracked_homes")
    .insert({
      user_id: viewer.userId,
      ref: input.refId,
      label: resolved.label,
      flat_type: input.flatType,
      area_sqm: input.areaSqm,
      floor: input.floor,
      purchase_price: input.purchasePrice,
      purchase_month: input.purchaseMonth,
    })
    .select(COLUMNS)
    .single();
  if (error || !inserted) return dbError("tracked.insert", error);
  const row = inserted as TrackedRow;
  const newId = Number(row.id);

  // Re-check after the insert so two concurrent requests cannot both slip under the limit.
  const { data: ids, error: idsError } = await supabase.from("tracked_homes").select("id").eq("user_id", viewer.userId).order("id", { ascending: true }).limit(TRACKED_MAX + 5);
  if (idsError) return dbError("tracked.recheck", idsError);
  const idList = ((ids ?? []) as { id: number | string }[]).map((r) => Number(r.id));
  if (!isWithinLimit(idList, newId, check.limit)) {
    await supabase.from("tracked_homes").delete().eq("user_id", viewer.userId).eq("id", newId);
    return unlimited ? errorJson("limit_reached", 409, { limit: check.limit }) : errorJson("plus_required", 402, { feature: "tracking.unlimited", level: "plus", limit: check.limit });
  }

  return json({ item: toView(row) }, 201);
}

/** PATCH { id, flatType?, areaSqm?, floor?, purchasePrice?, purchaseMonth? } -> { item } (replaces the details). */
export async function PATCH(req: NextRequest) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  const guard = await guardAccount("tracking.basic");
  if (!guard.ok) return guard.response;
  const { supabase, viewer } = guard;

  const body = await readJsonBody(req);
  const id = parseIdBody(body);
  if (!id.ok) return errorJson(id.error, 400);
  const current = await supabase.from("tracked_homes").select("ref").eq("user_id", viewer.userId).eq("id", id.value).maybeSingle();
  if (current.error) return dbError("tracked.lookup", current.error);
  if (!current.data) return errorJson("not_found", 404);
  const parsed = parseTrackedHomeInput({ ...(body as Record<string, unknown>), ref: (current.data as { ref: string }).ref });
  if (!parsed.ok) return errorJson(parsed.error, 400, parsed.field ? { field: parsed.field } : undefined);
  const input = parsed.value;

  const { data, error } = await supabase
    .from("tracked_homes")
    .update({ flat_type: input.flatType, area_sqm: input.areaSqm, floor: input.floor, purchase_price: input.purchasePrice, purchase_month: input.purchaseMonth })
    .eq("user_id", viewer.userId)
    .eq("id", id.value)
    .select(COLUMNS)
    .maybeSingle();
  if (error) return dbError("tracked.update", error);
  if (!data) return errorJson("not_found", 404);
  return json({ item: toView(data as TrackedRow) });
}

export async function DELETE(req: NextRequest) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  const guard = await guardAccount("tracking.basic");
  if (!guard.ok) return guard.response;
  const { supabase, viewer } = guard;
  const body = await readJsonBody(req);
  const id = body !== undefined ? parseIdBody(body) : { ok: true as const, value: parseId(req.nextUrl.searchParams.get("id")) };
  if (!id.ok || !id.value) return errorJson("invalid_id", 400);
  const { error } = await supabase.from("tracked_homes").delete().eq("user_id", viewer.userId).eq("id", id.value);
  if (error) return dbError("tracked.delete", error);
  return json({ ok: true });
}
