import { z } from "zod";

export type JsonSchema = Record<string, unknown>;

const SAFE_INT_MIN = -9007199254740991;
const SAFE_INT_MAX = 9007199254740991;

/**
 * zod -> JSON Schema (draft 2020-12, as used by OpenAPI 3.1 and tool input schemas), without the
 * `$schema` key and the safe-integer bounds zod adds to every `.int()`.
 */
export function toJsonSchema(schema: z.ZodType, io: "input" | "output" = "output", opts: { openObjects?: boolean } = {}): JsonSchema {
  const out = z.toJSONSchema(schema, { io, unrepresentable: "any" }) as JsonSchema;
  delete out.$schema;
  return clean(out, opts.openObjects ?? false) as JsonSchema;
}

/**
 * Drop zod's safe-integer bounds; with `openObjects`, also drop `additionalProperties: false` so documented
 * response objects may gain fields later without breaking strict clients.
 */
function clean(node: unknown, openObjects: boolean): unknown {
  if (Array.isArray(node)) return node.map((n) => clean(n, openObjects));
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "minimum" && v === SAFE_INT_MIN) continue;
      if (k === "maximum" && v === SAFE_INT_MAX) continue;
      if (openObjects && k === "additionalProperties" && v === false) continue;
      out[k] = clean(v, openObjects);
    }
    return out;
  }
  return node;
}
