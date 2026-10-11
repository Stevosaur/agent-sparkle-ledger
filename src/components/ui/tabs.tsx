"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { rovingTabStop, rovingTarget } from "@/lib/roving-focus";

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

/**
 * Accessible client-side tabs. All panels are rendered (hidden when inactive) so server content stays in the HTML.
 * Keyboard: Tab reaches the selected tab only; Left / Right / Home / End move between tabs and activate them.
 */
export function Tabs({ items, defaultTab, className }: { items: TabItem[]; defaultTab?: string; className?: string }) {
  const [active, setActive] = useState(defaultTab ?? items[0]?.id);
  const base = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const noneDisabled = items.map(() => false);
  const tabStop = rovingTabStop(
    items.findIndex((t) => t.id === active),
    noneDisabled,
  );

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = tabRefs.current.indexOf(e.target as HTMLButtonElement);
    const target = rovingTarget(e.key, current, noneDisabled);
    if (target == null) return;
    e.preventDefault();
    tabRefs.current[target]?.focus();
    setActive(items[target].id);
  }

  return (
    <div className={className}>
      <div role="tablist" onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto border-b border-line">
        {items.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`${base}-tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={i === tabStop ? 0 : -1}
            onClick={() => setActive(t.id)}
            className={cn(
              // inset focus ring: the scrolling tablist would clip an outer one
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500",
              active === t.id ? "border-brand-600 text-brand-800" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {items.map((t) => (
        <div key={t.id} role="tabpanel" id={`${base}-panel-${t.id}`} aria-labelledby={`${base}-tab-${t.id}`} hidden={active !== t.id} className="pt-4">
          {t.content}
        </div>
      ))}
    </div>
  );
}
