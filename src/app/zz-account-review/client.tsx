"use client";
import type { TrackedHomeView } from "@/lib/account/types";
import { TrackedHomeCard } from "@/components/account/tracked-home-card";
import { TrackedHomes } from "@/components/account/tracked-homes";
import { WatchlistManager } from "@/components/account/watchlist-manager";
import { AlertsManager } from "@/components/account/alerts-manager";
import { TelegramLink } from "@/components/account/telegram-link";
import { LoginForm } from "@/components/account/login-form";
import { CheckoutButton, ManageBillingButton } from "@/components/account/billing-buttons";

export function ReviewClient({ homes }: { homes: TrackedHomeView[] }) {
  return (
    <div className="space-y-8">
      {homes.map((h) => (
        <TrackedHomeCard key={h.id} home={h} onChange={() => undefined} onRemove={() => undefined} />
      ))}
      <TrackedHomes />
      <WatchlistManager />
      <TelegramLink configured linked={false} />
      <AlertsManager />
      <LoginForm next="/profile/" mode="signup" googleEnabled />
      <ManageBillingButton />
      <CheckoutButton interval="year" featured />
    </div>
  );
}
