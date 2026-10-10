import type { ReactNode } from "react";
import { T } from "@/components/i18n/t";
import { cn } from "@/lib/cn";

/** Short "Source: …" line under a data section. */
export function SourceLine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("mt-3 text-xs text-muted", className)}>
      <T k="common.source" fallback="Source" />: {children}
    </p>
  );
}
