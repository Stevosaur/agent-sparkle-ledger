import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/auth/require";
import { getBlockRentals, getBlockTransactions, getHdbBlock, getNearbyBlocks, getTown, getTownRentals } from "@/lib/data/hdb";
import { getCoverage, getMeta } from "@/lib/data/meta";
import { monthIndex, monthLabel } from "@/lib/data/months";
import { getLaunches } from "@/lib/data/private";
import { launchesNear, mopCohort, summariseRentals, yieldsByFlatType, type HdbContextData } from "@/lib/hdb-insights";

const NO_STORE = { "Cache-Control": "private, no-store" };
const MOP_RADIUS_M = 1000;
const LAUNCH_RADIUS_M = 2000;
const RENTAL_MONTHS = 24;
const YIELD_MONTHS = 12;

function toMonthIndex(label: string | null | undefined): number | null {
  if (!label) return null;
  try {
    return monthIndex(label);
  } catch {
    return null;
  }
}

function maxOrNull(a: number | null, b: number | null): number | null {
  return a == null ? b : b == null ? a : Math.max(a, b);
}

/**
 * GET /api/gated/hdb/<slug>/context/
 * Rental demand (block rentals, yields, town rents) and competing supply (nearby MOP cohort, new launches)
 * for one block. Gate: "property.context" (free account).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const gate = await requireFeature("property.context");
  if (!gate.ok) return gate.response;

  const { slug } = await ctx.params;
  const block = getHdbBlock(slug);
  if (!block) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  const coverage = getCoverage();
  const meta = getMeta();
  const sales = getBlockTransactions(slug);
  const rentals = getBlockRentals(slug);
  const town = getTown(block.townSlug);

  // Windows end at the dataset's latest month (the pipeline's convention for TxSummary.count12m and
  // HdbBlock.rentals), not at today's date. Without the rentals source's latest period, the later of this
  // town's newest rental and the resale data's latest month stands in for the dataset-wide rental month.
  const salesLatestMonth = toMonthIndex(meta.latestMonth.hdb) ?? sales[0]?.monthIndex ?? null;
  const rentalsLatestMonth =
    toMonthIndex(meta.sources.find((s) => s.id === "hdb-rentals")?.latestPeriod) ?? maxOrNull(getTownRentals(block.townSlug)[0]?.monthIndex ?? null, salesLatestMonth);

  const rentalSummary = summariseRentals(rentals, rentalsLatestMonth, RENTAL_MONTHS);
  const yieldRows = yieldsByFlatType({
    sales,
    rentals,
    salesLatestMonth,
    rentalsLatestMonth,
    town,
    extraFlatTypes: Object.keys(block.unitMix),
    months: YIELD_MONTHS,
  });

  const from = block.lat != null && block.lng != null ? { lat: block.lat, lng: block.lng } : null;
  const currentYear = new Date().getUTCFullYear();
  const mop = from ? mopCohort(getNearbyBlocks(from, MOP_RADIUS_M, slug, 5000), currentYear, { radiusM: MOP_RADIUS_M, horizonYears: 5, limit: 25 }) : null;
  const launchRows = from && coverage.launches ? launchesNear(getLaunches(), from, LAUNCH_RADIUS_M, 20) : from ? [] : null;

  const body: HdbContextData = {
    slug,
    town: block.town,
    rentalsAvailable: coverage.rentals,
    rentals: rentalSummary,
    yields: {
      months: YIELD_MONTHS,
      salesToMonth: salesLatestMonth != null ? monthLabel(salesLatestMonth) : null,
      rentalsToMonth: rentalSummary.toMonth,
      rows: yieldRows,
    },
    mop,
    launches: { available: coverage.launches, radiusM: LAUNCH_RADIUS_M, rows: launchRows },
  };
  return NextResponse.json(body, { headers: NO_STORE });
}
