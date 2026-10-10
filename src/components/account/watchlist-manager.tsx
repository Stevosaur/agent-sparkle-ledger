"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bookmark, X } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import type { WatchlistItem, WatchlistResponse } from "@/lib/account/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Notice } from "@/components/ui/notice";
import { apiJson } from "./api";

function formatDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" });
}

/** The signed-in user's watchlist with remove buttons (GET / DELETE /api/watchlist/). */
export function WatchlistManager() {
  const t = useT();
  const [items, setItems] = useState<WatchlistItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyRef, setBusyRef] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiJson<WatchlistResponse>("/api/watchlist/").then((res) => {
      if (cancelled) return;
      if (res.ok) setItems(res.data.items);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function remove(ref: string) {
    setBusyRef(ref);
    const res = await apiJson<{ watching: boolean }>("/api/watchlist/", { method: "DELETE", body: { ref } });
    setBusyRef(null);
    if (res.ok) setItems((list) => (list ?? []).filter((i) => i.ref !== ref));
    else setError(res.error);
  }

  if (error && !items) {
    return <Notice tone="warn">{t("common.error", "Something went wrong. Please try again.")}</Notice>;
  }
  if (!items) return <div className="h-32 animate-pulse rounded-xl bg-surface" aria-busy="true" />;
  if (items.length === 0) {
    return (
      <EmptyState
        title={t("account.watchlist.emptyTitle", "Your watchlist is empty")}
        action={
          <Link href="/property-analysis/" className="text-sm font-medium text-brand-700 hover:underline">
            {t("account.watchlist.find", "Find a property")}
          </Link>
        }
      >
        {t("account.watchlist.emptyBody", "Tap \"Add to watchlist\" at the end of any property page to follow it here.")}
      </EmptyState>
    );
  }

  return (
    <Card>
      {error ? (
        <p role="alert" className="border-b border-line px-5 py-2 text-sm text-down">
          {t("common.error", "Something went wrong. Please try again.")}
        </p>
      ) : null}
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.ref} className="flex items-center gap-3 px-5 py-3">
            <Bookmark className="size-4 shrink-0 text-brand-700" aria-hidden />
            <div className="min-w-0 flex-1">
              {item.href ? (
                <Link href={item.href} className="block truncate font-medium text-ink hover:text-brand-700 hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span className="block truncate font-medium text-muted">
                  {item.label} · {t("account.watchlist.unavailable", "no longer listed")}
                </span>
              )}
              <span className="text-xs text-muted">{t("account.watchlist.added", "Added {date}", { date: formatDay(item.createdAt) })}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => remove(item.ref)}
              disabled={busyRef === item.ref}
              aria-label={t("account.watchlist.remove", "Remove {label} from watchlist", { label: item.label })}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
