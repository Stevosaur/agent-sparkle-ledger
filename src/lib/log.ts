/**
 * Structured JSON logging with PII-aware redaction. Never log secrets, tokens, phone numbers or message bodies.
 */
const REDACT_KEYS = /pass|secret|token|authorization|cookie|api[_-]?key|phone|whatsapp|email|body|nric/i;

function redact(v: unknown, depth = 0): unknown {
  if (depth > 4 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1));
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, REDACT_KEYS.test(k) ? "[redacted]" : redact(val, depth + 1)]));
}

function write(level: "debug" | "info" | "warn" | "error", msg: string, fields?: Record<string, unknown>) {
  if (level === "debug" && process.env.LOG_LEVEL !== "debug") return;
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(redact(fields ?? {}) as object) });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (m: string, f?: Record<string, unknown>) => write("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => write("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => write("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => write("error", m, f),
};
