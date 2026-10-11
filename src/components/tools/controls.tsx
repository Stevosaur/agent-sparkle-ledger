"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { rovingTabStop, rovingTarget } from "@/lib/roving-focus";

/** Parse a user-typed number ("1,200,000", " 3.5 ") -> number, or null when empty / invalid. */
export function parseNum(raw: string): number | null {
  const s = raw.replace(/[,\s]/g, "").replace(/^S\$/i, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Number input with an optional prefix / suffix, kept as a string so partial input ("1.") is not lost. */
export function NumberField({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  min,
  max,
  step = "any",
  disabled,
  className,
}: {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  hint?: ReactNode;
  min?: number;
  max?: number;
  step?: number | "any";
  disabled?: boolean;
  className?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const n = parseNum(value);
  const invalid = value.trim() !== "" && (n == null || (min != null && n < min) || (max != null && n > max));
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div
        className={cn(
          "flex h-10 items-center rounded-lg border bg-surface px-3 text-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100",
          invalid ? "border-down" : "border-line",
          disabled && "opacity-60",
        )}
      >
        {prefix ? (
          <span className="mr-1.5 shrink-0 text-muted" aria-hidden>
            {prefix}
          </span>
        ) : null}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={hintId}
          onChange={(e) => onChange(e.target.value)}
          className="tabular h-full w-full min-w-0 bg-transparent text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {suffix ? (
          <span className="ml-1.5 shrink-0 text-muted" aria-hidden>
            {suffix}
          </span>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Radio-group styled as a segmented control. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  hideLabel,
}: {
  label: ReactNode;
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  onChange: (v: T) => void;
  className?: string;
  hideLabel?: boolean;
}) {
  const labelId = useId();
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const disabled = options.map((o) => !!o.disabled);
  // roving tabindex: Tab reaches the checked option only; arrow keys / Home / End move and select (like native radios)
  const tabStop = rovingTabStop(
    options.findIndex((o) => o.value === value),
    disabled,
  );

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = radioRefs.current.indexOf(e.target as HTMLButtonElement);
    const target = rovingTarget(e.key, current, disabled, { vertical: true });
    if (target == null) return;
    e.preventDefault();
    radioRefs.current[target]?.focus();
    if (options[target].value !== value) onChange(options[target].value);
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <div id={labelId} className={cn("text-sm font-medium text-ink", hideLabel && "sr-only")}>
        {label}
      </div>
      <div role="radiogroup" aria-labelledby={labelId} onKeyDown={onKeyDown} className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-line bg-canvas p-1">
        {options.map((o, i) => (
          <button
            key={o.value}
            ref={(el) => {
              radioRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={o.disabled}
            tabIndex={i === tabStop ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-8 rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-40",
              value === o.value ? "bg-surface text-brand-800 shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Debounce a value (e.g. a URL built from inputs) so typing does not fire a request per keystroke. */
export function useDebounced<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** A small "Source: …" line under data sections. */
export function SourceLine({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("mt-3 text-xs text-muted", className)}>{children}</p>;
}

/** Label / value row used in breakdown lists. */
export function BreakdownRow({ label, value, sub, strong }: { label: ReactNode; value: ReactNode; sub?: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/70 py-2 last:border-0">
      <dt className={cn("text-sm", strong ? "font-semibold text-ink" : "text-muted")}>
        {label}
        {sub ? <span className="block text-xs font-normal text-muted">{sub}</span> : null}
      </dt>
      <dd className={cn("tabular text-right text-sm", strong ? "font-semibold text-ink" : "text-ink")}>{value}</dd>
    </div>
  );
}
