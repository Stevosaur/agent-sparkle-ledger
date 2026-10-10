"use client";

export type LeadType = "mortgage" | "enquiry" | "services" | "listing" | "valuation" | "general";

export interface LeadFormProps {
  type: LeadType;
  /** context fields stored with the lead, e.g. { property: "condo:the-hillford" } */
  context?: Record<string, string>;
  title?: string;
  description?: string;
  submitLabel?: string;
}

/** Lead capture form posting to /api/leads/. STUB — implemented by the homes & leads work package. */
export function LeadForm(_props: LeadFormProps) {
  return null;
}
