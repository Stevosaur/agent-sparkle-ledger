import { NextResponse } from "next/server";
import { buildOpenApiDocument } from "@/lib/api/spec";
import { CORS_HEADERS } from "@/lib/api/http";

/** GET /openapi.json — OpenAPI 3.1 description of the public API, generated from src/lib/api/spec.ts. */
export function GET() {
  return NextResponse.json(buildOpenApiDocument(), {
    headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
