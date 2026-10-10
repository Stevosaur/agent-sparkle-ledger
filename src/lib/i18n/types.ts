export type Lang = "en" | "zh";
export const LANGS: Lang[] = ["en", "zh"];
/** A namespace of UI strings. Every key in `en` should also exist in `zh` (missing zh keys fall back to en). */
export interface Messages {
  en: Record<string, string>;
  zh: Record<string, string>;
}
