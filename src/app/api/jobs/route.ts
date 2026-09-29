import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processPending } from "@/lib/events/bus";

/** Cron hook to drain the event outbox (e.g. every minute). Protected by JOBS_SECRET bearer token. */
export async function POST(req: Request) {
  const secret = process.env.JOBS_SECRET;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const n = await processPending(100);
  return NextResponse.json({ processed: n });
}
