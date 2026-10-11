"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";

/**
 * Horizontal CSS scroll-snap carousel. Items are server-rendered children (each becomes a snap
 * point); previous/next buttons scroll by one viewport and disable themselves at either end.
 * Touch, trackpad and keyboard (tabbing through the links inside) all work without the buttons.
 */
export function ScrollCarousel({ items, label, labelKey, className }: { items: { key: string; node: ReactNode }[]; label: string; labelKey?: string; className?: string }) {
  const t = useT();
  const scroller = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft >= max - 4 });
    };
    // ResizeObserver fires once on observe, which also sets the initial state (and catches hidden tab panels becoming visible).
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, []);

  function scrollByPage(direction: 1 | -1) {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: reduce ? "auto" : "smooth" });
  }

  const showButtons = !(edges.start && edges.end);

  return (
    <div className={cn("relative", className)}>
      <ul ref={scroller} aria-label={labelKey ? t(labelKey, label) : label} className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:scroll-px-0 sm:px-0 [scrollbar-width:thin]">
        {items.map((item) => (
          <li key={item.key} className="w-[82%] shrink-0 snap-start sm:w-[calc(50%-0.375rem)] lg:w-[calc(33.333%-0.5rem)]">
            {item.node}
          </li>
        ))}
      </ul>
      {showButtons ? (
        <div className="mt-2 hidden justify-end gap-2 sm:flex">
          <button
            type="button"
            onClick={() => scrollByPage(-1)}
            disabled={edges.start}
            aria-label={t("home.launches.prev", "Previous launches")}
            className="flex size-9 items-center justify-center rounded-full border border-line bg-surface text-ink hover:bg-canvas disabled:opacity-40"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => scrollByPage(1)}
            disabled={edges.end}
            aria-label={t("home.launches.next", "More launches")}
            className="flex size-9 items-center justify-center rounded-full border border-line bg-surface text-ink hover:bg-canvas disabled:opacity-40"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}
