"use client";

import Link from "next/link";
import { CircleUserRound } from "lucide-react";
import { useViewer } from "@/lib/auth/viewer-context";
import { useT } from "@/lib/i18n/provider";
import { buttonClass } from "@/components/ui/button";
import { PlusBadge } from "@/components/gating/gated-panel";

export function AccountButton() {
  const { viewer, loading } = useViewer();
  const t = useT();
  if (loading) return <span className="inline-block h-9 w-20" aria-hidden />;
  if (!viewer?.integrations.auth) return null;
  if (!viewer.signedIn) {
    return (
      <Link href="/login/" className={buttonClass("primary", "sm")}>
        {t("nav.signIn")}
      </Link>
    );
  }
  return (
    <Link href="/profile/" className="inline-flex h-9 items-center gap-2 rounded-lg px-2 text-sm font-medium text-ink hover:bg-canvas">
      <CircleUserRound className="size-5" aria-hidden />
      <span className="hidden sm:inline">{t("nav.account")}</span>
      {viewer.plan === "plus" ? <PlusBadge /> : null}
    </Link>
  );
}
