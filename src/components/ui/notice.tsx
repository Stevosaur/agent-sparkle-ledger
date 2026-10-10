import type { ReactNode } from "react";
import { Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "warn"; title?: ReactNode; children: ReactNode; className?: string }) {
  const Icon = tone === "warn" ? TriangleAlert : Info;
  return (
    <div className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-sky-100 bg-sky-50 text-sky-900", className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title ? <div className="font-medium">{title}</div> : null}
        <div className={cn(title && "mt-0.5")}>{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action, className }: { title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-dashed border-line bg-surface px-6 py-10 text-center", className)}>
      <div className="font-medium text-ink">{title}</div>
      {children ? <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
