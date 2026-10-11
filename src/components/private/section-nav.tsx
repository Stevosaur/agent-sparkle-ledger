import { T } from "@/components/i18n/t";

export interface SectionLink {
  id: string;
  k: string;
  fallback: string;
}

/** Horizontal "On this page" jump links (scrolls sideways on small screens). */
export function SectionNav({ links }: { links: SectionLink[] }) {
  return (
    <nav aria-label="On this page" className="sticky top-16 z-30 -mx-4 mb-6 border-y border-line bg-canvas/95 px-4 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-2">
      <ul className="flex gap-1 overflow-x-auto py-2 text-sm">
        {links.map((l) => (
          <li key={l.id} className="shrink-0">
            <a href={`#${l.id}`} className="inline-block rounded-lg px-2.5 py-1 text-muted hover:bg-surface hover:text-ink">
              <T k={l.k} fallback={l.fallback} />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
