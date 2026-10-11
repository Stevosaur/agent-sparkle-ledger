"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import type { TelegramStatus } from "@/lib/account/types";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { apiJson } from "./api";

/** Link / unlink the user's Telegram chat for alerts (POST / DELETE / GET /api/telegram/link/). */
export function TelegramLink({ configured, linked: initiallyLinked }: { configured: boolean; linked: boolean }) {
  const t = useT();
  const [linked, setLinked] = useState(initiallyLinked);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createLink() {
    setBusy(true);
    setError(null);
    const res = await apiJson<{ url: string }>("/api/telegram/link/", { method: "POST", body: {} });
    setBusy(false);
    if (res.ok) setDeepLink(res.data.url);
    else setError(t("common.error", "Something went wrong. Please try again."));
  }

  async function refresh() {
    setBusy(true);
    const res = await apiJson<TelegramStatus>("/api/telegram/link/");
    setBusy(false);
    if (res.ok) {
      setLinked(res.data.linked);
      if (res.data.linked) setDeepLink(null);
      else setError(t("account.telegram.notYet", "Not linked yet. Tap Start in Telegram, then check again."));
    } else setError(t("common.error", "Something went wrong. Please try again."));
  }

  async function unlink() {
    setBusy(true);
    setError(null);
    const res = await apiJson<{ ok: boolean }>("/api/telegram/link/", { method: "DELETE", body: {} });
    setBusy(false);
    if (res.ok) setLinked(false);
    else setError(t("common.error", "Something went wrong. Please try again."));
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageCircle className="size-5 text-brand-700" aria-hidden />
            <h3 className="font-semibold text-ink">{t("account.telegram.title", "Telegram")}</h3>
          </div>
          {configured ? linked ? <Badge tone="up">{t("account.telegram.linked", "Linked")}</Badge> : <Badge>{t("account.telegram.notLinked", "Not linked")}</Badge> : null}
        </div>
        {!configured ? (
          <p className="text-sm text-muted">{t("account.telegram.unconfigured", "Telegram alerts aren't set up on this deployment yet.")}</p>
        ) : linked ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">{t("account.telegram.linkedBody", "Alerts are sent to your Telegram chat. Send /stop to the bot at any time to turn them off.")}</p>
            <Button type="button" variant="outline" size="sm" onClick={unlink} disabled={busy}>
              {t("account.telegram.unlink", "Unlink")}
            </Button>
          </div>
        ) : deepLink ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">{t("account.telegram.step", "Open the bot in Telegram and tap Start. This link works once.")}</p>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={deepLink} size="sm">
                {t("account.telegram.open", "Open Telegram")}
              </ButtonLink>
              <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={busy}>
                {t("account.telegram.check", "I've tapped Start")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">{t("account.telegram.body", "Link Telegram to receive alerts when a property records a new sale.")}</p>
            <Button type="button" size="sm" onClick={createLink} disabled={busy}>
              {t("account.telegram.link", "Link Telegram")}
            </Button>
          </div>
        )}
        {error ? (
          <p role="alert" className="text-sm text-down">
            {error}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
