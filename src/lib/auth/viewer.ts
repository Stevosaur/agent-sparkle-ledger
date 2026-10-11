import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gatingMode } from "./config";
import { featureMap, type FeatureKey, type Plan } from "./entitlements";

export interface Viewer {
  userId: string | null;
  email: string | null;
  plan: Plan;
  /** subscription status from Stripe ("trialing", "active", ...) or null */
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  gating: "open" | "enforce";
  features: Record<FeatureKey, boolean>;
}

/**
 * The current visitor, resolved from the Supabase session cookie and the `subscriptions` table
 * (see supabase/migrations). Reads cookies, so only call it from route handlers and dynamic pages.
 */
export async function getViewer(): Promise<Viewer> {
  const gating = gatingMode();
  const anonymous: Viewer = {
    userId: null,
    email: null,
    plan: "anonymous",
    subscriptionStatus: null,
    trialEndsAt: null,
    currentPeriodEnd: null,
    gating,
    features: featureMap("anonymous", gating),
  };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return anonymous;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return anonymous;
  const user = data.user;
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status, trial_end, current_period_end")
    .eq("user_id", user.id)
    .maybeSingle();
  const status = (sub?.status as string | undefined) ?? null;
  const periodEnd = (sub?.current_period_end as string | undefined) ?? null;
  const active = (status === "active" || status === "trialing") && (!periodEnd || new Date(periodEnd).getTime() > Date.now());
  const plan: Plan = active ? "plus" : "free";
  return {
    userId: user.id,
    email: user.email ?? null,
    plan,
    subscriptionStatus: status,
    trialEndsAt: (sub?.trial_end as string | undefined) ?? null,
    currentPeriodEnd: periodEnd,
    gating,
    features: featureMap(plan, gating),
  };
}
