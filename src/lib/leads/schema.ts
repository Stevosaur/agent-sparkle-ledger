import { z } from "zod";
import {
  HONEYPOT_FIELD,
  LEAD_TYPES,
  MAX_CONTEXT_ENTRIES,
  MAX_CONTEXT_KEY_LENGTH,
  MAX_CONTEXT_VALUE_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_NAME_LENGTH,
  normalizeSgPhone,
  singaporeToday,
  validateLeadFields,
  type LeadField,
  type LeadFieldErrors,
  type LeadTypeValue,
} from "./validate";

export type { LeadFieldErrors };

/** A validated, normalised lead ready to store or forward. */
export interface ValidLead {
  type: LeadTypeValue;
  name: string;
  /** lower-cased, or null when only a phone number was given */
  email: string | null;
  /** E.164 ("+6591234567"), or null when only an e-mail was given */
  phone: string | null;
  message: string | null;
  context: Record<string, string>;
}

export type ParseLeadResult = { ok: true; lead: ValidLead } | { ok: false; spam: true } | { ok: false; spam: false; errors: LeadFieldErrors };

const contextKey = z
  .string()
  .min(1)
  .max(MAX_CONTEXT_KEY_LENGTH)
  .regex(/^[A-Za-z0-9_.:-]+$/);

/** Shape and length limits; cross-field rules live in validateLeadFields (shared with the form). */
const leadSchema = z.object({
  type: z.enum(LEAD_TYPES),
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  email: z.string().trim().max(MAX_EMAIL_LENGTH).optional(),
  phone: z.string().trim().max(32).optional(),
  message: z.string().trim().max(MAX_MESSAGE_LENGTH).optional(),
  context: z
    .record(contextKey, z.string().trim().max(MAX_CONTEXT_VALUE_LENGTH))
    .optional()
    .refine((c) => !c || Object.keys(c).length <= MAX_CONTEXT_ENTRIES, { message: "too_many_entries" }),
  consent: z.literal(true),
  [HONEYPOT_FIELD]: z.string().optional(),
});

const KNOWN_FIELDS = new Set<string>(["type", "name", "email", "phone", "message", "context", "consent"]);

function firstIssueByField(issues: readonly { code: string; path: readonly PropertyKey[] }[]): LeadFieldErrors {
  const errors: LeadFieldErrors = {};
  for (const issue of issues) {
    const head = String(issue.path[0] ?? "type");
    const field = (KNOWN_FIELDS.has(head) ? head : "type") as LeadField;
    if (errors[field]) continue;
    if (field === "consent") errors.consent = "required";
    else if (issue.code === "too_big") errors[field] = "too_long";
    else if (issue.code === "too_small") errors[field] = "required";
    else errors[field] = "invalid";
  }
  return errors;
}

/**
 * Validate an incoming lead payload (POST /api/leads/).
 * - Honeypot filled -> `{ spam: true }` (callers answer 200 without storing, so bots learn nothing).
 * - Name, at least one of e-mail / Singapore phone, message <= 2000 chars, consent === true.
 * - services leads need a valid postal code and service type in `context`; a preferred date is optional.
 * - mortgage leads may carry `context.purpose` (purchase | refinance | unsure).
 */
export function parseLeadPayload(input: unknown, opts: { today?: string } = {}): ParseLeadResult {
  if (input && typeof input === "object") {
    const hp = (input as Record<string, unknown>)[HONEYPOT_FIELD];
    if (typeof hp === "string" && hp.trim() !== "") return { ok: false, spam: true };
  }
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, spam: false, errors: firstIssueByField(parsed.error.issues) };

  const data = parsed.data;
  const context: Record<string, string> = {};
  for (const [k, v] of Object.entries(data.context ?? {})) if (v !== "") context[k] = v;

  const errors = validateLeadFields(
    {
      type: data.type,
      name: data.name,
      email: data.email ?? "",
      phone: data.phone ?? "",
      message: data.message ?? "",
      consent: data.consent,
      postal: context.postal,
      service: context.service,
      preferredDate: context.preferredDate,
      purpose: context.purpose,
    },
    opts.today ?? singaporeToday(),
  );
  if (Object.keys(errors).length > 0) return { ok: false, spam: false, errors };

  return {
    ok: true,
    lead: {
      type: data.type,
      name: data.name,
      email: data.email ? data.email.toLowerCase() : null,
      phone: data.phone ? normalizeSgPhone(data.phone) : null,
      message: data.message ? data.message : null,
      context,
    },
  };
}
