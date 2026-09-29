"use server";
/**
 * Species master helpers. The matcher test is read-only: it does not write aliases, emit events or revalidate.
 */
import { z } from "zod";
import { db } from "@/lib/db/client";
import { requireActionCtx } from "@/lib/auth/session";
import { speciesDictionary } from "@/lib/services/dictionaries";
import { matchSpecies, CONFIRM_THRESHOLD, type SpeciesMatchResult } from "@/lib/domain/species-match";
import type { ActionResult } from "./_run";

export async function testSpeciesMatchAction(text: string): Promise<ActionResult<SpeciesMatchResult & { threshold: number }>> {
  const parsed = z.string().trim().min(1, "Type a name to test").max(80).safeParse(text);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const app = await requireActionCtx();
    if (!app.can("species.manage") && !app.can("supply.view")) return { ok: false, error: "You don't have permission to do that." };
    const dict = await speciesDictionary(db, app.org.id);
    return { ok: true, data: { ...matchSpecies(parsed.data, dict, 5), threshold: CONFIRM_THRESHOLD } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return { ok: false, error: /permission|signed in/i.test(msg) ? msg : "Something went wrong — please try again." };
  }
}
