"use client";

/** JSON fetch for the account APIs: never throws, returns the HTTP status and the API's error code. */
export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: string; body: Record<string, unknown> | null };

export async function apiJson<T>(url: string, init?: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown }): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.ok) return { ok: true, status: res.status, data: body as T };
    return { ok: false, status: res.status, error: typeof body?.error === "string" ? body.error : `http_${res.status}`, body };
  } catch {
    return { ok: false, status: 0, error: "network_error", body: null };
  }
}
