"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import * as Icons from "lucide-react";
import * as DM from "@radix-ui/react-dropdown-menu";
import * as Pop from "@radix-ui/react-popover";
import { createAuthClient } from "better-auth/react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import type { NavGroup } from "./nav";
import { CommandBar } from "./command-bar";
import { markNotificationsReadAction, switchOrgAction } from "@/app/actions";
import { time as fmtTime, date as fmtDate } from "@/lib/format";

const authClient = createAuthClient();

type Props = {
  nav: NavGroup[];
  user: { name: string; email: string; role: string };
  org: { id: string; name: string; isDemo: boolean };
  orgs: { id: string; name: string; isDemo: boolean }[];
  clockOffsetMs: number;
  marketDate: string;
  pendingApprovals: number;
  notifications: { id: string; title: string; body: string; href: string | null; at: string; unread: boolean }[];
  children: React.ReactNode;
};

function NavIcon({ name, className }: { name: string; className?: string }) {
  const I = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name] ?? Icons.Circle;
  return <I className={className} />;
}

function Sidebar({ nav, pendingApprovals, onNavigate }: { nav: NavGroup[]; pendingApprovals: number; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4 text-sm" aria-label="Main">
      {nav.map((g) => {
        const single = g.items.length === 1 && g.items[0].label === g.label;
        const active = g.items.some((i) => path === i.href || path.startsWith(i.href + "/"));
        return (
          <div key={g.label}>
            {single ? (
              <Link href={g.items[0].href} onClick={onNavigate} className={cn("flex items-center gap-2.5 rounded-md px-2.5 py-1.5 font-medium", active ? "bg-panel-3 text-text" : "text-text-2 hover:bg-panel-2 hover:text-text")}>
                <NavIcon name={g.icon} className={cn("size-4", active ? "text-accent" : "text-muted")} />
                {g.label}
              </Link>
            ) : (
              <>
                <div className="mb-1 flex items-center gap-2.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  <NavIcon name={g.icon} className="size-3.5" />
                  {g.label}
                </div>
                <div className="space-y-0.5">
                  {g.items.map((i) => {
                    const on = path === i.href || (i.href !== "/vendors" && i.href !== "/trace" && i.href !== "/settings" && path.startsWith(i.href + "/")) || (i.href === "/vendors" && /^\/vendors\/[0-9a-f-]{36}/.test(path)) || (i.href === "/trace" && /^\/trace\/[0-9a-f-]{36}/.test(path));
                    return (
                      <Link key={i.href} href={i.href} onClick={onNavigate} className={cn("flex items-center justify-between rounded-md py-1.5 pl-8 pr-2.5", on ? "bg-panel-3 font-medium text-text" : "text-text-2 hover:bg-panel-2 hover:text-text")}>
                        {i.label}
                        {i.href === "/ai/approvals" && pendingApprovals > 0 && <span className="num rounded bg-surplus px-1.5 text-[10px] font-bold text-black">{pendingApprovals}</span>}
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function DemoClock({ offsetMs, isDemo }: { offsetMs: number; isDemo: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date(Date.now() + offsetMs));
    tick();
    const t = setInterval(tick, 10000);
    return () => clearInterval(t);
  }, [offsetMs]);
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border bg-panel-2 px-2 py-1" title={isDemo ? "Demo clock: the DEMO workspace runs on a simulated overnight clock (Singapore time)" : "Singapore time"}>
      <span className="live-dot size-1.5 rounded-full bg-ok" />
      <span className="num text-xs font-semibold text-text">{now ? fmtTime(now) : "--:--"}</span>
      <span className="text-[10px] text-muted">SGT{isDemo ? " · demo clock" : ""}</span>
    </div>
  );
}

export function Shell({ nav, user, org, orgs, clockOffsetMs, marketDate, pendingApprovals, notifications, children }: Props) {
  const [open, setOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const unread = notifications.filter((n) => n.unread).length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-panel lg:flex">
        <div className="flex h-14 items-center border-b border-border px-4">
          <Link href="/dashboard"><Logo /></Link>
        </div>
        <Sidebar nav={nav} pendingApprovals={pendingApprovals} />
        <div className="border-t border-border p-3 text-[11px] text-muted">
          <Link href="/receive" className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-panel-2 hover:text-text"><Icons.ScanLine className="size-3.5" /> Mobile receiving</Link>
          <Link href="/supplier" className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-panel-2 hover:text-text"><Icons.Smartphone className="size-3.5" /> Supplier app preview</Link>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-border bg-panel">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <Logo />
              <button onClick={() => setOpen(false)} className="rounded p-2 text-muted" aria-label="Close menu"><Icons.X className="size-5" /></button>
            </div>
            <Sidebar nav={nav} pendingApprovals={pendingApprovals} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-bg/85 px-3 backdrop-blur sm:px-5">
          <button className="rounded-md p-2 text-muted hover:bg-panel-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Icons.Menu className="size-5" /></button>
          <div className="hidden items-center gap-2 md:flex">
            <span className="text-xs text-muted">Market night</span>
            <span className="text-xs font-semibold text-text">{fmtDate(marketDate)}</span>
          </div>
          {org.isDemo && <span className="rounded bg-surplus px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black" data-testid="demo-badge">Demo data</span>}
          <DemoClock offsetMs={clockOffsetMs} isDemo={org.isDemo} />
          <button onClick={() => setCmdOpen(true)} className="ml-auto flex h-9 min-w-0 items-center gap-2 rounded-md border border-border bg-panel px-3 text-left text-xs text-muted hover:border-border-strong sm:w-80" data-testid="command-trigger">
            <Icons.Sparkles className="size-3.5 shrink-0 text-accent" />
            <span className="hidden truncate sm:inline">Ask AI or search — “how much batang are we short?”</span>
            <span className="sm:hidden">Ask</span>
            <span className="ml-auto hidden sm:inline"><kbd className="num rounded border border-border px-1 text-[10px]">⌘K</kbd></span>
          </button>
          <Pop.Root onOpenChange={(o) => { if (!o && unread) void markNotificationsReadAction().then(() => router.refresh()); }}>
            <Pop.Trigger className="relative rounded-md p-2 text-muted hover:bg-panel-2 hover:text-text" aria-label="Notifications">
              <Icons.Bell className="size-4" />
              {unread > 0 && <span className="num absolute -right-0.5 -top-0.5 rounded-full bg-short px-1 text-[9px] font-bold text-white">{unread}</span>}
            </Pop.Trigger>
            <Pop.Portal>
              <Pop.Content align="end" sideOffset={8} className="z-50 w-[min(92vw,380px)] rounded-xl border border-border bg-panel shadow-2xl">
                <div className="border-b border-border px-4 py-2.5 text-xs font-semibold text-text">Notifications</div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 && <p className="p-4 text-xs text-muted">Nothing yet.</p>}
                  {notifications.map((n) => (
                    <Link key={n.id} href={n.href ?? "#"} className="block border-b border-border/60 px-4 py-2.5 last:border-0 hover:bg-panel-2">
                      <div className="flex items-center gap-2">
                        {n.unread && <span className="size-1.5 rounded-full bg-accent" />}
                        <span className="text-xs font-medium text-text">{n.title}</span>
                        <span className="num ml-auto text-[10px] text-muted">{fmtTime(n.at)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{n.body}</p>
                    </Link>
                  ))}
                </div>
              </Pop.Content>
            </Pop.Portal>
          </Pop.Root>
          <DM.Root>
            <DM.Trigger className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-panel-2" aria-label="Account menu" data-testid="user-menu">
              <span className="flex size-7 items-center justify-center rounded-full bg-panel-3 text-[11px] font-semibold text-text">{user.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</span>
              <span className="hidden text-left leading-tight xl:block">
                <span className="block text-xs font-medium text-text">{user.name}</span>
                <span className="block text-[10px] text-muted">{user.role}</span>
              </span>
            </DM.Trigger>
            <DM.Portal>
              <DM.Content align="end" sideOffset={8} className="z-50 w-64 rounded-xl border border-border bg-panel p-1.5 text-sm shadow-2xl">
                <div className="px-2.5 py-2">
                  <div className="text-xs font-medium text-text">{user.name}</div>
                  <div className="text-[11px] text-muted">{user.email}</div>
                </div>
                <DM.Separator className="my-1 h-px bg-border" />
                <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Organisation</div>
                {orgs.map((o) => (
                  <DM.Item key={o.id} onSelect={() => void switchOrgAction(o.id).then(() => { router.push("/dashboard"); router.refresh(); })} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs outline-none data-[highlighted]:bg-panel-2">
                    {o.id === org.id ? <Icons.Check className="size-3.5 text-accent" /> : <span className="size-3.5" />}
                    <span className="truncate">{o.name}</span>
                  </DM.Item>
                ))}
                <DM.Separator className="my-1 h-px bg-border" />
                <DM.Item onSelect={() => setTheme(theme === "dark" ? "light" : "dark")} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs outline-none data-[highlighted]:bg-panel-2">
                  {theme === "dark" ? <Icons.Sun className="size-3.5" /> : <Icons.Moon className="size-3.5" />} {theme === "dark" ? "Light mode" : "Dark mode"}
                </DM.Item>
                <DM.Item onSelect={async () => { await authClient.signOut(); router.replace("/login"); router.refresh(); }} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-short outline-none data-[highlighted]:bg-panel-2">
                  <Icons.LogOut className="size-3.5" /> Sign out
                </DM.Item>
              </DM.Content>
            </DM.Portal>
          </DM.Root>
        </header>
        <main className="mx-auto w-full max-w-[1500px] flex-1 px-3 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
      <CommandBar open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
