import { z } from "zod";
import { HDB_FLAT_TYPES } from "@/lib/data/types";
import { parsePropertyRef } from "@/lib/property-ref";
import { normalizeSgPhone } from "@/lib/leads/validate";
import { LISTING_LIMITS as L } from "./constants";
import type { ListingKind, ListingType } from "./types";

/** Validation for POST /api/homes/ (create a listing). */

export type ListingInputField =
  | "listingType"
  | "ref"
  | "title"
  | "description"
  | "askingPrice"
  | "flatType"
  | "areaSqm"
  | "floorLevel"
  | "bedrooms"
  | "bathrooms"
  | "contactName"
  | "whatsapp";

export type ListingInputErrors = Partial<Record<ListingInputField, string>>;

export interface ListingInput {
  listingType: ListingType;
  ref: string;
  kind: ListingKind;
  title: string;
  description: string | null;
  askingPrice: number;
  flatType: string | null;
  areaSqm: number | null;
  floorLevel: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  contactName: string | null;
  /** digits only, e.g. "6591234567" */
  whatsapp: string | null;
}

const optionalNumber = z.preprocess((v) => (v === "" || v === null ? undefined : typeof v === "string" ? Number(v) : v), z.number().finite().optional());

const schema = z.object({
  listingType: z.enum(["sale", "rent"]),
  ref: z.string().trim().min(1).max(200),
  title: z.string().trim().min(5).max(L.title),
  description: z.string().trim().max(L.description).optional(),
  askingPrice: z.preprocess((v) => (typeof v === "string" ? Number(v.replace(/[,\s]/g, "")) : v), z.number().finite().positive()),
  flatType: z.string().trim().max(40).optional(),
  areaSqm: optionalNumber,
  floorLevel: optionalNumber,
  bedrooms: optionalNumber,
  bathrooms: optionalNumber,
  contactName: z.string().trim().max(L.contactName).optional(),
  whatsapp: z.string().trim().max(24).optional(),
});

const FIELDS = new Set<string>(["listingType", "ref", "title", "description", "askingPrice", "flatType", "areaSqm", "floorLevel", "bedrooms", "bathrooms", "contactName", "whatsapp"]);

export function parseListingInput(input: unknown): { ok: true; value: ListingInput } | { ok: false; errors: ListingInputErrors } {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const errors: ListingInputErrors = {};
    for (const issue of parsed.error.issues) {
      const head = String(issue.path[0] ?? "");
      if (!FIELDS.has(head)) continue;
      const f = head as ListingInputField;
      if (!errors[f]) errors[f] = issue.code === "too_big" ? "too_long" : issue.code === "too_small" ? "required" : "invalid";
    }
    if (Object.keys(errors).length === 0) errors.ref = "invalid";
    return { ok: false, errors };
  }
  const d = parsed.data;
  const errors: ListingInputErrors = {};

  const ref = parsePropertyRef(d.ref);
  const kind = ref && (ref.kind === "hdb" || ref.kind === "condo" || ref.kind === "landed") ? ref.kind : null;
  if (!kind) errors.ref = "invalid";

  const price = Math.round(d.askingPrice);
  const [minP, maxP] = d.listingType === "sale" ? [L.minSalePrice, L.maxSalePrice] : [L.minRent, L.maxRent];
  if (price < minP || price > maxP) errors.askingPrice = "out_of_range";

  let flatType: string | null = d.flatType ? d.flatType.toUpperCase() : null;
  if (kind === "hdb") {
    if (!flatType) errors.flatType = "required";
    else if (!(HDB_FLAT_TYPES as readonly string[]).includes(flatType)) errors.flatType = "invalid";
  } else if (flatType) {
    flatType = d.flatType ?? null;
  }

  const area = d.areaSqm;
  if (area != null && (area < L.minAreaSqm || area > L.maxAreaSqm)) errors.areaSqm = "out_of_range";
  if (kind === "condo" && area == null) errors.areaSqm = "required";

  const int = (v: number | undefined, max: number, min: number, field: ListingInputField): number | null => {
    if (v == null) return null;
    if (!Number.isInteger(v) || v < min || v > max) {
      errors[field] = "out_of_range";
      return null;
    }
    return v;
  };
  const floorLevel = int(d.floorLevel, L.maxFloor, 1, "floorLevel");
  const bedrooms = int(d.bedrooms, L.maxRooms, 0, "bedrooms");
  const bathrooms = int(d.bathrooms, L.maxRooms, 0, "bathrooms");

  let whatsapp: string | null = null;
  if (d.whatsapp) {
    const e164 = normalizeSgPhone(d.whatsapp);
    if (!e164) errors.whatsapp = "invalid";
    else whatsapp = e164.slice(1);
  }

  if (Object.keys(errors).length > 0 || !kind) return { ok: false, errors };
  return {
    ok: true,
    value: {
      listingType: d.listingType,
      ref: d.ref,
      kind,
      title: d.title,
      description: d.description ? d.description : null,
      askingPrice: price,
      flatType,
      areaSqm: area != null ? Math.round(area * 10) / 10 : null,
      floorLevel,
      bedrooms,
      bathrooms,
      contactName: d.contactName ? d.contactName : null,
      whatsapp,
    },
  };
}
