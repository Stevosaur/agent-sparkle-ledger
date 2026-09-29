import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</div>}
        <h1 className="text-xl font-semibold tracking-tight text-text sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone, href, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "short" | "ok" | "surplus" | "late" | "spike" | "info" | "ai"; href?: string; className?: string }) {
  const color = tone ? { short: "text-short", ok: "text-ok", surplus: "text-surplus", late: "text-late", spike: "text-spike", info: "text-info", ai: "text-ai" }[tone] : "text-text";
  const inner = (
    <div className={cn("group rounded-xl border border-border bg-panel p-4 transition-colors", href && "hover:border-border-strong hover:bg-panel-2", className)}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={cn("num mt-1.5 break-words text-xl font-semibold sm:text-2xl xl:text-[26px]", color)}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function Empty({ title, children, className }: { title: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-dashed border-border px-6 py-10 text-center", className)}>
      <div className="text-sm font-medium text-text-2">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-md text-xs text-muted">{children}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="num rounded border border-border bg-panel-2 px-1.5 py-0.5 text-[10px] text-muted">{children}</kbd>;
}

export function Dl({ items, className }: { items: [React.ReactNode, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(110px,40%)_1fr] gap-x-3 gap-y-2 text-sm", className)}>
      {items.map(([k, v], i) => (
        <React.Fragment key={i}>
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words text-text">{v ?? "—"}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export function Bar({ value, max, tone = "accent", className }: { value: number; max: number; tone?: "accent" | "short" | "ok" | "surplus"; className?: string }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const c = { accent: "bg-accent", short: "bg-short", ok: "bg-ok", surplus: "bg-surplus" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-panel-3", className)}>
      <div className={cn("h-full rounded-full", c)} style={{ width: `${w}%` }} />
    </div>
  );
}

export function AiMark({ className }: { className?: string }) {
  return <span className={cn("inline-flex items-center rounded bg-accent-soft px-1 py-px text-[10px] font-bold uppercase tracking-wider text-ai", className)}>AI</span>;
}

export function Section({ title, children, action, className }: { title: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("mb-6", className)}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
