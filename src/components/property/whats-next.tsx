"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, Columns2, Link2, Scale, Wrench } from "lucide-react";
import { formatPropertyRef, type PropertyRef } from "@/lib/property-ref";
import { useViewer } from "@/lib/auth/viewer-context";
import { useT } from "@/lib/i18n/provider";
import { buttonClass } from "@/components/ui/button";

/**
 * The "What's next" row at the end of every property page: watchlist, compare, supply & demand,
 * home services and copy link. Watchlist calls /api/watchlist (GET ?ref=, POST/DELETE {ref}).
 */
export function WhatsNext({ property, postal, label }: { property: PropertyRef; postal?: string | null; label: string }) {
  const t = useT();
  const router = useRouter();
  const { viewer } = useViewer();
  const [watching, setWatching] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const refId = formatPropertyRef(property);

  useEffect(() => {
    if (!viewer?.signedIn) return;
    let cancelled = false;
    fetch(`/api/watchlist/?ref=${encodeURIComponent(refId)}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { watching?: boolean } | null) => {
        if (!cancelled && body) setWatching(Boolean(body.watching));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [viewer?.signedIn, refId]);

  async function toggleWatch() {
    if (!viewer?.signedIn) {
      router.push(`/login/?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/watchlist/", {
        method: watching ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ref: refId, label }),
      });
      if (res.ok) setWatching(!watching);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href.split("#")[0]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <section aria-labelledby="whats-next" className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <h2 id="whats-next" className="mb-3 text-base font-semibold text-ink">
        {t("next.title")}
      </h2>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={toggleWatch} disabled={busy} className={buttonClass(watching ? "secondary" : "outline", "sm")}>
          {watching ? <BookmarkCheck className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
          {watching ? t("next.watching") : t("next.watch")}
        </button>
        <Link href={`/compare/?ids=${encodeURIComponent(refId)}`} className={buttonClass("outline", "sm")}>
          <Columns2 className="size-4" aria-hidden />
          {t("next.compare")}
        </Link>
        <Link href={`/supply-demand/${property.slug}/`} className={buttonClass("outline", "sm")}>
          <Scale className="size-4" aria-hidden />
          {t("next.supplyDemand")}
        </Link>
        <Link href={postal ? `/services/?postal=${postal}` : "/services/"} className={buttonClass("outline", "sm")}>
          <Wrench className="size-4" aria-hidden />
          {t("next.services")}
        </Link>
        <button type="button" onClick={copyLink} className={buttonClass("outline", "sm")}>
          <Link2 className="size-4" aria-hidden />
          {copied ? t("next.copied") : t("next.copyLink")}
        </button>
      </div>
    </section>
  );
}
