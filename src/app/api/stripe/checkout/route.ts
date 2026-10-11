import type { NextRequest } from "next/server";
import { isStripeConfigured, isSupabaseConfigured } from "@/lib/auth/config";
import { requireUser } from "@/lib/auth/require";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { site } from "@/lib/config/site";
import { accountsDisabled, appOrigin, dbError, errorJson, json, readJsonBody, rejectCrossOrigin } from "@/lib/account/http";
import { getStripe, parseInterval, priceIdFor } from "@/lib/stripe/server";
import { eligibleForTrial, hasLiveSubscription } from "@/lib/stripe/subscription";

export const dynamic = "force-dynamic";

/**
 * POST { interval: "month" | "year" } -> { url } of a Stripe Checkout Session (subscription mode, with the
 * free trial for first-time subscribers). The Stripe customer is created once and stored in
 * subscriptions.stripe_customer_id (server key only); the webhook fills in the subscription.
 */

interface SubscriptionLookup {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  current_period_end: string | null;
  trial_end: string | null;
}

export async function POST(req: NextRequest) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  if (!isSupabaseConfigured()) return accountsDisabled();
  const stripe = getStripe();
  const admin = createSupabaseAdminClient();
  if (!stripe || !isStripeConfigured() || !admin) return errorJson("billing_disabled", 503);

  const gate = await requireUser();
  if (!gate.ok) return gate.response;
  const { viewer } = gate;

  const body = (await readJsonBody(req)) as { interval?: unknown } | undefined;
  const interval = parseInterval(body?.interval);
  if (!interval) return errorJson("invalid_interval", 400);
  const price = priceIdFor(interval);
  if (!price) return errorJson("interval_unavailable", 400);

  const { data, error } = await admin
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, status, current_period_end, trial_end")
    .eq("user_id", viewer.userId)
    .maybeSingle();
  if (error) return dbError("checkout.lookup", error);
  const existing = (data ?? null) as SubscriptionLookup | null;
  if (hasLiveSubscription(existing)) return errorJson("already_subscribed", 409);

  try {
    let customerId = existing?.stripe_customer_id ?? null;
    if (!customerId) {
      // The idempotency key makes a double-click (or a retry after a failed save) reuse the same customer.
      const customer = await stripe.customers.create(
        { email: viewer.email ?? undefined, metadata: { user_id: viewer.userId } },
        { idempotencyKey: `customer-create-${viewer.userId}` },
      );
      customerId = customer.id;
      const saved = await admin
        .from("subscriptions")
        .upsert({ user_id: viewer.userId, stripe_customer_id: customerId, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (saved.error) return dbError("checkout.save-customer", saved.error);
    }

    const origin = appOrigin(req);
    // Stripe accepts whole days (1-730); a misconfigured NEXT_PUBLIC_PLUS_TRIAL_DAYS disables the trial.
    const trialDays = Math.floor(site.plus.trialDays);
    const trial = eligibleForTrial(existing) && trialDays >= 1 && trialDays <= 730;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: viewer.userId,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      metadata: { user_id: viewer.userId },
      subscription_data: {
        metadata: { user_id: viewer.userId },
        ...(trial ? { trial_period_days: trialDays } : {}),
      },
      success_url: `${origin}/profile/?checkout=success`,
      cancel_url: `${origin}/plus/`,
    });
    if (!session.url) return errorJson("checkout_unavailable", 502);
    return json({ url: session.url });
  } catch (err) {
    console.error("[stripe/checkout] failed:", err);
    return errorJson("stripe_error", 502);
  }
}
