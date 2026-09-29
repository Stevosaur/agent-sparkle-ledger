import Link from "next/link";
import { Logo } from "@/components/app/logo";

export function MobileHeader({ title, back, right, demo }: { title: string; back?: string; right?: React.ReactNode; demo?: boolean }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur">
      {back ? <Link href={back} className="text-sm text-accent">‹ Back</Link> : <Logo compact />}
      <h1 className="text-base font-semibold text-text">{title}</h1>
      {demo && <span className="rounded bg-surplus px-1.5 py-0.5 text-[9px] font-bold uppercase text-black">Demo</span>}
      <div className="ml-auto">{right}</div>
    </header>
  );
}
