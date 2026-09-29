import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/auth/session";
import { LoginForm } from "./login-form";
import { Logo } from "@/components/app/logo";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  if (await getAppContext()) redirect(sp.next ?? "/dashboard");
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden border-r border-border bg-panel lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Logo />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Jurong Fishery Port · 01:30</p>
          <h1 className="mt-3 max-w-lg text-4xl font-semibold leading-tight tracking-tight text-text">The AI supply operating system for Singapore&apos;s seafood trade.</h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
            Messy WhatsApp catch declarations become structured lots. Supply meets demand, the AI recommends, a human approves, the system executes — and every kilogram stays traceable from vessel to invoice.
          </p>
          <div className="mt-8 grid max-w-md grid-cols-3 gap-3">
            {[
              ["Structured", "data"],
              ["Approved", "decisions"],
              ["Traced", "lots"],
            ].map(([a, b]) => (
              <div key={a} className="rounded-lg border border-border bg-panel-2 p-3">
                <div className="text-sm font-semibold text-text">{a}</div>
                <div className="text-xs text-muted">{b}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted">Demo workspace contains fictional data only.</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h2 className="text-xl font-semibold text-text">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Use a demo account below, or your own credentials.</p>
          <LoginForm next={sp.next} />
        </div>
      </section>
    </main>
  );
}
