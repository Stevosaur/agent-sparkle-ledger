import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { isAiConfigured, isStripeConfigured, isSupabaseConfigured } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

/** Current visitor + entitlements, consumed by ViewerProvider on the client. */
export async function GET() {
  const viewer = await getViewer();
  return NextResponse.json(
    {
      signedIn: Boolean(viewer.userId),
      email: viewer.email,
      plan: viewer.plan,
      subscriptionStatus: viewer.subscriptionStatus,
      trialEndsAt: viewer.trialEndsAt,
      currentPeriodEnd: viewer.currentPeriodEnd,
      gating: viewer.gating,
      features: viewer.features,
      integrations: { auth: isSupabaseConfigured(), billing: isStripeConfigured(), ai: isAiConfigured() },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
