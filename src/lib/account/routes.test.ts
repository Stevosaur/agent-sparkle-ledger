/**
 * Route-handler tests for the account APIs, run against an in-memory Supabase fake (no network).
 * Covers: watchlist contract used by WhatsNext, tracked-homes limit enforcement (incl. concurrent
 * inserts), alerts, Stripe checkout / webhook -> subscriptions row, cron alerts and Telegram linking.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { featureMap, type Plan } from "@/lib/auth/entitlements";
import type { Viewer } from "@/lib/auth/viewer";
import { site } from "@/lib/config/site";
import { FakeDb } from "./fake-supabase.test-helper";

const USER = "6f1c2a7e-3b4d-4c5e-8f90-1a2b3c4d5e6f";
const OTHER = "0a0b0c0d-1111-4222-8333-944455556666";

const state = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  viewer: null as Viewer | null,
  stripe: null as unknown,
}));

vi.mock("@/lib/auth/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/auth/config")>();
  return { ...orig, isSupabaseConfigured: () => true, isStripeConfigured: () => true, supabaseSecretKey: () => "sb_secret_test" };
});

vi.mock("@/lib/auth/require", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireUser: async () =>
      state.viewer?.userId
        ? { ok: true, viewer: state.viewer }
        : { ok: false, response: NextResponse.json({ error: "sign_in_required" }, { status: 401, headers: { "Cache-Control": "private, no-store" } }) },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => state.db.client(),
  createSupabaseAdminClient: () => state.db.client(),
}));

vi.mock("@/lib/stripe/server", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/stripe/server")>();
  return { ...orig, getStripe: () => state.stripe, stripeWebhookSecret: () => "whsec_test" };
});

import * as watchlist from "@/app/api/watchlist/route";
import * as tracked from "@/app/api/tracked/route";
import * as alerts from "@/app/api/alerts/route";
import * as checkout from "@/app/api/stripe/checkout/route";
import * as webhook from "@/app/api/stripe/webhook/route";
import * as cron from "@/app/api/cron/alerts/route";
import * as telegramWebhook from "@/app/api/telegram/webhook/route";
import * as telegramLink from "@/app/api/telegram/link/route";

function viewerFor(plan: Plan, userId: string = USER): Viewer {
  return { userId, email: "owner@example.com", plan, subscriptionStatus: null, trialEndsAt: null, currentPeriodEnd: null, gating: "enforce", features: featureMap(plan, "enforce") };
}

function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: { host: "localhost:3000", origin: "http://localhost:3000", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function call(res: Response | Promise<Response>) {
  const r = await res;
  return { status: r.status, body: (await r.json()) as Record<string, unknown>, cache: r.headers.get("cache-control") };
}

beforeEach(() => {
  state.db = new FakeDb();
  state.viewer = viewerFor("free");
  state.stripe = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("/api/watchlist/ (WhatsNext contract)", () => {
  const ref = "hdb:blk-872a-tampines-st-86";

  it("adds, reports and removes a property", async () => {
    expect(await call(watchlist.GET(req("GET", `/api/watchlist/?ref=${ref}`)))).toMatchObject({ status: 200, body: { watching: false }, cache: "private, no-store" });
    expect(await call(watchlist.POST(req("POST", "/api/watchlist/", { ref, label: "ignored client label" })))).toMatchObject({ status: 201, body: { watching: true } });
    // idempotent
    expect(await call(watchlist.POST(req("POST", "/api/watchlist/", { ref })))).toMatchObject({ status: 200, body: { watching: true } });
    expect(state.db.rows("watchlist")).toHaveLength(1);
    expect(state.db.rows("watchlist")[0]).toMatchObject({ user_id: USER, ref, label: "Blk 872A Tampines St 86" });
    expect(await call(watchlist.GET(req("GET", `/api/watchlist/?ref=${ref}`)))).toMatchObject({ body: { watching: true } });
    const list = await call(watchlist.GET(req("GET", "/api/watchlist/")));
    expect(list.body.items).toEqual([expect.objectContaining({ ref, label: "Blk 872A Tampines St 86", href: "/hdb/blk-872a-tampines-st-86/" })]);
    expect(await call(watchlist.DELETE(req("DELETE", "/api/watchlist/", { ref, label: "x" })))).toMatchObject({ status: 200, body: { watching: false } });
    expect(state.db.rows("watchlist")).toHaveLength(0);
  });

  it("only sees the current user's rows", async () => {
    state.db.rows("watchlist").push({ id: 99, user_id: OTHER, ref, label: "x", created_at: "2026-01-01T00:00:00Z" });
    expect(await call(watchlist.GET(req("GET", `/api/watchlist/?ref=${ref}`)))).toMatchObject({ body: { watching: false } });
    expect((await call(watchlist.GET(req("GET", "/api/watchlist/")))).body.items).toEqual([]);
  });

  it("validates refs and existence", async () => {
    expect(await call(watchlist.GET(req("GET", "/api/watchlist/?ref=bogus")))).toMatchObject({ status: 400, body: { error: "invalid_ref" } });
    expect(await call(watchlist.POST(req("POST", "/api/watchlist/", { ref: "condo:no-such-project" })))).toMatchObject({ status: 404, body: { error: "not_found" } });
    expect(await call(watchlist.POST(req("POST", "/api/watchlist/", "not json")))).toMatchObject({ status: 400 });
  });

  it("needs a signed-in user and same-origin mutations", async () => {
    state.viewer = null;
    expect(await call(watchlist.GET(req("GET", "/api/watchlist/")))).toMatchObject({ status: 401, body: { error: "sign_in_required" } });
    state.viewer = viewerFor("free");
    expect(await call(watchlist.POST(req("POST", "/api/watchlist/", { ref }, { origin: "https://evil.example" })))).toMatchObject({ status: 403, body: { error: "forbidden_origin" } });
  });
});

describe("/api/tracked/ limit enforcement", () => {
  const home = { ref: "hdb:blk-872a-tampines-st-86", flatType: "4 ROOM", purchasePrice: 400000, purchaseMonth: "2020-06" };

  it(`lets a free account track ${site.freeTrackedHomes} home and asks for Plus after that`, async () => {
    const first = await call(tracked.POST(req("POST", "/api/tracked/", home)));
    expect(first.status).toBe(201);
    expect(first.body.item).toMatchObject({ ref: home.ref, label: "Blk 872A Tampines St 86", flatType: "4 ROOM", estimate: { status: "ok", method: "block-flat-type-median" } });
    for (let i = 1; i < site.freeTrackedHomes; i++) expect((await call(tracked.POST(req("POST", "/api/tracked/", home)))).status).toBe(201);
    const over = await call(tracked.POST(req("POST", "/api/tracked/", { ...home, ref: "hdb:blk-201-tampines-st-21" })));
    expect(over).toMatchObject({ status: 402, body: { error: "plus_required", feature: "tracking.unlimited" } });
    expect(state.db.rows("tracked_homes")).toHaveLength(site.freeTrackedHomes);
    const list = await call(tracked.GET());
    expect(list.body.limit).toEqual({ max: site.freeTrackedHomes, used: site.freeTrackedHomes, unlimited: false, freeLimit: site.freeTrackedHomes });
  });

  it("rejects concurrent inserts that race past the count check", async () => {
    const results = await Promise.all([0, 1, 2].map(() => call(tracked.POST(req("POST", "/api/tracked/", home)))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(site.freeTrackedHomes);
    expect(results.filter((r) => r.status === 402)).toHaveLength(3 - site.freeTrackedHomes);
    expect(state.db.rows("tracked_homes")).toHaveLength(site.freeTrackedHomes);
    // all three passed the count check and inserted (ids 1-3); the post-insert re-check removed the extras
    expect(state.db.nextId("tracked_homes")).toBe(4);
    expect(state.db.rows("tracked_homes")[0].id).toBe(1);
  });

  it("lets Plus track more homes", async () => {
    state.viewer = viewerFor("plus");
    for (const ref of ["hdb:blk-872a-tampines-st-86", "hdb:blk-201-tampines-st-21", "hdb:blk-455-tampines-st-42"]) {
      expect((await call(tracked.POST(req("POST", "/api/tracked/", { ...home, ref })))).status).toBe(201);
    }
    expect((await call(tracked.GET())).body.limit).toMatchObject({ used: 3, unlimited: true });
  });

  it("withholds estimates for homes beyond the free limit once Plus lapses", async () => {
    state.viewer = viewerFor("plus");
    const refs = ["hdb:blk-872a-tampines-st-86", "hdb:blk-201-tampines-st-21", "hdb:blk-455-tampines-st-42"];
    for (const ref of refs) expect((await call(tracked.POST(req("POST", "/api/tracked/", { ...home, ref })))).status).toBe(201);
    state.viewer = viewerFor("free");
    const list = await call(tracked.GET());
    const items = list.body.items as { id: number; ref: string; estimate: { status: string; reason?: string } }[];
    expect(items.map((i) => i.ref)).toEqual(refs);
    items.forEach((item, i) => {
      if (i < site.freeTrackedHomes) expect(item.estimate.status).toBe("ok");
      else expect(item.estimate).toEqual({ status: "unavailable", reason: "over-limit" });
    });
    expect(list.body.limit).toMatchObject({ max: site.freeTrackedHomes, used: 3, unlimited: false });
    // editing a locked home does not reveal its estimate either
    const locked = items[items.length - 1];
    const edited = await call(tracked.PATCH(req("PATCH", "/api/tracked/", { id: locked.id, flatType: "5 ROOM" })));
    expect(edited).toMatchObject({ status: 200, body: { item: { id: locked.id, flatType: "5 ROOM", estimate: { status: "unavailable", reason: "over-limit" } } } });
    expect((await call(tracked.POST(req("POST", "/api/tracked/", home)))).status).toBe(402);
    // renewing restores every estimate
    state.viewer = viewerFor("plus");
    const renewed = (await call(tracked.GET())).body.items as { estimate: { status: string } }[];
    expect(renewed.every((i) => i.estimate.status === "ok")).toBe(true);
  });

  it("validates input and edits / removes only the user's own homes", async () => {
    expect(await call(tracked.POST(req("POST", "/api/tracked/", { ref: home.ref })))).toMatchObject({ status: 400, body: { error: "flat_type_required", field: "flatType" } });
    expect(await call(tracked.POST(req("POST", "/api/tracked/", { ref: "condo:sample-park-condo" })))).toMatchObject({ status: 400, body: { error: "area_required" } });
    const created = await call(tracked.POST(req("POST", "/api/tracked/", home)));
    const id = (created.body.item as { id: number }).id;
    const edited = await call(tracked.PATCH(req("PATCH", "/api/tracked/", { id, flatType: "5 ROOM", areaSqm: 110, purchasePrice: 500000, purchaseMonth: "2021-01" })));
    expect(edited).toMatchObject({ status: 200, body: { item: { id, flatType: "5 ROOM", areaSqm: 110, purchasePrice: 500000 } } });
    state.viewer = viewerFor("free", OTHER);
    expect(await call(tracked.PATCH(req("PATCH", "/api/tracked/", { id, flatType: "3 ROOM" })))).toMatchObject({ status: 404 });
    await call(tracked.DELETE(req("DELETE", "/api/tracked/", { id })));
    expect(state.db.rows("tracked_homes")).toHaveLength(1);
    state.viewer = viewerFor("free");
    expect(await call(tracked.DELETE(req("DELETE", "/api/tracked/", { id })))).toMatchObject({ status: 200 });
    expect(state.db.rows("tracked_homes")).toHaveLength(0);
  });
});

describe("/api/alerts/", () => {
  it("is a Plus feature", async () => {
    expect(await call(alerts.GET())).toMatchObject({ status: 402, body: { error: "plus_required", feature: "alerts" } });
  });

  it("creates alerts starting from the property's latest recorded month", async () => {
    state.viewer = viewerFor("plus");
    const created = await call(alerts.POST(req("POST", "/api/alerts/", { ref: "hdb:blk-872a-tampines-st-86" })));
    expect(created).toMatchObject({ status: 201, body: { item: { kind: "new-sale", channel: "telegram", active: true, lastCheckedMonth: "2026-08" } } });
    expect(await call(alerts.POST(req("POST", "/api/alerts/", { ref: "hdb:blk-872a-tampines-st-86" })))).toMatchObject({ status: 409, body: { error: "already_exists" } });
    const launch = await call(alerts.POST(req("POST", "/api/alerts/", { ref: "launch:condo/upcoming-fixture-towers" })));
    expect(launch).toMatchObject({ status: 201, body: { item: { kind: "new-launch", lastCheckedMonth: null } } });
    expect(await call(alerts.POST(req("POST", "/api/alerts/", { ref: "hdb:blk-1-x", channel: "email" })))).toMatchObject({ status: 400, body: { error: "channel_unavailable" } });
    const id = (created.body.item as { id: number }).id;
    expect(await call(alerts.PATCH(req("PATCH", "/api/alerts/", { id, active: false })))).toMatchObject({ status: 200, body: { item: { active: false } } });
    const list = await call(alerts.GET());
    expect(list.body).toMatchObject({ max: 50, telegram: { linked: false } });
    expect(list.body.items).toHaveLength(2);
    // a lapsed subscriber can still delete
    state.viewer = viewerFor("free");
    expect(await call(alerts.DELETE(req("DELETE", "/api/alerts/", { id })))).toMatchObject({ status: 200 });
    expect(state.db.rows("alerts")).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* Stripe                                                              */
/* ------------------------------------------------------------------ */

function fakeStripe() {
  const calls = { customers: [] as unknown[], sessions: [] as Record<string, unknown>[] };
  const subscriptions: Record<string, unknown> = {};
  const stripe = {
    calls,
    subscriptions: { retrieve: async (id: string) => subscriptions[id] },
    store: subscriptions,
    customers: {
      create: async (params: unknown, opts: unknown) => {
        calls.customers.push({ params, opts });
        return { id: "cus_new" };
      },
      retrieve: async (id: string) => ({ id, object: "customer", metadata: { user_id: USER } }),
    },
    checkout: {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          calls.sessions.push(params);
          return { url: "https://checkout.stripe.com/c/pay/test" };
        },
      },
    },
    webhooks: {
      constructEvent: (payload: string, signature: string, secret: string) => {
        if (signature !== "t=1,v1=valid" || secret !== "whsec_test") throw new Error("No signatures found matching the expected signature");
        return JSON.parse(payload);
      },
    },
  };
  return stripe;
}

function stripeSub(id: string, status: string, userId: string | null = USER) {
  return {
    id,
    object: "subscription",
    customer: "cus_new",
    status,
    cancel_at_period_end: false,
    cancel_at: null,
    trial_end: status === "trialing" ? 1_791_590_400 : null,
    metadata: userId ? { user_id: userId } : {},
    items: { object: "list", data: [{ id: "si_1", current_period_end: 1_792_195_200, price: { id: "price_month" } }] },
  };
}

describe("/api/stripe/checkout/", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_MONTHLY", "price_month");
    vi.stubEnv("STRIPE_PRICE_YEARLY", "price_year");
    state.stripe = fakeStripe();
  });

  it("creates the customer once and a subscription checkout with the trial for first-timers", async () => {
    const res = await call(checkout.POST(req("POST", "/api/stripe/checkout/", { interval: "year" })));
    expect(res).toMatchObject({ status: 200, body: { url: "https://checkout.stripe.com/c/pay/test" } });
    const stripe = state.stripe as ReturnType<typeof fakeStripe>;
    expect(stripe.calls.customers).toHaveLength(1);
    expect(state.db.rows("subscriptions")[0]).toMatchObject({ user_id: USER, stripe_customer_id: "cus_new" });
    const session = stripe.calls.sessions[0];
    expect(session).toMatchObject({
      mode: "subscription",
      customer: "cus_new",
      client_reference_id: USER,
      line_items: [{ price: "price_year", quantity: 1 }],
      subscription_data: { metadata: { user_id: USER }, trial_period_days: site.plus.trialDays },
      success_url: "http://localhost:3000/profile/?checkout=success",
      cancel_url: "http://localhost:3000/plus/",
    });
    // second checkout reuses the stored customer
    await call(checkout.POST(req("POST", "/api/stripe/checkout/", { interval: "month" })));
    expect(stripe.calls.customers).toHaveLength(1);
  });

  it("skips the trial for returning subscribers and blocks a second live subscription", async () => {
    state.db.rows("subscriptions").push({ user_id: USER, stripe_customer_id: "cus_old", stripe_subscription_id: "sub_old", status: "canceled", trial_end: null, current_period_end: null });
    await call(checkout.POST(req("POST", "/api/stripe/checkout/", { interval: "month" })));
    const stripe = state.stripe as ReturnType<typeof fakeStripe>;
    expect(stripe.calls.sessions[0]).toMatchObject({ customer: "cus_old" });
    expect((stripe.calls.sessions[0].subscription_data as Record<string, unknown>).trial_period_days).toBeUndefined();
    state.db.rows("subscriptions")[0].status = "active";
    expect(await call(checkout.POST(req("POST", "/api/stripe/checkout/", { interval: "month" })))).toMatchObject({ status: 409, body: { error: "already_subscribed" } });
  });

  it("validates the interval and requires sign-in", async () => {
    expect(await call(checkout.POST(req("POST", "/api/stripe/checkout/", { interval: "week" })))).toMatchObject({ status: 400, body: { error: "invalid_interval" } });
    state.viewer = null;
    expect(await call(checkout.POST(req("POST", "/api/stripe/checkout/", { interval: "month" })))).toMatchObject({ status: 401 });
  });
});

describe("/api/stripe/webhook/", () => {
  beforeEach(() => {
    state.stripe = fakeStripe();
  });

  function event(type: string, object: unknown) {
    return req("POST", "/api/stripe/webhook/", JSON.stringify({ id: "evt_1", type, data: { object } }), { "stripe-signature": "t=1,v1=valid", origin: "" });
  }

  it("rejects bad signatures", async () => {
    const bad = req("POST", "/api/stripe/webhook/", JSON.stringify({ type: "customer.subscription.updated" }), { "stripe-signature": "t=1,v1=forged" });
    expect(await call(webhook.POST(bad))).toMatchObject({ status: 400, body: { error: "invalid_signature" } });
    expect(state.db.rows("subscriptions")).toHaveLength(0);
  });

  it("stores the subscription after checkout.session.completed", async () => {
    const stripe = state.stripe as ReturnType<typeof fakeStripe>;
    stripe.store.sub_1 = stripeSub("sub_1", "trialing");
    const res = await call(webhook.POST(event("checkout.session.completed", { id: "cs_1", mode: "subscription", subscription: "sub_1", client_reference_id: USER, metadata: {} })));
    expect(res).toMatchObject({ status: 200, body: { received: true } });
    expect(state.db.rows("subscriptions")[0]).toMatchObject({
      user_id: USER,
      stripe_customer_id: "cus_new",
      stripe_subscription_id: "sub_1",
      status: "trialing",
      price_id: "price_month",
      current_period_end: new Date(1_792_195_200 * 1000).toISOString(),
      trial_end: new Date(1_791_590_400 * 1000).toISOString(),
      cancel_at_period_end: false,
    });
  });

  it("mirrors subscription updates using the latest state from Stripe", async () => {
    const stripe = state.stripe as ReturnType<typeof fakeStripe>;
    // the event payload is stale ("incomplete"), Stripe now says "active"
    stripe.store.sub_1 = stripeSub("sub_1", "active", null);
    state.db.rows("subscriptions").push({ user_id: USER, stripe_customer_id: "cus_new", stripe_subscription_id: null, status: null });
    await call(webhook.POST(event("customer.subscription.created", stripeSub("sub_1", "incomplete", null))));
    expect(state.db.rows("subscriptions")[0]).toMatchObject({ user_id: USER, stripe_subscription_id: "sub_1", status: "active" });
  });

  it("does not let an old cancelled subscription overwrite a newer live one", async () => {
    const stripe = state.stripe as ReturnType<typeof fakeStripe>;
    state.db.rows("subscriptions").push({ user_id: USER, stripe_customer_id: "cus_new", stripe_subscription_id: "sub_new", status: "active" });
    stripe.store.sub_old = stripeSub("sub_old", "canceled");
    await call(webhook.POST(event("customer.subscription.deleted", stripeSub("sub_old", "canceled"))));
    expect(state.db.rows("subscriptions")[0]).toMatchObject({ stripe_subscription_id: "sub_new", status: "active" });
    // the live subscription's own cancellation is applied
    stripe.store.sub_new = stripeSub("sub_new", "canceled");
    await call(webhook.POST(event("customer.subscription.deleted", stripeSub("sub_new", "canceled"))));
    expect(state.db.rows("subscriptions")[0]).toMatchObject({ stripe_subscription_id: "sub_new", status: "canceled" });
  });

  it("acknowledges events it does not handle", async () => {
    expect(await call(webhook.POST(event("invoice.paid", { id: "in_1" })))).toMatchObject({ status: 200, body: { received: true, ignored: "invoice.paid" } });
  });
});

/* ------------------------------------------------------------------ */
/* Alerts delivery                                                     */
/* ------------------------------------------------------------------ */

describe("/api/cron/alerts/", () => {
  it("requires the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(await call(cron.GET(req("GET", "/api/cron/alerts/")))).toMatchObject({ status: 401 });
    expect(await call(cron.GET(req("GET", "/api/cron/alerts/", undefined, { authorization: "Bearer wrong" })))).toMatchObject({ status: 401 });
  });

  it("messages users whose property recorded a newer sale and advances last_checked_month", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:abc");
    vi.stubEnv("GATING_MODE", "enforce");
    const sent: { chat_id: string; text: string }[] = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const db = state.db;
    db.rows("profiles").push({ id: USER, telegram_chat_id: "111" }, { id: OTHER, telegram_chat_id: "222" });
    db.rows("subscriptions").push({ user_id: USER, status: "active", current_period_end: "2099-01-01T00:00:00Z" });
    db.rows("subscriptions").push({ user_id: OTHER, status: "canceled", current_period_end: "2026-01-01T00:00:00Z" });
    db.rows("alerts").push(
      { id: 1, user_id: USER, ref: "hdb:blk-872a-tampines-st-86", kind: "new-sale", channel: "telegram", active: true, last_checked_month: "2026-07" },
      { id: 2, user_id: USER, ref: "condo:sample-park-condo", kind: "new-sale", channel: "telegram", active: true, last_checked_month: "2026-06" },
      { id: 3, user_id: OTHER, ref: "hdb:blk-872a-tampines-st-86", kind: "new-sale", channel: "telegram", active: true, last_checked_month: "2026-07" },
      { id: 4, user_id: USER, ref: "hdb:blk-201-tampines-st-21", kind: "new-sale", channel: "telegram", active: false, last_checked_month: "2020-01" },
    );
    const res = await call(cron.GET(req("GET", "/api/cron/alerts/", undefined, { authorization: "Bearer s3cret" })));
    expect(res).toMatchObject({ status: 200, body: { ok: true, complete: true, checked: 3, sent: 1, messages: 1, failed: 0, skipped: { "no-change": 1, "not-entitled": 1 } } });
    expect(sent).toHaveLength(1);
    expect(sent[0].chat_id).toBe("111");
    expect(sent[0].text).toContain("Blk 872A Tampines St 86");
    const rows = db.rows("alerts");
    expect(rows.find((a) => a.id === 1)?.last_checked_month).toBe("2026-08");
    expect(rows.find((a) => a.id === 3)?.last_checked_month).toBe("2026-07");
  });

  it("sends one message per chat for several fired alerts, and unlinks chats that blocked the bot", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:abc");
    vi.stubEnv("GATING_MODE", "enforce");
    const sent: { chat_id: string; text: string }[] = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { chat_id: string; text: string };
      sent.push(body);
      return body.chat_id === "222"
        ? new Response(JSON.stringify({ ok: false, description: "Forbidden: bot was blocked by the user" }), { status: 403 })
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const db = state.db;
    db.rows("profiles").push({ id: USER, telegram_chat_id: "111" }, { id: OTHER, telegram_chat_id: "222" });
    db.rows("subscriptions").push({ user_id: USER, status: "active", current_period_end: "2099-01-01T00:00:00Z" }, { user_id: OTHER, status: "trialing", current_period_end: "2099-01-01T00:00:00Z" });
    db.rows("alerts").push(
      { id: 1, user_id: USER, ref: "hdb:blk-872a-tampines-st-86", kind: "new-sale", channel: "telegram", active: true, last_checked_month: "2026-07" },
      { id: 2, user_id: USER, ref: "launch:condo/aurora-fixture-residences", kind: "new-launch", channel: "telegram", active: true, last_checked_month: "2026-01" },
      { id: 3, user_id: OTHER, ref: "hdb:blk-872a-tampines-st-86", kind: "new-sale", channel: "telegram", active: true, last_checked_month: "2026-07" },
    );
    const res = await call(cron.GET(req("GET", "/api/cron/alerts/", undefined, { authorization: "Bearer s3cret" })));
    expect(res).toMatchObject({ status: 200, body: { sent: 2, messages: 1, failed: 1 } });
    expect(sent.filter((m) => m.chat_id === "111")).toHaveLength(1);
    expect(sent.find((m) => m.chat_id === "111")?.text).toMatch(/Blk 872A Tampines St 86[\s\S]*Aurora Fixture Residences/);
    const rows = db.rows("alerts");
    expect(rows.find((a) => a.id === 1)?.last_checked_month).toBe("2026-08");
    expect(rows.find((a) => a.id === 2)?.last_checked_month).toBe("2026-08");
    // the blocked chat is unlinked and its alert is kept for when the user links again
    expect(rows.find((a) => a.id === 3)?.last_checked_month).toBe("2026-07");
    expect(db.rows("profiles").find((p) => p.id === OTHER)?.telegram_chat_id).toBeNull();
    expect(db.rows("profiles").find((p) => p.id === USER)?.telegram_chat_id).toBe("111");
  });
});

describe("Telegram linking", () => {
  it("issues a deep link and links the chat from /start <code>", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:abc");
    vi.stubEnv("TELEGRAM_BOT_USERNAME", "@PlotlineBot");
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "hook-secret");
    const link = await call(telegramLink.POST(req("POST", "/api/telegram/link/", {})));
    expect(link.status).toBe(200);
    const url = String(link.body.url);
    expect(url).toMatch(/^https:\/\/t\.me\/PlotlineBot\?start=[A-Za-z0-9_-]{24}$/);
    const code = url.split("start=")[1];
    expect(state.db.rows("profiles")[0]).toMatchObject({ id: USER, telegram_link_code: code });

    const update = (text: string, type = "private") => ({ update_id: 1, message: { message_id: 1, text, chat: { id: 555, type } } });
    const forged = req("POST", "/api/telegram/webhook/", update(`/start ${code}`), { "x-telegram-bot-api-secret-token": "nope" });
    expect((await call(telegramWebhook.POST(forged))).status).toBe(401);
    const group = await call(telegramWebhook.POST(req("POST", "/api/telegram/webhook/", update(`/start ${code}`, "group"), { "x-telegram-bot-api-secret-token": "hook-secret" })));
    expect(group.body).toMatchObject({ method: "sendMessage", chat_id: "555" });
    expect(state.db.rows("profiles")[0].telegram_chat_id).toBeUndefined();

    const ok = await call(telegramWebhook.POST(req("POST", "/api/telegram/webhook/", update(`/start ${code}`), { "x-telegram-bot-api-secret-token": "hook-secret" })));
    expect(ok.body).toMatchObject({ method: "sendMessage", chat_id: "555" });
    expect(String(ok.body.text)).toContain("Linked");
    expect(state.db.rows("profiles")[0]).toMatchObject({ telegram_chat_id: "555", telegram_link_code: null });

    // the code is single-use
    const reused = await call(telegramWebhook.POST(req("POST", "/api/telegram/webhook/", update(`/start ${code}`), { "x-telegram-bot-api-secret-token": "hook-secret" })));
    expect(String(reused.body.text)).toContain("expired");

    const status = await call(telegramLink.GET());
    expect(status.body).toMatchObject({ configured: true, linked: true });

    const stop = await call(telegramWebhook.POST(req("POST", "/api/telegram/webhook/", update("/stop"), { "x-telegram-bot-api-secret-token": "hook-secret" })));
    expect(String(stop.body.text)).toContain("off");
    expect(state.db.rows("profiles")[0].telegram_chat_id).toBeNull();
  });
});
