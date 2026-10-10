import Link from "next/link";
import { primaryNav, site } from "@/lib/config/site";
import { T } from "@/components/i18n/t";
import { LangToggle } from "@/components/i18n/lang-toggle";
import { SearchBox } from "@/components/search/search-box";
import { AccountButton } from "./account-button";
import { Logo } from "./logo";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label={`${site.name} home`}>
          <Logo />
        </Link>
        <div className="hidden min-w-0 flex-1 md:block md:max-w-md">
          <SearchBox />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <LangToggle />
          <AccountButton />
        </div>
      </div>
      <nav aria-label="Primary" className="mx-auto hidden max-w-6xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6 md:flex">
        {primaryNav.map((item) => (
          <Link key={item.href} href={item.href} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-canvas hover:text-ink">
            <T k={item.labelKey} fallback={item.label} />
          </Link>
        ))}
      </nav>
      <div className="px-4 pb-3 md:hidden">
        <SearchBox />
      </div>
    </header>
  );
}
