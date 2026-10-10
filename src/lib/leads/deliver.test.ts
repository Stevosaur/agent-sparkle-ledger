import { afterEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
let adminConfigured = true;
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => (adminConfigured ? { from: (table: string) => ({ insert: (row: unknown) => insert(table, row) }) } : null),
}));

import { deliverLead, leadSinks, leadsWebhookUrl } from "./deliver";

const lead = { type: "mortgage" as const, name: "Tan", email: null, phone: "+6591234567", message: null, context: { purpose: "refinance" } };

afterEach(() => {
  insert.mockReset();
  adminConfigured = true;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("deliverLead", () => {
  it("stores the lead with the columns of public.leads (id and created_at left to defaults)", async () => {
    insert.mockResolvedValue({ error: null });
    const r = await deliverLead(lead, { userId: "user-1" });
    expect(r).toEqual({ status: "delivered", stored: true, forwarded: false });
    expect(insert).toHaveBeenCalledWith("leads", { type: "mortgage", name: "Tan", email: null, phone: "+6591234567", message: null, context: { purpose: "refinance" }, user_id: "user-1", status: "new" });
  });

  it("succeeds when one of two sinks works, fails when all do", async () => {
    vi.stubEnv("LEADS_WEBHOOK_URL", "https://hooks.example.org/x");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    insert.mockResolvedValue({ error: { code: "42P01", message: "missing table" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await deliverLead(lead, { userId: null })).toEqual({ status: "delivered", stored: false, forwarded: true });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("timeout"))));
    expect(await deliverLead(lead, { userId: null })).toEqual({ status: "failed" });
    spy.mockRestore();
  });

  it("is disabled with no database and no webhook", async () => {
    adminConfigured = false;
    expect(leadSinks()).toEqual({ database: false, webhook: false });
    expect(await deliverLead(lead, { userId: null })).toEqual({ status: "disabled" });
  });

  it("only accepts http(s) webhook URLs", () => {
    vi.stubEnv("LEADS_WEBHOOK_URL", "ftp://x.example.org/");
    expect(leadsWebhookUrl()).toBeNull();
    vi.stubEnv("LEADS_WEBHOOK_URL", "not a url");
    expect(leadsWebhookUrl()).toBeNull();
    vi.stubEnv("LEADS_WEBHOOK_URL", " https://hooks.example.org/a ");
    expect(leadsWebhookUrl()).toBe("https://hooks.example.org/a");
  });
});
