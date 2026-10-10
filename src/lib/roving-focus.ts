/**
 * Keyboard navigation for roving-tabindex widgets (tablist, radiogroup): only one item is in the tab
 * order and the arrow keys move between items, wrapping at the ends and skipping disabled ones.
 */

export type RovingOptions = {
  /** also handle ArrowUp / ArrowDown (radio groups); a horizontal tablist only uses Left / Right */
  vertical?: boolean;
};

/** Index of the first enabled item scanning from `from` in direction `dir` (exclusive, wrapping), or null. */
function step(disabled: readonly boolean[], from: number, dir: 1 | -1): number | null {
  const n = disabled.length;
  for (let k = 1; k <= n; k++) {
    const i = (((from + dir * k) % n) + n) % n;
    if (!disabled[i]) return i;
  }
  return null;
}

/**
 * Index to move focus (and selection) to for `key`, or null when the key is not a navigation key or no
 * enabled item exists. `current` is the focused item's index (-1 when unknown).
 */
export function rovingTarget(key: string, current: number, disabled: readonly boolean[], opts: RovingOptions = {}): number | null {
  const n = disabled.length;
  if (n === 0) return null;
  const next = opts.vertical ? ["ArrowRight", "ArrowDown"] : ["ArrowRight"];
  const prev = opts.vertical ? ["ArrowLeft", "ArrowUp"] : ["ArrowLeft"];
  if (next.includes(key)) return step(disabled, current >= 0 && current < n ? current : -1, 1);
  if (prev.includes(key)) return step(disabled, current >= 0 && current < n ? current : n, -1);
  if (key === "Home") return step(disabled, -1, 1);
  if (key === "End") return step(disabled, n, -1);
  return null;
}

/** The item that carries tabIndex 0: the selected one when it is enabled, else the first enabled item. */
export function rovingTabStop(selected: number, disabled: readonly boolean[]): number {
  if (selected >= 0 && selected < disabled.length && !disabled[selected]) return selected;
  return step(disabled, -1, 1) ?? -1;
}
