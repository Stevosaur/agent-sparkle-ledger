import { Bot, Cog, Plug, User } from "lucide-react";
import type { auditEvent } from "@/lib/db/schema";
import { dateTime, time } from "@/lib/format";

/** Activity timeline: what happened, when, who (human vs AI), source and before/after. */
export function Timeline({ events, showDate }: { events: (typeof auditEvent.$inferSelect)[]; showDate?: boolean }) {
  if (!events.length) return <p className="text-xs text-muted">No activity recorded yet.</p>;
  return (
    <ol className="relative space-y-3 border-l border-border pl-5" data-testid="timeline">
      {events.map((e) => {
        const Icon = e.actorType === "AGENT" ? Bot : e.actorType === "USER" ? User : e.actorType === "INTEGRATION" ? Plug : Cog;
        const tone = e.actorType === "AGENT" ? "text-ai bg-accent-soft" : e.actorType === "USER" ? "text-text bg-panel-3" : "text-muted bg-panel-2";
        const diff = e.before && e.after ? Object.keys(e.after).filter((k) => JSON.stringify((e.before as Record<string, unknown>)[k]) !== JSON.stringify((e.after as Record<string, unknown>)[k])) : [];
        return (
          <li key={e.id} className="relative">
            <span className={`absolute -left-[31px] flex size-5 items-center justify-center rounded-full ${tone}`}><Icon className="size-3" /></span>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="num text-xs font-semibold text-text">{showDate ? dateTime(e.at) : time(e.at)}</span>
              <span className={`text-xs font-medium ${e.actorType === "AGENT" ? "text-ai" : "text-text-2"}`}>{e.actorLabel}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted">{e.actorType === "AGENT" ? "AI" : e.actorType === "USER" ? "Human" : e.actorType.toLowerCase()} · {e.source.toLowerCase()}</span>
            </div>
            <p className="mt-0.5 text-sm text-text-2">{e.summary}</p>
            {diff.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {diff.slice(0, 4).map((k) => (
                  <span key={k} className="num rounded border border-border bg-panel-2 px-1.5 py-0.5 text-[10px] text-muted">
                    {k}: <span className="text-short line-through">{fmt((e.before as Record<string, unknown>)[k])}</span> → <span className="text-ok">{fmt((e.after as Record<string, unknown>)[k])}</span>
                  </span>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function fmt(v: unknown) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return time(v);
  if (typeof v === "string" && /^-?\d+\.\d+$/.test(v)) return String(Number(v));
  return typeof v === "object" ? JSON.stringify(v).slice(0, 40) : String(v);
}
