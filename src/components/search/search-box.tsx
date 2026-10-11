"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Building, Building2, Home, MapPin, Search, Sparkles, TrainFront } from "lucide-react";
import type { SearchEntry, SearchKind } from "@/lib/data/types";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";

const ICONS: Record<SearchKind, typeof Search> = {
  hdb: Building,
  condo: Building2,
  landed: Home,
  "landed-street": MapPin,
  launch: Sparkles,
  town: MapPin,
  mrt: TrainFront,
};

/**
 * Property search combobox backed by /api/search/. Enter opens the highlighted result.
 * `onSelect` overrides navigation (e.g. compare and valuation pickers).
 */
export function SearchBox({
  size = "md",
  placeholder,
  kinds,
  autoFocus,
  onSelect,
  className,
  name,
  defaultValue,
}: {
  size?: "md" | "lg";
  placeholder?: string;
  kinds?: SearchKind[];
  autoFocus?: boolean;
  onSelect?: (entry: SearchEntry) => void;
  className?: string;
  /** form field name, so the box can submit a GET form (e.g. /property-analysis/?q=) */
  name?: string;
  /** initial text, e.g. the current ?q= */
  defaultValue?: string;
}) {
  const t = useT();
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState(defaultValue ?? "");
  // only fetch suggestions once the user has typed (not for a prefilled defaultValue)
  const [dirty, setDirty] = useState(false);
  const [results, setResults] = useState<SearchEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 || !dirty) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ q: term, limit: "8" });
      if (kinds?.length) params.set("kinds", kinds.join(","));
      fetch(`/api/search/?${params}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((body: { results: SearchEntry[] }) => {
          setResults(body.results ?? []);
          setActive(0);
          setOpen(true);
        })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 150);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [q, kinds, dirty]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const visible = q.trim().length >= 2 ? results : [];
  const popupOpen = open && q.trim().length >= 2;
  const listOpen = popupOpen && visible.length > 0;
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const activeId = listOpen && visible[active] ? optionId(active) : undefined;

  /** Keyboard highlight: also keeps the option in view (hover highlights without scrolling the list under the pointer). */
  function highlight(i: number) {
    setActive(i);
    document.getElementById(optionId(i))?.scrollIntoView?.({ block: "nearest" });
  }

  function choose(entry: SearchEntry) {
    setOpen(false);
    if (onSelect) {
      onSelect(entry);
      setQ("");
    } else router.push(entry.href);
  }

  return (
    <div ref={boxRef} className={cn("relative w-full", className)}>
      <div className={cn("flex items-center gap-2 rounded-xl border border-line bg-surface px-3 shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100", size === "lg" ? "h-14" : "h-10")}>
        <Search className={cn("shrink-0 text-muted", size === "lg" ? "size-5" : "size-4")} aria-hidden />
        <input
          type="search"
          name={name}
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-label={placeholder ?? t("search.placeholder")}
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setDirty(true);
          }}
          onFocus={() => visible.length > 0 && setOpen(true)}
          // options are not focusable (they preventDefault on mousedown), so leaving the input means leaving the widget
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (!open) {
                // reopening starts at the first option (the list remounts scrolled to the top)
                if (visible.length) {
                  setActive(0);
                  setOpen(true);
                }
              } else highlight(Math.max(0, Math.min(active + 1, visible.length - 1)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              highlight(Math.max(Math.min(active, visible.length) - 1, 0));
            } else if (e.key === "Enter" && open && visible[active]) {
              e.preventDefault();
              choose(visible[active]);
            } else if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder ?? t("search.placeholder")}
          className={cn("h-full w-full min-w-0 bg-transparent text-ink outline-none placeholder:text-muted", size === "lg" ? "text-base" : "text-sm")}
        />
        {loading ? <span className="text-xs text-muted">{t("search.searching")}</span> : null}
      </div>
      {listOpen ? (
        // mousedown would move focus off the input (closing the list via onBlur) before the click lands
        <ul
          id={listId}
          role="listbox"
          aria-label={placeholder ?? t("search.placeholder")}
          onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-lg"
        >
          {visible.map((r, i) => {
            const Icon = ICONS[r.kind] ?? Search;
            return (
              <li
                key={r.href}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(r)}
                className={cn("flex w-full cursor-pointer items-start gap-3 px-4 py-2 text-left", i === active ? "bg-brand-50" : "hover:bg-canvas")}
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{r.label}</span>
                  <span className="block truncate text-xs text-muted">{r.sub}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : popupOpen && !loading ? (
        <p role="status" className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted shadow-lg">{t("search.noResults")}</p>
      ) : null}
    </div>
  );
}
