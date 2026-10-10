import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Stat({ label, value, sub, className, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string; tone?: "up" | "down" }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={cn("tabular mt-1 text-xl font-semibold text-ink", tone === "up" && "text-up", tone === "down" && "text-down")}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4", className)}>{children}</div>;
}
