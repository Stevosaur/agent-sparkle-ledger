import "server-only";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireActionCtx, type AppContext } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/rbac";
import { processPending } from "@/lib/events/bus";
import { DomainError } from "@/lib/services/context";
import { log } from "@/lib/log";

export type ActionResult<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

/**
 * Wrap a server action: authenticate, authorise (RBAC), run, then let event-driven agents react
 * (processed inline so the next render shows their output) and revalidate.
 */
export async function run<T>(perm: Permission | null, fn: (app: AppContext) => Promise<T>, message?: string | ((d: T) => string)): Promise<ActionResult<T>> {
  try {
    const app = await requireActionCtx(perm ?? undefined);
    const data = await fn(app);
    await processPending(40);
    revalidatePath("/", "layout");
    return { ok: true, data, message: typeof message === "function" ? message(data) : message };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    if (e instanceof DomainError) return { ok: false, error: e.message };
    const msg = e instanceof Error ? e.message : "Something went wrong";
    log.error("action failed", { err: msg });
    return { ok: false, error: /permission|signed in/i.test(msg) ? msg : "Something went wrong — the error has been logged." };
  }
}
