"use client";

import { useId, useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email magic-link sign-in (and optional Google OAuth). Both return through /auth/callback/?next=. */
export function LoginForm({ next, mode, googleEnabled }: { next: string; mode: "signin" | "signup"; googleEnabled: boolean }) {
  const t = useT();
  const emailId = useId();
  const errorId = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  function callbackUrl(): string {
    const url = new URL("/auth/callback/", window.location.origin);
    url.searchParams.set("next", next);
    return url.toString();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setError(t("account.login.invalidEmail", "Enter a valid email address."));
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError(t("account.login.unavailable", "Sign-in isn't available on this deployment."));
      return;
    }
    setStatus("sending");
    setError(null);
    const { error: otpError } = await supabase.auth.signInWithOtp({ email: value, options: { emailRedirectTo: callbackUrl(), shouldCreateUser: true } });
    if (otpError) {
      setStatus("idle");
      setError(
        otpError.status === 429
          ? t("account.login.rateLimited", "Too many attempts. Please wait a minute and try again.")
          : t("account.login.sendFailed", "We couldn't send the sign-in link. Please check the address and try again."),
      );
      return;
    }
    setEmail(value);
    setStatus("sent");
  }

  async function signInWithGoogle() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError(t("account.login.unavailable", "Sign-in isn't available on this deployment."));
      return;
    }
    setStatus("sending");
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl() } });
    if (oauthError) {
      setStatus("idle");
      setError(t("account.login.googleFailed", "Google sign-in isn't available right now. Use your email instead."));
    }
  }

  if (status === "sent") {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-4 text-center">
        <MailCheck className="size-8 text-brand-700" aria-hidden />
        <h2 className="text-lg font-semibold text-ink">{t("account.login.sentTitle", "Check your inbox")}</h2>
        <p className="text-sm text-muted">
          {t("account.login.sentBody", "We sent a sign-in link to {email}. Open it in this browser to continue.", { email })}
        </p>
        <p className="text-xs text-muted">{t("account.login.sentHint", "No email after a few minutes? Check your spam folder or request a new link.")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => setStatus("idle")}>
          {t("account.login.tryAgain", "Use a different email or resend")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field
          htmlFor={emailId}
          label={t("account.login.emailLabel", "Email address")}
          hint={mode === "signup" ? t("account.login.signupHint", "We'll email you a link to create your free account. No password needed.") : t("account.login.signinHint", "We'll email you a one-time sign-in link. No password needed.")}
        >
          <Input
            id={emailId}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            placeholder="you@example.com"
          />
        </Field>
        {error ? (
          <p id={errorId} role="alert" className="text-sm text-down">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={status === "sending"}>
          {status === "sending"
            ? t("account.login.sending", "Sending…")
            : mode === "signup"
              ? t("account.login.submitSignup", "Email me a sign-up link")
              : t("account.login.submit", "Email me a sign-in link")}
        </Button>
      </form>
      {googleEnabled ? (
        <>
          <div className="flex items-center gap-3 text-xs text-muted" aria-hidden>
            <span className="h-px flex-1 bg-line" />
            {t("account.login.or", "or")}
            <span className="h-px flex-1 bg-line" />
          </div>
          <Button type="button" variant="outline" className="w-full" onClick={signInWithGoogle} disabled={status === "sending"}>
            {t("account.login.google", "Continue with Google")}
          </Button>
        </>
      ) : null}
    </div>
  );
}
