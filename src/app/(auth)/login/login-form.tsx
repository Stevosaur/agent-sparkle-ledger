"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAuthClient } from "better-auth/react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

const authClient = createAuthClient();

const DEMO = [
  { email: "procurement@demo.pasarcatch.sg", role: "Procurement manager", who: "Lim Wei" },
  { email: "ops@demo.pasarcatch.sg", role: "Operations / receiving", who: "Nur Aisyah" },
  { email: "finance@demo.pasarcatch.sg", role: "Finance", who: "Priya Raman" },
  { email: "owner@demo.pasarcatch.sg", role: "Owner (all modules)", who: "Demo Owner" },
  { email: "supplier@demo.pasarcatch.sg", role: "Supplier app", who: "Ah Seng" },
];

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("procurement@demo.pasarcatch.sg");
  const [password, setPassword] = useState("pasarcatch-demo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e?: React.FormEvent, override?: string) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const who = override ?? email;
    const res = await authClient.signIn.email({ email: who, password });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? "Sign-in failed");
      return;
    }
    router.replace(next ?? (who.startsWith("supplier@") ? "/supplier" : "/dashboard"));
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <Field label="Email">
        <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="login-email" />
      </Field>
      <Field label="Password">
        <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="login-password" />
      </Field>
      {error && <p className="rounded-md border border-short/30 bg-short-soft px-3 py-2 text-xs text-short">{error}</p>}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy} data-testid="login-submit">
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      <div className="pt-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Demo accounts · password pasarcatch-demo</div>
        <div className="space-y-1.5">
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              onClick={() => {
                setEmail(d.email);
                void submit(undefined, d.email);
              }}
              className="flex w-full items-center justify-between rounded-md border border-border bg-panel px-3 py-2 text-left text-xs hover:border-border-strong hover:bg-panel-2"
            >
              <span className="text-text">{d.who}</span>
              <span className="text-muted">{d.role}</span>
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}
