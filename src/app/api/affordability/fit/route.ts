import { NextResponse, type NextRequest } from "next/server";
import { getTowns } from "@/lib/data/hdb";
import { getProjects } from "@/lib/data/private";
import { getCoverage, getMeta } from "@/lib/data/meta";
import { DEFAULT_FIT_SIZE_SQFT, fitCondo, fitHdb } from "@/lib/tools/fit";

/**
 * GET /api/affordability/fit/?maxPrice=800000&kind=hdb|condo&sizeSqft=1000  (public)
 * HDB towns × flat types whose 12-month median resale price is within maxPrice, or condo / EC projects
 * whose 12-month median psf × sizeSqft is within maxPrice. Top 20, priciest first. Aggregates only.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const maxPrice = Number(sp.get("maxPrice"));
  const kind = sp.get("kind") === "condo" ? "condo" : sp.get("kind") === "hdb" || !sp.get("kind") ? "hdb" : null;
  const sizeRaw = sp.get("sizeSqft");
  const sizeSqft = sizeRaw == null || sizeRaw === "" ? DEFAULT_FIT_SIZE_SQFT : Number(sizeRaw);
  if (!kind) return NextResponse.json({ error: "invalid_kind", message: "kind must be hdb or condo" }, { status: 400 });
  if (!Number.isFinite(maxPrice) || maxPrice <= 0 || maxPrice > 100_000_000) {
    return NextResponse.json({ error: "invalid_max_price", message: "maxPrice must be a positive number" }, { status: 400 });
  }
  if (kind === "condo" && (!Number.isFinite(sizeSqft) || sizeSqft < 200 || sizeSqft > 20_000)) {
    return NextResponse.json({ error: "invalid_size", message: "sizeSqft must be between 200 and 20,000" }, { status: 400 });
  }
  const coverage = getCoverage();
  const meta = getMeta();
  const body =
    kind === "hdb"
      ? {
          kind,
          maxPrice,
          sizeSqft: null,
          available: coverage.hdb,
          rows: coverage.hdb ? fitHdb(getTowns(), maxPrice) : [],
          latestMonth: meta.latestMonth.hdb,
          source: "HDB resale prices, data.gov.sg",
        }
      : {
          kind,
          maxPrice,
          sizeSqft,
          available: coverage.private,
          rows: coverage.private ? fitCondo(getProjects(), maxPrice, sizeSqft) : [],
          latestMonth: meta.latestMonth.private,
          source: "URA private residential transactions",
        };
  return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
