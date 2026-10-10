import { z } from "zod";

/** Body of POST /api/affordability/save/: a label plus the calculator's input and result objects. */

const finite = z.number().refine(Number.isFinite, "must be a finite number");

/** Calculator input / result values: numbers, short enums, flags and short lists of rule keys. */
const scalar = z.union([finite, z.string().max(40), z.boolean(), z.null(), z.array(z.string().max(40)).max(40)]);
const flatRecord = z.record(z.string().max(40), scalar).refine((o) => Object.keys(o).length <= 40, "too many fields");

export const saveCalculationSchema = z.object({
  label: z.string().trim().min(1).max(100),
  input: flatRecord,
  result: flatRecord,
});

export type SaveCalculationBody = z.infer<typeof saveCalculationSchema>;
