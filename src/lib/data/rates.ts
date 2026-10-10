import "server-only";
import { readJson } from "./store";
import type { RatesSnapshot } from "./types";

export function getRates(): RatesSnapshot | null {
  return readJson<RatesSnapshot | null>("rates.json", null);
}
