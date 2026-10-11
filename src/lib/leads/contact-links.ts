/** Direct-contact links (WhatsApp click-to-chat and mailto). Pure and client-safe. */

/** Digits of a WhatsApp number in international format ("+65 9123 4567" -> "6591234567"), or null. */
export function whatsappDigits(number: string | null | undefined): string | null {
  if (!number) return null;
  const digits = number.replace(/\D/g, "");
  // E.164 allows up to 15 digits; anything under 8 cannot be a reachable number.
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** https://wa.me/<digits>?text=<prefilled message>, or null when the number is unusable. */
export function whatsappHref(number: string | null | undefined, text?: string): string | null {
  const digits = whatsappDigits(number);
  if (!digits) return null;
  return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`;
}

/**
 * True when a contact e-mail is a real configured address rather than the placeholder default
 * (example.com / .org / .net are reserved and never deliverable).
 */
export function isConfiguredEmail(email: string | null | undefined): email is string {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e) && !/@(?:[^@]+\.)?example\.(?:com|org|net)$/.test(e);
}

export function mailtoHref(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
