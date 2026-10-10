"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BellRing, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { site } from "@/lib/config/site";
import { formatMonth } from "@/lib/format";
import { formatPropertyRef } from "@/lib/property-ref";
import type { SearchEntry, SearchKind } from "@/lib/data/types";
import { refFromHref, ALERTABLE_KINDS } from "@/lib/account/refs";
import type { AlertView, AlertsListResponse } from "@/lib/account/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { SearchBox } from "@/components/search/search-box";
import { apiJson } from "./api";
import { T } from "@/components/i18n/t";

/** Stable reference: SearchBox re-runs its fetch effect when `kinds` changes identity. */
const ALERT_SEARCH_KINDS: SearchKind[] = ["hdb", "condo", "landed", "landed-street", "launch"];

/** Alerts list with pause / resume / delete and a property picker to add one (Plus; /api/alerts/). */
export function AlertsManager() {
  const t = useT();
  const [data, setData] = useState<AlertsListResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiJson<AlertsListResponse>("/api/alerts/").then((res) => {
      if (cancelled) return;
      if (res.ok) setData(res.data);
      else setLoadError(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function errorText(code: string): string {
    switch (code) {
      case "already_exists":
        return t("account.alerts.exists", "You already have an alert for this property.");
      case "limit_reached":
        return t("account.alerts.limit", "You've reached the maximum number of alerts. Delete one to add another.");
      case "unsupported_property":
        return t("account.alerts.unsupported", "Alerts are available for HDB blocks, condos, landed homes, landed streets and new launches.");
      case "not_found":
        return t("account.alerts.notFound", "We couldn't find that property.");
      case "plus_required":
        return t("account.alerts.plusRequired", "Alerts need {plus}.", { plus: site.plusName });
      default:
        return t("common.error", "Something went wrong. Please try again.");
    }
  }

  async function add(entry: SearchEntry) {
    const ref = refFromHref(entry.href);
    if (!ref || !ALERTABLE_KINDS.includes(ref.kind)) {
      setMessage({ tone: "error", text: errorText("unsupported_property") });
      return;
    }
    setAdding(true);
    setMessage(null);
    const res = await apiJson<{ item: AlertView }>("/api/alerts/", { method: "POST", body: { ref: formatPropertyRef(ref), channel: "telegram" } });
    setAdding(false);
    if (res.ok) {
      setData((d) => (d ? { ...d, items: [res.data.item, ...d.items] } : d));
      setMessage({ tone: "ok", text: t("account.alerts.added", "Alert added for {label}.", { label: res.data.item.label }) });
    } else setMessage({ tone: "error", text: errorText(res.error) });
  }

  async function toggle(alert: AlertView) {
    setBusyId(alert.id);
    const res = await apiJson<{ item: AlertView }>("/api/alerts/", { method: "PATCH", body: { id: alert.id, active: !alert.active } });
    setBusyId(null);
    if (res.ok) setData((d) => (d ? { ...d, items: d.items.map((a) => (a.id === alert.id ? res.data.item : a)) } : d));
    else setMessage({ tone: "error", text: errorText(res.error) });
  }

  async function remove(alert: AlertView) {
    setBusyId(alert.id);
    const res = await apiJson<{ ok: boolean }>("/api/alerts/", { method: "DELETE", body: { id: alert.id } });
    setBusyId(null);
    if (res.ok) setData((d) => (d ? { ...d, items: d.items.filter((a) => a.id !== alert.id) } : d));
    else setMessage({ tone: "error", text: errorText(res.error) });
  }

  if (loadError) return <Notice tone="warn">{t("common.error", "Something went wrong. Please try again.")}</Notice>;
  if (!data) return <div className="h-40 animate-pulse rounded-xl bg-surface" role="status"><span className="sr-only"><T k="common.loading" fallback="Loading…" /></span></div>;

  const canAdd = data.telegram.configured && data.items.length < data.max;

  return (
    <div className="space-y-4">
      {!data.telegram.configured ? (
        <Notice tone="warn">{t("account.alerts.noDelivery", "Telegram delivery isn't set up on this deployment, so alerts can't be sent yet.")}</Notice>
      ) : !data.telegram.linked ? (
        <Notice>{t("account.alerts.linkFirst", "Link Telegram above so your alerts have somewhere to go.")}</Notice>
      ) : null}

      {canAdd ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-ink">
            {t("account.alerts.addLabel", "Add an alert")}
          </p>
          <SearchBox kinds={ALERT_SEARCH_KINDS} onSelect={add} placeholder={t("account.alerts.addPlaceholder", "Search a block, condo, street or new launch")} />
          {adding ? <p className="text-xs text-muted">{t("account.alerts.adding", "Adding…")}</p> : null}
        </div>
      ) : null}

      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-sm text-down" : "text-sm text-up"}>
          {message.text}
        </p>
      ) : null}

      {data.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center text-sm text-muted">
          {t("account.alerts.empty", "No alerts yet. We check for new sales once a day and message you when one is recorded.")}
        </p>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {data.items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
                <BellRing className={a.active ? "size-4 shrink-0 text-brand-700" : "size-4 shrink-0 text-muted"} aria-hidden />
                {/* min-w-48: on phones the name keeps its width and the badge / buttons wrap below it */}
                <div className="min-w-48 flex-1">
                  {a.href ? (
                    <Link href={a.href} className="block truncate font-medium text-ink hover:text-brand-700 hover:underline">
                      {a.label}
                    </Link>
                  ) : (
                    <span className="block truncate font-medium text-muted">{a.label}</span>
                  )}
                  <span className="text-xs text-muted">
                    {a.kind === "new-launch" ? t("account.alerts.kindLaunch", "Launch sales updates") : t("account.alerts.kindSale", "New sales")} ·{" "}
                    {t("account.alerts.channelTelegram", "Telegram")}
                    {a.lastCheckedMonth ? ` · ${t("account.alerts.upTo", "latest seen {month}", { month: formatMonth(a.lastCheckedMonth) })}` : ""}
                  </span>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  {!a.active ? <Badge className="mr-1">{t("account.alerts.paused", "Paused")}</Badge> : null}
                  <Button type="button" variant="outline" size="sm" onClick={() => toggle(a)} disabled={busyId === a.id}>
                    {a.active ? t("account.alerts.pause", "Pause") : t("account.alerts.resume", "Resume")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(a)}
                    disabled={busyId === a.id}
                    aria-label={t("account.alerts.delete", "Delete alert for {label}", { label: a.label })}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-xs text-muted">
        {t("account.alerts.source", "Checked daily against the latest HDB resale (data.gov.sg) and URA transaction records. Records are published with a delay, so an alert can arrive weeks after the sale.")}
      </p>
    </div>
  );
}
