"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { SearchBox } from "@/components/search/search-box";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";

/**
 * Search form for /property-analysis/. Choosing a suggestion in the combobox opens that property's
 * page; pressing Enter with no suggestion highlighted, or "Show all results", submits a GET form so
 * the page lists every grouped match for ?q=. The typed text is mirrored into a hidden `q` field via
 * the form's input event (SearchBox owns its own input).
 */
export function AnalysisSearch({ initialQuery }: { initialQuery: string }) {
  const t = useT();
  const [query, setQuery] = useState(initialQuery);

  return (
    <form
      role="search"
      action="/property-analysis/"
      method="get"
      aria-label={t("home.analysis.searchLabel", "Search properties")}
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      onInput={(e) => {
        const target = e.target as HTMLInputElement;
        if (target.type === "search") setQuery(target.value);
      }}
      onSubmit={(e) => {
        if (!query.trim()) e.preventDefault();
      }}
    >
      <input type="hidden" name="q" value={query} />
      <SearchBox size="lg" className="sm:flex-1" />
      <Button type="submit" size="lg" variant="primary" className="sm:w-auto">
        <Search className="size-4" aria-hidden />
        {t("home.analysis.submit", "Show all results")}
      </Button>
    </form>
  );
}
