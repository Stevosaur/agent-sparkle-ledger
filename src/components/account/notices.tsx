import { Lock } from "lucide-react";
import { T } from "@/components/i18n/t";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/notice";

/** Honest state for deployments without Supabase: no sign-in, so account features are off. */
export function AccountsDisabled() {
  return (
    <EmptyState
      title={<T k="account.disabled.title" fallback="Accounts aren't enabled on this deployment" />}
      action={
        <ButtonLink href="/" variant="outline">
          <T k="account.disabled.cta" fallback="Back to property search" />
        </ButtonLink>
      }
    >
      <T
        k="account.disabled.body"
        fallback="This site is running without its user database, so sign-in, watchlists, tracked homes and alerts are switched off. Property pages, calculators and rankings work as normal."
      />
    </EmptyState>
  );
}

/** Sign-up / sign-in prompt for signed-out visitors on account pages. */
export function SignInPrompt({ next, titleKey, title, bodyKey, body }: { next: string; titleKey: string; title: string; bodyKey: string; body: string }) {
  const nextParam = encodeURIComponent(next);
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <Lock className="size-6 text-brand-700" aria-hidden />
      <h2 className="text-lg font-semibold text-ink">
        <T k={titleKey} fallback={title} />
      </h2>
      <p className="max-w-md text-sm text-muted">
        <T k={bodyKey} fallback={body} />
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <ButtonLink href={`/login/?mode=signup&next=${nextParam}`}>
          <T k="account.prompt.signup" fallback="Create free account" />
        </ButtonLink>
        <ButtonLink href={`/login/?next=${nextParam}`} variant="outline">
          <T k="account.prompt.signin" fallback="Sign in" />
        </ButtonLink>
      </div>
    </Card>
  );
}
