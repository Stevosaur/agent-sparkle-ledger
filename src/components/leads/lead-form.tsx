"use client";

import Link from "next/link";
import { useId, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, Mail, MessageCircle } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { site } from "@/lib/config/site";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";
import {
  HONEYPOT_FIELD,
  MAX_CONTEXT_ENTRIES,
  MAX_CONTEXT_KEY_LENGTH,
  MAX_CONTEXT_VALUE_LENGTH,
  MAX_MESSAGE_LENGTH,
  MORTGAGE_PURPOSES,
  SERVICE_TYPES,
  maxPreferredDate,
  singaporeToday,
  validateLeadFields,
  type LeadField,
  type LeadFieldErrors,
} from "@/lib/leads/validate";
import { isConfiguredEmail, mailtoHref, whatsappHref } from "@/lib/leads/contact-links";

export type LeadType = "mortgage" | "enquiry" | "services" | "listing" | "valuation" | "general";

/** Optional starting values, e.g. the services page prefills the postal code from ?postal=. */
export interface LeadFormInitialValues {
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  postal?: string;
  service?: string;
  preferredDate?: string;
  purpose?: string;
}

export interface LeadFormProps {
  type: LeadType;
  /** context fields stored with the lead, e.g. { property: "condo:the-hillford" } */
  context?: Record<string, string>;
  title?: string;
  description?: string;
  submitLabel?: string;
  initial?: LeadFormInitialValues;
}

type Status = "idle" | "submitting" | "success" | "error" | "disabled" | "rate_limited";

interface Values {
  name: string;
  email: string;
  phone: string;
  message: string;
  postal: string;
  service: string;
  preferredDate: string;
  purpose: string;
  consent: boolean;
}

const TYPE_COPY: Record<LeadType, { title: [string, string]; description: [string, string]; summary: [string, string] }> = {
  mortgage: {
    title: ["homes.lead.title.mortgage", "Talk to a mortgage adviser"],
    description: ["homes.lead.desc.mortgage", "Compare bank packages or refinance with help from a licensed adviser. Free and no obligation."],
    summary: ["homes.lead.summary.mortgage", "mortgage advice"],
  },
  enquiry: {
    title: ["homes.lead.title.enquiry", "Make an enquiry"],
    description: ["homes.lead.desc.enquiry", "Ask about this property and we will get back to you."],
    summary: ["homes.lead.summary.enquiry", "a property enquiry"],
  },
  services: {
    title: ["homes.lead.title.services", "Book a home service"],
    description: ["homes.lead.desc.services", "Tell us what you need. Our service partner will contact you to confirm the time and quote."],
    summary: ["homes.lead.summary.services", "a home service"],
  },
  listing: {
    title: ["homes.lead.title.listing", "Enquire about this home"],
    description: ["homes.lead.desc.listing", "Send your details and question and we will pass them to the lister."],
    summary: ["homes.lead.summary.listing", "a home listing"],
  },
  valuation: {
    title: ["homes.lead.title.valuation", "Request a professional valuation"],
    description: ["homes.lead.desc.valuation", "Leave your details and a valuer will contact you."],
    summary: ["homes.lead.summary.valuation", "a valuation"],
  },
  general: {
    title: ["homes.lead.title.general", "Contact us"],
    description: ["homes.lead.desc.general", "Send us a message and we will reply as soon as we can."],
    summary: ["homes.lead.summary.general", "a general enquiry"],
  },
};

/** Who the lead may be shared with, per type (shown in the PDPA consent text). */
const SHARE_WITH: Partial<Record<LeadType, [string, string]>> = {
  mortgage: ["homes.lead.share.mortgage", ", including sharing it with a licensed mortgage adviser we work with"],
  enquiry: ["homes.lead.share.enquiry", ", including sharing it with the party who can answer it, such as the developer's appointed sales team"],
  services: ["homes.lead.share.services", ", including sharing it with the partner who will provide the service"],
  listing: ["homes.lead.share.listing", ", including sharing it with the lister of this home"],
  valuation: ["homes.lead.share.valuation", ", including sharing it with a licensed valuer we work with"],
};

const SERVICE_LABELS: Record<(typeof SERVICE_TYPES)[number], [string, string]> = {
  cleaning: ["homes.services.cleaning", "Home cleaning"],
  moving: ["homes.services.moving", "Moving"],
  disinfection: ["homes.services.disinfection", "Disinfection"],
  aircon: ["homes.services.aircon", "Aircon servicing"],
};

const PURPOSE_LABELS: Record<(typeof MORTGAGE_PURPOSES)[number], [string, string]> = {
  purchase: ["homes.lead.purpose.purchase", "Buying a home"],
  refinance: ["homes.lead.purpose.refinance", "Refinancing"],
  unsure: ["homes.lead.purpose.unsure", "Not sure yet"],
};

const ERROR_COPY: Record<LeadField, [string, string]> = {
  type: ["homes.lead.err.generic", "Please check this field."],
  name: ["homes.lead.err.name", "Enter your name (up to 100 characters)."],
  email: ["homes.lead.err.email", "Enter a valid e-mail address."],
  phone: ["homes.lead.err.phone", "Enter a Singapore number: 8 digits starting with 3, 6, 8 or 9."],
  contact: ["homes.lead.err.contact", "Give an e-mail address or a phone number so we can reply."],
  message: ["homes.lead.err.message", "Keep the message under 2,000 characters."],
  context: ["homes.lead.err.generic", "Please check this field."],
  consent: ["homes.lead.err.consent", "Please agree so we can respond to your request."],
  postal: ["homes.lead.err.postal", "Enter a 6-digit Singapore postal code."],
  service: ["homes.lead.err.service", "Choose a service."],
  preferredDate: ["homes.lead.err.date", "Choose a date from today up to a year ahead."],
  purpose: ["homes.lead.err.generic", "Please check this field."],
};

/** Order used to focus the first invalid field. */
const FIELD_ORDER: LeadField[] = ["name", "email", "phone", "contact", "postal", "service", "preferredDate", "purpose", "message", "consent"];

const noopSubscribe = () => () => undefined;

/** Keep only context entries the API accepts (key pattern, value length, entry count). */
function sanitizeContext(ctx: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (Object.keys(out).length >= MAX_CONTEXT_ENTRIES) break;
    if (!/^[A-Za-z0-9_.:-]+$/.test(k) || k.length > MAX_CONTEXT_KEY_LENGTH || typeof v !== "string") continue;
    const value = v.trim().slice(0, MAX_CONTEXT_VALUE_LENGTH);
    if (value) out[k] = value;
  }
  return out;
}

function ErrorText({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-xs font-medium text-down">
      {children}
    </p>
  );
}

/**
 * Lead capture form posting to /api/leads/. Fields depend on `type` (services: postal code, service,
 * preferred date; mortgage: purpose). Requires PDPA consent. When the API answers 503 (no lead store
 * configured) it offers WhatsApp and e-mail fallbacks, showing only the channels that are configured.
 */
export function LeadForm({ type, context, title, description, submitLabel, initial }: LeadFormProps) {
  const t = useT();
  const uid = useId();
  const id = (field: string) => `${uid}-${field}`;
  const copy = TYPE_COPY[type] ?? TYPE_COPY.general;
  // Date bounds only on the client (server snapshot null) so cached HTML never disagrees with "today".
  const today = useSyncExternalStore(noopSubscribe, singaporeToday, () => null);

  const [values, setValues] = useState<Values>(() => ({
    name: initial?.name ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    message: initial?.message ?? "",
    postal: initial?.postal ?? "",
    service: initial?.service && (SERVICE_TYPES as readonly string[]).includes(initial.service) ? initial.service : "",
    preferredDate: initial?.preferredDate ?? "",
    purpose: initial?.purpose && (MORTGAGE_PURPOSES as readonly string[]).includes(initial.purpose) ? initial.purpose : "",
    consent: false,
  }));
  const [errors, setErrors] = useState<LeadFieldErrors>({});
  const [status, setStatus] = useState<Status>("idle");

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    if (Object.keys(errors).length) {
      setErrors((e) => {
        const next = { ...e };
        delete next[key as LeadField];
        if (key === "email" || key === "phone") delete next.contact;
        return next;
      });
    }
  }

  function errorFor(field: LeadField): string | null {
    const code = errors[field];
    if (!code) return null;
    const [k, fb] = ERROR_COPY[field];
    return t(k, fb);
  }

  function describedBy(...fields: LeadField[]): string | undefined {
    const ids = fields.filter((f) => errors[f]).map((f) => id(`${f}-error`));
    return ids.length ? ids.join(" ") : undefined;
  }

  function focusFirst(errs: LeadFieldErrors) {
    const first = FIELD_ORDER.find((f) => errs[f]);
    if (!first) return;
    const target = first === "contact" ? "email" : first;
    document.getElementById(id(target))?.focus();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;
    const errs = validateLeadFields({ type, ...values }, singaporeToday());
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      focusFirst(errs);
      return;
    }
    const honeypot = String(new FormData(e.currentTarget).get(HONEYPOT_FIELD) ?? "");
    const extra: Record<string, string> = {};
    if (type === "services") {
      extra.postal = values.postal.trim();
      extra.service = values.service;
      if (values.preferredDate) extra.preferredDate = values.preferredDate;
    }
    if (type === "mortgage" && values.purpose) extra.purpose = values.purpose;
    const payload = {
      type,
      name: values.name.trim(),
      email: values.email.trim() || undefined,
      phone: values.phone.trim() || undefined,
      message: values.message.trim() || undefined,
      context: sanitizeContext({ page: window.location.pathname, ...(context ?? {}), ...extra }),
      consent: true,
      [HONEYPOT_FIELD]: honeypot,
    };
    setStatus("submitting");
    try {
      const res = await fetch("/api/leads/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setStatus("success");
        return;
      }
      if (res.status === 503) return setStatus("disabled");
      if (res.status === 429) return setStatus("rate_limited");
      const body = (await res.json().catch(() => null)) as { fields?: LeadFieldErrors } | null;
      if (res.status === 400 && body?.fields && Object.keys(body.fields).length) {
        setErrors(body.fields);
        setStatus("idle");
        focusFirst(body.fields);
        return;
      }
      setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  function reset() {
    setValues((v) => ({ ...v, message: "", preferredDate: "", consent: false }));
    setErrors({});
    setStatus("idle");
  }

  const heading = title ?? t(copy.title[0], copy.title[1]);
  const intro = description ?? t(copy.description[0], copy.description[1]);

  if (status === "success") {
    return (
      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-8 text-center" role="status" aria-live="polite">
          <CheckCircle2 className="size-8 text-up" aria-hidden />
          <div className="text-base font-semibold text-ink">{t("homes.lead.successTitle", "Request received")}</div>
          <p className="max-w-md text-sm text-muted">{t("homes.lead.successBody", "Thank you. We will contact you within one to two working days.")}</p>
          <Button type="button" variant="outline" size="sm" onClick={reset}>
            {t("homes.lead.sendAnother", "Send another request")}
          </Button>
        </CardBody>
      </Card>
    );
  }

  // Fallback channels for the 503 "leads_disabled" case, built locally from what the visitor typed.
  const summaryLines = [
    t("homes.lead.fallbackIntro", "Hi {site}, I would like help with {topic}.", { site: site.name, topic: t(copy.summary[0], copy.summary[1]) }),
    values.name.trim() && `${t("homes.lead.name", "Name")}: ${values.name.trim()}`,
    type === "services" && values.postal.trim() && `${t("homes.lead.postal", "Postal code")}: ${values.postal.trim()}`,
    type === "services" && values.service && `${t("homes.lead.service", "Service")}: ${t(SERVICE_LABELS[values.service as keyof typeof SERVICE_LABELS][0], SERVICE_LABELS[values.service as keyof typeof SERVICE_LABELS][1])}`,
    type === "services" && values.preferredDate && `${t("homes.lead.date", "Preferred date")}: ${values.preferredDate}`,
    values.message.trim(),
  ].filter(Boolean) as string[];
  const fallbackText = summaryLines.join("\n");
  const waHref = whatsappHref(site.whatsapp, fallbackText);
  const emailOk = isConfiguredEmail(site.contactEmail);

  const busy = status === "submitting";
  const share = SHARE_WITH[type];
  const shareText = share ? t(share[0], share[1]) : "";

  return (
    <Card>
      <CardHeader title={heading} description={intro} />
      <CardBody>
        <form noValidate onSubmit={onSubmit} className="space-y-4" aria-describedby={Object.keys(errors).length ? id("summary") : undefined}>
          {Object.keys(errors).length > 0 ? (
            <p id={id("summary")} role="alert" className="text-sm font-medium text-down">
              {t("homes.lead.fixErrors", "Please fix the highlighted fields.")}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor={id("name")} className="block text-sm font-medium text-ink">
              {t("homes.lead.name", "Name")}
            </label>
            <Input
              id={id("name")}
              name="name"
              autoComplete="name"
              maxLength={100}
              required
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={describedBy("name")}
            />
            {errors.name ? <ErrorText id={id("name-error")}>{errorFor("name")}</ErrorText> : null}
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-ink">{t("homes.lead.contactLegend", "How should we reach you?")}</legend>
            <p id={id("contact-hint")} className="text-xs text-muted">
              {t("homes.lead.contactHint", "Give at least one: e-mail or Singapore mobile / phone number.")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor={id("email")} className="block text-sm text-ink">
                  {t("homes.lead.email", "E-mail")}
                </label>
                <Input
                  id={id("email")}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={254}
                  value={values.email}
                  onChange={(e) => set("email", e.target.value)}
                  aria-invalid={errors.email || errors.contact ? true : undefined}
                  aria-describedby={[id("contact-hint"), describedBy("email", "contact")].filter(Boolean).join(" ")}
                />
                {errors.email ? <ErrorText id={id("email-error")}>{errorFor("email")}</ErrorText> : null}
              </div>
              <div className="space-y-1.5">
                <label htmlFor={id("phone")} className="block text-sm text-ink">
                  {t("homes.lead.phone", "Phone (Singapore)")}
                </label>
                <Input
                  id={id("phone")}
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={20}
                  placeholder="9123 4567"
                  value={values.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  aria-invalid={errors.phone || errors.contact ? true : undefined}
                  aria-describedby={[id("contact-hint"), describedBy("phone", "contact")].filter(Boolean).join(" ")}
                />
                {errors.phone ? <ErrorText id={id("phone-error")}>{errorFor("phone")}</ErrorText> : null}
              </div>
            </div>
            {errors.contact ? <ErrorText id={id("contact-error")}>{errorFor("contact")}</ErrorText> : null}
          </fieldset>

          {type === "services" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor={id("postal")} className="block text-sm font-medium text-ink">
                  {t("homes.lead.postal", "Postal code")}
                </label>
                <Input
                  id={id("postal")}
                  name="postal"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={6}
                  required
                  value={values.postal}
                  onChange={(e) => set("postal", e.target.value.replace(/\D/g, "").slice(0, 6))}
                  aria-invalid={errors.postal ? true : undefined}
                  aria-describedby={describedBy("postal")}
                />
                {errors.postal ? <ErrorText id={id("postal-error")}>{errorFor("postal")}</ErrorText> : null}
              </div>
              <div className="space-y-1.5">
                <label htmlFor={id("service")} className="block text-sm font-medium text-ink">
                  {t("homes.lead.service", "Service")}
                </label>
                <Select
                  id={id("service")}
                  name="service"
                  required
                  value={values.service}
                  onChange={(e) => set("service", e.target.value)}
                  aria-invalid={errors.service ? true : undefined}
                  aria-describedby={describedBy("service")}
                >
                  <option value="">{t("homes.lead.chooseService", "Choose a service")}</option>
                  {SERVICE_TYPES.map((s) => (
                    <option key={s} value={s}>
                      {t(SERVICE_LABELS[s][0], SERVICE_LABELS[s][1])}
                    </option>
                  ))}
                </Select>
                {errors.service ? <ErrorText id={id("service-error")}>{errorFor("service")}</ErrorText> : null}
              </div>
              {/* own row: a date input is unreadable at a third of a sidebar-width form */}
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor={id("preferredDate")} className="block text-sm font-medium text-ink">
                  {t("homes.lead.dateOptional", "Preferred date (optional)")}
                </label>
                <Input
                  id={id("preferredDate")}
                  name="preferredDate"
                  type="date"
                  min={today ?? undefined}
                  max={today ? maxPreferredDate(today) : undefined}
                  value={values.preferredDate}
                  onChange={(e) => set("preferredDate", e.target.value)}
                  aria-invalid={errors.preferredDate ? true : undefined}
                  aria-describedby={describedBy("preferredDate")}
                />
                {errors.preferredDate ? <ErrorText id={id("preferredDate-error")}>{errorFor("preferredDate")}</ErrorText> : null}
              </div>
            </div>
          ) : null}

          {type === "mortgage" ? (
            <div className="space-y-1.5">
              <label htmlFor={id("purpose")} className="block text-sm font-medium text-ink">
                {t("homes.lead.purpose", "What do you need?")}
              </label>
              <Select id={id("purpose")} name="purpose" value={values.purpose} onChange={(e) => set("purpose", e.target.value)} aria-describedby={describedBy("purpose")}>
                <option value="">{t("homes.lead.purposeAny", "Select (optional)")}</option>
                {MORTGAGE_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {t(PURPOSE_LABELS[p][0], PURPOSE_LABELS[p][1])}
                  </option>
                ))}
              </Select>
              {errors.purpose ? <ErrorText id={id("purpose-error")}>{errorFor("purpose")}</ErrorText> : null}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor={id("message")} className="block text-sm font-medium text-ink">
              {type === "services" ? t("homes.lead.notesOptional", "Notes for the service team (optional)") : t("homes.lead.messageOptional", "Message (optional)")}
            </label>
            <Textarea
              id={id("message")}
              name="message"
              maxLength={MAX_MESSAGE_LENGTH}
              rows={4}
              value={values.message}
              onChange={(e) => set("message", e.target.value)}
              aria-invalid={errors.message ? true : undefined}
              aria-describedby={[id("message-count"), describedBy("message")].filter(Boolean).join(" ")}
            />
            <div className="flex justify-between gap-2">
              {errors.message ? <ErrorText id={id("message-error")}>{errorFor("message")}</ErrorText> : <span />}
              <span id={id("message-count")} className="tabular text-xs text-muted">
                {values.message.length}/{MAX_MESSAGE_LENGTH}
              </span>
            </div>
          </div>

          {/* Honeypot: hidden from people and assistive tech; bots that fill every input reveal themselves. */}
          <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
            <label htmlFor={id(HONEYPOT_FIELD)}>Website</label>
            <input id={id(HONEYPOT_FIELD)} name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-start gap-3">
              <input
                id={id("consent")}
                name="consent"
                type="checkbox"
                checked={values.consent}
                onChange={(e) => set("consent", e.target.checked)}
                className="mt-0.5 size-4 shrink-0 rounded border-line accent-brand-700"
                aria-invalid={errors.consent ? true : undefined}
                aria-describedby={describedBy("consent")}
              />
              <label htmlFor={id("consent")} className="text-xs leading-relaxed text-muted">
                {t(
                  "homes.lead.consent",
                  "I agree that {site} may collect, use and disclose the personal data above to respond to this request{share}, in line with the Personal Data Protection Act 2012 (PDPA). I can withdraw consent at any time by contacting {site}.",
                  { site: site.name, share: shareText },
                )}{" "}
                <Link href="/privacy/" className="font-medium text-brand-700 underline-offset-2 hover:underline">
                  {t("homes.lead.privacy", "Privacy policy")}
                </Link>
              </label>
            </div>
            {errors.consent ? <ErrorText id={id("consent-error")}>{errorFor("consent")}</ErrorText> : null}
          </div>

          {status === "disabled" ? (
            <Notice tone="warn" title={t("homes.lead.disabledTitle", "Online requests are not connected yet")}>
              {waHref || emailOk ? (
                <>
                  <p>{t("homes.lead.disabledBody", "Your request was not sent. Please contact us directly instead:")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {waHref ? (
                      <a href={waHref} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "sm")}>
                        <MessageCircle className="size-4" aria-hidden />
                        {t("homes.lead.whatsapp", "WhatsApp us")}
                      </a>
                    ) : null}
                    {emailOk ? (
                      <a href={mailtoHref(site.contactEmail, `${site.name}: ${t(copy.summary[0], copy.summary[1])}`, fallbackText)} className={buttonClass("outline", "sm")}>
                        <Mail className="size-4" aria-hidden />
                        {t("homes.lead.email", "E-mail")}
                      </a>
                    ) : null}
                  </div>
                </>
              ) : (
                <p>{t("homes.lead.disabledNoFallback", "Your request was not sent and no other contact channel is set up on this site yet. Please try again later.")}</p>
              )}
            </Notice>
          ) : null}
          {status === "rate_limited" ? (
            <p role="alert" className="text-sm font-medium text-down">
              {t("homes.lead.rateLimited", "Too many requests from your connection. Please wait a few minutes and try again.")}
            </p>
          ) : null}
          {status === "error" ? (
            <p role="alert" className="text-sm font-medium text-down">
              {t("homes.lead.error", "We could not send your request. Please try again.")}
            </p>
          ) : null}

          <Button type="submit" disabled={busy} aria-busy={busy || undefined} className={cn("w-full sm:w-auto")}>
            {busy ? t("homes.lead.sending", "Sending…") : (submitLabel ?? t("homes.lead.submit", "Send request"))}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
