"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Bookmark, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { useViewer } from "@/lib/auth/viewer-context";
import { useT } from "@/lib/i18n/provider";
import { formatSgdCompact } from "@/lib/format";
import type { AffordabilityInput, AffordabilityResult } from "@/lib/calc/affordability";

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

/**
 * Save an affordability calculation to the signed-in user's account (POST /api/affordability/save/).
 * Accounts must be connected (Supabase); otherwise the control says saving is unavailable.
 */
export function SaveCalculation({ input, result }: { input: AffordabilityInput; result: AffordabilityResult }) {
  const t = useT();
  const pathname = usePathname();
  const { viewer, loading } = useViewer();
  const [label, setLabel] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const defaultLabel = t("tools.aff.saveDefaultLabel", "Budget up to {price}", { price: formatSgdCompact(result.maxPrice) });

  if (loading) return null;
  if (!viewer?.integrations.auth) {
    return <p className="text-xs text-muted">{t("tools.aff.saveUnavailable", "Saving calculations is unavailable on this deployment because accounts are not connected.")}</p>;
  }
  if (!viewer.signedIn) {
    return (
      <p className="text-sm text-muted">
        <Link href={`/login/?next=${encodeURIComponent(pathname ?? "/affordability/")}`} className="font-medium text-brand-700 hover:underline">
          {t("tools.aff.saveSignIn", "Sign in to save this calculation")}
        </Link>
      </p>
    );
  }

  async function save() {
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/affordability/save/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ label: (label.trim() || defaultLabel).slice(0, 100), input, result }),
      });
      if (res.ok) setStatus({ kind: "saved" });
      else {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setStatus({ kind: "error", message: body?.message ?? t("common.error", "Something went wrong. Please try again.") });
      }
    } catch {
      setStatus({ kind: "error", message: t("common.error", "Something went wrong. Please try again.") });
    }
  }

  return (
    <div className="space-y-2 rounded-lg bg-canvas p-3">
      <label htmlFor="aff-save-label" className="block text-sm font-medium text-ink">
        {t("tools.aff.saveLabel", "Save this calculation")}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id="aff-save-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={defaultLabel} maxLength={100} />
        <Button type="button" variant="secondary" onClick={save} disabled={status.kind === "saving" || result.maxPrice <= 0}>
          {status.kind === "saved" ? <Check className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
          {status.kind === "saved" ? t("tools.aff.saved", "Saved") : t("tools.aff.save", "Save")}
        </Button>
      </div>
      <p aria-live="polite" className="text-xs text-muted">
        {status.kind === "saved" ? t("tools.aff.savedNote", "Saved to your account.") : status.kind === "error" ? status.message : null}
      </p>
    </div>
  );
}
