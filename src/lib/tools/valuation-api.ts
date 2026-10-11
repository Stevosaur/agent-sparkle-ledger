import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { parsePropertyRef } from "@/lib/property-ref";
import { estimateValuation, type ValuationRequest } from "@/lib/valuation-service";

/** Request body shared by POST /api/gated/valuation/ and /api/gated/valuation/report/. */
export const valuationBodySchema = z.object({
  ref: z.string().min(3).max(200),
  flatType: z.string().max(40).nullish(),
  storeyRange: z.string().max(20).nullish(),
  floor: z.number().min(-5).max(200).nullish(),
  areaSqm: z.number().positive().max(100_000),
});

export type ValuationBody = z.infer<typeof valuationBodySchema>;

export const NO_STORE = { "Cache-Control": "private, no-store" } as const;
const MAX_BODY_BYTES = 4096;

export function parseValuationBody(body: unknown): { ok: true; request: ValuationRequest } | { ok: false; message: string } {
  const parsed = valuationBodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request" };
  const ref = parsePropertyRef(parsed.data.ref);
  if (!ref) return { ok: false, message: "Unknown property reference" };
  return {
    ok: true,
    request: {
      ref,
      flatType: parsed.data.flatType ?? null,
      storeyRange: parsed.data.storeyRange ?? null,
      floor: parsed.data.floor ?? null,
      areaSqm: parsed.data.areaSqm,
    },
  };
}

/** Parse, value and serialise. The caller has already passed its requireFeature() gate. */
export async function handleValuationPost(req: NextRequest): Promise<NextResponse> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: "payload_too_large", message: "Request too large" }, { status: 413, headers: NO_STORE });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "Send a JSON body" }, { status: 400, headers: NO_STORE });
  }
  const parsed = parseValuationBody(body);
  if (!parsed.ok) return NextResponse.json({ error: "invalid_input", message: parsed.message }, { status: 400, headers: NO_STORE });
  const outcome = estimateValuation(parsed.request);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error, message: outcome.message }, { status: outcome.status, headers: NO_STORE });
  return NextResponse.json(outcome.valuation, { headers: NO_STORE });
}
