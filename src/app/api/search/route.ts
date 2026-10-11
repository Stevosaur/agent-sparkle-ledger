import { NextResponse, type NextRequest } from "next/server";
import { search } from "@/lib/data/search";
import type { SearchKind } from "@/lib/data/types";

const KINDS: SearchKind[] = ["hdb", "condo", "landed", "landed-street", "launch", "town", "mrt"];

/** GET /api/search/?q=tampines&limit=8&kinds=hdb,condo */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  const limit = Math.min(25, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 8) || 8));
  const kindsParam = req.nextUrl.searchParams.get("kinds");
  const kinds = kindsParam ? (kindsParam.split(",").filter((k) => (KINDS as string[]).includes(k)) as SearchKind[]) : undefined;
  const results = search(q, { limit, kinds });
  return NextResponse.json({ q, results }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
