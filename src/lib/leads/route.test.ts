import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/leads/route";

let ipSeq = 0;
function request(body: unknown, opts: { contentType?: string; ip?: string; raw?: string } = {}) {
  const ip = opts.ip ?? `203.0.113.${++ipSeq}`;
  return new NextRequest("http://localhost/api/leads/", {
    method: "POST",
    headers: { "content-type": opts.contentType ?? "application/json", "x-forwarded-for": ip },
    body: opts.raw ?? JSON.stringify(body),
  });
}

const valid = {
  type: "services",
  name: "Tan Ah Kow",
  email: "tan@example.org",
  phone: "91234567",
  consent: true,
  context: { postal: "521872", service: "aircon" },
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/leads/", () => {
  it("answers 503 leads_disabled when neither Supabase nor a webhook is configured", async () => {
    const res = await POST(request(valid));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "leads_disabled" });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("validates before delivering and never echoes personal data", async () => {
    const res = await POST(request({ ...valid, phone: "1234", consent: false }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "invalid", fields: { phone: "invalid", consent: "required" } });
    expect(JSON.stringify(body)).not.toContain("Tan");
  });

  it("swallows honeypot submissions with a 200", async () => {
    const res = await POST(request({ ...valid, website: "http://spam.example" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects non-JSON, malformed and oversized bodies", async () => {
    expect((await POST(request(null, { contentType: "text/plain", raw: "hi" }))).status).toBe(415);
    expect((await POST(request(null, { raw: "{not json" }))).status).toBe(400);
    expect((await POST(request({ ...valid, message: "x".repeat(20_000) }))).status).toBe(413);
  });

  it("rate-limits bursts from one IP", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await POST(request({ type: "general" }, { ip: "198.51.100.77" }))).status);
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it("forwards valid leads to LEADS_WEBHOOK_URL and returns only { ok: true }", async () => {
    vi.stubEnv("LEADS_WEBHOOK_URL", "https://hooks.example.org/leads");
    vi.stubEnv("LEADS_WEBHOOK_SECRET", "s3cret");
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(request(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://hooks.example.org/leads");
    expect((init?.headers as Record<string, string>)["X-Leads-Secret"]).toBe("s3cret");
    const sent = JSON.parse(String(init?.body));
    expect(sent).toMatchObject({ type: "services", name: "Tan Ah Kow", email: "tan@example.org", phone: "+6591234567", context: { postal: "521872", service: "aircon" }, status: "new" });
    expect(sent.context.page).toBeUndefined();
  });

  it("answers 502 when the only configured sink fails", async () => {
    vi.stubEnv("LEADS_WEBHOOK_URL", "https://hooks.example.org/leads");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await POST(request(valid));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "delivery_failed" });
    errSpy.mockRestore();
  });
});
