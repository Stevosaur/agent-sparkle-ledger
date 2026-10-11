import type Stripe from "stripe";

/**
 * Pure mapping from Stripe objects to rows of the `subscriptions` table (see supabase/migrations).
 * Recent Stripe API versions moved `current_period_end` from the subscription onto each subscription
 * item, so the period end is the latest item period end.
 */

export interface SubscriptionRow {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string;
  status: string;
  price_id: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  updated_at: string;
}

/** Statuses that keep (or will shortly restore) access: the user should not be sold a second subscription. */
export const LIVE_STATUSES: ReadonlySet<string> = new Set(["active", "trialing", "past_due"]);

/** Subscription events the webhook handles; everything else is acknowledged and ignored. */
export const HANDLED_EVENTS = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"] as const;
export type HandledEventType = (typeof HANDLED_EVENTS)[number];

export function isHandledEvent(type: string): type is HandledEventType {
  return (HANDLED_EVENTS as readonly string[]).includes(type);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** Unix seconds -> ISO timestamp (null-safe). */
export function unixToIso(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

/** Customer id from an expandable customer field. */
export function customerIdOf(customer: string | { id: string } | null | undefined): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

/** Latest current_period_end across the subscription's items (unix seconds), or null. */
export function periodEndOf(sub: Pick<Stripe.Subscription, "items">): number | null {
  let end: number | null = null;
  for (const item of sub.items?.data ?? []) {
    const e = item.current_period_end;
    if (typeof e === "number" && (end === null || e > end)) end = e;
  }
  return end;
}

export function subscriptionToRow(sub: Stripe.Subscription, userId: string, now: Date = new Date()): SubscriptionRow {
  const firstPrice = sub.items?.data?.[0]?.price;
  return {
    user_id: userId,
    stripe_customer_id: customerIdOf(sub.customer),
    stripe_subscription_id: sub.id,
    status: sub.status,
    price_id: firstPrice ? firstPrice.id : null,
    current_period_end: unixToIso(periodEndOf(sub)),
    trial_end: unixToIso(sub.trial_end),
    // A cancellation scheduled from the billing portal sets cancel_at_period_end (or cancel_at on newer API versions).
    cancel_at_period_end: Boolean(sub.cancel_at_period_end || (sub.cancel_at != null && sub.status !== "canceled")),
    updated_at: now.toISOString(),
  };
}

/** The Supabase user id a Checkout Session was created for (client_reference_id, then metadata). */
export function userIdFromCheckoutSession(session: Pick<Stripe.Checkout.Session, "client_reference_id" | "metadata">): string | null {
  if (isUuid(session.client_reference_id)) return session.client_reference_id;
  const meta = session.metadata?.user_id;
  return isUuid(meta) ? meta : null;
}

/** The Supabase user id stored in subscription (or customer) metadata. */
export function userIdFromMetadata(metadata: Stripe.Metadata | null | undefined): string | null {
  const v = metadata?.user_id;
  return isUuid(v) ? v : null;
}

/**
 * Whether an incoming subscription row may overwrite the stored one. A user has one row; if they ever hold
 * two Stripe subscriptions (e.g. an old one finally cancelling after a new one started), a dead
 * subscription must not overwrite a different live one.
 */
export function shouldReplace(existing: { stripe_subscription_id: string | null; status: string | null } | null, incoming: { stripe_subscription_id: string; status: string }): boolean {
  if (!existing || !existing.stripe_subscription_id) return true;
  if (existing.stripe_subscription_id === incoming.stripe_subscription_id) return true;
  if (LIVE_STATUSES.has(incoming.status)) return true;
  return !LIVE_STATUSES.has(existing.status ?? "");
}

/** First-time subscribers get the free trial; anyone who has had a subscription or trial before does not. */
export function eligibleForTrial(existing: { stripe_subscription_id: string | null; trial_end: string | null } | null): boolean {
  return !existing || (!existing.stripe_subscription_id && !existing.trial_end);
}

/** Whether a stored row still grants access and blocks a new checkout. */
export function hasLiveSubscription(row: { status: string | null; current_period_end: string | null } | null, now: Date = new Date()): boolean {
  if (!row || !LIVE_STATUSES.has(row.status ?? "")) return false;
  return !row.current_period_end || new Date(row.current_period_end).getTime() > now.getTime();
}
