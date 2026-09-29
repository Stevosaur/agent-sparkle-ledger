import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...p }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...p} />
    </div>
  );
}
export function THead({ className, ...p }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("sticky top-0 z-10 bg-panel", className)} {...p} />;
}
export function TH({ className, align, ...p }: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center" }) {
  return <th className={cn("border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted whitespace-nowrap", align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left", className)} {...p} />;
}
export function TR({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-border/70 last:border-0 hover:bg-panel-2/60", className)} {...p} />;
}
export function TD({ className, align, num, ...p }: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center"; num?: boolean }) {
  return <td className={cn("px-3 py-2 align-middle", align === "right" || num ? "text-right" : align === "center" ? "text-center" : "", num && "num", className)} {...p} />;
}
