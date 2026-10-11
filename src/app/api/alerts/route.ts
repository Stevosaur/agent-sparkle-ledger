import type { NextRequest } from "next/server";
import { resolveProperty } from "@/lib/data/resolve";
import { parsePropertyRef } from "@/lib/property-ref";
import { dbError, errorJson, guardAccount, json, readJsonBody, rejectCrossOrigin } from "@/lib/account/http";
import { getPropertyActivity } from "@/lib/account/activity";
import { ALERTS_MAX } from "@/lib/account/limits";
import { isTelegramConfigured } from "@/lib/account/telegram";
import { parseAlertCreate, parseAlertUpdate, parseId, parseIdBody } from "@/lib/account/validation";
import type { AlertChannel, AlertKind } from "@/lib/account/refs";
import type { AlertView, AlertsListResponse } from "@/lib/account/types";
import { supabaseSecretKey } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

/**
 * New-sale / new-launch alerts (feature "alerts", Plus). Delivered by the daily cron job (/api/cron/alerts/).
 *   GET                              -> { items, max, telegram: { configured, linked } }
 *   POST   { ref, channel? }         -> { item }      (kind is derived from the ref: launches -> "new-launch")
 *   PATCH  { id, active?, channel? } -> { item }
 *   DELETE { id }                    -> { ok }
 */

interface AlertRow {
  id: number | string;
  ref: string;
  kind: AlertKind;
  channel: AlertChannel;
  active: boolean;
  last_checked_month: string | null;
  created_at: string;
}

const COLUMNS = "id, ref, kind, channel, active, last_checked_month, created_at";

function toView(row: AlertRow): AlertView {
  const ref = parsePropertyRef(row.ref);
  const resolved = ref ? resolveProperty(ref) : null;
  return {
    id: Number(row.id),
    ref: row.ref,
    label: resolved?.label ?? row.ref,
    href: resolved?.href ?? null,
    kind: row.kind,
    channel: row.channel,
    active: row.active,
    lastCheckedMonth: row.last_checked_month,
    createdAt: row.created_at,
  };
}

/** Telegram delivery needs the bot and the server key (linking writes the chat id with the service role). */
function telegramDeliveryConfigured(): boolean {
  return isTelegramConfigured() && Boolean(supabaseSecretKey());
}

export async function GET() {
  const guard = await guardAccount("alerts");
  if (!guard.ok) return guard.response;
  const { supabase, viewer } = guard;
  const [alerts, profile] = await Promise.all([
    supabase.from("alerts").select(COLUMNS).eq("user_id", viewer.userId).order("created_at", { ascending: false }).limit(ALERTS_MAX),
    supabase.from("profiles").select("telegram_chat_id").eq("id", viewer.userId).maybeSingle(),
  ]);
  if (alerts.error) return dbError("alerts.list", alerts.error);
  const body: AlertsListResponse = {
    items: ((alerts.data ?? []) as AlertRow[]).map(toView),
    max: ALERTS_MAX,
    telegram: { configured: telegramDeliveryConfigured(), linked: Boolean((profile.data as { telegram_chat_id?: string | null } | null)?.telegram_chat_id) },
  };
  return json(body);
}

export async function POST(req: NextRequest) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  const guard = await guardAccount("alerts");
  if (!guard.ok) return guard.response;
  const { supabase, viewer } = guard;

  const parsed = parseAlertCreate(await readJsonBody(req));
  if (!parsed.ok) return errorJson(parsed.error, 400, parsed.field ? { field: parsed.field } : undefined);
  const { ref, refId, kind, channel } = parsed.value;
  const activity = getPropertyActivity(ref);
  if (!activity) return errorJson("not_found", 404, { field: "ref" });

  const existing = await supabase.from("alerts").select(COLUMNS).eq("user_id", viewer.userId).eq("ref", refId).eq("kind", kind).maybeSingle();
  if (existing.error) return dbError("alerts.exists", existing.error);
  if (existing.data) return errorJson("already_exists", 409, { item: toView(existing.data as AlertRow) });

  const { count, error: countError } = await supabase.from("alerts").select("id", { count: "exact", head: true }).eq("user_id", viewer.userId);
  if (countError) return dbError("alerts.count", countError);
  if ((count ?? 0) >= ALERTS_MAX) return errorJson("limit_reached", 409, { max: ALERTS_MAX });

  // Start from the property's current latest month so only sales recorded after today trigger an alert.
  const { data, error } = await supabase
    .from("alerts")
    .insert({ user_id: viewer.userId, ref: refId, kind, channel, active: true, last_checked_month: activity.month })
    .select(COLUMNS)
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return errorJson("already_exists", 409);
    return dbError("alerts.insert", error);
  }
  return json({ item: toView(data as AlertRow) }, 201);
}

export async function PATCH(req: NextRequest) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  const guard = await guardAccount("alerts");
  if (!guard.ok) return guard.response;
  const { supabase, viewer } = guard;

  const parsed = parseAlertUpdate(await readJsonBody(req));
  if (!parsed.ok) return errorJson(parsed.error, 400, parsed.field ? { field: parsed.field } : undefined);
  const { id, ...changes } = parsed.value;
  const { data, error } = await supabase.from("alerts").update(changes).eq("user_id", viewer.userId).eq("id", id).select(COLUMNS).maybeSingle();
  if (error) return dbError("alerts.update", error);
  if (!data) return errorJson("not_found", 404);
  return json({ item: toView(data as AlertRow) });
}

export async function DELETE(req: NextRequest) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  // Deleting is allowed without Plus so a lapsed subscriber can still clean up their alerts.
  const guard = await guardAccount();
  if (!guard.ok) return guard.response;
  const { supabase, viewer } = guard;
  const body = await readJsonBody(req);
  const id = body !== undefined ? parseIdBody(body) : { ok: true as const, value: parseId(req.nextUrl.searchParams.get("id")) };
  if (!id.ok || !id.value) return errorJson("invalid_id", 400);
  const { error } = await supabase.from("alerts").delete().eq("user_id", viewer.userId).eq("id", id.value);
  if (error) return dbError("alerts.delete", error);
  return json({ ok: true });
}
