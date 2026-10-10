import type { NextRequest } from "next/server";
import { resolveProperty } from "@/lib/data/resolve";
import { parsePropertyRef, propertyHref } from "@/lib/property-ref";
import { dbError, errorJson, guardAccount, json, readJsonBody, rejectCrossOrigin } from "@/lib/account/http";
import { normaliseRef } from "@/lib/account/refs";
import { cleanLabel, parseRefBody } from "@/lib/account/validation";
import { WATCHLIST_MAX } from "@/lib/account/limits";
import type { WatchlistItem, WatchlistResponse } from "@/lib/account/types";

export const dynamic = "force-dynamic";

/**
 * Watchlist (feature "watchlist", free account).
 *   GET  ?ref=<ref>  -> { watching }
 *   GET              -> { items, max }
 *   POST   { ref, label? } -> { watching: true }
 *   DELETE { ref }         -> { watching: false }
 * Refs are property refs ("hdb:blk-872a-tampines-st-86"), validated with parsePropertyRef.
 */

interface WatchRow {
  ref: string;
  label: string | null;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const guard = await guardAccount("watchlist");
  if (!guard.ok) return guard.response;
  const { supabase, viewer } = guard;

  const refParam = req.nextUrl.searchParams.get("ref");
  if (refParam !== null) {
    const n = normaliseRef(refParam);
    if (!n) return errorJson("invalid_ref", 400);
    const { data, error } = await supabase.from("watchlist").select("id").eq("user_id", viewer.userId).eq("ref", n.id).maybeSingle();
    if (error) return dbError("watchlist.get", error);
    return json({ watching: Boolean(data) });
  }

  const { data, error } = await supabase
    .from("watchlist")
    .select("ref, label, created_at")
    .eq("user_id", viewer.userId)
    .order("created_at", { ascending: false })
    .limit(WATCHLIST_MAX);
  if (error) return dbError("watchlist.list", error);

  const items: WatchlistItem[] = ((data ?? []) as WatchRow[]).map((row) => {
    const parsed = parsePropertyRef(row.ref);
    const resolved = parsed ? resolveProperty(parsed) : null;
    return {
      ref: row.ref,
      label: resolved?.label ?? row.label ?? row.ref,
      href: resolved ? resolved.href : null,
      createdAt: row.created_at,
    };
  });
  const body: WatchlistResponse = { items, max: WATCHLIST_MAX };
  return json(body);
}

export async function POST(req: NextRequest) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  const guard = await guardAccount("watchlist");
  if (!guard.ok) return guard.response;
  const { supabase, viewer } = guard;

  const body = await readJsonBody(req);
  const parsed = parseRefBody(body);
  if (!parsed.ok) return errorJson(parsed.error, 400);
  const resolved = resolveProperty(parsed.value.ref);
  if (!resolved) return errorJson("not_found", 404);
  const refId = parsed.value.id;

  const existing = await supabase.from("watchlist").select("id").eq("user_id", viewer.userId).eq("ref", refId).maybeSingle();
  if (existing.error) return dbError("watchlist.exists", existing.error);
  if (existing.data) return json({ watching: true });

  const { count, error: countError } = await supabase.from("watchlist").select("id", { count: "exact", head: true }).eq("user_id", viewer.userId);
  if (countError) return dbError("watchlist.count", countError);
  if ((count ?? 0) >= WATCHLIST_MAX) return errorJson("limit_reached", 409, { max: WATCHLIST_MAX });

  const label = resolved.label || cleanLabel((body as { label?: unknown }).label) || refId;
  const { error } = await supabase
    .from("watchlist")
    .upsert({ user_id: viewer.userId, ref: refId, label }, { onConflict: "user_id,ref", ignoreDuplicates: true });
  if (error) return dbError("watchlist.insert", error);
  return json({ watching: true, ref: refId, href: propertyHref(resolved.ref) }, 201);
}

export async function DELETE(req: NextRequest) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  const guard = await guardAccount("watchlist");
  if (!guard.ok) return guard.response;
  const { supabase, viewer } = guard;

  const body = await readJsonBody(req);
  const parsed = parseRefBody(body ?? { ref: req.nextUrl.searchParams.get("ref") });
  if (!parsed.ok) return errorJson(parsed.error, 400);
  const { error } = await supabase.from("watchlist").delete().eq("user_id", viewer.userId).eq("ref", parsed.value.id);
  if (error) return dbError("watchlist.delete", error);
  return json({ watching: false });
}
