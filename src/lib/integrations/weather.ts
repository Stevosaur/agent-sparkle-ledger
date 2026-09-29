/**
 * Optional weather signal. Never a critical dependency.
 * VERIFIED FACT (data.gov.sg docs via search excerpts): GET https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast,
 * API key optional via `x-api-key` header; rate limited (HTTP 429).
 */
import type { WeatherProvider } from "./types";

class DataGovWeather implements WeatherProvider {
  kind = "WEATHER";
  provider = "data.gov.sg (NEA) 2-hour forecast";
  status = "CONNECTED" as const;
  description = "Public real-time weather API. Used only for ETA/demand context.";
  async twoHourOutlook() {
    try {
      const res = await fetch("https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast", {
        headers: process.env.DATAGOV_API_KEY ? { "x-api-key": process.env.DATAGOV_API_KEY } : {},
        signal: AbortSignal.timeout(4000),
        next: { revalidate: 900 },
      } as RequestInit);
      if (!res.ok) return null;
      const j = (await res.json()) as { data?: { items?: { forecasts?: { area: string; forecast: string }[] }[] } };
      return j.data?.items?.[0]?.forecasts ?? null;
    } catch {
      return null;
    }
  }
}

class NoWeather implements WeatherProvider {
  kind = "WEATHER";
  provider = "Weather (disabled)";
  status = "NOT_CONNECTED" as const;
  description = "Set WEATHER_ENABLED=true to use the public data.gov.sg real-time API.";
  async twoHourOutlook() {
    return null;
  }
}

export const getWeather = (): WeatherProvider => (process.env.WEATHER_ENABLED === "true" ? new DataGovWeather() : new NoWeather());
