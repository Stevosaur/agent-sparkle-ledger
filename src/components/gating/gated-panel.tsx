"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { FEATURES, type FeatureKey } from "@/lib/auth/entitlements";
import { useFeature } from "@/lib/auth/viewer-context";
import { useT } from "@/lib/i18n/provider";
import { buttonClass } from "@/components/ui/button";
import { site } from "@/lib/config/site";
import { cn } from "@/lib/cn";
import { T } from "@/components/i18n/t";

/**
 * Shows `children` only to visitors entitled to `feature`; everyone else sees a sign-up / trial prompt.
 *
 * IMPORTANT: children must fetch their gated data themselves from a route handler protected with
 * requireFeature(). Never pass gated data from a server component into this panel — it would be in the
 * page payload for everyone.
 */
export function GatedPanel({ feature, children, teaser, className, minHeight = 160 }: { feature: FeatureKey; children: ReactNode; teaser?: ReactNode; className?: string; minHeight?: number }) {
  const { allowed, loading, viewer } = useFeature(feature);
  const t = useT();
  const pathname = usePathname();
  if (loading) return <div className={cn("animate-pulse rounded-xl bg-canvas", className)} style={{ minHeight }} role="status"><span className="sr-only"><T k="common.loading" fallback="Loading…" /></span></div>;
  if (allowed) return <>{children}</>;
  const level = FEATURES[feature];
  const needsAccount = level === "account" || !viewer?.signedIn;
  // The prompt only renders on the client (viewer state loads after hydration), so the full URL including
  // the query string is available here and the visitor returns to exactly this page after signing in.
  const next = encodeURIComponent(typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : (pathname ?? "/"));
  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-line bg-surface", className)} style={{ minHeight }}>
      {teaser ? <div className="pointer-events-none select-none opacity-40 blur-[3px]" aria-hidden>{teaser}</div> : null}
      <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-8 text-center", teaser && "absolute inset-0 bg-surface/70")}>
        {needsAccount && level === "account" ? <Lock className="size-6 text-brand-700" aria-hidden /> : <Sparkles className="size-6 text-plus-500" aria-hidden />}
        <div className="font-semibold text-ink">{needsAccount && level === "account" ? t("gate.signupTitle") : t("gate.plusTitle")}</div>
        <p className="max-w-md text-sm text-muted">{needsAccount && level === "account" ? t("gate.signupBody") : t("gate.plusBody")}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {level === "plus" ? (
            <Link href={viewer?.signedIn ? "/plus/" : `/login/?next=${encodeURIComponent("/plus/")}`} className={buttonClass("plus")}>
              {t("gate.plusCta", "Start free trial")}
              {site.plus.trialDays > 0 ? ` · ${t("gate.trialDays", "{n} days", { n: site.plus.trialDays })}` : null}
            </Link>
          ) : (
            <Link href={`/login/?mode=signup&next=${next}`} className={buttonClass("primary")}>
              {t("gate.signupCta")}
            </Link>
          )}
        </div>
        {!viewer?.signedIn ? (
          <Link href={`/login/?next=${next}`} className="text-sm text-brand-700 hover:underline">
            {t("gate.signIn")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** Small "Plus" pill to mark gated controls. */
export function PlusBadge({ className }: { className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full bg-plus-50 px-2 py-0.5 text-xs font-semibold text-plus-700", className)}>{site.plusName}</span>;
}
