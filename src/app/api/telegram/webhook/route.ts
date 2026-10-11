import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { site } from "@/lib/config/site";
import { absoluteUrl } from "@/lib/seo";
import { errorJson, json, NO_STORE, readJsonBody } from "@/lib/account/http";
import { parseBotCommand, safeEqual, telegramWebhookSecret } from "@/lib/account/telegram";

export const dynamic = "force-dynamic";

/**
 * Telegram bot webhook. Register it with setWebhook (url = <site>/api/telegram/webhook/, secret_token =
 * TELEGRAM_WEBHOOK_SECRET); Telegram echoes the secret in X-Telegram-Bot-Api-Secret-Token.
 *   /start <code>  links the chat to the account that generated <code> on /profile/
 *   /stop          unlinks the chat
 * Replies are returned in the webhook response (Bot API "method" reply), so no extra API call is needed.
 */

interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id?: number | string; type?: string };
  };
}

function reply(chatId: string, text: string): NextResponse {
  return NextResponse.json({ method: "sendMessage", chat_id: chatId, text, link_preview_options: { is_disabled: true } }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const secret = telegramWebhookSecret();
  if (!secret) return errorJson("telegram_disabled", 503);
  if (!safeEqual(req.headers.get("x-telegram-bot-api-secret-token") ?? "", secret)) return errorJson("unauthorized", 401);
  const admin = createSupabaseAdminClient();
  if (!admin) return errorJson("accounts_disabled", 503);

  const update = (await readJsonBody(req)) as TelegramUpdate | undefined;
  const message = update?.message;
  const rawChatId = message?.chat?.id;
  // Acknowledge everything we do not act on (edited messages, callbacks, ...) so Telegram does not retry.
  if (!message || (typeof rawChatId !== "number" && typeof rawChatId !== "string")) return json({ ok: true });
  const chatId = String(rawChatId);
  const command = parseBotCommand(message.text);
  if (command.command === "other") return json({ ok: true });

  const profileUrl = absoluteUrl("/profile/");
  if (message.chat?.type !== "private") {
    return reply(chatId, `Please message me directly to link ${site.name} alerts.`);
  }

  if (command.command === "stop") {
    const { error } = await admin.from("profiles").update({ telegram_chat_id: null }).eq("telegram_chat_id", chatId);
    if (error) {
      console.error("[telegram] unlink failed:", error);
      return errorJson("server_error", 500);
    }
    return reply(chatId, `${site.name} alerts are off for this chat. You can link Telegram again from ${profileUrl}`);
  }

  if (!command.code) {
    return reply(chatId, `To get ${site.name} alerts here, open ${profileUrl} and tap "Link Telegram".`);
  }

  const { data, error } = await admin
    .from("profiles")
    .update({ telegram_chat_id: chatId, telegram_link_code: null })
    .eq("telegram_link_code", command.code)
    .select("id");
  if (error) {
    console.error("[telegram] link failed:", error);
    return errorJson("server_error", 500);
  }
  if (!data || data.length === 0) {
    return reply(chatId, `This link has expired or was already used. Open ${profileUrl} and tap "Link Telegram" again.`);
  }
  return reply(chatId, `Linked. ${site.name} alerts will arrive in this chat. Send /stop to turn them off.`);
}
