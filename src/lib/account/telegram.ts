/**
 * Telegram bot helpers: deep-link codes, command parsing and the Bot API sendMessage call.
 * Env: TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME (without "@"), TELEGRAM_WEBHOOK_SECRET.
 */

export function telegramBotToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined;
}

export function telegramBotUsername(): string | undefined {
  const u = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  return u && /^[A-Za-z0-9_]{5,64}$/.test(u) ? u : undefined;
}

export function telegramWebhookSecret(): string | undefined {
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || undefined;
}

/**
 * Linking and delivery are possible: bot token (sending), username (deep links) and webhook secret
 * (receiving /start). The daily cron only needs the token.
 */
export function isTelegramConfigured(): boolean {
  return Boolean(telegramBotToken() && telegramBotUsername() && telegramWebhookSecret());
}

/** Random single-use link code, valid as a Telegram /start parameter (A-Z a-z 0-9 _ -, at most 64 chars). */
export function generateLinkCode(): string {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const LINK_CODE_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function telegramDeepLink(username: string, code: string): string {
  return `https://t.me/${username}?start=${encodeURIComponent(code)}`;
}

export type BotCommand = { command: "start"; code: string | null } | { command: "stop" } | { command: "other" };

/** "/start abc" (also "/start@MyBot abc") -> start with code; "/stop" -> stop; anything else -> other. */
export function parseBotCommand(text: unknown): BotCommand {
  if (typeof text !== "string") return { command: "other" };
  const m = /^\/(start|stop)(?:@[A-Za-z0-9_]+)?(?:\s+(\S+))?\s*$/.exec(text.trim());
  if (!m) return { command: "other" };
  if (m[1] === "stop") return { command: "stop" };
  const code = m[2] && LINK_CODE_RE.test(m[2]) ? m[2] : null;
  return { command: "start", code };
}

/** Constant-time string comparison (for webhook secrets). */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export interface TelegramSendResult {
  ok: boolean;
  status: number;
  description?: string;
}

/** Bot API sendMessage (plain text, link previews off). Never throws. */
export async function sendTelegramMessage(token: string, chatId: string, text: string, fetchImpl: typeof fetch = fetch): Promise<TelegramSendResult> {
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096), link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    return { ok: res.ok && body?.ok === true, status: res.status, description: body?.description };
  } catch (err) {
    return { ok: false, status: 0, description: err instanceof Error ? err.message : "network_error" };
  }
}
