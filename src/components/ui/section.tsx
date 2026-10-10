import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** A titled block on a page. `id` doubles as the in-page anchor. */
export function Section({ id, title, description, actions, children, className }: { id?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-24", className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-ink sm:text-xl">{title}</h2>
          {description ? <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <header className="pb-6 pt-6 sm:pt-10">
      {eyebrow ? <div className="mb-2 text-sm font-medium text-brand-700">{eyebrow}</div> : null}
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
      {description ? <p className="mt-2 max-w-3xl text-base text-muted">{description}</p> : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </header>
  );
}
