/**
 * Lead-form validation rules shared by the browser form and the POST /api/leads/ handler.
 * Pure functions only (no zod, no server imports) so the client bundle stays small.
 */

export const LEAD_TYPES = ["mortgage", "enquiry", "services", "listing", "valuation", "general"] as const;
export type LeadTypeValue = (typeof LEAD_TYPES)[number];

/** Home services offered through the services lead form. */
export const SERVICE_TYPES = ["cleaning", "moving", "disinfection", "aircon"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const MORTGAGE_PURPOSES = ["purchase", "refinance", "unsure"] as const;
export type MortgagePurpose = (typeof MORTGAGE_PURPOSES)[number];

export const MAX_NAME_LENGTH = 100;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_CONTEXT_ENTRIES = 20;
export const MAX_CONTEXT_KEY_LENGTH = 40;
export const MAX_CONTEXT_VALUE_LENGTH = 200;
/** Furthest a preferred service date may be booked ahead. */
export const MAX_BOOKING_DAYS_AHEAD = 365;

/** Name of the hidden honeypot input. Humans never fill it; naive bots do. */
export const HONEYPOT_FIELD = "website";

export function isLeadType(value: unknown): value is LeadTypeValue {
  return typeof value === "string" && (LEAD_TYPES as readonly string[]).includes(value);
}

export function isServiceType(value: unknown): value is ServiceType {
  return typeof value === "string" && (SERVICE_TYPES as readonly string[]).includes(value);
}

/**
 * Singapore phone numbers: 8 digits starting with 3, 6, 8 or 9, optionally prefixed by +65 or 65.
 * Spaces, hyphens, dots and brackets are ignored. Returns the E.164 form ("+6591234567") or null.
 */
export function normalizeSgPhone(input: string): string | null {
  const compact = input.trim().replace(/[\s\-().]/g, "");
  const m = /^(?:\+?65)?([3689]\d{7})$/.exec(compact);
  return m ? `+65${m[1]}` : null;
}

export function isValidSgPhone(input: string): boolean {
  return normalizeSgPhone(input) !== null;
}

/**
 * Singapore postal codes are 6 digits; the first two digits are the postal sector, 01 to 82.
 */
export function isValidPostalCode(input: string): boolean {
  const code = input.trim();
  if (!/^\d{6}$/.test(code)) return false;
  const sector = Number(code.slice(0, 2));
  return sector >= 1 && sector <= 82;
}

/** Pragmatic e-mail check: one "@", no spaces, a dot in the domain, at most 254 characters. */
export function isValidEmail(input: string): boolean {
  const email = input.trim();
  return email.length <= MAX_EMAIL_LENGTH && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[A-Za-z]{2,}$/.test(email);
}

/** Today's date in Singapore (UTC+8, no daylight saving) as "YYYY-MM-DD". */
export function singaporeToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

function parseIsoDate(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(t);
  // reject rolled-over dates such as 2026-02-30
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return t;
}

/** A preferred service date: a real calendar date, not before `today`, at most a year ahead. */
export function isValidPreferredDate(value: string, today: string = singaporeToday()): boolean {
  const t = parseIsoDate(value.trim());
  const base = parseIsoDate(today);
  if (t == null || base == null) return false;
  return t >= base && t <= base + MAX_BOOKING_DAYS_AHEAD * 86_400_000;
}

/** "2026-12-31" one year after `today`, for the date input's max attribute. */
export function maxPreferredDate(today: string = singaporeToday()): string {
  const base = parseIsoDate(today) ?? Date.now();
  return new Date(base + MAX_BOOKING_DAYS_AHEAD * 86_400_000).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Cross-field rules (shared by the form and the API)                  */
/* ------------------------------------------------------------------ */

export type LeadField =
  | "type"
  | "name"
  | "email"
  | "phone"
  | "contact"
  | "message"
  | "context"
  | "consent"
  | "postal"
  | "service"
  | "preferredDate"
  | "purpose";

/**
 * Error codes per field ("required" | "invalid" | "too_long"). Codes, not messages, so the client can
 * translate them and so nothing the visitor typed is ever echoed back by the API.
 */
export type LeadFieldErrors = Partial<Record<LeadField, string>>;

export interface LeadFieldValues {
  type: LeadTypeValue;
  name: string;
  email: string;
  phone: string;
  message: string;
  consent: boolean;
  /** services only */
  postal?: string;
  service?: string;
  preferredDate?: string;
  /** mortgage only */
  purpose?: string;
}

export function validateLeadFields(v: LeadFieldValues, today: string = singaporeToday()): LeadFieldErrors {
  const errors: LeadFieldErrors = {};
  const name = v.name.trim();
  if (!name) errors.name = "required";
  else if (name.length > MAX_NAME_LENGTH) errors.name = "too_long";

  const email = v.email.trim();
  const phone = v.phone.trim();
  if (email && !isValidEmail(email)) errors.email = "invalid";
  if (phone && !isValidSgPhone(phone)) errors.phone = "invalid";
  if (!email && !phone) errors.contact = "required";

  if (v.message.trim().length > MAX_MESSAGE_LENGTH) errors.message = "too_long";
  if (v.consent !== true) errors.consent = "required";

  if (v.type === "services") {
    const postal = (v.postal ?? "").trim();
    if (!postal) errors.postal = "required";
    else if (!isValidPostalCode(postal)) errors.postal = "invalid";
    const service = (v.service ?? "").trim();
    if (!service) errors.service = "required";
    else if (!isServiceType(service)) errors.service = "invalid";
    const date = (v.preferredDate ?? "").trim();
    if (date && !isValidPreferredDate(date, today)) errors.preferredDate = "invalid";
  }
  if (v.type === "mortgage") {
    const purpose = (v.purpose ?? "").trim();
    if (purpose && !(MORTGAGE_PURPOSES as readonly string[]).includes(purpose)) errors.purpose = "invalid";
  }
  return errors;
}
