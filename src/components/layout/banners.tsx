"use client";

import { useViewer } from "@/lib/auth/viewer-context";
import { useT } from "@/lib/i18n/provider";

/** Site-wide status banners: synthetic fixture data, and preview (open gating) mode. */
export function Banners({ fixture }: { fixture: boolean }) {
  const { viewer } = useViewer();
  const t = useT();
  return (
    <>
      {fixture ? <div className="bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-900">{t("fixture.banner")}</div> : null}
      {viewer?.gating === "open" ? <div className="bg-brand-50 px-4 py-1.5 text-center text-xs text-brand-800">{t("gate.previewBanner")}</div> : null}
    </>
  );
}
