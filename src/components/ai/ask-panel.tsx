"use client";

import type { PropertyRef } from "@/lib/property-ref";

export interface AskPanelProps {
  /** what the question is about; "general" for site-wide questions */
  context: PropertyRef | { kind: "general" };
  title?: string;
  /** suggested starter questions */
  suggestions?: string[];
}

/** AI assistant grounded in the dataset. STUB — implemented by the AI work package (calls POST /api/ask/). */
export function AskPanel(_props: AskPanelProps) {
  return null;
}
