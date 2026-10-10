import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { T } from "@/components/i18n/t";

/** Small "Source: …" attribution under a data section. */
export function SourceLine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("mt-3 text-xs text-muted", className)}>
      <T k="common.source" fallback="Source" />: {children}
    </p>
  );
}
