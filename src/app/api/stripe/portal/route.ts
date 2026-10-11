import type { NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/auth/config";
import { requireUser } from "@/lib/auth/require";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { accountsDisabled, appOrigin, dbError, errorJson, json, rejectCrossOrigin } from "@/lib/account/http";
import { getStripe } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

/** POST -> { url } of a Stripe Billing Portal session for the signed-in user's customer (manage / cancel). */
export async function POST(req: NextRequest) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  if (!isSupabaseConfigured()) return accountsDisabled();
  const stripe = getStripe();
  if (!stripe) return errorJson("billing_disabled", 503);

  const gate = await requireUser();
  if (!gate.ok) return gate.response;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return accountsDisabled();
  // RLS: users can read their own subscription row.
  const { data, error } = await supabase.from("subscriptions").select("stripe_customer_id").eq("user_id", gate.viewer.userId).maybeSingle();
  if (error) return dbError("portal.lookup", error);
  const customerId = (data as { stripe_customer_id?: string | null } | null)?.stripe_customer_id;
  if (!customerId) return errorJson("no_customer", 404);

  try {
    const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${appOrigin(req)}/profile/` });
    return json({ url: session.url });
  } catch (err) {
    console.error("[stripe/portal] failed:", err);
    return errorJson("stripe_error", 502);
  }
}
