import { site } from "@/lib/config/site";

/** Wordmark: a plot-line glyph + name. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="inline-flex items-center gap-2">
        <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
          <rect width="32" height="32" rx="8" fill="#19625b" />
          <path d="M6 22 L12 15 L17 18 L26 8" stroke="#ffffff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="26" cy="8" r="2.4" fill="#f7b538" />
        </svg>
        <span className="text-lg font-bold tracking-tight text-ink">{site.name}</span>
      </span>
    </span>
  );
}
