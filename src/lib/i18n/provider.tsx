"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { messages } from "./messages";
import type { Lang } from "./types";

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, fallback?: string, vars?: Record<string, string | number>) => string;
}

const LangContext = createContext<LangContextValue | null>(null);
const STORAGE_KEY = "lang";
const EVENT = "plotline:lang";

function interpolate(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

function readStoredLang(): Lang {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "zh" ? "zh" : "en";
  } catch {
    return "en";
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/**
 * EN/中文 toggle. Pages are server-rendered in English (so they stay static and cacheable); after
 * hydration the stored language is applied on the client (server snapshot is always "en", so the first
 * client render matches the server HTML).
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore<Lang>(subscribe, readStoredLang, () => "en");

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-Hans-SG" : "en-SG";
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }
    document.cookie = `${STORAGE_KEY}=${next}; path=/; max-age=31536000; samesite=lax`;
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      setLang,
      t: (key, fallback, vars) => interpolate(messages[lang][key] ?? messages.en[key] ?? fallback ?? key, vars),
    }),
    [lang, setLang],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (ctx) return ctx;
  // Outside the provider (e.g. isolated tests): English only.
  return {
    lang: "en",
    setLang: () => undefined,
    t: (key, fallback, vars) => interpolate(messages.en[key] ?? fallback ?? key, vars),
  };
}

export const useT = () => useLang().t;
