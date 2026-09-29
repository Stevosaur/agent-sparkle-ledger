"use client";
import { ActionButton } from "@/components/app/action-button";
import { setDemoClockAction } from "@/app/actions";

export function ClockButtons() {
  return (
    <div className="flex flex-wrap gap-2">
      {["01:45", "02:30", "03:30", "04:15", "05:00", "05:30", "07:00"].map((t) => (
        <ActionButton key={t} size="sm" action={() => setDemoClockAction(t)} className="num">{t}</ActionButton>
      ))}
    </div>
  );
}
