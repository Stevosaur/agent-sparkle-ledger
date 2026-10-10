import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  customerIdOf,
  eligibleForTrial,
  hasLiveSubscription,
  isHandledEvent,
  periodEndOf,
  shouldReplace,
  subscriptionToRow,
  unixToIso,
  userIdFromCheckoutSession,
  userIdFromMetadata,
} from "./subscription";

const USER = "6f1c2a7e-3b4d-4c5e-8f90-1a2b3c4d5e6f";
const NOW = new Date("2026-10-10T00:00:00Z");

/** Minimal Stripe.Subscription fixture: only the fields the mapper reads. */
function sub(overrides: Partial<Record<string, unknown>> = {}): Stripe.Subscription {
  return {
    id: "sub_123",
    object: "subscription",
    customer: "cus_abc",
    status: "trialing",
    cancel_at_period_end: false,
    cancel_at: null,
    trial_end: 1_791_590_400, // 2026-10-10T00:00:00Z
    metadata: { user_id: USER },
    items: {
      object: "list",
      data: [
        { id: "si_1", current_period_end: 1_792_195_200, price: { id: "price_month" } }, // 2026-10-17
        { id: "si_2", current_period_end: 1_792_000_000, price: { id: "price_addon" } }, // earlier: ignored
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe("subscriptionToRow", () => {
  it("maps a trialing subscription, taking the period end from the items", () => {
    expect(subscriptionToRow(sub(), USER, NOW)).toEqual({
      user_id: USER,
      stripe_customer_id: "cus_abc",
      stripe_subscription_id: "sub_123",
      status: "trialing",
      price_id: "price_month",
      current_period_end: new Date(1_792_195_200 * 1000).toISOString(),
      trial_end: new Date(1_791_590_400 * 1000).toISOString(),
      cancel_at_period_end: false,
      updated_at: NOW.toISOString(),
    });
  });

  it("handles an expanded customer object and no trial", () => {
    const row = subscriptionToRow(sub({ customer: { id: "cus_xyz", object: "customer" }, status: "active", trial_end: null }), USER, NOW);
    expect(row.stripe_customer_id).toBe("cus_xyz");
    expect(row.status).toBe("active");
    expect(row.trial_end).toBeNull();
  });

  it("flags a scheduled cancellation via cancel_at_period_end or cancel_at", () => {
    expect(subscriptionToRow(sub({ cancel_at_period_end: true }), USER, NOW).cancel_at_period_end).toBe(true);
    expect(subscriptionToRow(sub({ cancel_at: 1_792_195_200 }), USER, NOW).cancel_at_period_end).toBe(true);
    // once cancelled, it is no longer "scheduled"
    expect(subscriptionToRow(sub({ cancel_at: 1_792_195_200, status: "canceled" }), USER, NOW).cancel_at_period_end).toBe(false);
  });

  it("maps a deleted (canceled) subscription", () => {
    const row = subscriptionToRow(sub({ status: "canceled" }), USER, NOW);
    expect(row.status).toBe("canceled");
    expect(row.stripe_subscription_id).toBe("sub_123");
  });

  it("tolerates subscriptions without items", () => {
    const row = subscriptionToRow(sub({ items: { object: "list", data: [] } }), USER, NOW);
    expect(row.price_id).toBeNull();
    expect(row.current_period_end).toBeNull();
  });
});

describe("helpers", () => {
  it("converts unix seconds", () => {
    expect(unixToIso(0)).toBeNull();
    expect(unixToIso(null)).toBeNull();
    expect(unixToIso(1_700_000_000)).toBe("2023-11-14T22:13:20.000Z");
  });

  it("reads customer ids and period ends", () => {
    expect(customerIdOf("cus_1")).toBe("cus_1");
    expect(customerIdOf({ id: "cus_2" })).toBe("cus_2");
    expect(customerIdOf(null)).toBeNull();
    expect(periodEndOf(sub())).toBe(1_792_195_200);
  });

  it("finds the user id on checkout sessions and metadata", () => {
    expect(userIdFromCheckoutSession({ client_reference_id: USER, metadata: null })).toBe(USER);
    expect(userIdFromCheckoutSession({ client_reference_id: null, metadata: { user_id: USER } })).toBe(USER);
    expect(userIdFromCheckoutSession({ client_reference_id: "not-a-uuid", metadata: {} })).toBeNull();
    expect(userIdFromMetadata({ user_id: USER })).toBe(USER);
    expect(userIdFromMetadata({ user_id: "x" })).toBeNull();
    expect(userIdFromMetadata(null)).toBeNull();
  });

  it("recognises handled event types", () => {
    expect(isHandledEvent("checkout.session.completed")).toBe(true);
    expect(isHandledEvent("customer.subscription.created")).toBe(true);
    expect(isHandledEvent("customer.subscription.updated")).toBe(true);
    expect(isHandledEvent("customer.subscription.deleted")).toBe(true);
    expect(isHandledEvent("invoice.paid")).toBe(false);
  });
});

describe("shouldReplace", () => {
  it("writes when there is no row or it is the same subscription", () => {
    expect(shouldReplace(null, { stripe_subscription_id: "sub_1", status: "canceled" })).toBe(true);
    expect(shouldReplace({ stripe_subscription_id: null, status: null }, { stripe_subscription_id: "sub_1", status: "trialing" })).toBe(true);
    expect(shouldReplace({ stripe_subscription_id: "sub_1", status: "active" }, { stripe_subscription_id: "sub_1", status: "canceled" })).toBe(true);
  });

  it("never lets a dead subscription overwrite a different live one", () => {
    expect(shouldReplace({ stripe_subscription_id: "sub_new", status: "active" }, { stripe_subscription_id: "sub_old", status: "canceled" })).toBe(false);
    expect(shouldReplace({ stripe_subscription_id: "sub_new", status: "trialing" }, { stripe_subscription_id: "sub_old", status: "incomplete_expired" })).toBe(false);
  });

  it("lets a live subscription replace another one", () => {
    expect(shouldReplace({ stripe_subscription_id: "sub_old", status: "canceled" }, { stripe_subscription_id: "sub_new", status: "active" })).toBe(true);
    expect(shouldReplace({ stripe_subscription_id: "sub_old", status: "canceled" }, { stripe_subscription_id: "sub_new", status: "incomplete" })).toBe(true);
  });
});

describe("trial eligibility and live subscriptions", () => {
  it("offers the trial only to first-time subscribers", () => {
    expect(eligibleForTrial(null)).toBe(true);
    expect(eligibleForTrial({ stripe_subscription_id: null, trial_end: null })).toBe(true);
    expect(eligibleForTrial({ stripe_subscription_id: "sub_1", trial_end: null })).toBe(false);
    expect(eligibleForTrial({ stripe_subscription_id: null, trial_end: "2026-01-01T00:00:00Z" })).toBe(false);
  });

  it("blocks a second checkout while a subscription is live", () => {
    expect(hasLiveSubscription(null, NOW)).toBe(false);
    expect(hasLiveSubscription({ status: "active", current_period_end: "2026-11-10T00:00:00Z" }, NOW)).toBe(true);
    expect(hasLiveSubscription({ status: "trialing", current_period_end: null }, NOW)).toBe(true);
    expect(hasLiveSubscription({ status: "past_due", current_period_end: "2026-11-10T00:00:00Z" }, NOW)).toBe(true);
    expect(hasLiveSubscription({ status: "active", current_period_end: "2026-09-10T00:00:00Z" }, NOW)).toBe(false);
    expect(hasLiveSubscription({ status: "canceled", current_period_end: "2026-11-10T00:00:00Z" }, NOW)).toBe(false);
  });
});
