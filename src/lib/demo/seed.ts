/**
 * DEMO seed. Builds a fictional wholesaler at Jurong Fishery Port with:
 *  - reference data (species master, vendors, vessels, farms, buyers, fleet, documents, licences)
 *  - ~60 nights of bulk history (orders, lots, receipts, invoices, deliveries) for forecasts, prices and scorecards
 *  - LAST NIGHT: the full overnight story (23:15 → 07:00) executed through the real services and agents
 *  - TONIGHT: the same story in progress up to ~01:00, ready for a live demonstration
 * Everything is labelled DEMO DATA in the product.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/lib/db/client";
import * as S from "@/lib/db/schema";
import { SPECIES_CATALOGUE } from "@/lib/domain/species-catalogue";
import { normaliseName } from "@/lib/domain/species-match";
import { addDays, atMarketTime, compactDate, deliveryDateFor, isoWeekday, marketDateFor, sgtParts } from "@/lib/domain/time";
import { ROLES } from "@/lib/auth/rbac";
import { drain } from "@/lib/events/bus";
import { ingestSupplierMessage } from "@/lib/agents/catch-intake";
import { runProcurementAgent } from "@/lib/agents/procurement";
import { runDemandForecast } from "@/lib/agents/demand";
import { runLogisticsAgent, runSurplusAgent } from "@/lib/agents/operations";
import { acceptDeclaredLot, createPurchaseOrder } from "@/lib/services/procurement";
import { confirmLot, markLanded, transformLot, updateEta } from "@/lib/services/lots";
import { receiveLot } from "@/lib/services/receiving";
import { completeStop, createSalesOrder, dispatchShipment, generatePickList, pickAndPackOrder } from "@/lib/services/fulfilment";
import { approveForPayment, createCustomerInvoice, draftInvoiceFromPo, transmitInvoiceNow } from "@/lib/services/finance";
import { decideApproval } from "@/lib/services/approvals";
import type { Ctx } from "@/lib/services/context";
import { DEMO_CUSTOMERS, DEMO_DRIVERS, DEMO_PASSWORD, DEMO_USERS, DEMO_VEHICLES, DEMO_VENDORS, JFP, type DemoVendor } from "./data";

// ---------- deterministic randomness ----------
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(20260929);
const between = (a: number, b: number) => a + (b - a) * R();
const normal = (mu: number, sd: number) => mu + sd * Math.sqrt(-2 * Math.log(Math.max(1e-9, R()))) * Math.cos(2 * Math.PI * R());
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const pick = <T,>(xs: T[]) => xs[Math.floor(R() * xs.length)];

async function insertMany(table: Parameters<typeof db.insert>[0], rows: Record<string, unknown>[], chunk = 400) {
  for (let i = 0; i < rows.length; i += chunk) await db.insert(table).values(rows.slice(i, i + chunk) as never);
}

export type SeedResult = { orgId: string; tonight: string; lastNight: string; demoNow: Date; counts: Record<string, number> };

/** Which night to stage as "tonight" given the real clock. */
export function chooseTonight(realNow = new Date()): string {
  return marketDateFor(realNow);
}

export async function seedDemo(opts: { realNow?: Date; historyNights?: number; log?: (m: string) => void } = {}): Promise<SeedResult> {
  const log = opts.log ?? (() => {});
  const tonight = chooseTonight(opts.realNow);
  const lastNight = addDays(tonight, -1);
  const historyNights = opts.historyNights ?? 60;

  // ---------------- roles ----------------
  for (const [key, r] of Object.entries(ROLES)) {
    await db.insert(S.role).values({ key, name: r.name, description: r.description, permissions: r.permissions }).onConflictDoUpdate({ target: S.role.key, set: { name: r.name, description: r.description, permissions: r.permissions } });
  }

  // ---------------- organisation ----------------
  const [org] = await db
    .insert(S.organization)
    .values({
      name: "Selat Fresh Seafood (DEMO)", slug: "selat-fresh-demo", siteCode: "JFP", plan: "GROWTH", isDemo: true,
      features: { forecasting: true, rfq: true, recall: true, invoicenow: true, whatsappSimulator: true },
      uen: "DEMO00001X", gstRegistered: true, gstRegNo: "DEMO-GST-0001", gstRatePct: "9.00",
      settings: { dispatchCutoff: "06:00", marketOpens: "22:00", defaultAllocationPolicy: "PRIORITY", weightVarianceAlertPct: 5, receivingTempMaxC: 4, surplusDiscountFloorPct: 15, invoiceTolerance: { qtyPct: 1, pricePct: 0.5, amountAbs: 5 }, procurementWeights: { price: 0.35, reliability: 0.25, quality: 0.15, freshness: 0.1, eta: 0.1, relationship: 0.05 } },
    })
    .returning();
  const orgId = org.id;
  log(`org ${org.name}`);

  // ---------------- users ----------------
  const hash = await hashPassword(DEMO_PASSWORD);
  const userIds: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    const id = crypto.randomUUID();
    await db.insert(S.user).values({ id, name: u.name, email: u.email, emailVerified: true });
    await db.insert(S.account).values({ id: crypto.randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash });
    userIds[u.email] = id;
  }

  // ---------------- species ----------------
  const speciesRows = await db
    .insert(S.species)
    .values(SPECIES_CATALOGUE.map((c) => ({
      orgId, code: c.code, canonicalName: c.canonicalName, chineseName: c.chineseName ?? null, malayName: c.malayName ?? null, localNames: c.localNames,
      scientificName: c.scientificName ?? null, category: c.category, typicalSizeMinKg: String(c.sizeKg[0]), typicalSizeMaxKg: String(c.sizeKg[1]),
      typicalYieldPct: String(c.yieldPct), storage: c.storage, freshnessHours: c.freshnessHours, substituteCodes: c.substitutes, indicativeMarkupPct: String(c.markupPct),
      notes: "Operational mapping only — not a legally authoritative taxonomy.",
    })))
    .returning();
  const sp = Object.fromEntries(speciesRows.map((s) => [s.code, s]));
  const aliasRows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const c of SPECIES_CATALOGUE) for (const a of c.aliases) {
    const n = normaliseName(a.text);
    if (seen.has(n)) continue;
    seen.add(n);
    aliasRows.push({ orgId, speciesId: sp[c.code].id, alias: a.text, normalised: n, language: a.language, source: "SEED" });
  }
  await insertMany(S.speciesAlias, aliasRows);

  // ---------------- locations, fleet ----------------
  const [recvBay] = await db.insert(S.warehouseLocation).values([
    { orgId, code: "JFP-RB1", name: "Receiving bay 1 (JFP)", type: "RECEIVING_BAY", tempMinC: "0", tempMaxC: "4", lat: String(JFP.lat), lng: String(JFP.lng) },
    { orgId, code: "JFP-CH1", name: "Chiller 1", type: "CHILLER", tempMinC: "0", tempMaxC: "4" },
    { orgId, code: "JFP-PR1", name: "Processing room", type: "PROCESSING", tempMinC: "4", tempMaxC: "12" },
    { orgId, code: "JFP-DB1", name: "Dispatch bay (Jurong Fishery Port)", type: "DISPATCH_BAY", tempMinC: "0", tempMaxC: "4", address: "Jurong Fishery Port (demo tenancy)", lat: String(JFP.lat), lng: String(JFP.lng) },
    { orgId, code: "CS-EXT", name: "Third-party cold store (demo)", type: "COLD_STORE", tempMinC: "-25", tempMaxC: "-18", coldStoreLicenceNo: "DEMO-SFA-CS-0042" },
  ]).returning();
  void recvBay;
  const drivers = await db.insert(S.driver).values(DEMO_DRIVERS.map((d) => ({ orgId, name: d.name, phone: d.phone, licenceClass: "Class 4", shiftStart: d.shift[0], shiftEnd: d.shift[1] }))).returning();
  const vehicles = await db.insert(S.vehicle).values(DEMO_VEHICLES.map((v) => ({ orgId, name: v.name, plate: v.plate, capacityKg: String(v.capacityKg), refrigerated: true, tempMinC: "0", tempMaxC: "4" }))).returning();

  // ---------------- vendors ----------------
  const vendorByCode: Record<string, typeof S.vendor.$inferSelect & { demo: DemoVendor }> = {};
  for (const v of DEMO_VENDORS) {
    const [row] = await db
      .insert(S.vendor)
      .values({
        orgId, code: v.code, name: v.name, type: v.type, country: v.country, region: v.region, gstRegistered: v.gst, gstRegNo: v.gst ? `DEMO-GST-${v.code.slice(2)}` : null,
        paymentTermsDays: v.terms, preferredChannel: "WHATSAPP", whatsappNumber: v.whatsapp, relationshipTier: v.tier, distanceKm: String(v.distanceKm),
        minOrderKg: v.type === "IMPORTER" ? "10" : null, notes: "DEMO vendor — fictional.",
      })
      .returning();
    vendorByCode[v.code] = { ...row, demo: v };
    await db.insert(S.vendorContact).values({ orgId, vendorId: row.id, name: v.contact, role: v.type === "FISHING_VESSEL" || v.type === "FOREIGN_FISHERY" ? "Skipper / owner" : "Sales", whatsapp: v.whatsapp, isPrimary: true, preferredLanguage: v.country === "SG" ? "en" : v.country === "MY" ? "ms" : "id" });
    if (v.vessel) await db.insert(S.vessel).values({ orgId, vendorId: row.id, name: v.vessel.name, registrationNo: v.vessel.reg, licenceNo: `${v.vessel.reg}-LIC`, homePort: v.vessel.port, flagCountry: v.vessel.flag, gearType: v.vessel.gear, capacityKg: "3000" });
    if (v.farm) await db.insert(S.farm).values({ orgId, vendorId: row.id, name: v.farm.name, farmType: v.farm.type, location: v.farm.location, country: v.country, licenceNo: `DEMO-FARM-${v.code.slice(2)}` });
    if (v.species.length) await db.insert(S.vendorSpeciesCapability).values(v.species.map((c) => ({ orgId, vendorId: row.id, speciesId: sp[c].id, typicalKgPerNight: String(Math.round(between(30, 120))) })));
    // Licences & documents — fictional reference numbers, MANUAL verification only.
    const licences: Record<string, unknown>[] = [];
    const docs: Record<string, unknown>[] = [];
    const exp = (days: number) => addDays(tonight, days);
    if (v.type === "IMPORTER" || v.type === "WHOLESALER") licences.push({ licenceType: "SFA Licence for Import/Export/Transhipment of Meat and Fish Products", licenceNo: `DEMO-SFA-IMP-${v.code.slice(2)}`, issuer: "Singapore Food Agency (reference only)", validFrom: exp(-300), validTo: v.code === "V-OCEANHV" ? exp(12) : exp(400) });
    if (v.type === "AQUACULTURE_FARM" && v.country === "SG") licences.push({ licenceType: "SFA Fish Culture Farm Licence", licenceNo: `DEMO-SFA-FARM-${v.code.slice(2)}`, issuer: "Singapore Food Agency (reference only)", validFrom: exp(-200), validTo: exp(500) });
    if (v.type === "FISHING_VESSEL") licences.push({ licenceType: "Fishing vessel licence", licenceNo: `DEMO-SFA-FV-${v.code.slice(2)}`, issuer: "Singapore Food Agency (reference only)", validFrom: exp(-100), validTo: v.code === "V-KIMHOCK" ? exp(-3) : exp(260) });
    if (v.country !== "SG") licences.push({ licenceType: "Exporter registration (country of origin)", licenceNo: `DEMO-${v.country}-EXP-${v.code.slice(2)}`, issuer: `${v.country} competent authority (reference only)`, validFrom: exp(-150), validTo: exp(215) });
    if (v.code === "V-NORDIC") docs.push({ docType: "HEALTH_CERT", title: "Health certificate — chilled Atlantic salmon", referenceNo: "DEMO-HC-NO-7781", status: "VALID", issuedAt: exp(-2), expiresAt: exp(28) });
    if (v.type === "IMPORTER") docs.push({ docType: "CCP", title: "Cargo Clearance Permit reference (TradeNet via declaring agent)", referenceNo: `DEMO-CCP-${v.code.slice(2)}-0929`, status: "VALID", issuedAt: exp(-1), expiresAt: exp(30), integrationMode: "MANUAL" });
    if (v.country !== "SG") docs.push({ docType: "CATCH_CERT", title: "Catch / harvest declaration", referenceNo: `DEMO-CC-${v.code.slice(2)}`, status: v.code === "V-BATAM" ? "MISSING" : "VALID", issuedAt: exp(-5), expiresAt: exp(60) });
    docs.push({ docType: "GST_CERT", title: v.gst ? "GST registration" : "Not GST-registered declaration", referenceNo: v.gst ? `DEMO-GST-${v.code.slice(2)}` : null, status: "VALID" });
    if (licences.length) await db.insert(S.vendorLicence).values(licences.map((l) => ({ orgId, vendorId: row.id, verificationMode: "MANUAL", ...l })) as never);
    await db.insert(S.vendorDocument).values(docs.map((d) => ({ orgId, vendorId: row.id, integrationMode: "MANUAL", ...d })) as never);
  }
  await db.execute(sql`UPDATE vendor_document SET status = 'EXPIRING' WHERE org_id = ${orgId} AND expires_at IS NOT NULL AND expires_at < ${addDays(tonight, 30)} AND status = 'VALID'`);

  // ---------------- customers, standing orders ----------------
  const custByCode: Record<string, typeof S.customer.$inferSelect & { demo: (typeof DEMO_CUSTOMERS)[number] }> = {};
  for (const c of DEMO_CUSTOMERS) {
    const [row] = await db
      .insert(S.customer)
      .values({ orgId, code: c.code, name: c.name, type: c.type, priorityTier: c.tier, address: c.address, postalCode: c.postal, lat: String(c.lat), lng: String(c.lng), deliveryWindowStart: c.window[0], deliveryWindowEnd: c.window[1], creditTermsDays: c.terms, gstRegistered: c.type !== "WET_MARKET_STALL" && c.type !== "HAWKER", peppolId: c.type === "HOTEL" || c.type === "SUPERMARKET" ? `0195:SGDEMO${c.code.slice(2)}` : null, contactName: "Demo contact", phone: c.phone })
      .returning();
    custByCode[c.code] = { ...row, demo: c };
  }
  const standing = [
    { c: "C-MBHOTEL", s: "SAL", kg: 25, days: [1, 2, 3, 4, 5, 6, 7], price: 26.5 },
    { c: "C-HBR", s: "GRP", kg: 12, days: [2, 3, 4, 5, 6, 7], price: 24.0 },
    { c: "C-CLEMFS", s: "SPM", kg: 15, days: [1, 2, 3, 4, 5, 6], price: 11.2 },
    { c: "C-FMJ", s: "TIL", kg: 12, days: [1, 3, 5, 6], price: 8.2 },
    { c: "C-TBM", s: "THF", kg: 10, days: [6, 7], price: 15.5 },
  ];
  await db.insert(S.standingOrder).values(standing.map((x) => ({ orgId, customerId: custByCode[x.c].id, speciesId: sp[x.s].id, daysOfWeek: x.days, quantityKg: String(x.kg), agreedPricePerKg: String(x.price) })));

  // ---------------- automation rules (explicit, auditable) ----------------
  await db.insert(S.automationRule).values([
    { orgId, key: "AUTO_TEMPLATED_MESSAGES", name: "Templated supplier acknowledgements", description: "Automatically send the templated “catch received — confirm?” reply to suppliers. Other outbound messages still need approval.", riskClass: "EXTERNAL_COMMUNICATION", enabled: true, params: { actions: ["SEND_SUPPLIER_ACK"] }, updatedBy: "Demo Owner" },
    { orgId, key: "AUTO_PO_UNDER_LIMIT", name: "Auto-approve small purchase orders", description: "Let the Procurement Agent place POs below a value limit without approval. Disabled by default.", riskClass: "COMMERCIAL_COMMITMENT", enabled: false, params: { maxAmount: 300 } },
    { orgId, key: "AUTO_NEGOTIATION", name: "RFQ negotiation within boundaries", description: "Allow the RFQ agent to counter-offer within target/max price, quantity and deadline boundaries. Disabled by default.", riskClass: "COMMERCIAL_COMMITMENT", enabled: false, params: {} },
  ]);

  // ---------------- memberships ----------------
  for (const u of DEMO_USERS) {
    await db.insert(S.membership).values({
      orgId, userId: userIds[u.email], roleKey: u.role, title: u.title,
      vendorId: "vendorCode" in u ? vendorByCode[u.vendorCode].id : null,
      customerId: "customerCode" in u ? custByCode[u.customerCode].id : null,
    });
  }

  // ---------------- history (bulk) ----------------
  const counts = await seedHistory(orgId, sp, vendorByCode, custByCode, vehicles, drivers, tonight, historyNights, log);

  // ---------------- scripted nights through real services ----------------
  const users = { lim: userIds["procurement@demo.pasarcatch.sg"], nur: userIds["ops@demo.pasarcatch.sg"], priya: userIds["finance@demo.pasarcatch.sg"] };
  const actorCtx = (id: string, label: string, at: Date, source: Ctx["source"] = "WEB"): Ctx => ({ orgId, actor: { type: "USER", id, label }, source, now: at });
  const people = {
    lim: (at: Date) => actorCtx(users.lim, "Lim Wei", at),
    nur: (at: Date) => actorCtx(users.nur, "Nur Aisyah", at, "MOBILE"),
    priya: (at: Date) => actorCtx(users.priya, "Priya Raman", at),
  };
  log(`scenario: last night ${lastNight} (full)`);
  await runNight({ orgId, night: lastNight, full: true, sp, vendorByCode, custByCode, people });
  log(`scenario: tonight ${tonight} (in progress)`);
  await runNight({ orgId, night: tonight, full: false, sp, vendorByCode, custByCode, people });

  // Demo clock: "now" for this workspace = 01:10 SGT on tonight's market night (just after the last seeded
  // event), then ticks in real time.
  const demoNow = atMarketTime(tonight, "01:10");
  const realNow = opts.realNow ?? new Date();
  await db.update(S.organization).set({ settings: { ...(org.settings ?? {}), demoClockOffsetMs: demoNow.getTime() - realNow.getTime() } }).where(eq(S.organization.id, orgId));

  // ---------------- second tenant (isolation) ----------------
  await seedSecondTenant(userIds["owner@demo.pasarcatch.sg"], tonight);

  return { orgId, tonight, lastNight, demoNow, counts };
}

// =====================================================================================
async function seedHistory(
  orgId: string,
  sp: Record<string, typeof S.species.$inferSelect>,
  vendors: Record<string, typeof S.vendor.$inferSelect & { demo: DemoVendor }>,
  custs: Record<string, typeof S.customer.$inferSelect & { demo: (typeof DEMO_CUSTOMERS)[number] }>,
  vehicles: (typeof S.vehicle.$inferSelect)[],
  drivers: (typeof S.driver.$inferSelect)[],
  tonight: string,
  nights: number,
  log: (m: string) => void,
) {
  const cat = Object.fromEntries(SPECIES_CATALOGUE.map((c) => [c.code, c]));
  const suppliersFor = (code: string) => Object.values(vendors).filter((v) => v.demo.species.includes(code));
  const rows = { so: [] as Record<string, unknown>[], sol: [] as Record<string, unknown>[], lot: [] as Record<string, unknown>[], po: [] as Record<string, unknown>[], pol: [] as Record<string, unknown>[], gr: [] as Record<string, unknown>[], grl: [] as Record<string, unknown>[], alloc: [] as Record<string, unknown>[], mv: [] as Record<string, unknown>[], si: [] as Record<string, unknown>[], sil: [] as Record<string, unknown>[], ci: [] as Record<string, unknown>[], cil: [] as Record<string, unknown>[], sh: [] as Record<string, unknown>[], st: [] as Record<string, unknown>[], sho: [] as Record<string, unknown>[], qi: [] as Record<string, unknown>[], tr: [] as Record<string, unknown>[], audit: [] as Record<string, unknown>[] };
  let soN = 0, poN = 0, grnN = 0, invN = 0, runN = 0;
  const lotSeq: Record<string, number> = {};
  const id = () => crypto.randomUUID();

  for (let k = nights + 1; k >= 2; k--) {
    const m = addDays(tonight, -k);
    const deliv = deliveryDateFor(m);
    const wd = isoWeekday(deliv);
    const weekend = wd >= 6;
    // Recent upward trend for batang (+~10% over the last 3 weeks) to make forecast explanations meaningful.
    const trend = (code: string) => (code === "SPM" && k <= 21 ? 1.08 : code === "PRW" && k <= 14 ? 0.94 : 1);
    const soLinesBySpecies: Record<string, { id: string; soId: string; custId: string; kg: number; price: number }[]> = {};
    const soByCust: Record<string, string> = {};
    for (const c of Object.values(custs)) {
      if (R() < 0.07) continue;
      const soId = id();
      soByCust[c.id] = soId;
      soN++;
      rows.so.push({ id: soId, orgId, soNumber: `SO-${String(soN).padStart(5, "0")}`, customerId: c.id, marketDate: m, status: k > 8 ? "INVOICED" : "DELIVERED", source: pick(["STANDING_ORDER", "WHATSAPP", "WHATSAPP", "PHONE", "PORTAL"]), confirmedAt: atMarketTime(m, `${pick(["20", "21", "22", "23"])}:${String(Math.floor(R() * 60)).padStart(2, "0")}`), createdAt: atMarketTime(m, "20:00") });
      for (const [code, base] of Object.entries(c.demo.basket)) {
        if (R() < 0.1) continue;
        const kg = r1(Math.max(2, base * (weekend ? c.demo.weekendFactor : 1) * trend(code) * normal(1, 0.12)));
        const cost = (cat[code].demoCost[0] + cat[code].demoCost[1]) / 2;
        const price = r2(cost * (1 + cat[code].markupPct / 100) * normal(1, 0.03));
        const lid = id();
        (soLinesBySpecies[code] ??= []).push({ id: lid, soId, custId: c.id, kg, price });
      }
    }
    // Supply per species
    const lotsBySpecies: Record<string, { id: string; kg: number; cost: number; vendorId: string }[]> = {};
    const poByVendor: Record<string, { id: string; number: string; lines: { polId: string; lotId: string; code: string; kg: number; rec: number; price: number }[]; vendor: (typeof vendors)[string] }> = {};
    for (const [code, lines] of Object.entries(soLinesBySpecies)) {
      const demand = lines.reduce((a, l) => a + l.kg, 0);
      const sups = suppliersFor(code);
      if (!sups.length) continue;
      const chosen = [...sups].sort(() => R() - 0.5).slice(0, demand > 60 && sups.length > 1 ? 2 : 1);
      let supply = demand * between(0.96, 1.08);
      for (let i = 0; i < chosen.length; i++) {
        const v = chosen[i];
        const share = i === chosen.length - 1 ? supply : supply * between(0.45, 0.65);
        supply -= share;
        const declared = r1(share);
        const fill = Math.min(1.02, normal(v.demo.profile.fill, v.demo.profile.fillSd));
        const received = r1(declared * fill);
        const rejected = R() < 0.06 ? r1(received * between(0.02, 0.08)) : 0;
        const accepted = r1(received - rejected);
        const baseCost = between(cat[code].demoCost[0], cat[code].demoCost[1]);
        const seasonal = 1 + 0.03 * Math.sin((k / 60) * Math.PI * 2);
        const cost = r2(baseCost * (1 + v.demo.profile.priceBias) * seasonal);
        const etaH = pick(["00:30", "01:00", "01:30", "02:00", "02:30", "03:00"]);
        const eta = atMarketTime(m, etaH);
        const arrival = new Date(eta.getTime() + Math.max(-10, normal(v.demo.profile.lateMin, v.demo.profile.lateMin * 0.8 + 5)) * 60000);
        const grade = R() < v.demo.profile.gradeA ? "A" : R() < 0.85 ? "B" : "C";
        const temp = r1(R() < 0.02 ? between(5, 7.5) : normal(2, 0.8));
        const lotId = id();
        lotSeq[m] = (lotSeq[m] ?? 0) + 1;
        const lotNumber = `LOT-JFP-${compactDate(m)}-${String(lotSeq[m]).padStart(4, "0")}`;
        const po = (poByVendor[v.id] ??= { id: id(), number: `PO-${String(++poN).padStart(5, "0")}`, lines: [], vendor: v });
        const polId = id();
        po.lines.push({ polId, lotId, code, kg: declared, rec: accepted, price: cost });
        rows.lot.push({
          id: lotId, orgId, lotNumber, marketDate: m, confirmation: "CONFIRMED", vendorId: v.id, sourceCountry: v.demo.code === "V-NORDIC" ? "NO" : v.demo.code === "V-ANDAMAN" ? "MM" : v.country,
          sourceLocation: v.demo.vessel?.name ?? v.demo.farm?.name ?? v.region, landingLocation: v.demo.vessel ? v.demo.vessel.port : null, catchDate: m, originalEta: eta, expectedArrivalAt: eta,
          landingTime: arrival, receivedTime: arrival, speciesId: sp[code].id, supplierSpeciesName: cat[code].localNames[0] ?? cat[code].canonicalName.toLowerCase(), canonicalSpeciesName: cat[code].canonicalName,
          scientificName: cat[code].scientificName ?? null, quantityDeclaredKg: String(declared), quantityReceivedKg: String(received), quantityAvailableKg: "0", quantityAllocatedKg: "0", quantityRejectedKg: String(rejected),
          qualityGrade: grade, temperatureAtReceivingC: String(temp), askingPricePerKg: String(r2(cost * 1.02)), agreedCostPerKg: String(cost), status: "CLOSED", purchaseOrderLineId: polId, createdBy: "Seed (history)", createdAt: atMarketTime(m, "23:00"),
        });
        const grId = id();
        rows.gr.push({ id: grId, orgId, grnNumber: `GRN-${String(++grnN).padStart(5, "0")}`, purchaseOrderId: po.id, vendorId: v.id, receivedAt: arrival, receivedBy: "Night receiving (history)" });
        const grlId = id();
        rows.grl.push({ id: grlId, orgId, goodsReceiptId: grId, purchaseOrderLineId: polId, lotId, declaredKg: String(declared), receivedKg: String(received), acceptedKg: String(accepted), rejectedKg: String(rejected), rejectionReason: rejected ? pick(["POOR_QUALITY", "WRONG_SIZE", "DAMAGED"]) : null, temperatureC: String(temp), qualityGrade: grade, expectedAt: eta, arrivedLateMinutes: Math.max(0, Math.round((arrival.getTime() - eta.getTime()) / 60000)) });
        rows.qi.push({ orgId, lotId, goodsReceiptLineId: grlId, inspectedAt: arrival, inspector: "Night receiving (history)", grade, temperatureC: String(temp), rejectedKg: String(rejected) });
        rows.tr.push({ orgId, lotId, readingC: String(temp), thresholdMaxC: "4", isException: temp > 4, source: "PROBE", at: arrival });
        rows.mv.push({ orgId, lotId, type: "RECEIPT", quantityKg: String(received), availableAfterKg: String(received), refType: "goods_receipt", refId: grId, actor: "history", at: arrival });
        rows.audit.push({ orgId, at: arrival, actorType: "SYSTEM", actorLabel: "Seed (history)", action: "LOT_RECEIVED", entityType: "catch_lot", entityId: lotId, summary: `Historical receipt: ${received} kg of ${declared} kg declared, grade ${grade}, ${temp}°C.`, source: "SEED", relatedIds: [v.id] });
        (lotsBySpecies[code] ??= []).push({ id: lotId, kg: accepted, cost, vendorId: v.id });
      }
    }
    // Allocate FEFO and record deliveries
    const deliveredBySo: Record<string, { lineId: string; code: string; kg: number; price: number; lotId: string | null }[]> = {};
    for (const [code, lines] of Object.entries(soLinesBySpecies)) {
      const lots = [...(lotsBySpecies[code] ?? [])].map((l) => ({ ...l, left: l.kg }));
      for (const l of [...lines].sort(() => R() - 0.5)) {
        let need = l.kg;
        let got = 0;
        let firstLot: string | null = null;
        for (const lot of lots) {
          if (need <= 0) break;
          const take = r1(Math.min(need, lot.left));
          if (take <= 0) continue;
          lot.left = r1(lot.left - take);
          need = r1(need - take);
          got = r1(got + take);
          firstLot ??= lot.id;
          const aId = id();
          rows.alloc.push({ id: aId, orgId, lotId: lot.id, salesOrderLineId: l.id, quantityKg: String(take), status: "DISPATCHED", policy: "PRIORITY", confirmedBy: "history", createdAt: atMarketTime(m, "02:30") });
          rows.mv.push({ orgId, lotId: lot.id, type: "DISPATCH", quantityKg: String(-take), availableAfterKg: String(lot.left), refType: "allocation", refId: aId, actor: "history", at: atMarketTime(m, "05:30") });
        }
        rows.sol.push({ id: l.id, orgId, salesOrderId: l.soId, speciesId: sp[code].id, requestedKg: String(l.kg), allocatedKg: String(got), pickedKg: String(got), deliveredKg: String(got), pricePerKg: String(l.price) });
        (deliveredBySo[l.soId] ??= []).push({ lineId: l.id, code, kg: got, price: l.price, lotId: firstLot });
      }
      // leftovers = waste/markdown, recorded as waste movement
      for (const lot of lots) if (lot.left > 0.5) rows.mv.push({ orgId, lotId: lot.id, type: "WASTE", quantityKg: String(-lot.left), availableAfterKg: "0", refType: "markdown", actor: "history", at: atMarketTime(m, "07:30") });
    }
    // POs + supplier invoices
    for (const po of Object.values(poByVendor)) {
      const sub = po.lines.reduce((a, l) => a + r2(l.kg * l.price), 0);
      const rate = po.vendor.gstRegistered ? 9 : 0;
      rows.po.push({ id: po.id, orgId, poNumber: po.number, vendorId: po.vendor.id, marketDate: m, status: "CLOSED", source: pick(["CATCH_DECLARATION", "CATCH_DECLARATION", "AI_RECOMMENDATION", "MANUAL"]), subtotal: r2(sub).toFixed(2), gstRatePct: rate.toFixed(2), gstAmount: r2((sub * rate) / 100).toFixed(2), total: r2(sub * (1 + rate / 100)).toFixed(2), approvedBy: "Lim Wei", approvedAt: atMarketTime(m, "23:30"), createdBy: "Lim Wei", createdAt: atMarketTime(m, "23:30") });
      for (const l of po.lines) rows.pol.push({ id: l.polId, orgId, purchaseOrderId: po.id, speciesId: sp[l.code].id, lotId: l.lotId, quantityKg: String(l.kg), pricePerKg: String(l.price), receivedKg: String(l.rec), lineTotal: r2(l.kg * l.price).toFixed(2) });
      const siId = id();
      const invSub = po.lines.reduce((a, l) => a + r2(l.rec * l.price), 0);
      const invDate = addDays(m, 1);
      rows.si.push({ id: siId, orgId, vendorId: po.vendor.id, purchaseOrderId: po.id, invoiceNumber: `${po.vendor.code.slice(2, 6)}-${compactDate(m)}-${po.number.slice(3)}`, invoiceDate: invDate, dueDate: addDays(invDate, po.vendor.paymentTermsDays), subtotal: r2(invSub).toFixed(2), gstAmount: r2((invSub * rate) / 100).toFixed(2), total: r2(invSub * (1 + rate / 100)).toFixed(2), source: pick(["EMAIL", "UPLOAD", "WHATSAPP"]), matchStatus: "MATCHED", matchResult: { status: "MATCHED", summary: "PO, goods receipt and invoice agree exactly." }, paymentStatus: k > 14 ? "PAID" : "APPROVED_FOR_PAYMENT", receivedAt: atMarketTime(m, "08:00") });
      for (const l of po.lines) rows.sil.push({ orgId, supplierInvoiceId: siId, purchaseOrderLineId: l.polId, speciesId: sp[l.code].id, description: sp[l.code].canonicalName, quantityKg: String(l.rec), unitPrice: String(l.price), lineTotal: r2(l.rec * l.price).toFixed(2), gstCode: rate ? "SR" : "NA" });
    }
    // Customer invoices & shipments
    const stopsByVehicle: Record<number, string[]> = {};
    const custList = Object.values(custs).filter((c) => soByCust[c.id]);
    custList.forEach((c, i) => (stopsByVehicle[i % vehicles.length] ??= []).push(c.id));
    for (const [vi, cids] of Object.entries(stopsByVehicle)) {
      const shId = id();
      const dep = atMarketTime(m, "05:30");
      rows.sh.push({ id: shId, orgId, shipmentNumber: `RUN-${String(++runN).padStart(4, "0")}`, marketDate: m, vehicleId: vehicles[Number(vi)].id, driverId: drivers[Number(vi)].id, status: "COMPLETED", plannedDepartureAt: dep, actualDepartureAt: new Date(dep.getTime() + between(-5, 12) * 60000), completedAt: atMarketTime(m, "07:30"), totalKg: "0", distanceKm: String(r1(between(25, 55))), durationMin: Math.round(between(90, 150)), routingProvider: "Straight-line estimate", createdAt: atMarketTime(m, "05:00") });
      cids.forEach((cid, seq) => {
        const c = Object.values(custs).find((x) => x.id === cid)!;
        const planned = new Date(dep.getTime() + (20 + seq * 22) * 60000);
        const actual = new Date(planned.getTime() + Math.max(-8, normal(6, 12)) * 60000);
        const stId = id();
        rows.st.push({ id: stId, orgId, shipmentId: shId, sequence: seq + 1, customerId: cid, address: c.address, lat: c.lat, lng: c.lng, windowStart: atMarketTime(m, c.deliveryWindowStart!), windowEnd: atMarketTime(m, c.deliveryWindowEnd!), plannedArrivalAt: planned, actualArrivalAt: actual, status: "DELIVERED", loadKg: "0", podName: "Stall owner", podAt: actual });
        rows.sho.push({ orgId, shipmentId: shId, stopId: stId, salesOrderId: soByCust[cid] });
      });
    }
    for (const [soId, lines] of Object.entries(deliveredBySo)) {
      const so = rows.so.find((x) => x.id === soId)!;
      const c = Object.values(custs).find((x) => x.id === so.customerId)!;
      const bill = lines.filter((l) => l.kg > 0);
      if (!bill.length) continue;
      const sub = bill.reduce((a, l) => a + r2(l.kg * l.price), 0);
      const ciId = id();
      rows.ci.push({ id: ciId, orgId, type: "INVOICE", invoiceNumber: `INV-${String(++invN).padStart(5, "0")}`, customerId: c.id, salesOrderId: soId, invoiceDate: deliv, dueDate: addDays(deliv, c.creditTermsDays), subtotal: r2(sub).toFixed(2), gstRatePct: "9.00", gstAmount: r2(sub * 0.09).toFixed(2), total: r2(sub * 1.09).toFixed(2), status: k > 14 ? "PAID" : "ISSUED", peppolStatus: c.peppolId ? "MOCK_TRANSMITTED" : "NOT_SENT", createdAt: atMarketTime(m, "07:30") });
      for (const l of bill) rows.cil.push({ orgId, customerInvoiceId: ciId, salesOrderLineId: l.lineId, lotId: l.lotId, speciesId: sp[l.code].id, description: sp[l.code].canonicalName, quantityKg: String(l.kg), unitPrice: String(l.price), lineTotal: r2(l.kg * l.price).toFixed(2), gstCode: "SR" });
    }
  }
  log(`history rows: ${rows.lot.length} lots, ${rows.so.length} orders`);
  await insertMany(S.salesOrder, rows.so);
  await insertMany(S.salesOrderLine, rows.sol);
  await insertMany(S.purchaseOrder, rows.po);
  await insertMany(S.catchLot, rows.lot);
  await insertMany(S.purchaseOrderLine, rows.pol);
  await insertMany(S.goodsReceipt, rows.gr);
  await insertMany(S.goodsReceiptLine, rows.grl);
  await insertMany(S.qualityInspection, rows.qi);
  await insertMany(S.temperatureReading, rows.tr);
  await insertMany(S.allocation, rows.alloc);
  await insertMany(S.inventoryMovement, rows.mv);
  await insertMany(S.supplierInvoice, rows.si);
  await insertMany(S.supplierInvoiceLine, rows.sil);
  await insertMany(S.shipment, rows.sh);
  await insertMany(S.shipmentStop, rows.st);
  await insertMany(S.shipmentOrder, rows.sho);
  await insertMany(S.customerInvoice, rows.ci);
  await insertMany(S.customerInvoiceLine, rows.cil);
  await insertMany(S.auditEvent, rows.audit);
  // keep document sequences ahead of history numbers
  for (const [key, value] of [["SO", soN], ["PO", poN], ["GRN", grnN], ["INV", invN], ["RUN", runN]] as const) await db.insert(S.sequenceCounter).values({ orgId, key, value });
  return { historyLots: rows.lot.length, historyOrders: rows.so.length, historyPOs: rows.po.length };
}

// =====================================================================================
type NightArgs = {
  orgId: string;
  night: string;
  full: boolean;
  sp: Record<string, typeof S.species.$inferSelect>;
  vendorByCode: Record<string, typeof S.vendor.$inferSelect & { demo: DemoVendor }>;
  custByCode: Record<string, typeof S.customer.$inferSelect & { demo: (typeof DEMO_CUSTOMERS)[number] }>;
  people: { lim: (at: Date) => Ctx; nur: (at: Date) => Ctx; priya: (at: Date) => Ctx };
};

async function runNight(a: NightArgs) {
  const { orgId, night, full, sp, vendorByCode: V, custByCode: C, people } = a;
  const at = (hhmm: string) => atMarketTime(night, hhmm);
  const cat = Object.fromEntries(SPECIES_CATALOGUE.map((c) => [c.code, c]));
  const deliv = deliveryDateFor(night);
  const weekend = isoWeekday(deliv) >= 6;

  // ---- 22:00–00:20 buyer orders (standing orders + WhatsApp/phone) ----
  const demand: Record<string, number> = {};
  let minute = 0;
  const custs = Object.values(C);
  for (const c of custs) {
    const lines = Object.entries(c.demo.basket)
      .filter(() => R() > 0.08)
      .map(([code, base]) => {
        let kg = r1(Math.max(3, base * (weekend ? c.demo.weekendFactor : 1) * normal(1.05, 0.08)));
        if (!full && (code === "SPM" || code === "THF")) kg = r1(kg * 1.25); // tonight: strong batang & threadfin demand
        demand[code] = (demand[code] ?? 0) + kg;
        const cost = (cat[code].demoCost[0] + cat[code].demoCost[1]) / 2;
        return { speciesId: sp[code].id, requestedKg: kg, pricePerKg: r2(cost * (1 + cat[code].markupPct / 100)) };
      });
    const standingOnly = c.demo.type === "HOTEL" || c.code === "C-CLEMFS";
    const when = standingOnly ? at("22:00") : new Date(at("22:05").getTime() + minute * 60000);
    minute += 13;
    const src = standingOnly ? "STANDING_ORDER" : minute % 3 === 0 ? "PHONE" : "WHATSAPP";
    await createSalesOrder(people.lim(when), { customerId: c.id, marketDate: night, source: src, lines });
  }
  await drain();

  // ---- 22:10 importer supply arranged by PO (salmon) ----
  const salmonKg = r1((demand.SAL ?? 40) * 1.02);
  const nordicEta = at("22:30");
  const salmonPo = await db.transaction((x) =>
    createPurchaseOrder(x, people.lim(at("22:10")), { vendorId: V["V-NORDIC"].id, marketDate: night, source: "MANUAL", expectedAt: nordicEta, lines: [{ speciesId: sp.SAL.id, quantityKg: salmonKg, pricePerKg: full ? 18.9 : 19.2 }] }),
  );
  await db.update(S.catchLot).set({ sourceCountry: "NO", sourceLocation: "Norway (air freight via Changi)", compliance: { healthCertRef: "DEMO-HC-NO-7781", ccpRef: `DEMO-CCP-NORDIC-${compactDate(night)}`, mode: "MANUAL" } }).where(inArray(S.catchLot.id, salmonPo.lotIds));
  await db.insert(S.catchLotDocument).values(salmonPo.lotIds.flatMap((lotId) => [
    { orgId, lotId, docType: "HEALTH_CERT", referenceNo: "DEMO-HC-NO-7781", integrationMode: "MANUAL" as const },
    { orgId, lotId, docType: "CCP", referenceNo: `DEMO-CCP-NORDIC-${compactDate(night)}`, integrationMode: "MANUAL" as const },
  ]));

  // ---- 23:15 supplier declarations over WhatsApp ----
  const d = (code: string) => demand[code] ?? 0;
  const q = (x: number) => Math.max(6, Math.round(x));
  type Decl = { vendor: string; time: string; text: string; accept?: boolean; offerOnly?: boolean };
  const spmKim = full ? r1(d("SPM") * 0.45) : 45;
  const spmAhSeng = full ? r1(d("SPM") - spmKim) : 0; // tonight Ah Seng declares live (definition-of-done flow)
  const thf = r1(d("THF"));
  const decls: Decl[] = [
    { vendor: "V-KIMHOCK", time: "23:15", text: `Kim Hock 3 tonight ${q(spmKim)}kg batang 1-2kg size, ${q(d("RSN") * 1.02)}kg ikan merah, ${q(d("GSN") * 0.6)}kg ang go li, ${q(d("STR") * 1.05)}kg pari. Batang 8.60, merah 11.20. Reach 2am`, accept: true },
    { vendor: "V-SENGHUAT", time: "23:18", text: `Tonight got ${q(thf * (full ? 0.45 : 0.06))}kg ngoh her, ${q(d("POM") * 0.5)}kg pomfret, ${q(d("IMK") * 0.6)}kg kembung, ${q(d("YTS") * 1.05)}kg selar, ${q(d("SQD") * 0.55)}kg sotong. Ngoh her asking 11.60. Boat reach 1.30`, accept: true },
    { vendor: "V-LCKPRAWN", time: "23:22", text: `Harvest tonight: ${q(d("PRW") + (full ? 45 : 40))}kg white prawns 25-35g, ${q(d("TPR") * 1.05)}kg tiger prawn. Prawn $11.80 tiger $24.50. Truck reach 00:40`, accept: true },
    { vendor: "V-STRAITSBLUE", time: "23:25", text: `Straits Blue: ${q(d("BAR") * 1.03)}kg seabass 700-900g @ 8.90, ${q(d("GRP") * 1.02)}kg grouper @ 17.50, ${q(d("MUS") * 1.05)}kg mussels @ 5.20. Deliver 23:50`, accept: true },
    { vendor: "V-ANDAMAN", time: "23:28", text: `Can supply ${q(d("POM") * 0.4)}kg white pomfret 300-400g @ ${full ? "21.00" : "24.50"}/kg and ${q(d("HTL") * 1.05)}kg hairtail @ 6.40/kg, truck reach 01:15`, accept: true },
    { vendor: "V-JSCAGE", time: "23:31", text: `${q(d("TIL") * 1.05)}kg red tilapia 500-700g @ 5.60. Lorry reach 2.30`, accept: true },
    { vendor: "V-OCEANHV", time: "23:34", text: `Tonight ${q(d("SQD") * 0.5)}kg squid @ 10.20, ${q(d("CLM") * 1.1)}kg lala @ 4.80. ETA 02:30`, accept: true },
    { vendor: "V-BATAM", time: "23:40", text: `Pak Budi: ${q(d("FCR") * 1.05)}kg flower crab @ 15.00, ${q(d("MCR") * 1.05)}kg mud crab @ 36.00. Reach 3am`, accept: true },
    { vendor: "V-NELAYAN", time: "23:45", text: `Malam ni ${q(d("IMK") * 0.45)}kg kembung @ 4.60, ${q(d("WHR") * 1.05)}kg parang @ 6.40. Sampai 2.15`, accept: true },
  ];
  if (full && spmAhSeng > 0) decls.unshift({ vendor: "V-AHSENG", time: "23:12", text: `Tonight ${Math.round(spmAhSeng)}kg batang, around 600-800g, asking 8.80. Boat reach 1.30.`, accept: true });
  // Threadfin: shortage — Ocean Harvest offers extra stock (left as an offer; the Procurement Agent recommends it).
  const thfOfferKg = full ? 30 : 42;
  decls.push({ vendor: "V-OCEANHV", time: "23:50", text: `Extra ngoh her available ${thfOfferKg}kg 800-1200g @ ${full ? "12.10" : "11.80"}. ETA 03:20`, offerOnly: true });
  if (!full) decls.push({ vendor: "V-NELAYAN", time: "00:05", text: "Got some mackerel 30kg tonight maybe, price later", offerOnly: false, accept: false });

  const lotIdsByVendor: Record<string, string[]> = {};
  for (const dcl of decls) {
    const v = V[dcl.vendor];
    const res = await ingestSupplierMessage(orgId, { channel: "WHATSAPP_SIMULATOR", from: v.whatsappNumber, body: dcl.text, at: at(dcl.time), marketDate: night }, "SEED");
    lotIdsByVendor[dcl.vendor] = [...(lotIdsByVendor[dcl.vendor] ?? []), ...res.lotIds];
    if (dcl.accept === false) continue; // stays a DRAFT needing human review
    // Procurement manager reviews a few minutes later: confirm mapping, then buy (or keep as offer).
    const reviewAt = new Date(at(dcl.time).getTime() + 6 * 60000);
    for (const lotId of res.lotIds) {
      await confirmLot(people.lim(reviewAt), lotId);
      if (!dcl.offerOnly) {
        // Where the supplier gave no price, the manager agrees one by phone (demo: catalogue cost band).
        const [l] = await db.select().from(S.catchLot).where(eq(S.catchLot.id, lotId));
        const code = Object.values(sp).find((x) => x.id === l.speciesId)?.code;
        const agreed = l.askingPricePerKg ? undefined : code ? r2((cat[code].demoCost[0] + cat[code].demoCost[1]) / 2) : undefined;
        await acceptDeclaredLot(people.lim(new Date(reviewAt.getTime() + 60000)), lotId, { pricePerKg: agreed });
      }
    }
  }
  await drain();

  // ---- 00:10 demand forecast, 00:30 procurement agent ----
  await runDemandForecast(orgId, night, "SCHEDULE", at("00:10"));
  await runProcurementAgent(orgId, night, "SCHEDULE", { at: at("00:30") });
  await drain();

  // ---- early deliveries already received: salmon (22:30), seabass/grouper/mussels (23:50), prawns (00:40) ----
  const recv = async (lotId: string, hhmm: string, factor = 0.995, extra: Partial<Parameters<typeof receiveLot>[1]> = {}) => {
    const [lot] = await db.select().from(S.catchLot).where(eq(S.catchLot.id, lotId));
    if (!lot || !["EXPECTED", "LANDED"].includes(lot.status) || !lot.purchaseOrderLineId) return null;
    return receiveLot(people.nur(at(hhmm)), { lotId, receivedKg: r1(Number(lot.quantityDeclaredKg) * factor), qualityGrade: "A", temperatureC: r1(normal(1.8, 0.5)), ...extra });
  };
  for (const id of salmonPo.lotIds) await recv(id, "22:35", 1);
  for (const id of lotIdsByVendor["V-STRAITSBLUE"] ?? []) await recv(id, "23:58", 1);
  for (const id of lotIdsByVendor["V-LCKPRAWN"] ?? []) await recv(id, "00:45", 0.99);
  await drain();

  // ---- 01:05 vessel ETA changes (two late vessels) ----
  const sengHuat = lotIdsByVendor["V-SENGHUAT"] ?? [];
  const kimHock = lotIdsByVendor["V-KIMHOCK"] ?? [];
  if (sengHuat[0]) for (const id of sengHuat) await updateEta(people.lim(at("00:58")), id, "02:45", "Skipper called: strong current off Pulau Sudong");
  if (kimHock[0]) for (const id of kimHock) await updateEta(people.lim(at("01:05")), id, "03:10", "Engine issue, running slow");
  await drain();

  if (!full) return; // TONIGHT stops here (~01:00): the rest of the night is demonstrated live.

  // ---- 00:40 manager approves the Procurement Agent's threadfin recommendation ----
  const pendingPo = await db.select().from(S.approval).where(and(eq(S.approval.orgId, orgId), eq(S.approval.status, "PENDING"), eq(S.approval.kind, "CREATE_PURCHASE_ORDER")));
  for (const ap of pendingPo) await decideApproval(people.lim(at("00:42")), ap.id, "APPROVE", { note: "Go — need it for Saturday stalls" });
  await drain();

  // ---- 01:30 another boat lands with additional seafood ----
  const extra = await ingestSupplierMessage(orgId, { channel: "WHATSAPP_SIMULATOR", from: V["V-NELAYAN"].whatsappNumber, body: `Boat sudah sampai JFP. Extra ${Math.round(d("SQD") * 0.2 + 12)}kg sotong @ 9.60, ${Math.round(d("FCR") * 0.3 + 6)}kg ketam renjong @ 14.20`, at: at("01:28"), marketDate: night }, "SEED");
  for (const id of extra.lotIds) {
    await confirmLot(people.lim(at("01:31")), id);
    await acceptDeclaredLot(people.lim(at("01:32")), id);
    await markLanded(people.nur(at("01:35")), id);
  }
  lotIdsByVendor["V-NELAYAN"] = [...(lotIdsByVendor["V-NELAYAN"] ?? []), ...extra.lotIds];
  await drain();

  // ---- 02:00–03:30 receiving: actual weights, one supplier 8% short, one temperature exception ----
  const allLots = await db.select().from(S.catchLot).where(and(eq(S.catchLot.orgId, orgId), eq(S.catchLot.marketDate, night), inArray(S.catchLot.status, ["EXPECTED", "LANDED"]), sql`${S.catchLot.purchaseOrderLineId} IS NOT NULL`));
  const order = allLots.sort((x, y) => (x.expectedArrivalAt?.getTime() ?? 0) - (y.expectedArrivalAt?.getTime() ?? 0));
  let kimBatang: string | null = null;
  for (const lot of order) {
    const vcode = Object.values(V).find((v) => v.id === lot.vendorId)?.code;
    const eta = lot.expectedArrivalAt ?? at("02:00");
    const hh = new Date(Math.max(eta.getTime() + normal(8, 6) * 60000, at("01:40").getTime()));
    const hhmm = `${String(sgtParts(hh).hour).padStart(2, "0")}:${String(sgtParts(hh).minute).padStart(2, "0")}`;
    const code = Object.values(sp).find((s) => s.id === lot.speciesId)?.code;
    if (vcode === "V-AHSENG" && code === "SPM") await recv(lot.id, hhmm, 0.92, { qualityGrade: "A", temperatureC: 1.6 }); // 8% under declared
    else if (vcode === "V-SENGHUAT" && code === "SQD") await recv(lot.id, hhmm, 0.99, { qualityGrade: "B", temperatureC: 7.5, rejectedKg: 2, rejectionReason: "TEMPERATURE", notes: "Ice melted in transit" });
    else if (vcode === "V-KIMHOCK" && code === "SPM") {
      await recv(lot.id, hhmm, 0.98);
      kimBatang = lot.id;
    } else await recv(lot.id, hhmm, normal(0.985, 0.01));
    if (lot.id === kimBatang) {
      // Processing: part of the batang is cleaned/filleted for the fish-soup hawker (full genealogy).
      const [l] = await db.select().from(S.catchLot).where(eq(S.catchLot.id, lot.id));
      const avail = Number(l.quantityAvailableKg);
      const base = Math.min(avail * 0.4, 40);
      await transformLot(people.nur(new Date(hh.getTime() + 8 * 60000)), lot.id, [
        { processingState: "CLEANED", kg: r1(base * 0.45), type: "CLEAN" },
        { processingState: "FILLETED", kg: r1(base * 0.3), type: "FILLET" },
      ], r1(base * 0.25));
    }
  }
  await drain();

  // ---- 02:20+ manager approves the Allocation Agent's proposals ----
  const pendingAlloc = await db.select().from(S.approval).where(and(eq(S.approval.orgId, orgId), eq(S.approval.status, "PENDING"), eq(S.approval.kind, "CONFIRM_ALLOCATION")));
  let t = at("03:35").getTime();
  for (const ap of pendingAlloc) {
    try {
      await decideApproval(people.lim(new Date((t += 40000))), ap.id, "APPROVE");
    } catch {
      /* stale proposal after later receipts; superseded below */
    }
  }
  await drain();

  // ---- 03:45 picking & packing ----
  await generatePickList(people.nur(at("03:45")), night);
  const sos = await db.select().from(S.salesOrder).where(and(eq(S.salesOrder.orgId, orgId), eq(S.salesOrder.marketDate, night), eq(S.salesOrder.status, "PICKING")));
  t = at("03:50").getTime();
  for (const so of sos) await pickAndPackOrder(people.nur(new Date((t += 150000))), so.id);
  await drain();

  // ---- 04:15 surplus agent, 04:30 manager approves discounted offer ----
  await runSurplusAgent(orgId, night, "SCHEDULE", at("04:15"));
  const disc = await db.select().from(S.approval).where(and(eq(S.approval.orgId, orgId), eq(S.approval.status, "PENDING"), eq(S.approval.kind, "APPLY_DISCOUNT")));
  for (const ap of disc) await decideApproval(people.lim(at("04:30")), ap.id, "APPROVE", { note: "Clear it before 6" });

  // ---- 05:00 routes, 05:30 trucks depart, deliveries ----
  const routes = await runLogisticsAgent(people.nur(at("05:00")), night, "05:30");
  for (const shId of routes.shipmentIds) await dispatchShipment(people.nur(at("05:31")), shId);
  await drain();
  const stops = await db.select().from(S.shipmentStop).where(inArray(S.shipmentStop.shipmentId, routes.shipmentIds));
  for (const st of stops.sort((x, y) => (x.plannedArrivalAt?.getTime() ?? 0) - (y.plannedArrivalAt?.getTime() ?? 0))) {
    const late = st.sequence === 3 ? 38 : normal(4, 6);
    const when = new Date((st.plannedArrivalAt?.getTime() ?? at("06:00").getTime()) + late * 60000);
    await db.update(S.shipmentStop).set({ actualArrivalAt: when }).where(eq(S.shipmentStop.id, st.id));
    await completeStop(people.nur(when), st.id, "Stall owner");
  }
  await drain();

  // ---- 07:00 finance: supplier invoices arrive, AP agent performs three-way matching ----
  const pos = await db.select().from(S.purchaseOrder).where(and(eq(S.purchaseOrder.orgId, orgId), eq(S.purchaseOrder.marketDate, night)));
  let n = 100;
  for (const po of pos) {
    const v = Object.values(V).find((x) => x.id === po.vendorId)!;
    // Ah Seng bills the declared weight (the classic discrepancy); everyone else bills what was received.
    await draftInvoiceFromPo(people.priya(at("07:00")), po.id, { invoiceNumber: `${v.code.slice(2, 6)}-${compactDate(night)}-${++n}`, billReceivedWeight: v.code !== "V-AHSENG" });
  }
  await drain();
  const matched = await db.select().from(S.supplierInvoice).where(and(eq(S.supplierInvoice.orgId, orgId), inArray(S.supplierInvoice.purchaseOrderId, pos.map((p) => p.id)), inArray(S.supplierInvoice.matchStatus, ["MATCHED", "MATCH_WITHIN_TOLERANCE"])));
  for (const si of matched) await approveForPayment(people.priya(at("07:20")), si.id);
  const delivered = await db.select().from(S.salesOrder).where(and(eq(S.salesOrder.orgId, orgId), eq(S.salesOrder.marketDate, night), eq(S.salesOrder.status, "DELIVERED")));
  for (const so of delivered) {
    const inv = await createCustomerInvoice(people.priya(at("07:25")), so.id);
    const [c] = await db.select().from(S.customer).where(eq(S.customer.id, so.customerId));
    if (c.peppolId) await transmitInvoiceNow(people.priya(at("07:26")), inv.id);
  }
  await drain();
}

// =====================================================================================
async function seedSecondTenant(ownerUserId: string, tonight: string) {
  const [org] = await db.insert(S.organization).values({ name: "Kelong Fresh Trading (DEMO tenant B)", slug: "kelong-fresh-demo", siteCode: "SNK", isDemo: true, uen: "DEMO00002Y", settings: {} }).returning();
  await db.insert(S.membership).values({ orgId: org.id, userId: ownerUserId, roleKey: "OWNER", title: "Director" });
  const c = SPECIES_CATALOGUE.find((x) => x.code === "POM")!;
  const [s] = await db.insert(S.species).values({ orgId: org.id, code: c.code, canonicalName: c.canonicalName, chineseName: c.chineseName, localNames: c.localNames, category: c.category, substituteCodes: [] }).returning();
  const [v] = await db.insert(S.vendor).values({ orgId: org.id, code: "V-KELONG", name: "Kelong Seafood Supplier (tenant B)", type: "FISHING_VESSEL", country: "SG" }).returning();
  await db.insert(S.catchLot).values({ orgId: org.id, lotNumber: `LOT-SNK-${compactDate(tonight)}-0001`, marketDate: tonight, vendorId: v.id, speciesId: s.id, canonicalSpeciesName: s.canonicalName, quantityDeclaredKg: "25", status: "EXPECTED", confirmation: "CONFIRMED" });
}
