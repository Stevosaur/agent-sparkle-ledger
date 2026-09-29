import { eq } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { species, speciesAlias, vendor, vendorContact, vessel, farm } from "@/lib/db/schema";
import type { SpeciesDictionaryEntry } from "@/lib/domain/species-match";
import type { VendorDictionaryEntry } from "@/lib/domain/intake-parser";

export async function speciesDictionary(x: Executor, orgId: string): Promise<SpeciesDictionaryEntry[]> {
  const [sp, al] = await Promise.all([
    x.select().from(species).where(eq(species.orgId, orgId)),
    x.select().from(speciesAlias).where(eq(speciesAlias.orgId, orgId)),
  ]);
  return sp
    .filter((s) => s.active)
    .map((s) => ({
      speciesId: s.id,
      code: s.code,
      canonicalName: s.canonicalName,
      names: [
        { text: s.canonicalName, kind: "CANONICAL" as const },
        ...(s.chineseName ? [{ text: s.chineseName, kind: "CHINESE" as const }] : []),
        ...(s.malayName ? [{ text: s.malayName, kind: "MALAY" as const }] : []),
        ...s.localNames.map((t) => ({ text: t, kind: "LOCAL" as const })),
        ...(s.scientificName ? [{ text: s.scientificName, kind: "SCIENTIFIC" as const }] : []),
        ...al.filter((a) => a.speciesId === s.id).map((a) => ({ text: a.alias, kind: "ALIAS" as const, learned: a.source !== "SEED" })),
      ],
    }));
}

export async function vendorDictionary(x: Executor, orgId: string): Promise<(VendorDictionaryEntry & { whatsapp: string | null })[]> {
  const [vs, cs, vsl, fm] = await Promise.all([
    x.select().from(vendor).where(eq(vendor.orgId, orgId)),
    x.select().from(vendorContact).where(eq(vendorContact.orgId, orgId)),
    x.select().from(vessel).where(eq(vessel.orgId, orgId)),
    x.select().from(farm).where(eq(farm.orgId, orgId)),
  ]);
  return vs
    .filter((v) => v.active)
    .map((v) => ({
      vendorId: v.id,
      name: v.name,
      whatsapp: v.whatsappNumber,
      aliases: [
        v.code,
        ...cs.filter((c) => c.vendorId === v.id).map((c) => c.name),
        ...vsl.filter((s) => s.vendorId === v.id).map((s) => s.name),
        ...fm.filter((f) => f.vendorId === v.id).map((f) => f.name),
        v.name.replace(/\b(pte|ltd|sdn|bhd|fishery|fisheries|trading|enterprise|seafood|marine|aquaculture|farm)\b\.?/gi, "").trim(),
      ].filter((a) => a && a.length >= 4),
    }));
}

export const normalisePhone = (p: string | null | undefined) => (p ?? "").replace(/[^\d]/g, "");
