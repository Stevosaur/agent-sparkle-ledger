import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "brand" | "plus" | "up" | "down" | "warn" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-canvas text-muted border-line",
  brand: "bg-brand-50 text-brand-800 border-brand-100",
  plus: "bg-plus-50 text-plus-700 border-plus-100",
  up: "bg-green-50 text-up border-green-100",
  down: "bg-red-50 text-down border-red-100",
  warn: "bg-amber-50 text-amber-800 border-amber-200",
  info: "bg-sky-50 text-sky-800 border-sky-100",
};

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", tones[tone], className)} {...props} />;
}
