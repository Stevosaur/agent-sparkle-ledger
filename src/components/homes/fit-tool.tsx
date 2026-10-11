"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Link2, MapPin, X } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { EmptyState, Notice } from "@/components/ui/notice";
import { Badge } from "@/components/ui/badge";
import { SearchBox } from "@/components/search/search-box";
import { useT } from "@/lib/i18n/provider";
import { formatDistance, formatInt, formatPsf } from "@/lib/format";
import { FIT_MAX_PLACES, FIT_MAX_WEIGHT } from "@/lib/homes/constants";
import { fitQueryString, parseFitParams, placeRefFromSearch } from "@/lib/homes/fit";
import { formatAsking } from "@/lib/homes/format";
import type { FitResponse } from "@/lib/homes/types";
import type { SearchEntry, SearchKind } from "@/lib/data/types";

/** Search result kinds that can be a place (stable reference: SearchBox re-queries when `kinds` changes). */
const PLACE_KINDS: SearchKind[] = ["hdb", "condo", "landed", "landed-street", "launch", "town", "mrt"];
const WEIGHTS = Array.from({ length: FIT_MAX_WEIGHT }, (_, i) => i + 1);

/**
 * "Fit": up to three places with importance weights; ranks homes by weighted straight-line distance via
 * GET /api/homes/fit/. The URL (?p=...&w=...&t=...) holds the state so results can be shared.
 */
export function FitTool() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname() ?? "/homes/fit/";
  const sp = useSearchParams();
  const uid = useId();
  const places = parseFitParams(sp?.get("p"), sp?.get("w"));
  const typeParam = sp?.get("t");
  const listingType = typeParam === "sale" || typeParam === "rent" ? typeParam : null;
  const query = [fitQueryString(places), listingType ? `t=${listingType}` : ""].filter(Boolean).join("&");

  const [labels, setLabels] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ key: string; data: FitResponse | null; error: boolean }>({ key: "", data: null, error: false });
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const hasPlaces = places.length > 0;
  useEffect(() => {
    if (!hasPlaces) return;
    let cancelled = false;
    fetch(`/api/homes/fit/?${query}`)
      .then((r) => (r.ok ? (r.json() as Promise<FitResponse>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (!cancelled) setResult({ key: query, data, error: false });
      })
      .catch(() => {
        if (!cancelled) setResult({ key: query, data: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [query, hasPlaces]);

  const data = result.key === query ? result.data : null;
  const loading = hasPlaces && result.key !== query;
  const failed = result.key === query && result.error;

  function go(next: { ref: string; weight: number }[], type: "sale" | "rent" | null = listingType) {
    const qs = [fitQueryString(next), type ? `t=${type}` : ""].filter(Boolean).join("&");
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  function add(entry: SearchEntry) {
    const ref = placeRefFromSearch(entry);
    if (!ref) {
      setNotice(t("homes.fit.cannotUse", "That result cannot be used as a place. Try a block, condo, street, town or postal code."));
      return;
    }
    if (places.some((p) => p.ref === ref)) {
      setNotice(t("homes.fit.duplicate", "That place is already on your list."));
      return;
    }
    if (places.length >= FIT_MAX_PLACES) return;
    setNotice(null);
    setLabels((l) => ({ ...l, [ref]: entry.label }));
    go([...places, { ref, weight: 1 }]);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  const labelOf = (ref: string) => data?.places.find((p) => p.ref === ref)?.label ?? labels[ref] ?? ref;
  const unresolved = new Set(data?.unresolved ?? []);
  const resolvedPlaces = data?.places ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{t("homes.fit.placesTitle", "Your places")}</h2>
            <p className="mt-0.5 text-sm text-muted">
              {t("homes.fit.placesHint", "Add up to {max} places you travel to often, such as work, school or family, and how much each matters.", { max: FIT_MAX_PLACES })}
            </p>
          </div>
          {places.length > 0 ? (
            <ol className="space-y-2">
              {places.map((p, i) => (
                <li key={p.ref} className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800" aria-hidden>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="min-w-[9rem] flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{labelOf(p.ref)}</span>
                    {unresolved.has(p.ref) ? <span className="block text-xs text-down">{t("homes.fit.unresolved", "Location not found; this place is ignored.")}</span> : null}
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    <label htmlFor={`${uid}-w-${i}`} className="sr-only">
                      {t("homes.fit.importanceFor", "Importance of {place}", { place: labelOf(p.ref) })}
                    </label>
                    <Select id={`${uid}-w-${i}`} value={p.weight} onChange={(e) => go(places.map((q, j) => (j === i ? { ...q, weight: Number(e.target.value) } : q)))} className="w-auto">
                      {WEIGHTS.map((w) => (
                        <option key={w} value={w}>
                          {t("homes.fit.weight", "Importance {w}", { w })}
                        </option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      onClick={() => go(places.filter((_, j) => j !== i))}
                      className={buttonClass("ghost", "sm", "px-2")}
                      aria-label={t("homes.fit.remove", "Remove {place}", { place: labelOf(p.ref) })}
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
          {places.length < FIT_MAX_PLACES ? (
            <div className="space-y-1">
              <SearchBox
                kinds={PLACE_KINDS}
                placeholder={t("homes.fit.addPlaceholder", "Add a place: block, condo, street, town or postal code")}
                onSelect={add}
              />
              {notice ? (
                <p role="status" className="text-xs text-down">
                  {notice}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted">{t("homes.fit.max", "You have added the maximum of {max} places.", { max: FIT_MAX_PLACES })}</p>
          )}
          {places.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {data?.mode === "listings" ? (
                <>
                  <label htmlFor={`${uid}-type`} className="text-sm text-muted">
                    {t("homes.fit.show", "Show")}
                  </label>
                  <Select id={`${uid}-type`} value={listingType ?? ""} onChange={(e) => go(places, (e.target.value || null) as "sale" | "rent" | null)} className="w-auto">
                    <option value="">{t("homes.fit.allListings", "All listings")}</option>
                    <option value="sale">{t("homes.type.sale", "For sale")}</option>
                    <option value="rent">{t("homes.type.rent", "For rent")}</option>
                  </Select>
                </>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={copy}>
                <Link2 className="size-4" aria-hidden />
                {copied ? t("next.copied", "Link copied") : t("homes.fit.share", "Copy link to these results")}
              </Button>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <section aria-labelledby={`${uid}-results`} aria-busy={loading || undefined}>
        <h2 id={`${uid}-results`} className="mb-3 text-lg font-semibold text-ink">
          {t("homes.fit.resultsTitle", "Best fit")}
        </h2>
        {places.length === 0 ? (
          <EmptyState title={t("homes.fit.emptyTitle", "Add a place to start")}>{t("homes.fit.emptyBody", "Homes are ranked by their weighted straight-line distance to your places: the closer to the places that matter most, the higher they rank.")}</EmptyState>
        ) : loading ? (
          <p className="py-8 text-center text-sm text-muted">{t("common.loading", "Loading…")}</p>
        ) : failed || !data ? (
          <Notice tone="warn">{t("common.error", "Something went wrong. Please try again.")}</Notice>
        ) : resolvedPlaces.length === 0 ? (
          <Notice tone="warn">{t("homes.fit.noneResolved", "None of these places has a known location. Try another search result.")}</Notice>
        ) : (
          <div className="space-y-3">
            {data.mode === "properties" ? (
              <Notice>{t("homes.fit.propertiesMode", "No homes are listed right now, so this ranks HDB blocks and condos with at least one sale in the latest 12 months.")}</Notice>
            ) : null}
            {data.results.length === 0 ? (
              <EmptyState
                title={
                  data.mode === "listings" && listingType && data.candidates === 0
                    ? listingType === "rent"
                      ? t("homes.fit.noRentListings", "No homes for rent are listed right now")
                      : t("homes.fit.noSaleListings", "No homes for sale are listed right now")
                    : t("homes.fit.noResults", "No homes with a known location to rank")
                }
              />
            ) : (
              <ol className="space-y-2">
                {data.results.map((r, i) => (
                  <li key={r.id}>
                    <Card>
                      <CardBody className="flex gap-3">
                        <span className="tabular flex size-7 shrink-0 items-center justify-center rounded-full bg-canvas text-sm font-semibold text-ink">{i + 1}</span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={r.href} className="font-medium text-brand-700 hover:underline">
                              {r.label}
                            </Link>
                            {r.kind === "listing" && r.listingType ? <Badge tone={r.listingType === "sale" ? "brand" : "info"}>{r.listingType === "sale" ? t("homes.type.sale", "For sale") : t("homes.type.rent", "For rent")}</Badge> : null}
                            {r.sample ? <Badge tone="warn">{t("homes.sample", "Sample")}</Badge> : null}
                          </div>
                          {r.sub ? <p className="truncate text-xs text-muted">{r.sub}</p> : null}
                          <p className="text-sm text-ink">
                            {r.kind === "listing" && r.askingPrice != null && r.listingType
                              ? formatAsking(r.askingPrice, r.listingType)
                              : r.medianPsf12m != null
                                ? t("homes.fit.medianPsf", "Median {psf} over {n} sales in 12 months", { psf: formatPsf(r.medianPsf12m), n: formatInt(r.count12m ?? 0) })
                                : null}
                          </p>
                          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                            {r.distances.map((d, j) => (
                              <li key={j} className="flex items-center gap-1">
                                <MapPin className="size-3" aria-hidden />
                                {t("homes.fit.distanceTo", "{d} to {place}", { d: formatDistance(d), place: resolvedPlaces[j]?.label ?? String.fromCharCode(65 + j) })}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="tabular text-sm font-semibold text-ink">{formatDistance(r.score)}</div>
                          <div className="text-[11px] text-muted">{t("homes.fit.weighted", "weighted")}</div>
                        </div>
                      </CardBody>
                    </Card>
                  </li>
                ))}
              </ol>
            )}
            <p className="text-xs text-muted">
              {t("homes.fit.method", "Score = weighted average straight-line distance to your places (importance 1 to 5). Travel time by MRT or road can differ.")}{" "}
              {data.mode === "properties" ? `${t("common.source", "Source")}: ${t("homes.fit.source", "HDB resale flat prices, data.gov.sg; URA private residential transactions")}` : null}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
