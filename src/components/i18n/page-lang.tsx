"use client";

import type { ReactNode } from "react";
import { useLang } from "@/lib/i18n/provider";

/**
 * Re-marks a translated island inside an English-only (lang="en") block with the page language, so 中文
 * UI text is not announced as English. Renders "en-SG" on the server and first client render (like <T>).
 */
export function PageLang({ children }: { children: ReactNode }) {
  const { lang } = useLang();
  return <span lang={lang === "zh" ? "zh-Hans-SG" : "en-SG"}>{children}</span>;
}
