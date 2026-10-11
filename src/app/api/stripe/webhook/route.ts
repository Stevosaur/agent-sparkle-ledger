import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { errorJson, json } from "@/lib/account/http";
import { getStripe, stripeWebhookSecret } from "@/lib/stripe/server";
import { customerIdOf, isHandledEvent, shouldReplace, subscriptionToRow, userIdFromCheckoutSession, userIdFromMetadata } from "@/lib/stripe/subscription";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook (endpoint URL must end in "/": <site>/api/stripe/webhook/).
 * Verifies the signature on the raw body with STRIPE_WEBHOOK_SECRET, then mirrors the subscription into
 * the `subscriptions` table with the server key. Handles checkout.session.completed and
 * customer.subscription.created / updated / deleted. The subscription is re-fetched from Stripe so events
 * that arrive out of order still store the latest state.
 */

async function findUserId(admin: SupabaseClient, stripe: Stripe, customerId: string | null, ...candidates: (string | null)[]): Promise<string | null> {
  for (const c of candidates) if (c) return c;
  if (!customerId) return null;
  const { data } = await admin.from("subscriptions").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
  const stored = (data as { user_id?: string } | null)?.user_id;
  if (stored) return stored;
  const customer = await stripe.customers.retrieve(customerId);
  return "deleted" in customer && customer.deleted ? null : userIdFromMetadata((customer as Stripe.Customer).metadata);
}

async function syncSubscription(admin: SupabaseClient, sub: Stripe.Subscription, userId: string): Promise<void> {
  const row = subscriptionToRow(sub, userId);
  const { data: existing, error: readError } = await admin.from("subscriptions").select("stripe_subscription_id, status").eq("user_id", userId).maybeSingle();
  if (readError) throw readError;
  if (!shouldReplace((existing ?? null) as { stripe_subscription_id: string | null; status: string | null } | null, row)) return;
  const { error } = await admin.from("subscriptions").upsert(row, { onConflict: "user_id" });
  if (error) throw error;
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = stripeWebhookSecret();
  if (!stripe || !secret) return errorJson("billing_disabled", 503);
  const admin = createSupabaseAdminClient();
  if (!admin) return errorJson("accounts_disabled", 503);

  const signature = req.headers.get("stripe-signature");
  if (!signature) return errorJson("missing_signature", 400);
  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return errorJson("invalid_signature", 400);
  }

  if (!isHandledEvent(event.type)) return json({ received: true, ignored: event.type });

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription" || !session.subscription) return json({ received: true, ignored: "not_subscription" });
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const userId = await findUserId(admin, stripe, customerIdOf(sub.customer), userIdFromCheckoutSession(session), userIdFromMetadata(sub.metadata));
      if (!userId) {
        console.warn(`[stripe/webhook] no user for checkout session ${session.id}`);
        return json({ received: true, ignored: "unknown_user" });
      }
      await syncSubscription(admin, sub, userId);
      return json({ received: true });
    }

    // customer.subscription.created | updated | deleted
    const fromEvent = event.data.object as Stripe.Subscription;
    const sub = await stripe.subscriptions.retrieve(fromEvent.id);
    const userId = await findUserId(admin, stripe, customerIdOf(sub.customer), userIdFromMetadata(sub.metadata));
    if (!userId) {
      console.warn(`[stripe/webhook] no user for subscription ${sub.id}`);
      return json({ received: true, ignored: "unknown_user" });
    }
    await syncSubscription(admin, sub, userId);
    return json({ received: true });
  } catch (err) {
    // 500 makes Stripe retry with backoff.
    console.error(`[stripe/webhook] ${event.type} ${event.id} failed:`, err);
    return errorJson("processing_failed", 500);
  }
}
