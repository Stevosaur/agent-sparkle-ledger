"use client";

import { useLang } from "@/lib/i18n/provider";
import { Notice } from "@/components/ui/notice";

/** Shown only in Chinese: long-form legal and methodology text is published in English. */
export function EnglishOnlyNote() {
  const { lang, t } = useLang();
  if (lang !== "zh") return null;
  return <Notice>{t("trust.englishOnly", "This page is available in English only. The English version prevails.")}</Notice>;
}
