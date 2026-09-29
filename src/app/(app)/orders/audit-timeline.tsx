import { Badge } from "@/components/ui/badge";
import { AiMark } from "@/components/ui/misc";
import { dateTime, titleCase } from "@/lib/format";
import type { timelineFor } from "@/lib/services/queries";

type Ev = Awaited<ReturnType<typeof timelineFor>>[number];

/** Vertical audit trail (newest first) shared by the order and purchase-order detail screens. */
export function AuditTimeline({ events }: { events: Ev[] }) {
  if (!events.length) return <p className="text-xs text-muted">No audit events recorded yet.</p>;
  return (
    <ol className="relative space-y-3 border-l border-border pl-4">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className={`absolute -left-[21px] top-1.5 size-2 rounded-full ${e.actorType === "AGENT" ? "bg-ai" : e.actorType === "USER" ? "bg-accent" : "bg-border-strong"}`} />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
            <span className="num">{dateTime(e.at)}</span>
            <Badge className="normal-case">{titleCase(e.action)}</Badge>
            <span className="flex items-center gap-1">{e.actorType === "AGENT" && <AiMark />}{e.actorLabel}</span>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-text">{e.summary}</p>
        </li>
      ))}
    </ol>
  );
}
