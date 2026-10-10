"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { FeatureKey, Plan } from "./entitlements";

export interface ClientViewer {
  signedIn: boolean;
  email: string | null;
  plan: Plan;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  gating: "open" | "enforce";
  features: Partial<Record<FeatureKey, boolean>>;
  integrations: { auth: boolean; billing: boolean; ai: boolean };
}

interface ViewerContextValue {
  viewer: ClientViewer | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

async function loadViewer(): Promise<ClientViewer | null> {
  try {
    const res = await fetch("/api/me/", { cache: "no-store", credentials: "same-origin" });
    return res.ok ? ((await res.json()) as ClientViewer) : null;
  } catch {
    return null;
  }
}

const ViewerContext = createContext<ViewerContextValue>({ viewer: null, loading: true, refresh: async () => undefined });

/** Loads /api/me/ once per page load so static pages can still personalise gated sections client-side. */
export function ViewerProvider({ children }: { children: ReactNode }) {
  const [viewer, setViewer] = useState<ClientViewer | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await loadViewer();
    if (next) setViewer(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadViewer().then((next) => {
      if (cancelled) return;
      if (next) setViewer(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <ViewerContext.Provider value={{ viewer, loading, refresh }}>{children}</ViewerContext.Provider>;
}

export function useViewer(): ViewerContextValue {
  return useContext(ViewerContext);
}

export function useFeature(feature: FeatureKey): { allowed: boolean; loading: boolean; viewer: ClientViewer | null } {
  const { viewer, loading } = useViewer();
  return { allowed: Boolean(viewer?.features[feature]), loading, viewer };
}
