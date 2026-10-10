"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { useViewer } from "@/lib/auth/viewer-context";
import { useT } from "@/lib/i18n/provider";

/** Owner-only controls on a listing page (close the listing). Renders nothing for everyone else. */
export function OwnerActions({ listingId }: { listingId: string }) {
  const t = useT();
  const { viewer } = useViewer();
  const signedIn = Boolean(viewer?.signedIn);
  const [owner, setOwner] = useState<{ id: string; isOwner: boolean } | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "closed" | "error">("idle");

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    fetch(`/api/homes/${listingId}/`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ isOwner?: boolean }>) : null))
      .then((body) => {
        if (!cancelled) setOwner({ id: listingId, isOwner: Boolean(body?.isOwner) });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signedIn, listingId]);

  if (!signedIn || !owner || owner.id !== listingId || !owner.isOwner) return null;

  async function close() {
    if (!window.confirm(t("homes.owner.confirm", "Close this listing? It will no longer be shown to buyers or tenants."))) return;
    setState("busy");
    try {
      const res = await fetch(`/api/homes/${listingId}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status: "closed" }),
      });
      setState(res.ok ? "closed" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "closed") {
    return <Notice title={t("homes.owner.closedTitle", "Listing closed")}>{t("homes.owner.closedBody", "It will disappear from search within a few minutes.")}</Notice>;
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
      <span className="text-muted">{t("homes.owner.yours", "This is your listing.")}</span>
      <Button type="button" variant="outline" size="sm" onClick={close} disabled={state === "busy"}>
        {t("homes.owner.close", "Mark as sold / let and close")}
      </Button>
      {state === "error" ? (
        <span role="alert" className="text-down">
          {t("common.error", "Something went wrong. Please try again.")}
        </span>
      ) : null}
    </div>
  );
}
