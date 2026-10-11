import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabasePublicKey, supabaseSecretKey, supabaseUrl } from "@/lib/auth/config";

/** Per-request Supabase client acting as the signed-in user (RLS applies). Null when Supabase is not configured. */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return null;
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl()!, supabasePublicKey()!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only there; the proxy refreshes sessions.
        }
      },
    },
  });
}

/** Trusted server client (bypasses RLS) for webhooks and cron jobs. Null unless the secret key is set. */
export function createSupabaseAdminClient(): SupabaseClient | null {
  const url = supabaseUrl();
  const key = supabaseSecretKey();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
