import Link from "next/link";
import { toolTiles } from "@/lib/config/site";
import { T } from "@/components/i18n/t";
import { Section } from "@/components/ui/section";
import { ToolIcon } from "./tool-icon";

/** The eight tool tiles (configured in src/lib/config/site.ts). */
export function ToolTiles() {
  return (
    <Section id="tools" title={<T k="home.tools.title" fallback="Tools" />} description={<T k="home.tools.desc" fallback="Free calculators and research built on the same records." />}>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {toolTiles.map((tile) => (
          <li key={tile.href}>
            <Link
              href={tile.href}
              className="flex h-full flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <ToolIcon name={tile.icon} className="size-5" />
              </span>
              <span className="text-sm font-semibold text-ink">
                <T k={tile.labelKey} fallback={tile.label} />
              </span>
              <span className="text-xs text-muted">
                <T k={tile.descKey} fallback={tile.desc} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
