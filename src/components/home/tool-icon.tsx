import { Columns2, Gauge, LineChart, Map, Percent, Search, Trophy, Wallet, Wrench, type LucideIcon } from "lucide-react";

/** Icons for the home-page tool tiles, keyed by the `icon` name in `toolTiles` (src/lib/config/site.ts). */
export const TOOL_ICONS: Record<string, LucideIcon> = {
  Gauge,
  Search,
  Wallet,
  Percent,
  Trophy,
  Columns2,
  Map,
  LineChart,
};

/** Decorative tool icon by name; unknown names fall back to a generic tool icon so a config typo never breaks the page. */
export function ToolIcon({ name, className }: { name: string; className?: string }) {
  const Icon = TOOL_ICONS[name] ?? Wrench;
  return <Icon className={className} aria-hidden />;
}
