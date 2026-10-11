/** Which optional integrations are configured on this deployment (env-driven; safe on server and client for NEXT_PUBLIC_*). */

export function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;
}

/** Supabase publishable (new) or anon (legacy) key. */
export function supabasePublicKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabasePublicKey());
}

/** Server-only: Supabase secret (new) or service-role (legacy) key for trusted writes (webhooks, cron). */
export function supabaseSecretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && (process.env.STRIPE_PRICE_MONTHLY || process.env.STRIPE_PRICE_YEARLY));
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * "enforce": gated features require an account / Plus subscription.
 * "open": accounts are not connected (no Supabase), so every feature is unlocked and a preview banner is shown.
 * Override with GATING_MODE=open|enforce.
 */
export function gatingMode(): "open" | "enforce" {
  const forced = process.env.GATING_MODE;
  if (forced === "open" || forced === "enforce") return forced;
  return isSupabaseConfigured() ? "enforce" : "open";
}
