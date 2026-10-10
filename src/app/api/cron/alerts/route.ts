import type { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { gatingMode } from "@/lib/auth/config";
import { site } from "@/lib/config/site";
import { absoluteUrl } from "@/lib/seo";
import { parsePropertyRef } from "@/lib/property-ref";
import { errorJson, json } from "@/lib/account/http";
import { getPropertyActivity } from "@/lib/account/activity";
import { batchByChat, planAlertDispatch, type AlertRowLite, type PropertyActivity } from "@/lib/account/alerts-math";
import { safeEqual, sendTelegramMessage, telegramBotToken } from "@/lib/account/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily alert job (vercel.json cron, "Authorization: Bearer <CRON_SECRET>").
 * For every active alert, compares the property's latest recorded month (tx.last, or the latest launch
 * sales report) with alerts.last_checked_month and, when newer, sends a Telegram message (one per chat,
 * covering all of that user's fired alerts) and advances last_checked_month.
 */

const PAGE = 500;
const SEND_CONCURRENCY = 8;
const TIME_BUDGET_MS = 50_000;
const USER_CHUNK = 150;

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return errorJson("cron_disabled", 503);
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) return errorJson("unauthorized", 401);

  const admin = createSupabaseAdminClient();
  if (!admin) return errorJson("accounts_disabled", 503);
  const token = telegramBotToken();
  if (!token) return json({ ok: true, checked: 0, sent: 0, note: "telegram_not_configured" });

  const started = Date.now();
  const enforce = gatingMode() === "enforce";
  const manageUrl = absoluteUrl("/profile/");
  const activityCache = new Map<string, PropertyActivity | null>();
  const totals = { checked: 0, sent: 0, messages: 0, failed: 0, skipped: {} as Record<string, number> };
  let lastId = 0;
  let complete = true;

  for (;;) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      complete = false;
      break;
    }
    const { data, error } = await admin
      .from("alerts")
      .select("id, user_id, ref, kind, channel, last_checked_month")
      .eq("active", true)
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(PAGE);
    if (error) {
      console.error("[cron/alerts] load failed:", error);
      return errorJson("server_error", 500, totals);
    }
    const alerts = ((data ?? []) as (AlertRowLite & { id: number | string })[]).map((a) => ({ ...a, id: Number(a.id) }));
    if (alerts.length === 0) break;
    lastId = alerts[alerts.length - 1].id;
    totals.checked += alerts.length;

    for (const a of alerts) {
      if (activityCache.has(a.ref)) continue;
      const ref = parsePropertyRef(a.ref);
      activityCache.set(a.ref, ref ? getPropertyActivity(ref) : null);
    }

    const userIds = [...new Set(alerts.map((a) => a.user_id))];
    const chatIdByUser = new Map<string, string | null>();
    const entitled = enforce ? new Set<string>() : null;
    for (const ids of chunk(userIds, USER_CHUNK)) {
      const profiles = await admin.from("profiles").select("id, telegram_chat_id").in("id", ids);
      if (profiles.error) {
        console.error("[cron/alerts] profiles failed:", profiles.error);
        return errorJson("server_error", 500, totals);
      }
      for (const p of (profiles.data ?? []) as { id: string; telegram_chat_id: string | null }[]) chatIdByUser.set(p.id, p.telegram_chat_id);
      if (entitled) {
        const subs = await admin.from("subscriptions").select("user_id, status, current_period_end").in("user_id", ids);
        if (subs.error) {
          console.error("[cron/alerts] subscriptions failed:", subs.error);
          return errorJson("server_error", 500, totals);
        }
        // Same rule as getViewer(): active or trialing, and the paid/trial period has not ended.
        for (const s of (subs.data ?? []) as { user_id: string; status: string | null; current_period_end: string | null }[]) {
          const live = (s.status === "active" || s.status === "trialing") && (!s.current_period_end || new Date(s.current_period_end).getTime() > Date.now());
          if (live) entitled.add(s.user_id);
        }
      }
    }

    const plan = planAlertDispatch(alerts, activityCache, chatIdByUser, entitled, site.name, manageUrl);
    for (const s of plan.skipped) totals.skipped[s.reason] = (totals.skipped[s.reason] ?? 0) + 1;

    // One message per chat (Telegram rate-limits each chat), several chats in parallel.
    for (const batch of chunk(batchByChat(plan.sends, manageUrl), SEND_CONCURRENCY)) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        complete = false;
        break;
      }
      await Promise.all(
        batch.map(async (message) => {
          const ids = message.alerts.map((a) => a.alertId).join(",");
          const result = await sendTelegramMessage(token, message.chatId, message.text);
          if (!result.ok) {
            totals.failed += message.alerts.length;
            console.warn(`[cron/alerts] telegram send failed for alerts ${ids}: ${result.status} ${result.description ?? ""}`);
            // 403: the user blocked the bot or deleted their account. Unlink the chat (as /stop does) so the
            // alerts wait as "not linked" instead of failing every day; the profile then offers to link again.
            if (result.status === 403) {
              const { error: unlinkError } = await admin.from("profiles").update({ telegram_chat_id: null }).eq("telegram_chat_id", message.chatId);
              if (unlinkError) console.error("[cron/alerts] could not unlink a blocked chat:", unlinkError);
            }
            return;
          }
          totals.sent += message.alerts.length;
          totals.messages += 1;
          await Promise.all(
            message.alerts.map(async (a) => {
              const { error: updateError } = await admin.from("alerts").update({ last_checked_month: a.month }).eq("id", a.alertId);
              if (updateError) console.error(`[cron/alerts] could not advance alert ${a.alertId}:`, updateError);
            }),
          );
        }),
      );
    }
    if (!complete || alerts.length < PAGE) break;
  }

  return json({ ok: true, complete, ...totals });
}
