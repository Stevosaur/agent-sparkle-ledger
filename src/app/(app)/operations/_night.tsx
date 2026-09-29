import Link from "next/link";
import { addDays } from "@/lib/domain/time";
import { date } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Resolve `?night=YYYY-MM-DD` (never in the future); defaults to tonight's market. */
export function resolveNight(param: string | undefined, tonight: string) {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param) && !Number.isNaN(Date.parse(param)) && param <= tonight) return param;
  return tonight;
}

/** Tonight / last night / other recent nights switcher for operations screens. */
export function NightPicker({ path, night, tonight, extra = [] }: { path: string; night: string; tonight: string; extra?: { date: string; runs?: number }[] }) {
  const last = addDays(tonight, -1);
  const opts = [
    { date: tonight, label: "Tonight" },
    { date: last, label: "Last night" },
    ...extra.filter((e) => e.date !== tonight && e.date !== last).slice(0, 2).map((e) => ({ date: e.date, label: date(e.date) })),
  ];
  if (!opts.some((o) => o.date === night)) opts.push({ date: night, label: date(night) });
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-border bg-panel p-0.5 text-xs" role="tablist" aria-label="Market night">
      {opts.map((o) => (
        <Link
          key={o.date}
          href={o.date === tonight ? path : `${path}?night=${o.date}`}
          role="tab"
          aria-selected={o.date === night}
          className={cn("rounded-md px-3 py-1.5", o.date === night ? "bg-panel-3 text-text" : "text-muted hover:text-text")}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

export function PastNightNote({ night, path }: { night: string; path: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-info/30 bg-info-soft px-3 py-2 text-xs text-info">
      Viewing the market night of <span className="font-semibold">{date(night)}</span> (history).
      <Link href={path} className="ml-auto font-semibold underline-offset-2 hover:underline">Back to tonight →</Link>
    </div>
  );
}
