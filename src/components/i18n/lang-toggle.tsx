"use client";

import { Languages } from "lucide-react";
import { useLang } from "@/lib/i18n/provider";

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "en" ? "zh" : "en")}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ink hover:bg-canvas"
      aria-label={lang === "en" ? "切换到中文" : "Switch to English"}
    >
      <Languages className="size-4" aria-hidden />
      <span>{lang === "en" ? "中文" : "EN"}</span>
    </button>
  );
}
