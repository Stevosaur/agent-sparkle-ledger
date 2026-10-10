"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { useViewer } from "@/lib/auth/viewer-context";
import { site } from "@/lib/config/site";
import { formatPropertyRef, type PropertyKind } from "@/lib/property-ref";
import type { SearchEntry, SearchKind } from "@/lib/data/types";
import { refFromHref, TRACKABLE_KINDS } from "@/lib/account/refs";
import { parseTrackedHomeInput } from "@/lib/account/validation";
import type { TrackedHomeView, TrackedListResponse } from "@/lib/account/types";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Notice } from "@/components/ui/notice";
import { SearchBox } from "@/components/search/search-box";
import { apiJson } from "./api";
import { draftToBody, EMPTY_DRAFT, HomeDetailsFields, useTrackedErrorText, type HomeDetailsDraft } from "./home-details-fields";
import { TrackedHomeCard } from "./tracked-home-card";

/** Stable reference: SearchBox re-runs its fetch effect when `kinds` changes identity. */
const TRACKABLE_SEARCH_KINDS: SearchKind[] = ["hdb", "condo", "landed"];

interface Picked {
  ref: string;
  kind: PropertyKind;
  label: string;
  sub: string;
}

function AddHomeForm({ onAdded, limitVars }: { onAdded: (item: TrackedHomeView) => void; limitVars: Record<string, string | number> }) {
  const t = useT();
  const errorText = useTrackedErrorText();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [draft, setDraft] = useState<HomeDetailsDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(entry: SearchEntry) {
    const ref = refFromHref(entry.href);
    if (!ref || !TRACKABLE_KINDS.includes(ref.kind)) {
      setError(errorText("unsupported_property"));
      return;
    }
    setError(null);
    setPicked({ ref: formatPropertyRef(ref), kind: ref.kind, label: entry.label, sub: entry.sub });
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!picked) return;
    const body = { ref: picked.ref, ...draftToBody(draft) };
    const check = parseTrackedHomeInput(body);
    if (!check.ok) {
      setError(errorText(check.error, limitVars));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await apiJson<{ item: TrackedHomeView }>("/api/tracked/", { method: "POST", body });
    setBusy(false);
    if (res.ok) {
      onAdded(res.data.item);
      setPicked(null);
      setDraft(EMPTY_DRAFT);
    } else setError(errorText(res.error, limitVars));
  }

  return (
    <Card>
      <CardHeader title={t("account.tracked.addTitle", "Add a home")} description={t("account.tracked.addBody", "Search your block, condo or landed address, then add a few details.")} />
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          {picked ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate font-medium text-ink">{picked.label}</div>
                <div className="truncate text-xs text-muted">{picked.sub}</div>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(null)} aria-label={t("account.tracked.changeHome", "Choose a different home")}>
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-ink">{t("account.tracked.homeLabel", "Your home")}</p>
              <SearchBox kinds={TRACKABLE_SEARCH_KINDS} onSelect={pick} placeholder={t("account.tracked.searchPlaceholder", "Search block, condo or landed address")} />
            </div>
          )}
          {picked ? <HomeDetailsFields kind={picked.kind} value={draft} onChange={setDraft} disabled={busy} /> : null}
          {error ? (
            <p role="alert" className="text-sm text-down">
              {error}
            </p>
          ) : null}
          {picked ? (
            <Button type="submit" disabled={busy}>
              <Plus className="size-4" aria-hidden />
              {busy ? t("account.tracked.adding", "Adding…") : t("account.tracked.add", "Track this home")}
            </Button>
          ) : null}
        </form>
      </CardBody>
    </Card>
  );
}

/** My Property: the signed-in user's tracked homes (GET / POST / PATCH / DELETE /api/tracked/). */
export function TrackedHomes() {
  const t = useT();
  const { viewer } = useViewer();
  const [data, setData] = useState<TrackedListResponse | null>(null);
  const [loadError, setLoadError] = useState<{ status: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiJson<TrackedListResponse>("/api/tracked/").then((res) => {
      if (cancelled) return;
      if (res.ok) setData(res.data);
      else setLoadError({ status: res.status });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <Notice tone="warn">
        {loadError.status === 401 ? (
          <>
            {t("account.tracked.err.signIn", "Your session has expired. Please sign in again.")}{" "}
            <Link href={`/login/?next=${encodeURIComponent("/my-property/")}`} className="font-medium underline">
              {t("account.prompt.signin", "Sign in")}
            </Link>
          </>
        ) : (
          t("common.error", "Something went wrong. Please try again.")
        )}
      </Notice>
    );
  }
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-surface" aria-busy="true" />;

  const { items, limit } = data;
  const canAdd = items.length < limit.max;
  const limitVars = { free: limit.freeLimit, max: limit.max, plus: site.plusName };

  const update = (next: TrackedHomeView) => setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === next.id ? next : i)) } : d));
  const remove = (id: number) => setData((d) => (d ? { ...d, items: d.items.filter((i) => i.id !== id), limit: { ...d.limit, used: d.limit.used - 1 } } : d));
  const add = (item: TrackedHomeView) => setData((d) => (d ? { ...d, items: [...d.items, item], limit: { ...d.limit, used: d.limit.used + 1 } } : d));

  return (
    <div className="space-y-6">
      {items.length === 0 ? (
        <EmptyState title={t("account.tracked.emptyTitle", "You're not tracking a home yet")}>
          {t("account.tracked.emptyBody", "Add your home below to follow its estimated value, quarter by quarter, from recorded sales nearby.")}
        </EmptyState>
      ) : (
        items.map((home) => <TrackedHomeCard key={home.id} home={home} onChange={update} onRemove={remove} />)
      )}

      {canAdd ? (
        <AddHomeForm onAdded={add} limitVars={limitVars} />
      ) : limit.unlimited ? (
        <Notice>{t("account.tracked.err.limit", "You've reached the limit of {max} tracked homes.", limitVars)}</Notice>
      ) : (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink">{t("account.tracked.err.plus", "Free accounts can track {free} home. Upgrade to {plus} to track more.", limitVars)}</p>
            <Link href="/plus/" className={buttonClass("plus", "sm")}>
              {site.plus.trialDays > 0 && !viewer?.subscriptionStatus && !viewer?.trialEndsAt ? t("account.plus.startTrial", "Start {days}-day free trial", { days: site.plus.trialDays }) : t("account.plus.upgrade", "Upgrade to {plus}", { plus: site.plusName })}
            </Link>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
