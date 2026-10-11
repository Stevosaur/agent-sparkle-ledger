import { formatMonth, formatSgd, formatInt } from "@/lib/format";
import type { AlertChannel, AlertKind } from "./refs";

/** Pure planning for the daily alert job: which alerts fire, with what message. */

/** Latest activity of a property, as recorded in the dataset. */
export interface PropertyActivity {
  label: string;
  /** absolute URL of the property page */
  url: string;
  kind: "sale" | "launch";
  /** "YYYY-MM" of the latest recorded sale (or launch sales report); null when none */
  month: string | null;
  lastPrice: number | null;
  unitsSold: number | null;
  totalUnits: number | null;
}

export interface AlertRowLite {
  id: number;
  user_id: string;
  ref: string;
  kind: AlertKind;
  channel: AlertChannel;
  last_checked_month: string | null;
}

/** True when `latest` is a later "YYYY-MM" than `lastChecked` (or the first activity ever recorded). */
export function isNewerMonth(latest: string | null, lastChecked: string | null): boolean {
  if (!latest) return false;
  if (!lastChecked) return true;
  return latest > lastChecked;
}

/** The lines describing one property's new activity, ending with its page URL (no footer). */
export function alertSection(activity: PropertyActivity, siteName: string): string {
  const month = formatMonth(activity.month);
  const lines =
    activity.kind === "launch"
      ? [
          `${siteName} alert: new sales update for ${activity.label}.`,
          activity.unitsSold != null
            ? `Units sold: ${formatInt(activity.unitsSold)}${activity.totalUnits != null ? ` of ${formatInt(activity.totalUnits)}` : ""} (as of ${month}).`
            : `Latest report: ${month}.`,
        ]
      : [
          `${siteName} alert: new sale recorded at ${activity.label}.`,
          activity.lastPrice != null ? `Latest sale: ${formatSgd(activity.lastPrice)} (${month}).` : `Latest sale: ${month}.`,
        ];
  return [...lines, activity.url].join("\n");
}

function manageFooter(manageUrl: string): string {
  return `\n\nManage alerts: ${manageUrl}`;
}

export function buildAlertMessage(activity: PropertyActivity, siteName: string, manageUrl: string): string {
  return alertSection(activity, siteName) + manageFooter(manageUrl);
}

export type SkipReason = "no-change" | "not-found" | "not-entitled" | "not-linked" | "channel-unavailable";

export interface AlertDispatchPlan {
  /** `text` is the alert as a message of its own; `section` the same without the footer, for batching */
  sends: { alertId: number; userId: string; chatId: string; text: string; section: string; month: string }[];
  skipped: { alertId: number; reason: SkipReason }[];
}

/**
 * Decide which alerts to send. An alert fires when the property's latest recorded month is newer than the
 * alert's last_checked_month. Alerts whose user has not linked Telegram, or whose Plus subscription has
 * lapsed, are skipped without advancing last_checked_month, so they fire once the user links / renews.
 * `entitledUsers` null means every user is entitled (open gating).
 */
export function planAlertDispatch(
  alerts: readonly AlertRowLite[],
  activityByRef: ReadonlyMap<string, PropertyActivity | null>,
  chatIdByUser: ReadonlyMap<string, string | null>,
  entitledUsers: ReadonlySet<string> | null,
  siteName: string,
  manageUrl: string,
): AlertDispatchPlan {
  const plan: AlertDispatchPlan = { sends: [], skipped: [] };
  for (const a of alerts) {
    const activity = activityByRef.get(a.ref) ?? null;
    if (!activity) {
      plan.skipped.push({ alertId: a.id, reason: "not-found" });
      continue;
    }
    if (!isNewerMonth(activity.month, a.last_checked_month)) {
      plan.skipped.push({ alertId: a.id, reason: "no-change" });
      continue;
    }
    if (entitledUsers && !entitledUsers.has(a.user_id)) {
      plan.skipped.push({ alertId: a.id, reason: "not-entitled" });
      continue;
    }
    if (a.channel !== "telegram") {
      plan.skipped.push({ alertId: a.id, reason: "channel-unavailable" });
      continue;
    }
    const chatId = chatIdByUser.get(a.user_id) ?? null;
    if (!chatId) {
      plan.skipped.push({ alertId: a.id, reason: "not-linked" });
      continue;
    }
    plan.sends.push({
      alertId: a.id,
      userId: a.user_id,
      chatId,
      text: buildAlertMessage(activity, siteName, manageUrl),
      section: alertSection(activity, siteName),
      month: activity.month!,
    });
  }
  return plan;
}

/** Telegram's sendMessage text limit. */
export const TELEGRAM_MAX_TEXT = 4096;

export interface ChatMessage {
  chatId: string;
  /** alerts covered by this message, with the month to store as last_checked_month once it is delivered */
  alerts: { alertId: number; month: string }[];
  text: string;
}

/**
 * Combine the planned sends into one message per chat (split only when a message would pass Telegram's
 * length limit). Telegram rate-limits each chat to about one message per second, so a monthly data drop
 * that fires many alerts for one user must not become a burst of separate messages.
 */
export function batchByChat(sends: AlertDispatchPlan["sends"], manageUrl: string, maxLength: number = TELEGRAM_MAX_TEXT): ChatMessage[] {
  const footer = manageFooter(manageUrl);
  const byChat = new Map<string, AlertDispatchPlan["sends"]>();
  for (const s of sends) {
    const list = byChat.get(s.chatId);
    if (list) list.push(s);
    else byChat.set(s.chatId, [s]);
  }
  const out: ChatMessage[] = [];
  for (const [chatId, list] of byChat) {
    let current: ChatMessage | null = null;
    for (const s of list) {
      if (current && current.text.length + 2 + s.section.length + footer.length > maxLength) {
        current.text += footer;
        out.push(current);
        current = null;
      }
      current ??= { chatId, alerts: [], text: "" };
      current.text += (current.text ? "\n\n" : "") + s.section;
      current.alerts.push({ alertId: s.alertId, month: s.month });
    }
    if (current) {
      current.text += footer;
      out.push(current);
    }
  }
  return out;
}
