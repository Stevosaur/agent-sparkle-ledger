"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUserRound, House, Map, ScanLine, Star } from "lucide-react";
import { bottomTabs } from "@/lib/config/site";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";

const ICONS = { "/": House, "/map/": Map, "/spot/": ScanLine, "/my-property/": Star, "/profile/": CircleUserRound } as const;

/** Mobile bottom tab bar (Home, Map, Spot, My Property, Profile). Hidden on md+ screens. */
export function BottomTabs() {
  const pathname = usePathname() ?? "/";
  const t = useT();
  return (
    <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {bottomTabs.map((tab) => {
          const Icon = ICONS[tab.href as keyof typeof ICONS] ?? House;
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link href={tab.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-brand-700" : "text-muted")} aria-current={active ? "page" : undefined}>
                <Icon className="size-5" aria-hidden />
                {t(tab.labelKey, tab.label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
