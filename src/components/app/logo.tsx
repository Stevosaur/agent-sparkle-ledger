export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-accent" />
        <path d="M6 18c3.5-5 8-7 13-6 2 .4 4 1.5 5.5 3L27 12v10l-2.5-3c-1.5 1.5-3.5 2.6-5.5 3-5 1-9.5-1-13-4z" className="fill-accent-fg" />
        <circle cx="19.5" cy="16" r="1.2" className="fill-accent" />
      </svg>
      {!compact && (
        <div className="leading-none">
          <div className="text-[15px] font-semibold tracking-tight text-text">PasarCatch <span className="text-accent">AI</span></div>
        </div>
      )}
    </div>
  );
}
