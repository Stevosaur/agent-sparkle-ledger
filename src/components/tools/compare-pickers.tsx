"use client";

import { useRouter } from "next/navigation";
import { SearchBox } from "@/components/search/search-box";
import { useT } from "@/lib/i18n/provider";
import { formatPropertyRef } from "@/lib/property-ref";
import { refFromHref } from "@/lib/tools/refs";
import type { SearchEntry, SearchKind } from "@/lib/data/types";

/** Stable identity: SearchBox refetches whenever the kinds array changes. */
const PROPERTY_KINDS: SearchKind[] = ["hdb", "condo", "landed", "landed-street", "launch"];
export const MAX_COMPARE = 4;

/** Adds a property to /compare/?ids= (max 4). */
export function ComparePicker({ ids }: { ids: string[] }) {
  const t = useT();
  const router = useRouter();
  const full = ids.length >= MAX_COMPARE;

  function add(entry: SearchEntry) {
    const ref = refFromHref(entry.href);
    if (!ref) return;
    const id = formatPropertyRef(ref);
    const next = ids.includes(id) ? ids : [...ids, id].slice(0, MAX_COMPARE);
    router.push(`/compare/?ids=${encodeURIComponent(next.join(","))}`, { scroll: false });
  }

  if (full) return <p className="text-sm text-muted">{t("tools.cmp.full", "You are comparing the maximum of {n} properties. Remove one to add another.", { n: MAX_COMPARE })}</p>;
  return (
    <div className="max-w-xl">
      <SearchBox kinds={PROPERTY_KINDS} onSelect={add} placeholder={t("tools.cmp.addPlaceholder", "Add an HDB block, condo, landed home or new launch")} />
    </div>
  );
}

/** Picks property A or B on /compare-units/. */
export function UnitsPicker({ slot, a, b }: { slot: "a" | "b"; a: string | null; b: string | null }) {
  const t = useT();
  const router = useRouter();
  function choose(entry: SearchEntry) {
    const ref = refFromHref(entry.href);
    if (!ref) return;
    const id = formatPropertyRef(ref);
    const params = new URLSearchParams();
    const nextA = slot === "a" ? id : a;
    const nextB = slot === "b" ? id : b;
    if (nextA) params.set("a", nextA);
    if (nextB) params.set("b", nextB);
    router.push(`/compare-units/?${params.toString()}`, { scroll: false });
  }
  return (
    <SearchBox
      kinds={PROPERTY_KINDS}
      onSelect={choose}
      placeholder={slot === "a" ? t("tools.cmp.pickA", "Choose the first property") : t("tools.cmp.pickB", "Choose the second property")}
    />
  );
}
