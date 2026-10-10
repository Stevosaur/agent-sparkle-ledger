import type { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { dbError, errorJson, guardAccount, json, rejectCrossOrigin } from "@/lib/account/http";
import { generateLinkCode, isTelegramConfigured, telegramBotUsername, telegramDeepLink } from "@/lib/account/telegram";
import type { TelegramStatus } from "@/lib/account/types";

export const dynamic = "force-dynamic";

/**
 * Telegram linking for the signed-in user.
 *   GET    -> { configured, linked }
 *   POST   -> { url }   deep link https://t.me/<bot>?start=<one-time code>
 *   DELETE -> { ok }    unlink
 * The Telegram columns are only writable with the server key (see supabase/migrations), so a user can
 * never point alerts at someone else's chat.
 */

export async function GET() {
  const guard = await guardAccount();
  if (!guard.ok) return guard.response;
  const { data } = await guard.supabase.from("profiles").select("telegram_chat_id").eq("id", guard.viewer.userId).maybeSingle();
  const body: TelegramStatus = {
    configured: isTelegramConfigured() && Boolean(createSupabaseAdminClient()),
    linked: Boolean((data as { telegram_chat_id?: string | null } | null)?.telegram_chat_id),
  };
  return json(body);
}

export async function POST(req: NextRequest) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  const guard = await guardAccount();
  if (!guard.ok) return guard.response;
  const admin = createSupabaseAdminClient();
  const username = telegramBotUsername();
  if (!admin || !username || !isTelegramConfigured()) return errorJson("telegram_disabled", 503);
  const code = generateLinkCode();
  const { error } = await admin.from("profiles").upsert({ id: guard.viewer.userId, telegram_link_code: code }, { onConflict: "id" });
  if (error) return dbError("telegram.link", error);
  return json({ url: telegramDeepLink(username, code) });
}

export async function DELETE(req: NextRequest) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  const guard = await guardAccount();
  if (!guard.ok) return guard.response;
  const admin = createSupabaseAdminClient();
  if (!admin) return errorJson("telegram_disabled", 503);
  const { error } = await admin.from("profiles").update({ telegram_chat_id: null, telegram_link_code: null }).eq("id", guard.viewer.userId);
  if (error) return dbError("telegram.unlink", error);
  return json({ ok: true });
}
