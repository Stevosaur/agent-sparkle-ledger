"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Plus, SlidersHorizontal } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, Notice } from "@/components/ui/notice";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";
import { BEDROOM_OPTIONS, filtersToSearchParams, isUnfiltered, parseListingFilters } from "@/lib/homes/filters";
import { KIND_LABEL, TYPE_LABEL } from "@/lib/homes/format";
import { LISTING_KINDS, LISTING_TYPES, type AreaOption, type ListingFilters, type ListingsBackend, type ListingsPage, type ListingSummary } from "@/lib/homes/types";
import { ListingGrid } from "./listing-card";

export interface HomesBrowserProps {
  initial: { sale: ListingsPage; rent: ListingsPage };
  areas: AreaOption[];
  backend: ListingsBackend;
  unavailable: boolean;
}

function apiUrl(qs: string, offset = 0): string {
  const p = new URLSearchParams(qs);
  if (offset > 0) p.set("offset", String(offset));
  const s = p.toString();
  return `/api/homes/${s ? `?${s}` : ""}`;
}

/**
 * Sale / rent tabs, filters and results for /homes/. The URL is the source of truth (shareable); the
 * unfiltered first page of each tab comes from the server render, filtered views from GET /api/homes/.
 */
export function HomesBrowser({ initial, areas, backend, unavailable }: HomesBrowserProps) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname() ?? "/homes/";
  const searchParams = useSearchParams();
  const uid = useId();
  const filters = parseListingFilters(new URLSearchParams(searchParams?.toString() ?? ""));
  const qs = filtersToSearchParams(filters).toString();
  const fromServer = isUnfiltered(filters);

  const [remote, setRemote] = useState<{ key: string; page: ListingsPage | null; error: boolean }>({ key: "", page: null, error: false });
  const [more, setMore] = useState<{ key: string; listings: ListingSummary[] }>({ key: "", listings: [] });
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (fromServer) return;
    let cancelled = false;
    fetch(apiUrl(qs))
      .then((r) => (r.ok ? (r.json() as Promise<ListingsPage>) : Promise.reject(new Error(String(r.status)))))
      .then((page) => {
        if (!cancelled) setRemote({ key: qs, page, error: false });
      })
      .catch(() => {
        if (!cancelled) setRemote({ key: qs, page: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [qs, fromServer]);

  const base: ListingsPage | null = fromServer ? initial[filters.type] : remote.key === qs ? remote.page : null;
  const loading = !fromServer && remote.key !== qs;
  const failed = !fromServer && remote.key === qs && remote.error;
  const listings = base ? [...base.listings, ...(more.key === qs ? more.listings : [])] : [];
  const total = base?.total ?? 0;

  function navigate(next: ListingFilters) {
    const s = filtersToSearchParams(next).toString();
    router.replace(`${pathname}${s ? `?${s}` : ""}`, { scroll: false });
  }

  function onPriceSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const merged = parseListingFilters(
      new URLSearchParams({ ...Object.fromEntries(filtersToSearchParams(filters)), min: String(fd.get("min") ?? ""), max: String(fd.get("max") ?? "") }),
    );
    navigate(merged);
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await fetch(apiUrl(qs, listings.length));
      if (res.ok) {
        const page = (await res.json()) as ListingsPage;
        setMore((m) => ({ key: qs, listings: [...(m.key === qs ? m.listings : []), ...page.listings] }));
      }
    } finally {
      setLoadingMore(false);
    }
  }

  const priceLabel = filters.type === "rent" ? t("homes.filter.rentRange", "Monthly rent (S$)") : t("homes.filter.price", "Price range (S$)");
  const tabHref = (type: (typeof LISTING_TYPES)[number]) => (type === "sale" ? "/homes/" : "/homes/?type=rent");
  const filtered = !isUnfiltered(filters);

  return (
    <div className="space-y-5">
      <nav aria-label={t("homes.tabsLabel", "Listing type")} className="flex gap-1 border-b border-line">
        {LISTING_TYPES.map((type) => (
          <Link
            key={type}
            href={tabHref(type)}
            scroll={false}
            aria-current={filters.type === type ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              filters.type === type ? "border-brand-600 text-brand-800" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t(TYPE_LABEL[type][0], TYPE_LABEL[type][1])}
            <span className="ml-1 text-xs text-muted">({initial[type].total})</span>
          </Link>
        ))}
      </nav>

      {backend !== "none" && !unavailable ? (
        <section aria-labelledby={`${uid}-filters`} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <h2 id={`${uid}-filters`} className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <SlidersHorizontal className="size-4" aria-hidden />
            {t("homes.filters", "Filters")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-kind`} className="block text-xs font-medium text-muted">
                {t("homes.filter.kind", "Property type")}
              </label>
              <Select id={`${uid}-kind`} value={filters.kind ?? ""} onChange={(e) => navigate({ ...filters, kind: (e.target.value || null) as ListingFilters["kind"] })}>
                <option value="">{t("homes.filter.any", "Any")}</option>
                {LISTING_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(KIND_LABEL[k][0], KIND_LABEL[k][1])}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-area`} className="block text-xs font-medium text-muted">
                {t("homes.filter.area", "Area / town")}
              </label>
              <Select id={`${uid}-area`} value={filters.area ?? ""} onChange={(e) => navigate({ ...filters, area: e.target.value || null })} disabled={areas.length === 0}>
                <option value="">{t("homes.filter.anyArea", "All areas")}</option>
                {areas.some((a) => a.group === "town") ? (
                  <optgroup label={t("homes.filter.towns", "HDB towns")}>
                    {areas
                      .filter((a) => a.group === "town")
                      .map((a) => (
                        <option key={a.key} value={a.key}>
                          {a.label}
                        </option>
                      ))}
                  </optgroup>
                ) : null}
                {areas.some((a) => a.group === "district") ? (
                  <optgroup label={t("homes.filter.districts", "Postal districts")}>
                    {areas
                      .filter((a) => a.group === "district")
                      .map((a) => (
                        <option key={a.key} value={a.key}>
                          {a.label}
                        </option>
                      ))}
                  </optgroup>
                ) : null}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-beds`} className="block text-xs font-medium text-muted">
                {t("homes.filter.beds", "Bedrooms")}
              </label>
              <Select id={`${uid}-beds`} value={filters.bedrooms ?? ""} onChange={(e) => navigate({ ...filters, bedrooms: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{t("homes.filter.any", "Any")}</option>
                {BEDROOM_OPTIONS.map((b) => (
                  <option key={b} value={b}>
                    {b === 5 ? "5+" : b}
                  </option>
                ))}
              </Select>
            </div>
            <form key={qs} onSubmit={onPriceSubmit} className="space-y-1.5" aria-label={priceLabel}>
              <span className="block text-xs font-medium text-muted" aria-hidden>
                {priceLabel}
              </span>
              <div className="flex items-center gap-2">
                <label htmlFor={`${uid}-min`} className="sr-only">
                  {t("homes.filter.min", "Minimum")}
                </label>
                <Input id={`${uid}-min`} name="min" inputMode="numeric" placeholder={t("homes.filter.min", "Minimum")} defaultValue={filters.minPrice ?? ""} className="min-w-0" />
                <span aria-hidden className="text-muted">
                  –
                </span>
                <label htmlFor={`${uid}-max`} className="sr-only">
                  {t("homes.filter.max", "Maximum")}
                </label>
                <Input id={`${uid}-max`} name="max" inputMode="numeric" placeholder={t("homes.filter.max", "Maximum")} defaultValue={filters.maxPrice ?? ""} className="min-w-0" />
                <Button type="submit" variant="outline" size="md" className="shrink-0 px-3">
                  {t("homes.filter.apply", "Apply")}
                </Button>
              </div>
            </form>
          </div>
          {filtered ? (
            <div className="mt-3">
              <Link href={tabHref(filters.type)} scroll={false} className="text-sm font-medium text-brand-700 hover:underline">
                {t("homes.filter.clear", "Clear filters")}
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}

      {backend === "sample" ? (
        <Notice title={t("homes.sampleTitle", "Sample listings")}>
          {t("homes.sampleBody", "This deployment runs on the synthetic test dataset, so these listings are generated from it to demonstrate the pages. They are not real homes.")}
        </Notice>
      ) : null}

      <div aria-live="polite" aria-busy={loading || undefined}>
        {backend === "none" ? (
          <EmptyState
            title={t("homes.emptyNoBackendTitle", "No listings yet")}
            action={
              <ButtonLink href="/homes/new/">
                <Plus className="size-4" aria-hidden />
                {t("homes.listYourHome", "List your home")}
              </ButtonLink>
            }
          >
            {t("homes.emptyNoBackendBody", "Home listings are stored in the site database (Supabase), which is not connected on this deployment yet.")}
          </EmptyState>
        ) : unavailable ? (
          <Notice tone="warn" title={t("homes.unavailableTitle", "Listings are temporarily unavailable")}>
            {t("homes.unavailableBody", "We could not load listings just now. Please try again in a few minutes.")}
          </Notice>
        ) : loading ? (
          <p className="py-10 text-center text-sm text-muted">{t("common.loading", "Loading…")}</p>
        ) : failed ? (
          <Notice tone="warn">{t("common.error", "Something went wrong. Please try again.")}</Notice>
        ) : listings.length === 0 ? (
          <EmptyState
            title={filtered ? t("homes.emptyFilteredTitle", "No homes match these filters") : filters.type === "rent" ? t("homes.emptyRentTitle", "No homes for rent yet") : t("homes.emptySaleTitle", "No homes for sale yet")}
            action={
              filtered ? (
                <ButtonLink href={tabHref(filters.type)} variant="outline">
                  {t("homes.filter.clear", "Clear filters")}
                </ButtonLink>
              ) : (
                <ButtonLink href="/homes/new/">
                  <Plus className="size-4" aria-hidden />
                  {t("homes.listYourHome", "List your home")}
                </ButtonLink>
              )
            }
          >
            {filtered ? t("homes.emptyFilteredBody", "Try a wider price range or another area.") : t("homes.emptyBody", "Be the first to list a home here. Listings are free.")}
          </EmptyState>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">{t("homes.resultCount", "{shown} of {total} homes", { shown: listings.length, total })}</p>
            <ListingGrid listings={listings} />
            {listings.length < total ? (
              <div className="flex justify-center">
                <Button type="button" variant="outline" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? t("common.loading", "Loading…") : t("common.showMore", "Show more")}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
