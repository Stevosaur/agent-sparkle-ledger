import Link from "next/link";
import { ArrowRight, Gauge, Search, Wallet, type LucideIcon } from "lucide-react";
import { T } from "@/components/i18n/t";

const TASKS: { href: string; icon: LucideIcon; titleKey: string; title: string; descKey: string; desc: string }[] = [
  {
    href: "/valuation/",
    icon: Gauge,
    titleKey: "home.quick.value",
    title: "What is my home worth?",
    descKey: "home.quick.valueDesc",
    desc: "An estimate from comparable recorded sales nearby.",
  },
  {
    href: "/property-analysis/",
    icon: Search,
    titleKey: "home.quick.analyse",
    title: "Analyse a property",
    descKey: "home.quick.analyseDesc",
    desc: "Sales, rents, lease and location for any address.",
  },
  {
    href: "/affordability/",
    icon: Wallet,
    titleKey: "home.quick.afford",
    title: "What can I buy?",
    descKey: "home.quick.affordDesc",
    desc: "Turn a budget or income into the homes that fit.",
  },
];

/** The three quick tasks under the hero. */
export function QuickTasks() {
  return (
    <section aria-labelledby="home-quick-title">
      <h2 id="home-quick-title" className="sr-only">
        <T k="home.quick.title" fallback="Start with a question" />
      </h2>
      <ul className="grid gap-3 sm:grid-cols-3">
        {TASKS.map(({ href, icon: Icon, titleKey, title, descKey, desc }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex h-full items-start gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(15,29,27,0.04)] transition-colors hover:border-brand-300 hover:bg-brand-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 font-semibold text-ink">
                  <T k={titleKey} fallback={title} />
                  <ArrowRight className="size-4 shrink-0 text-brand-700 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
                <span className="mt-0.5 block text-sm text-muted">
                  <T k={descKey} fallback={desc} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
