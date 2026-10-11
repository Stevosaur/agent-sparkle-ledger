"use client";

import { useEffect, useState } from "react";

interface GatedState<T> {
  url: string | null;
  data: T | null;
  error: string | null;
  status: number | null;
}

/** Fetch JSON from a gated route handler. `status` distinguishes 401/402 so callers can re-prompt. */
export function useGatedJson<T>(url: string | null): { data: T | null; error: string | null; loading: boolean; status: number | null } {
  const [state, setState] = useState<GatedState<T>>({ url: null, data: null, error: null, status: null });
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url, { credentials: "same-origin" })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) setState({ url, data: null, error: (body && (body.error as string)) || `HTTP ${res.status}`, status: res.status });
        else setState({ url, data: body as T, error: null, status: res.status });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ url, data: null, error: err instanceof Error ? err.message : "network_error", status: null });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  const current = state.url === url;
  return { data: current ? state.data : null, error: current ? state.error : null, status: current ? state.status : null, loading: Boolean(url) && !current };
}
