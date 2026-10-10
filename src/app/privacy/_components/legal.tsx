import type { ReactNode } from "react";
import { T } from "@/components/i18n/t";
import { cn } from "@/lib/cn";
import { EnglishOnlyNote } from "./english-only-note";

/** Shared building blocks for the trust and legal pages (/about/, /privacy/, /tos/, /methodology/). */

/** Date the legal pages were last revised (update when the wording changes). */
export const LEGAL_LAST_UPDATED = "2026-10-10";

export function formatLegalDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function LastUpdated() {
  return (
    <p className="text-sm text-muted">
      <T k="trust.lastUpdated" fallback="Last updated {date}" vars={{ date: formatLegalDate(LEGAL_LAST_UPDATED) }} />
    </p>
  );
}

/**
 * A numbered or plain section of long-form text with an h2. The (translated) title follows the page language;
 * the body is English-only prose, so it is marked lang="en" for screen readers and hyphenation in 中文 mode.
 */
export function LegalSection({ id, title, children, className }: { id: string; title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-24", className)}>
      <h2 id={`${id}-title`} className="text-lg font-semibold text-ink sm:text-xl">
        {title}
      </h2>
      <div lang="en" className="mt-2 space-y-3 text-[15px] leading-7 text-ink/90 [&_a]:font-medium [&_a]:text-brand-700 [&_a:hover]:underline [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ul]:list-disc [&_ul]:space-y-1">
        {children}
      </div>
    </section>
  );
}

/** Long-form page body: readable measure, spaced sections, plus the "English version prevails" note for Chinese readers. */
export function LegalBody({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-3xl space-y-8 pb-8">
      <EnglishOnlyNote />
      {children}
    </div>
  );
}
