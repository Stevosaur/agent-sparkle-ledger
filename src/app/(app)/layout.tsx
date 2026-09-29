import { redirect } from "next/navigation";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { requireApp } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { approval, notification } from "@/lib/db/schema";
import { Shell } from "@/components/app/shell";
import { NAV } from "@/components/app/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const app = await requireApp();
  if (app.role === "SUPPLIER") redirect("/supplier");
  const audienceByRole: Record<string, string[]> = {
    PROCUREMENT: ["PROCUREMENT", "ALL"],
    OPERATIONS: ["OPERATIONS", "ALL"],
    FINANCE: ["FINANCE", "ALL"],
    ADMIN: ["COMPLIANCE", "PROCUREMENT", "OPERATIONS", "FINANCE", "ALL"],
    OWNER: ["COMPLIANCE", "PROCUREMENT", "OPERATIONS", "FINANCE", "ALL"],
    BUYER: ["BUYER"],
    VIEWER: ["ALL"],
  };
  const audiences = (audienceByRole[app.role] ?? ["ALL"]) as (typeof notification.$inferSelect)["audience"][];
  const [[{ n: pendingApprovals }], notes] = await Promise.all([
    db.select({ n: count() }).from(approval).where(and(eq(approval.orgId, app.org.id), eq(approval.status, "PENDING"))),
    db.select().from(notification).where(and(eq(notification.orgId, app.org.id), inArray(notification.audience, audiences))).orderBy(desc(notification.createdAt)).limit(40),
  ]);
  const mine = notes
    .filter((n) => n.audience !== "BUYER" || n.customerId === app.membership.customerId)
    .slice(0, 25)
    .map((n) => ({ id: n.id, title: n.title, body: n.body, href: n.href, at: n.createdAt.toISOString(), unread: n.status === "UNREAD" }));
  const nav = NAV.filter((g) => !g.perm || app.can(g.perm))
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || app.can(i.perm)) }))
    .filter((g) => g.items.length);
  return (
    <Shell
      nav={nav}
      user={{ name: app.user.name, email: app.user.email, role: app.roleName }}
      org={{ id: app.org.id, name: app.org.name, isDemo: app.org.isDemo }}
      orgs={app.orgs}
      clockOffsetMs={app.org.isDemo ? Number(app.org.settings.demoClockOffsetMs ?? 0) : 0}
      marketDate={app.marketDate}
      pendingApprovals={Number(pendingApprovals)}
      notifications={mine}
    >
      {children}
    </Shell>
  );
}
