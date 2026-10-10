import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/auth/config";
import { requireUser } from "@/lib/auth/require";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;
const MAX_BODY_BYTES = 8192;

const finite = z.number().refine(Number.isFinite, "must be a finite number");

/** What the affordability tool sends: the calculator input and result (numbers / short enums only). */
const saveSchema = z.object({
  label: z.string().trim().min(1).max(100),
  input: z.record(z.string().max(40), z.union([finite, z.string().max(20)])).refine((o) => Object.keys(o).length <= 30, "too many fields"),
  result: z.record(z.string().max(40), z.union([finite, z.string().max(20)])).refine((o) => Object.keys(o).length <= 30, "too many fields"),
});

/**
 * POST /api/affordability/save/  (signed-in user; feature "affordability.save")
 * Body: { label, input, result } -> row in saved_calculations(user_id, kind 'affordability', label, input, result).
 * 503 when accounts (Supabase) are not configured on this deployment.
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "saving_unavailable", message: "Saving is unavailable: accounts are not connected on this deployment." }, { status: 503, headers: NO_STORE });
  }
  const gate = await requireUser();
  if (!gate.ok) return gate.response;

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: "payload_too_large", message: "Request too large" }, { status: 413, headers: NO_STORE });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "Send a JSON body" }, { status: 400, headers: NO_STORE });
  }
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", message: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400, headers: NO_STORE });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "saving_unavailable", message: "Saving is unavailable." }, { status: 503, headers: NO_STORE });
  const { data, error } = await supabase
    .from("saved_calculations")
    .insert({ user_id: gate.viewer.userId, kind: "affordability", label: parsed.data.label, input: parsed.data.input, result: parsed.data.result })
    .select("id")
    .single();
  if (error) {
    console.error("[affordability/save] insert failed:", error.message);
    return NextResponse.json({ error: "save_failed", message: "Could not save the calculation. Please try again." }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ id: (data as { id: string | number } | null)?.id ?? null }, { status: 201, headers: NO_STORE });
}
