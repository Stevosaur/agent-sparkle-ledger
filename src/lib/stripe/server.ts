import "server-only";
import Stripe from "stripe";

/**
 * Lazily created Stripe client (the SDK pins its own API version). Null when STRIPE_SECRET_KEY is not set,
 * so builds and previews without billing keep working.
 */
let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) client = new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 });
  return client;
}

export type BillingInterval = "month" | "year";

export function parseInterval(v: unknown): BillingInterval | null {
  return v === "month" || v === "year" ? v : null;
}

/** Stripe price id for a billing interval (STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY), or null when not configured. */
export function priceIdFor(interval: BillingInterval): string | null {
  const id = interval === "month" ? process.env.STRIPE_PRICE_MONTHLY : process.env.STRIPE_PRICE_YEARLY;
  return id?.trim() || null;
}

export function stripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}
