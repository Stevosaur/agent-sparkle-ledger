"use client";

import { useLang } from "@/lib/i18n/provider";

/**
 * Translatable text for server or client components: <T k="nav.home" fallback="Home" />.
 * Renders English on the server; switches to Chinese on the client when selected.
 */
export function T({ k, fallback, vars }: { k: string; fallback?: string; vars?: Record<string, string | number> }) {
  const { t } = useLang();
  return <>{t(k, fallback, vars)}</>;
}
