"use client";

import Link from "next/link";
import { useState } from "react";
import { CreditCard, Sparkles } from "lucide-react";
import { useViewer } from "@/lib/auth/viewer-context";
import { useT } from "@/lib/i18n/provider";
import { site } from "@/lib/config/site";
import { Button, buttonClass } from "@/components/ui/button";
import { apiJson } from "./api";

/** Opens the Stripe billing portal (POST /api/stripe/portal/). */
export function ManageBillingButton({ variant = "outline" }: { variant?: "outline" | "primary" }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    const res = await apiJson<{ url: string }>("/api/stripe/portal/", { method: "POST", body: {} });
    if (res.ok && res.data.url) {
      window.location.assign(res.data.url);
      return;
    }
    setBusy(false);
    setError(
      !res.ok && res.error === "billing_disabled"
        ? t("account.billing.disabled", "Payments aren't enabled on this deployment.")
        : !res.ok && res.error === "no_customer"
          ? t("account.billing.noCustomer", "There's no billing account to manage yet.")
          : t("common.error", "Something went wrong. Please try again."),
    );
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant={variant} onClick={open} disabled={busy}>
        <CreditCard className="size-4" aria-hidden />
        {busy ? t("account.billing.opening", "Opening…") : t("account.billing.manage", "Manage billing")}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-down">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Plan call-to-action on /plus/: starts Stripe Checkout for `interval`, or explains why it can't
 * (accounts / payments not configured, signed out, already subscribed).
 */
export function CheckoutButton({ interval, featured }: { interval: "month" | "year"; featured?: boolean }) {
  const t = useT();
  const { viewer, loading } = useViewer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; profileLink: boolean } | null>(null);
  const variant = featured ? "plus" : "outline";
  const trialLabel = site.plus.trialDays > 0 ? t("account.plus.startTrial", "Start {days}-day free trial", { days: site.plus.trialDays }) : t("account.plus.subscribe", "Subscribe");

  if (loading) return <span className={buttonClass(variant, "lg", "w-full opacity-60")} aria-hidden>{trialLabel}</span>;

  if (!viewer?.integrations.auth || !viewer.integrations.billing) {
    return (
      <Button type="button" variant={variant} size="lg" className="w-full" disabled aria-describedby="checkout-unavailable">
        {trialLabel}
      </Button>
    );
  }

  if (!viewer.signedIn) {
    return (
      <Link href={`/login/?mode=signup&next=${encodeURIComponent("/plus/")}`} className={buttonClass(variant, "lg", "w-full")}>
        {trialLabel}
      </Link>
    );
  }

  if (viewer.plan === "plus") {
    return (
      <Link href="/profile/" className={buttonClass("secondary", "lg", "w-full")}>
        <Sparkles className="size-4" aria-hidden />
        {t("account.plus.current", "You're on {plus}", { plus: site.plusName })}
      </Link>
    );
  }

  async function start() {
    setBusy(true);
    setError(null);
    const res = await apiJson<{ url: string }>("/api/stripe/checkout/", { method: "POST", body: { interval } });
    if (res.ok && res.data.url) {
      window.location.assign(res.data.url);
      return;
    }
    setBusy(false);
    if (!res.ok && res.error === "already_subscribed") setError({ text: t("account.plus.alreadySubscribed", "You already have a subscription. Manage it from your profile."), profileLink: true });
    else if (!res.ok && res.error === "interval_unavailable") setError({ text: t("account.plus.intervalUnavailable", "This plan isn't available right now."), profileLink: false });
    else if (!res.ok && res.status === 401) setError({ text: t("account.plus.signInAgain", "Your session has expired. Please sign in again."), profileLink: false });
    else setError({ text: t("common.error", "Something went wrong. Please try again."), profileLink: false });
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant={variant} size="lg" className="w-full" onClick={start} disabled={busy}>
        {busy ? t("account.plus.redirecting", "Opening secure checkout…") : trialLabel}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-down">
          {error.text}{" "}
          {error.profileLink ? (
            <Link href="/profile/" className="text-brand-700 hover:underline">
              {t("account.profile.title", "Your profile")}
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/** One line under the plan cards explaining why checkout is disabled, if it is. */
export function CheckoutAvailabilityNote() {
  const t = useT();
  const { viewer, loading } = useViewer();
  if (loading || !viewer) return null;
  let text: string | null = null;
  if (!viewer.integrations.auth) text = t("account.plus.noAccounts", "Accounts aren't enabled on this deployment, so subscriptions can't be started here.");
  else if (!viewer.integrations.billing) text = t("account.plus.noBilling", "Payments aren't enabled on this deployment yet, so checkout is switched off.");
  if (!text) return null;
  return (
    <p id="checkout-unavailable" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {text}
    </p>
  );
}
