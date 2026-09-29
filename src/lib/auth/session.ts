import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { membership, organization } from "@/lib/db/schema";
import { auth } from "./auth";
import { can, ROLES, type Permission } from "./rbac";
import { DEFAULT_SETTINGS, orgNow } from "@/lib/services/common";
import { marketDateFor } from "@/lib/domain/time";
import type { Ctx } from "@/lib/services/context";

export const ORG_COOKIE = "pc_org";

export type AppContext = {
  user: { id: string; name: string; email: string };
  org: typeof organization.$inferSelect & { settings: typeof DEFAULT_SETTINGS };
  role: string;
  roleName: string;
  membership: typeof membership.$inferSelect;
  orgs: { id: string; name: string; isDemo: boolean }[];
  now: Date;
  marketDate: string;
  ctx: Ctx;
  can: (p: Permission) => boolean;
};

/** Resolve the signed-in user, their active organisation (tenant) and role. Cached per request. */
export const getAppContext = cache(async (): Promise<AppContext | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const mems = await db
    .select({ m: membership, o: organization })
    .from(membership)
    .innerJoin(organization, eq(organization.id, membership.orgId))
    .where(eq(membership.userId, s.user.id));
  if (!mems.length) return null;
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const active = mems.find((x) => x.o.id === wanted) ?? mems[0];
  const org = { ...active.o, settings: { ...DEFAULT_SETTINGS, ...(active.o.settings ?? {}) } };
  const now = orgNow(org);
  const role = active.m.roleKey;
  return {
    user: { id: s.user.id, name: s.user.name, email: s.user.email },
    org,
    role,
    roleName: ROLES[role]?.name ?? role,
    membership: active.m,
    orgs: mems.map((x) => ({ id: x.o.id, name: x.o.name, isDemo: x.o.isDemo })),
    now,
    marketDate: marketDateFor(now),
    ctx: { orgId: org.id, actor: { type: "USER", id: s.user.id, label: s.user.name }, source: "WEB", now },
    can: (p) => can(role, p),
  };
});

/** For pages: redirect to login when unauthenticated; 403 page when the role lacks the permission. */
export async function requireApp(p?: Permission): Promise<AppContext> {
  const c = await getAppContext();
  if (!c) redirect("/login");
  if (p && !c.can(p)) redirect(`/forbidden?need=${p}`);
  return c;
}

/** For server actions / route handlers: throw instead of redirecting. */
export async function requireActionCtx(p?: Permission): Promise<AppContext> {
  const c = await getAppContext();
  if (!c) throw new Error("Not signed in");
  if (p && !c.can(p)) throw new Error("You don't have permission to do that.");
  return c;
}

export async function isMember(userId: string, orgId: string) {
  const r = await db.select({ id: membership.id }).from(membership).where(and(eq(membership.userId, userId), eq(membership.orgId, orgId)));
  return r.length > 0;
}
