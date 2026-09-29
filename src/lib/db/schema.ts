/**
 * PasarCatch relational schema (Drizzle ORM / PostgreSQL).
 *
 * Conventions
 * - Every tenant-owned table carries `org_id`; all service-layer queries filter on it.
 * - Weights are numeric(12,3) kg, unit prices numeric(12,4), money numeric(14,2). Never floats.
 * - Timestamps are timestamptz stored in UTC; the UI renders Asia/Singapore.
 * - `market_date` is the operational trading night (the SGT calendar date on which the night starts).
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// ---------- column helpers ----------
const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const ts = (name: string) => timestamp(name, { withTimezone: true });
const kg = (name: string) => numeric(name, { precision: 12, scale: 3 });
const unitPrice = (name: string) => numeric(name, { precision: 12, scale: 4 });
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });

// ---------- enums ----------
export const vendorType = pgEnum("vendor_type", [
  "FISHING_VESSEL",
  "AQUACULTURE_FARM",
  "FOREIGN_FISHERY",
  "IMPORTER",
  "WHOLESALER",
  "PROCESSOR",
  "LOGISTICS_PROVIDER",
]);
export const lotStatus = pgEnum("lot_status", [
  "EXPECTED",
  "LANDED",
  "RECEIVED",
  "INSPECTED",
  "AVAILABLE",
  "PARTIALLY_ALLOCATED",
  "ALLOCATED",
  "DISPATCHED",
  "CLOSED",
  "REJECTED",
]);
export const processingState = pgEnum("processing_state", [
  "WHOLE",
  "GUTTED",
  "CLEANED",
  "FILLETED",
  "PORTIONED",
  "LIVE",
  "FROZEN",
]);
export const riskClass = pgEnum("risk_class", [
  "READ_ONLY",
  "LOW_RISK_WRITE",
  "COMMERCIAL_COMMITMENT",
  "FINANCIAL",
  "EXTERNAL_COMMUNICATION",
  "COMPLIANCE",
]);
export const rejectionReason = pgEnum("rejection_reason", [
  "WRONG_SPECIES",
  "WRONG_SIZE",
  "UNDERWEIGHT",
  "POOR_QUALITY",
  "TEMPERATURE",
  "DAMAGED",
  "LATE",
  "OTHER",
]);
export const matchStatus = pgEnum("match_status", [
  "UNMATCHED",
  "MATCHED",
  "MATCH_WITHIN_TOLERANCE",
  "EXCEPTION",
  "APPROVED_EXCEPTION",
]);
export const allocationPolicy = pgEnum("allocation_policy", [
  "PRO_RATA",
  "PRIORITY",
  "FIRST_CONFIRMED",
  "MINIMUM_GUARANTEED",
  "MARGIN_MAX",
  "MANUAL_RANK",
]);

// =====================================================================
// Authentication (Better Auth core tables — text ids managed by Better Auth)
// =====================================================================
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// =====================================================================
// Tenancy & access
// =====================================================================
export const organization = pgTable("organization", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** Short site code used in lot numbers, e.g. JFP (Jurong Fishery Port). */
  siteCode: text("site_code").notNull().default("JFP"),
  plan: text("plan").$type<"STARTER" | "GROWTH" | "PRO" | "ENTERPRISE">().notNull().default("GROWTH"),
  features: jsonb("features").$type<Record<string, boolean>>().notNull().default({}),
  uen: text("uen"),
  gstRegistered: boolean("gst_registered").notNull().default(true),
  gstRegNo: text("gst_reg_no"),
  gstRatePct: numeric("gst_rate_pct", { precision: 5, scale: 2 }).notNull().default("9.00"),
  baseCurrency: text("base_currency").notNull().default("SGD"),
  timezone: text("timezone").notNull().default("Asia/Singapore"),
  isDemo: boolean("is_demo").notNull().default(false),
  settings: jsonb("settings").$type<OrgSettings>().notNull().default({} as OrgSettings),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type OrgSettings = {
  dispatchCutoff?: string; // "06:00" SGT
  marketOpens?: string; // "22:00" SGT
  defaultAllocationPolicy?: string;
  procurementWeights?: { price: number; reliability: number; quality: number; freshness: number; eta: number; relationship: number };
  invoiceTolerance?: { qtyPct: number; pricePct: number; amountAbs: number };
  weightVarianceAlertPct?: number;
  receivingTempMaxC?: number;
  surplusDiscountFloorPct?: number;
  /** DEMO workspaces only: offset applied to wall-clock time so the seeded overnight scenario and live actions share one timeline. */
  demoClockOffsetMs?: number;
};

export const role = pgTable("role", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
});

export const membership = pgTable(
  "membership",
  {
    id: id(),
    orgId: orgId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roleKey: text("role_key")
      .notNull()
      .references(() => role.key),
    /** For SUPPLIER users: the vendor they act for. */
    vendorId: uuid("vendor_id"),
    /** For BUYER users: the customer they act for. */
    customerId: uuid("customer_id"),
    title: text("title"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("membership_org_user_uq").on(t.orgId, t.userId), index("membership_user_idx").on(t.userId)],
);

export const sequenceCounter = pgTable(
  "sequence_counter",
  {
    orgId: orgId(),
    key: text("key").notNull(),
    value: integer("value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.key] })],
);

export const automationRule = pgTable(
  "automation_rule",
  {
    id: id(),
    orgId: orgId(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    riskClass: riskClass("risk_class").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
    updatedBy: text("updated_by"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("automation_rule_org_key_uq").on(t.orgId, t.key)],
);

// =====================================================================
// Vendors
// =====================================================================
export const vendor = pgTable(
  "vendor",
  {
    id: id(),
    orgId: orgId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: vendorType("type").notNull(),
    country: text("country").notNull().default("SG"),
    region: text("region"),
    address: text("address"),
    gstRegistered: boolean("gst_registered").notNull().default(false),
    gstRegNo: text("gst_reg_no"),
    uen: text("uen"),
    paymentTermsDays: integer("payment_terms_days").notNull().default(7),
    preferredChannel: text("preferred_channel").$type<"WHATSAPP" | "SMS" | "EMAIL" | "PHONE">().notNull().default("WHATSAPP"),
    /** E.164 number used to match inbound WhatsApp messages to the vendor. */
    whatsappNumber: text("whatsapp_number"),
    relationshipTier: text("relationship_tier").$type<"PREFERRED" | "STANDARD" | "PROBATION">().notNull().default("STANDARD"),
    minOrderKg: kg("min_order_kg"),
    distanceKm: numeric("distance_km", { precision: 8, scale: 1 }),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("vendor_org_code_uq").on(t.orgId, t.code),
    index("vendor_org_type_idx").on(t.orgId, t.type),
    index("vendor_org_whatsapp_idx").on(t.orgId, t.whatsappNumber),
  ],
);

export const vendorContact = pgTable(
  "vendor_contact",
  {
    id: id(),
    orgId: orgId(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendor.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role"),
    phone: text("phone"),
    email: text("email"),
    whatsapp: text("whatsapp"),
    preferredLanguage: text("preferred_language").default("en"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("vendor_contact_vendor_idx").on(t.vendorId)],
);

export const vendorDocument = pgTable(
  "vendor_document",
  {
    id: id(),
    orgId: orgId(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendor.id, { onDelete: "cascade" }),
    docType: text("doc_type")
      .$type<"HEALTH_CERT" | "IMPORT_PERMIT" | "CCP" | "CATCH_CERT" | "EXPORT_REGISTRATION" | "INSURANCE" | "GST_CERT" | "OTHER">()
      .notNull(),
    title: text("title").notNull(),
    referenceNo: text("reference_no"),
    fileKey: text("file_key"),
    issuedAt: date("issued_at"),
    expiresAt: date("expires_at"),
    status: text("status").$type<"VALID" | "EXPIRING" | "EXPIRED" | "MISSING" | "PENDING_REVIEW">().notNull().default("PENDING_REVIEW"),
    integrationMode: text("integration_mode").$type<"MANUAL" | "FUTURE_INTEGRATION">().notNull().default("MANUAL"),
    createdAt: createdAt(),
  },
  (t) => [index("vendor_document_vendor_idx").on(t.vendorId), index("vendor_document_expiry_idx").on(t.orgId, t.expiresAt)],
);

export const vendorLicence = pgTable(
  "vendor_licence",
  {
    id: id(),
    orgId: orgId(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendor.id, { onDelete: "cascade" }),
    licenceType: text("licence_type").notNull(),
    licenceNo: text("licence_no").notNull(),
    issuer: text("issuer").notNull(),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    verificationMode: text("verification_mode").$type<"MANUAL" | "FUTURE_INTEGRATION">().notNull().default("MANUAL"),
    verifiedBy: text("verified_by"),
    verifiedAt: ts("verified_at"),
    createdAt: createdAt(),
  },
  (t) => [index("vendor_licence_vendor_idx").on(t.vendorId), index("vendor_licence_expiry_idx").on(t.orgId, t.validTo)],
);

export const vendorSpeciesCapability = pgTable(
  "vendor_species_capability",
  {
    id: id(),
    orgId: orgId(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendor.id, { onDelete: "cascade" }),
    speciesId: uuid("species_id")
      .notNull()
      .references(() => species.id, { onDelete: "cascade" }),
    typicalKgPerNight: kg("typical_kg_per_night"),
    sizeMinKg: kg("size_min_kg"),
    sizeMaxKg: kg("size_max_kg"),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("vsc_vendor_species_uq").on(t.vendorId, t.speciesId)],
);

export const vessel = pgTable(
  "vessel",
  {
    id: id(),
    orgId: orgId(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendor.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    registrationNo: text("registration_no"),
    licenceNo: text("licence_no"),
    homePort: text("home_port"),
    flagCountry: text("flag_country").notNull().default("SG"),
    gearType: text("gear_type"),
    capacityKg: kg("capacity_kg"),
    createdAt: createdAt(),
  },
  (t) => [index("vessel_vendor_idx").on(t.vendorId)],
);

export const farm = pgTable(
  "farm",
  {
    id: id(),
    orgId: orgId(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendor.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    farmType: text("farm_type").$type<"SEA_CAGE" | "LAND_BASED_RAS" | "POND" | "OTHER">().notNull(),
    location: text("location"),
    country: text("country").notNull().default("SG"),
    licenceNo: text("licence_no"),
    createdAt: createdAt(),
  },
  (t) => [index("farm_vendor_idx").on(t.vendorId)],
);

// =====================================================================
// Species master
// =====================================================================
export const species = pgTable(
  "species",
  {
    id: id(),
    orgId: orgId(),
    code: text("code").notNull(),
    canonicalName: text("canonical_name").notNull(),
    chineseName: text("chinese_name"),
    malayName: text("malay_name"),
    localNames: text("local_names").array().notNull().default(sql`'{}'::text[]`),
    scientificName: text("scientific_name"),
    category: text("category").$type<"FISH" | "CRUSTACEAN" | "MOLLUSC" | "CEPHALOPOD" | "OTHER">().notNull(),
    typicalSizeMinKg: kg("typical_size_min_kg"),
    typicalSizeMaxKg: kg("typical_size_max_kg"),
    typicalYieldPct: numeric("typical_yield_pct", { precision: 5, scale: 2 }),
    storage: text("storage").$type<"CHILLED" | "FROZEN" | "LIVE">().notNull().default("CHILLED"),
    freshnessHours: integer("freshness_hours").notNull().default(48),
    substituteCodes: text("substitute_codes").array().notNull().default(sql`'{}'::text[]`),
    indicativeMarkupPct: numeric("indicative_markup_pct", { precision: 5, scale: 2 }).notNull().default("22.00"),
    /** Taxonomy disclaimer: operational mapping only, not legally authoritative. */
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("species_org_code_uq").on(t.orgId, t.code)],
);

export const speciesAlias = pgTable(
  "species_alias",
  {
    id: id(),
    orgId: orgId(),
    speciesId: uuid("species_id")
      .notNull()
      .references(() => species.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    normalised: text("normalised").notNull(),
    language: text("language").$type<"EN" | "ZH" | "MS" | "HOKKIEN" | "TEOCHEW" | "CANTONESE" | "PINYIN" | "OTHER">().notNull().default("EN"),
    source: text("source").$type<"SEED" | "LEARNED" | "ADMIN">().notNull().default("SEED"),
    useCount: integer("use_count").notNull().default(0),
    confirmedBy: text("confirmed_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("species_alias_org_norm_uq").on(t.orgId, t.normalised), index("species_alias_species_idx").on(t.speciesId)],
);

// =====================================================================
// Customers (buyers) & locations
// =====================================================================
export const customer = pgTable(
  "customer",
  {
    id: id(),
    orgId: orgId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type")
      .$type<"WET_MARKET_STALL" | "RESTAURANT" | "HOTEL" | "SUPERMARKET" | "HAWKER" | "CATERER" | "FISHMONGER">()
      .notNull(),
    priorityTier: integer("priority_tier").notNull().default(2),
    address: text("address"),
    postalCode: text("postal_code"),
    lat: numeric("lat", { precision: 9, scale: 6 }),
    lng: numeric("lng", { precision: 9, scale: 6 }),
    deliveryWindowStart: text("delivery_window_start"), // "04:30"
    deliveryWindowEnd: text("delivery_window_end"),
    creditTermsDays: integer("credit_terms_days").notNull().default(14),
    gstRegistered: boolean("gst_registered").notNull().default(false),
    peppolId: text("peppol_id"),
    contactName: text("contact_name"),
    phone: text("phone"),
    email: text("email"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("customer_org_code_uq").on(t.orgId, t.code)],
);

export const warehouseLocation = pgTable(
  "warehouse_location",
  {
    id: id(),
    orgId: orgId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type").$type<"RECEIVING_BAY" | "CHILLER" | "FREEZER" | "PROCESSING" | "DISPATCH_BAY" | "COLD_STORE">().notNull(),
    tempMinC: numeric("temp_min_c", { precision: 5, scale: 1 }),
    tempMaxC: numeric("temp_max_c", { precision: 5, scale: 1 }),
    address: text("address"),
    lat: numeric("lat", { precision: 9, scale: 6 }),
    lng: numeric("lng", { precision: 9, scale: 6 }),
    coldStoreLicenceNo: text("cold_store_licence_no"),
  },
  (t) => [uniqueIndex("warehouse_location_org_code_uq").on(t.orgId, t.code)],
);

// =====================================================================
// Messages (WhatsApp/SMS/email/manual intake)
// =====================================================================
export const message = pgTable(
  "message",
  {
    id: id(),
    orgId: orgId(),
    channel: text("channel").$type<"WHATSAPP" | "WHATSAPP_SIMULATOR" | "SMS" | "EMAIL" | "WEB" | "VOICE">().notNull(),
    direction: text("direction").$type<"INBOUND" | "OUTBOUND">().notNull(),
    vendorId: uuid("vendor_id").references(() => vendor.id),
    customerId: uuid("customer_id").references(() => customer.id),
    fromHandle: text("from_handle"),
    toHandle: text("to_handle"),
    body: text("body").notNull(),
    transcription: text("transcription"),
    externalId: text("external_id"),
    status: text("status").$type<"RECEIVED" | "PARSED" | "NEEDS_REVIEW" | "IGNORED" | "QUEUED" | "SENT" | "MOCK_SENT" | "FAILED" | "PENDING_APPROVAL">().notNull(),
    agentRunId: uuid("agent_run_id"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("message_org_at_idx").on(t.orgId, t.at), index("message_vendor_idx").on(t.vendorId)],
);

export const messageAttachment = pgTable("message_attachment", {
  id: id(),
  orgId: orgId(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => message.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"IMAGE" | "AUDIO" | "DOCUMENT">().notNull(),
  fileKey: text("file_key").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: createdAt(),
});

// =====================================================================
// Catch lots — the core traceable object
// =====================================================================
export const catchLot = pgTable(
  "catch_lot",
  {
    id: id(),
    orgId: orgId(),
    lotNumber: text("lot_number").notNull(),
    marketDate: date("market_date").notNull(),
    confirmation: text("confirmation").$type<"DRAFT" | "CONFIRMED">().notNull().default("CONFIRMED"),
    vendorId: uuid("vendor_id").references(() => vendor.id),
    vesselId: uuid("vessel_id").references(() => vessel.id),
    farmId: uuid("farm_id").references(() => farm.id),
    parentLotId: uuid("parent_lot_id").references((): AnyPgColumn => catchLot.id),
    rootLotId: uuid("root_lot_id").references((): AnyPgColumn => catchLot.id),
    sourceCountry: text("source_country"),
    sourceLocation: text("source_location"),
    landingLocation: text("landing_location"),
    catchDate: date("catch_date"),
    harvestDate: date("harvest_date"),
    originalEta: ts("original_eta"),
    expectedArrivalAt: ts("expected_arrival_at"),
    landingTime: ts("landing_time"),
    receivedTime: ts("received_time"),
    speciesId: uuid("species_id").references(() => species.id),
    supplierSpeciesName: text("supplier_species_name"),
    canonicalSpeciesName: text("canonical_species_name"),
    localName: text("local_name"),
    scientificName: text("scientific_name"),
    quantityDeclaredKg: kg("quantity_declared_kg").notNull().default("0"),
    quantityReceivedKg: kg("quantity_received_kg"),
    quantityAvailableKg: kg("quantity_available_kg").notNull().default("0"),
    quantityAllocatedKg: kg("quantity_allocated_kg").notNull().default("0"),
    quantityRejectedKg: kg("quantity_rejected_kg").notNull().default("0"),
    pieceCount: integer("piece_count"),
    averageWeightKg: kg("average_weight_kg"),
    sizeMinKg: kg("size_min_kg"),
    sizeMaxKg: kg("size_max_kg"),
    sizeGrade: text("size_grade"),
    qualityGrade: text("quality_grade").$type<"A" | "B" | "C" | "REJECT">(),
    processingState: processingState("processing_state").notNull().default("WHOLE"),
    temperatureAtReceivingC: numeric("temperature_at_receiving_c", { precision: 5, scale: 1 }),
    freshOrFrozen: text("fresh_or_frozen").$type<"FRESH" | "FROZEN" | "LIVE">().notNull().default("FRESH"),
    askingPricePerKg: unitPrice("asking_price_per_kg"),
    agreedCostPerKg: unitPrice("agreed_cost_per_kg"),
    currency: text("currency").notNull().default("SGD"),
    catchMethod: text("catch_method"),
    farmMethod: text("farm_method"),
    compliance: jsonb("compliance")
      .$type<{ ccpRef?: string; healthCertRef?: string; importPermitRef?: string; tradenetRef?: string; catchCertRef?: string; mode?: "MANUAL" }>()
      .notNull()
      .default({}),
    status: lotStatus("status").notNull().default("EXPECTED"),
    locationId: uuid("location_id").references(() => warehouseLocation.id),
    intakeMessageId: uuid("intake_message_id").references(() => message.id),
    intakeConfidence: numeric("intake_confidence", { precision: 4, scale: 3 }),
    fieldConfidence: jsonb("field_confidence").$type<Record<string, number>>(),
    ambiguousFields: text("ambiguous_fields").array().notNull().default(sql`'{}'::text[]`),
    purchaseOrderLineId: uuid("purchase_order_line_id"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("catch_lot_org_number_uq").on(t.orgId, t.lotNumber),
    index("catch_lot_org_market_idx").on(t.orgId, t.marketDate),
    index("catch_lot_org_status_idx").on(t.orgId, t.status),
    index("catch_lot_species_idx").on(t.orgId, t.speciesId, t.marketDate),
    index("catch_lot_vendor_idx").on(t.orgId, t.vendorId),
    index("catch_lot_parent_idx").on(t.parentLotId),
    index("catch_lot_root_idx").on(t.rootLotId),
  ],
);

export const catchLotPhoto = pgTable("catch_lot_photo", {
  id: id(),
  orgId: orgId(),
  lotId: uuid("lot_id")
    .notNull()
    .references(() => catchLot.id, { onDelete: "cascade" }),
  fileKey: text("file_key").notNull(),
  caption: text("caption"),
  stage: text("stage").$type<"DECLARATION" | "RECEIVING" | "INSPECTION" | "DISPATCH">().notNull(),
  takenBy: text("taken_by"),
  createdAt: createdAt(),
});

export const catchLotDocument = pgTable("catch_lot_document", {
  id: id(),
  orgId: orgId(),
  lotId: uuid("lot_id")
    .notNull()
    .references(() => catchLot.id, { onDelete: "cascade" }),
  docType: text("doc_type").notNull(),
  referenceNo: text("reference_no"),
  fileKey: text("file_key"),
  integrationMode: text("integration_mode").$type<"MANUAL" | "FUTURE_INTEGRATION">().notNull().default("MANUAL"),
  createdAt: createdAt(),
});

export const lotTransformation = pgTable(
  "lot_transformation",
  {
    id: id(),
    orgId: orgId(),
    parentLotId: uuid("parent_lot_id")
      .notNull()
      .references(() => catchLot.id),
    childLotId: uuid("child_lot_id").references(() => catchLot.id),
    transformationType: text("transformation_type")
      .$type<"GUT" | "CLEAN" | "FILLET" | "PORTION" | "FREEZE" | "SPLIT" | "WASTE">()
      .notNull(),
    inputKg: kg("input_kg").notNull(),
    outputKg: kg("output_kg").notNull(),
    locationId: uuid("location_id").references(() => warehouseLocation.id),
    performedBy: text("performed_by"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("lot_transformation_parent_idx").on(t.parentLotId), index("lot_transformation_child_idx").on(t.childLotId)],
);

// =====================================================================
// RFQs and quotes
// =====================================================================
export const rfq = pgTable(
  "rfq",
  {
    id: id(),
    orgId: orgId(),
    rfqNumber: text("rfq_number").notNull(),
    marketDate: date("market_date").notNull(),
    speciesId: uuid("species_id")
      .notNull()
      .references(() => species.id),
    quantityKg: kg("quantity_kg").notNull(),
    sizeMinKg: kg("size_min_kg"),
    sizeMaxKg: kg("size_max_kg"),
    deliverBy: ts("deliver_by"),
    targetPricePerKg: unitPrice("target_price_per_kg"),
    maxPricePerKg: unitPrice("max_price_per_kg"),
    minQuantityKg: kg("min_quantity_kg"),
    maxQuantityKg: kg("max_quantity_kg"),
    negotiationEnabled: boolean("negotiation_enabled").notNull().default(false),
    status: text("status").$type<"DRAFT" | "PENDING_APPROVAL" | "SENT" | "CLOSED" | "AWARDED" | "CANCELLED">().notNull().default("DRAFT"),
    vendorIds: uuid("vendor_ids").array().notNull().default(sql`'{}'::uuid[]`),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("rfq_org_number_uq").on(t.orgId, t.rfqNumber), index("rfq_org_market_idx").on(t.orgId, t.marketDate)],
);

export const quote = pgTable(
  "quote",
  {
    id: id(),
    orgId: orgId(),
    rfqId: uuid("rfq_id").references(() => rfq.id),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendor.id),
    marketDate: date("market_date").notNull(),
    status: text("status").$type<"RECEIVED" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "COUNTERED">().notNull().default("RECEIVED"),
    etaAt: ts("eta_at"),
    validUntil: ts("valid_until"),
    messageId: uuid("message_id").references(() => message.id),
    lotId: uuid("lot_id").references(() => catchLot.id),
    receivedAt: ts("received_at").notNull().defaultNow(),
    respondedInMinutes: integer("responded_in_minutes"),
  },
  (t) => [index("quote_org_market_idx").on(t.orgId, t.marketDate), index("quote_vendor_idx").on(t.vendorId)],
);

export const quoteLine = pgTable(
  "quote_line",
  {
    id: id(),
    orgId: orgId(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quote.id, { onDelete: "cascade" }),
    speciesId: uuid("species_id")
      .notNull()
      .references(() => species.id),
    quantityKg: kg("quantity_kg").notNull(),
    pricePerKg: unitPrice("price_per_kg").notNull(),
    sizeMinKg: kg("size_min_kg"),
    sizeMaxKg: kg("size_max_kg"),
    qualityGrade: text("quality_grade"),
  },
  (t) => [index("quote_line_species_idx").on(t.orgId, t.speciesId)],
);

// =====================================================================
// Demand
// =====================================================================
export const standingOrder = pgTable(
  "standing_order",
  {
    id: id(),
    orgId: orgId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "cascade" }),
    speciesId: uuid("species_id")
      .notNull()
      .references(() => species.id),
    /** ISO weekdays 1=Mon .. 7=Sun of the delivery morning. */
    daysOfWeek: integer("days_of_week").array().notNull(),
    quantityKg: kg("quantity_kg").notNull(),
    sizeMinKg: kg("size_min_kg"),
    sizeMaxKg: kg("size_max_kg"),
    agreedPricePerKg: unitPrice("agreed_price_per_kg"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("standing_order_org_idx").on(t.orgId, t.customerId)],
);

export const demandForecast = pgTable(
  "demand_forecast",
  {
    id: id(),
    orgId: orgId(),
    marketDate: date("market_date").notNull(),
    method: text("method").notNull(),
    agentRunId: uuid("agent_run_id"),
    generatedAt: ts("generated_at").notNull().defaultNow(),
  },
  (t) => [index("demand_forecast_org_market_idx").on(t.orgId, t.marketDate)],
);

export const demandForecastLine = pgTable(
  "demand_forecast_line",
  {
    id: id(),
    orgId: orgId(),
    forecastId: uuid("forecast_id")
      .notNull()
      .references(() => demandForecast.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customer.id),
    speciesId: uuid("species_id")
      .notNull()
      .references(() => species.id),
    forecastKg: kg("forecast_kg").notNull(),
    lowKg: kg("low_kg").notNull(),
    highKg: kg("high_kg").notNull(),
    components: jsonb("components").$type<Record<string, number | string>>().notNull(),
    explanation: text("explanation").notNull(),
    overrideKg: kg("override_kg"),
    overrideBy: text("override_by"),
    overrideReason: text("override_reason"),
  },
  (t) => [index("dfl_forecast_idx").on(t.forecastId), index("dfl_species_idx").on(t.orgId, t.speciesId)],
);

// =====================================================================
// Purchasing
// =====================================================================
export const purchaseOrder = pgTable(
  "purchase_order",
  {
    id: id(),
    orgId: orgId(),
    poNumber: text("po_number").notNull(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendor.id),
    marketDate: date("market_date").notNull(),
    status: text("status")
      .$type<"DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "SENT" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CLOSED" | "CANCELLED">()
      .notNull()
      .default("DRAFT"),
    source: text("source").$type<"MANUAL" | "AI_RECOMMENDATION" | "RFQ" | "CATCH_DECLARATION">().notNull().default("MANUAL"),
    expectedAt: ts("expected_at"),
    currency: text("currency").notNull().default("SGD"),
    subtotal: money("subtotal").notNull().default("0"),
    gstRatePct: numeric("gst_rate_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    gstAmount: money("gst_amount").notNull().default("0"),
    total: money("total").notNull().default("0"),
    approvalId: uuid("approval_id"),
    approvedBy: text("approved_by"),
    approvedAt: ts("approved_at"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("purchase_order_org_number_uq").on(t.orgId, t.poNumber),
    index("purchase_order_org_market_idx").on(t.orgId, t.marketDate),
    index("purchase_order_vendor_idx").on(t.orgId, t.vendorId),
  ],
);

export const purchaseOrderLine = pgTable(
  "purchase_order_line",
  {
    id: id(),
    orgId: orgId(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrder.id, { onDelete: "cascade" }),
    speciesId: uuid("species_id")
      .notNull()
      .references(() => species.id),
    lotId: uuid("lot_id").references(() => catchLot.id),
    quantityKg: kg("quantity_kg").notNull(),
    pricePerKg: unitPrice("price_per_kg").notNull(),
    receivedKg: kg("received_kg").notNull().default("0"),
    sizeMinKg: kg("size_min_kg"),
    sizeMaxKg: kg("size_max_kg"),
    lineTotal: money("line_total").notNull(),
  },
  (t) => [index("pol_po_idx").on(t.purchaseOrderId), index("pol_lot_idx").on(t.lotId), index("pol_species_idx").on(t.orgId, t.speciesId)],
);

export const goodsReceipt = pgTable(
  "goods_receipt",
  {
    id: id(),
    orgId: orgId(),
    grnNumber: text("grn_number").notNull(),
    purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrder.id),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendor.id),
    receivedAt: ts("received_at").notNull(),
    receivedBy: text("received_by"),
    locationId: uuid("location_id").references(() => warehouseLocation.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("goods_receipt_org_number_uq").on(t.orgId, t.grnNumber), index("goods_receipt_po_idx").on(t.purchaseOrderId)],
);

export const goodsReceiptLine = pgTable(
  "goods_receipt_line",
  {
    id: id(),
    orgId: orgId(),
    goodsReceiptId: uuid("goods_receipt_id")
      .notNull()
      .references(() => goodsReceipt.id, { onDelete: "cascade" }),
    purchaseOrderLineId: uuid("purchase_order_line_id").references(() => purchaseOrderLine.id),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => catchLot.id),
    declaredKg: kg("declared_kg").notNull(),
    receivedKg: kg("received_kg").notNull(),
    acceptedKg: kg("accepted_kg").notNull(),
    rejectedKg: kg("rejected_kg").notNull().default("0"),
    rejectionReason: rejectionReason("rejection_reason"),
    temperatureC: numeric("temperature_c", { precision: 5, scale: 1 }),
    qualityGrade: text("quality_grade"),
    expectedAt: ts("expected_at"),
    arrivedLateMinutes: integer("arrived_late_minutes"),
  },
  (t) => [index("grl_receipt_idx").on(t.goodsReceiptId), index("grl_lot_idx").on(t.lotId), index("grl_pol_idx").on(t.purchaseOrderLineId)],
);

// =====================================================================
// Sales & allocation
// =====================================================================
export const salesOrder = pgTable(
  "sales_order",
  {
    id: id(),
    orgId: orgId(),
    soNumber: text("so_number").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    marketDate: date("market_date").notNull(),
    status: text("status")
      .$type<
        | "DRAFT"
        | "CONFIRMED"
        | "PARTIALLY_ALLOCATED"
        | "ALLOCATED"
        | "PICKING"
        | "PACKED"
        | "DISPATCHED"
        | "DELIVERED"
        | "INVOICED"
        | "CANCELLED"
      >()
      .notNull()
      .default("CONFIRMED"),
    source: text("source").$type<"STANDING_ORDER" | "WHATSAPP" | "PORTAL" | "PHONE" | "MANUAL">().notNull().default("MANUAL"),
    confirmedAt: ts("confirmed_at"),
    requestedDeliveryBy: ts("requested_delivery_by"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("sales_order_org_number_uq").on(t.orgId, t.soNumber),
    index("sales_order_org_market_idx").on(t.orgId, t.marketDate),
    index("sales_order_customer_idx").on(t.orgId, t.customerId),
  ],
);

export const salesOrderLine = pgTable(
  "sales_order_line",
  {
    id: id(),
    orgId: orgId(),
    salesOrderId: uuid("sales_order_id")
      .notNull()
      .references(() => salesOrder.id, { onDelete: "cascade" }),
    speciesId: uuid("species_id")
      .notNull()
      .references(() => species.id),
    requestedKg: kg("requested_kg").notNull(),
    allocatedKg: kg("allocated_kg").notNull().default("0"),
    pickedKg: kg("picked_kg").notNull().default("0"),
    deliveredKg: kg("delivered_kg").notNull().default("0"),
    pricePerKg: unitPrice("price_per_kg").notNull(),
    sizeMinKg: kg("size_min_kg"),
    sizeMaxKg: kg("size_max_kg"),
    substituteForLineId: uuid("substitute_for_line_id").references((): AnyPgColumn => salesOrderLine.id),
    substitutionStatus: text("substitution_status").$type<"SUGGESTED" | "CONFIRMED" | "DECLINED">(),
  },
  (t) => [index("sol_so_idx").on(t.salesOrderId), index("sol_species_idx").on(t.orgId, t.speciesId)],
);

export const allocation = pgTable(
  "allocation",
  {
    id: id(),
    orgId: orgId(),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => catchLot.id),
    salesOrderLineId: uuid("sales_order_line_id")
      .notNull()
      .references(() => salesOrderLine.id),
    quantityKg: kg("quantity_kg").notNull(),
    status: text("status").$type<"PROPOSED" | "CONFIRMED" | "PICKED" | "DISPATCHED" | "RELEASED">().notNull().default("CONFIRMED"),
    policy: allocationPolicy("policy").notNull(),
    agentRunId: uuid("agent_run_id"),
    confirmedBy: text("confirmed_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("allocation_lot_idx").on(t.lotId), index("allocation_sol_idx").on(t.salesOrderLineId), index("allocation_org_idx").on(t.orgId, t.status)],
);

export const inventoryMovement = pgTable(
  "inventory_movement",
  {
    id: id(),
    orgId: orgId(),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => catchLot.id),
    type: text("type")
      .$type<"RECEIPT" | "REJECT" | "ALLOCATE" | "DEALLOCATE" | "PICK" | "DISPATCH" | "TRANSFORM_OUT" | "TRANSFORM_IN" | "WASTE" | "ADJUSTMENT">()
      .notNull(),
    /** Signed change to on-hand (available + allocated) kg for physical moves, or to available kg for reservations. */
    quantityKg: kg("quantity_kg").notNull(),
    availableAfterKg: kg("available_after_kg").notNull(),
    refType: text("ref_type"),
    refId: uuid("ref_id"),
    locationId: uuid("location_id").references(() => warehouseLocation.id),
    actor: text("actor"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("inventory_movement_lot_idx").on(t.lotId, t.at), index("inventory_movement_org_idx").on(t.orgId, t.at)],
);

export const pickList = pgTable(
  "pick_list",
  {
    id: id(),
    orgId: orgId(),
    pickListNumber: text("pick_list_number").notNull(),
    marketDate: date("market_date").notNull(),
    status: text("status").$type<"OPEN" | "IN_PROGRESS" | "COMPLETED">().notNull().default("OPEN"),
    assignedTo: text("assigned_to"),
    createdAt: createdAt(),
    completedAt: ts("completed_at"),
  },
  (t) => [uniqueIndex("pick_list_org_number_uq").on(t.orgId, t.pickListNumber)],
);

export const pickListLine = pgTable(
  "pick_list_line",
  {
    id: id(),
    orgId: orgId(),
    pickListId: uuid("pick_list_id")
      .notNull()
      .references(() => pickList.id, { onDelete: "cascade" }),
    allocationId: uuid("allocation_id")
      .notNull()
      .references(() => allocation.id),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => catchLot.id),
    salesOrderLineId: uuid("sales_order_line_id")
      .notNull()
      .references(() => salesOrderLine.id),
    quantityKg: kg("quantity_kg").notNull(),
    pickedKg: kg("picked_kg"),
    status: text("status").$type<"PENDING" | "PICKED" | "PACKED">().notNull().default("PENDING"),
    pickedAt: ts("picked_at"),
    packedAt: ts("packed_at"),
  },
  (t) => [index("pick_list_line_list_idx").on(t.pickListId), index("pick_list_line_alloc_idx").on(t.allocationId)],
);

// =====================================================================
// Logistics
// =====================================================================
export const driver = pgTable("driver", {
  id: id(),
  orgId: orgId(),
  name: text("name").notNull(),
  phone: text("phone"),
  licenceClass: text("licence_class"),
  shiftStart: text("shift_start"),
  shiftEnd: text("shift_end"),
  active: boolean("active").notNull().default(true),
});

export const vehicle = pgTable("vehicle", {
  id: id(),
  orgId: orgId(),
  name: text("name").notNull(),
  plate: text("plate").notNull(),
  capacityKg: kg("capacity_kg").notNull(),
  refrigerated: boolean("refrigerated").notNull().default(true),
  tempMinC: numeric("temp_min_c", { precision: 5, scale: 1 }),
  tempMaxC: numeric("temp_max_c", { precision: 5, scale: 1 }),
  active: boolean("active").notNull().default(true),
});

export const shipment = pgTable(
  "shipment",
  {
    id: id(),
    orgId: orgId(),
    shipmentNumber: text("shipment_number").notNull(),
    marketDate: date("market_date").notNull(),
    vehicleId: uuid("vehicle_id").references(() => vehicle.id),
    driverId: uuid("driver_id").references(() => driver.id),
    status: text("status").$type<"PLANNED" | "LOADING" | "DISPATCHED" | "COMPLETED" | "CANCELLED">().notNull().default("PLANNED"),
    plannedDepartureAt: ts("planned_departure_at"),
    actualDepartureAt: ts("actual_departure_at"),
    completedAt: ts("completed_at"),
    totalKg: kg("total_kg").notNull().default("0"),
    distanceKm: numeric("distance_km", { precision: 8, scale: 1 }),
    durationMin: integer("duration_min"),
    routingProvider: text("routing_provider"),
    agentRunId: uuid("agent_run_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("shipment_org_number_uq").on(t.orgId, t.shipmentNumber), index("shipment_org_market_idx").on(t.orgId, t.marketDate)],
);

export const shipmentStop = pgTable(
  "shipment_stop",
  {
    id: id(),
    orgId: orgId(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipment.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    address: text("address"),
    lat: numeric("lat", { precision: 9, scale: 6 }),
    lng: numeric("lng", { precision: 9, scale: 6 }),
    windowStart: ts("window_start"),
    windowEnd: ts("window_end"),
    plannedArrivalAt: ts("planned_arrival_at"),
    actualArrivalAt: ts("actual_arrival_at"),
    status: text("status").$type<"PENDING" | "ARRIVED" | "DELIVERED" | "FAILED">().notNull().default("PENDING"),
    loadKg: kg("load_kg").notNull().default("0"),
    podName: text("pod_name"),
    podFileKey: text("pod_file_key"),
    podAt: ts("pod_at"),
  },
  (t) => [index("shipment_stop_shipment_idx").on(t.shipmentId)],
);

export const shipmentOrder = pgTable(
  "shipment_order",
  {
    id: id(),
    orgId: orgId(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipment.id, { onDelete: "cascade" }),
    stopId: uuid("stop_id")
      .notNull()
      .references(() => shipmentStop.id, { onDelete: "cascade" }),
    salesOrderId: uuid("sales_order_id")
      .notNull()
      .references(() => salesOrder.id),
  },
  (t) => [uniqueIndex("shipment_order_so_uq").on(t.salesOrderId, t.shipmentId), index("shipment_order_shipment_idx").on(t.shipmentId)],
);

export const temperatureReading = pgTable(
  "temperature_reading",
  {
    id: id(),
    orgId: orgId(),
    lotId: uuid("lot_id").references(() => catchLot.id),
    vehicleId: uuid("vehicle_id").references(() => vehicle.id),
    shipmentId: uuid("shipment_id").references(() => shipment.id),
    locationId: uuid("location_id").references(() => warehouseLocation.id),
    readingC: numeric("reading_c", { precision: 5, scale: 1 }).notNull(),
    thresholdMaxC: numeric("threshold_max_c", { precision: 5, scale: 1 }),
    isException: boolean("is_exception").notNull().default(false),
    source: text("source").$type<"MANUAL" | "PROBE" | "IOT_FUTURE">().notNull().default("MANUAL"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("temperature_reading_lot_idx").on(t.lotId), index("temperature_reading_org_idx").on(t.orgId, t.at)],
);

export const qualityInspection = pgTable(
  "quality_inspection",
  {
    id: id(),
    orgId: orgId(),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => catchLot.id),
    goodsReceiptLineId: uuid("goods_receipt_line_id").references(() => goodsReceiptLine.id),
    inspectedAt: ts("inspected_at").notNull().defaultNow(),
    inspector: text("inspector"),
    grade: text("grade").$type<"A" | "B" | "C" | "REJECT">().notNull(),
    temperatureC: numeric("temperature_c", { precision: 5, scale: 1 }),
    sizeCheck: text("size_check").$type<"IN_SPEC" | "UNDERSIZE" | "OVERSIZE" | "MIXED">(),
    freshnessNotes: text("freshness_notes"),
    rejectedKg: kg("rejected_kg").notNull().default("0"),
    rejectionReason: rejectionReason("rejection_reason"),
    notes: text("notes"),
  },
  (t) => [index("quality_inspection_lot_idx").on(t.lotId)],
);

// =====================================================================
// Finance
// =====================================================================
export const supplierInvoice = pgTable(
  "supplier_invoice",
  {
    id: id(),
    orgId: orgId(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendor.id),
    purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrder.id),
    invoiceNumber: text("invoice_number").notNull(),
    invoiceDate: date("invoice_date").notNull(),
    dueDate: date("due_date"),
    currency: text("currency").notNull().default("SGD"),
    subtotal: money("subtotal").notNull(),
    gstAmount: money("gst_amount").notNull().default("0"),
    total: money("total").notNull(),
    source: text("source").$type<"UPLOAD" | "EMAIL" | "PEPPOL" | "MANUAL" | "WHATSAPP">().notNull().default("MANUAL"),
    fileKey: text("file_key"),
    matchStatus: matchStatus("match_status").notNull().default("UNMATCHED"),
    matchResult: jsonb("match_result").$type<Record<string, unknown>>(),
    paymentStatus: text("payment_status").$type<"UNPAID" | "APPROVED_FOR_PAYMENT" | "PAID" | "ON_HOLD">().notNull().default("UNPAID"),
    approvedBy: text("approved_by"),
    receivedAt: ts("received_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("supplier_invoice_dedupe_uq").on(t.orgId, t.vendorId, t.invoiceNumber),
    index("supplier_invoice_po_idx").on(t.purchaseOrderId),
    index("supplier_invoice_status_idx").on(t.orgId, t.matchStatus),
  ],
);

export const supplierInvoiceLine = pgTable(
  "supplier_invoice_line",
  {
    id: id(),
    orgId: orgId(),
    supplierInvoiceId: uuid("supplier_invoice_id")
      .notNull()
      .references(() => supplierInvoice.id, { onDelete: "cascade" }),
    purchaseOrderLineId: uuid("purchase_order_line_id").references(() => purchaseOrderLine.id),
    speciesId: uuid("species_id").references(() => species.id),
    description: text("description").notNull(),
    quantityKg: kg("quantity_kg").notNull(),
    unitPrice: unitPrice("unit_price").notNull(),
    lineTotal: money("line_total").notNull(),
    gstCode: text("gst_code").$type<"SR" | "ZR" | "ES" | "OS" | "NA">().notNull().default("SR"),
  },
  (t) => [index("sil_invoice_idx").on(t.supplierInvoiceId)],
);

export const customerInvoice = pgTable(
  "customer_invoice",
  {
    id: id(),
    orgId: orgId(),
    type: text("type").$type<"INVOICE" | "CREDIT_NOTE">().notNull().default("INVOICE"),
    invoiceNumber: text("invoice_number").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    salesOrderId: uuid("sales_order_id").references(() => salesOrder.id),
    creditNoteForId: uuid("credit_note_for_id").references((): AnyPgColumn => customerInvoice.id),
    invoiceDate: date("invoice_date").notNull(),
    dueDate: date("due_date"),
    currency: text("currency").notNull().default("SGD"),
    subtotal: money("subtotal").notNull(),
    gstRatePct: numeric("gst_rate_pct", { precision: 5, scale: 2 }).notNull(),
    gstAmount: money("gst_amount").notNull(),
    total: money("total").notNull(),
    status: text("status").$type<"DRAFT" | "ISSUED" | "SENT" | "PAID" | "VOID">().notNull().default("DRAFT"),
    peppolStatus: text("peppol_status").$type<"NOT_SENT" | "MOCK_TRANSMITTED" | "QUEUED" | "DELIVERED" | "FAILED">().notNull().default("NOT_SENT"),
    peppolMessageId: text("peppol_message_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("customer_invoice_org_number_uq").on(t.orgId, t.invoiceNumber), index("customer_invoice_so_idx").on(t.salesOrderId)],
);

export const customerInvoiceLine = pgTable(
  "customer_invoice_line",
  {
    id: id(),
    orgId: orgId(),
    customerInvoiceId: uuid("customer_invoice_id")
      .notNull()
      .references(() => customerInvoice.id, { onDelete: "cascade" }),
    salesOrderLineId: uuid("sales_order_line_id").references(() => salesOrderLine.id),
    lotId: uuid("lot_id").references(() => catchLot.id),
    speciesId: uuid("species_id").references(() => species.id),
    description: text("description").notNull(),
    quantityKg: kg("quantity_kg").notNull(),
    unitPrice: unitPrice("unit_price").notNull(),
    lineTotal: money("line_total").notNull(),
    gstCode: text("gst_code").$type<"SR" | "ZR" | "ES" | "OS" | "NA">().notNull().default("SR"),
  },
  (t) => [index("cil_invoice_idx").on(t.customerInvoiceId), index("cil_lot_idx").on(t.lotId)],
);

export const payment = pgTable(
  "payment",
  {
    id: id(),
    orgId: orgId(),
    direction: text("direction").$type<"AP" | "AR">().notNull(),
    supplierInvoiceId: uuid("supplier_invoice_id").references(() => supplierInvoice.id),
    customerInvoiceId: uuid("customer_invoice_id").references(() => customerInvoice.id),
    amount: money("amount").notNull(),
    currency: text("currency").notNull().default("SGD"),
    method: text("method").$type<"PAYNOW" | "GIRO" | "BANK_TRANSFER" | "CHEQUE" | "CASH">().notNull(),
    reference: text("reference"),
    provider: text("provider").notNull().default("MANUAL"),
    paidAt: ts("paid_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("payment_org_idx").on(t.orgId, t.paidAt)],
);

// =====================================================================
// AI agents, approvals, exceptions, audit
// =====================================================================
export const agentRun = pgTable(
  "agent_run",
  {
    id: id(),
    orgId: orgId(),
    agent: text("agent").notNull(),
    trigger: text("trigger").$type<"EVENT" | "USER" | "SCHEDULE" | "COMMAND" | "WEBHOOK" | "SEED">().notNull(),
    triggerEventId: uuid("trigger_event_id"),
    inputRef: jsonb("input_ref").$type<Record<string, unknown>>().notNull().default({}),
    provider: text("provider").notNull(),
    model: text("model"),
    status: text("status").$type<"RUNNING" | "SUCCEEDED" | "FAILED" | "AWAITING_APPROVAL">().notNull().default("RUNNING"),
    summary: text("summary"),
    toolCalls: jsonb("tool_calls").$type<{ tool: string; ok: boolean; ms?: number; note?: string }[]>().notNull().default([]),
    output: jsonb("output").$type<Record<string, unknown>>(),
    approvalStatus: text("approval_status").$type<"NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED" | "PARTIAL">().notNull().default("NOT_REQUIRED"),
    error: text("error"),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    latencyMs: integer("latency_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
  },
  (t) => [index("agent_run_org_started_idx").on(t.orgId, t.startedAt), index("agent_run_org_agent_idx").on(t.orgId, t.agent)],
);

export type AffectedRecord = { type: string; id: string; label: string; href?: string };

export const agentAction = pgTable(
  "agent_action",
  {
    id: id(),
    orgId: orgId(),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRun.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    riskClass: riskClass("risk_class").notNull(),
    title: text("title").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    explanation: text("explanation").notNull(),
    proposedAction: jsonb("proposed_action").$type<Record<string, unknown>>().notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    affectedRecords: jsonb("affected_records").$type<AffectedRecord[]>().notNull().default([]),
    requiresApproval: boolean("requires_approval").notNull(),
    executionStatus: text("execution_status")
      .$type<"PROPOSED" | "AUTO_EXECUTED" | "PENDING_APPROVAL" | "APPROVED" | "EXECUTED" | "REJECTED" | "MODIFIED" | "FAILED" | "SUPERSEDED">()
      .notNull(),
    executionResult: jsonb("execution_result").$type<Record<string, unknown>>(),
    executedAt: ts("executed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("agent_action_run_idx").on(t.agentRunId), index("agent_action_org_status_idx").on(t.orgId, t.executionStatus)],
);

export const approval = pgTable(
  "approval",
  {
    id: id(),
    orgId: orgId(),
    agentActionId: uuid("agent_action_id").references(() => agentAction.id),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    riskClass: riskClass("risk_class").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<"PENDING" | "APPROVED" | "REJECTED" | "MODIFIED" | "EXPIRED" | "SUPERSEDED">().notNull().default("PENDING"),
    requestedBy: text("requested_by").notNull(),
    requestedAt: ts("requested_at").notNull().defaultNow(),
    decidedBy: text("decided_by"),
    decidedAt: ts("decided_at"),
    decisionNote: text("decision_note"),
    modifications: jsonb("modifications").$type<Record<string, unknown>>(),
    dedupeKey: text("dedupe_key"),
  },
  (t) => [index("approval_org_status_idx").on(t.orgId, t.status, t.requestedAt), uniqueIndex("approval_dedupe_uq").on(t.orgId, t.dedupeKey)],
);

export const opsException = pgTable(
  "ops_exception",
  {
    id: id(),
    orgId: orgId(),
    type: text("type")
      .$type<
        | "TEMPERATURE"
        | "WEIGHT_VARIANCE"
        | "LATE_VESSEL"
        | "INVOICE_MISMATCH"
        | "SHORTAGE"
        | "SURPLUS"
        | "DOCUMENT_EXPIRY"
        | "LATE_DELIVERY"
        | "QUALITY"
        | "SPECIES_MAPPING"
      >()
      .notNull(),
    severity: text("severity").$type<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">().notNull(),
    status: text("status").$type<"OPEN" | "ACKNOWLEDGED" | "RESOLVED">().notNull().default("OPEN"),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    href: text("href"),
    dedupeKey: text("dedupe_key").notNull(),
    openedAt: ts("opened_at").notNull().defaultNow(),
    resolvedAt: ts("resolved_at"),
    resolvedBy: text("resolved_by"),
    resolutionNote: text("resolution_note"),
  },
  (t) => [uniqueIndex("ops_exception_dedupe_uq").on(t.orgId, t.dedupeKey), index("ops_exception_org_status_idx").on(t.orgId, t.status)],
);

export const auditEvent = pgTable(
  "audit_event",
  {
    id: id(),
    orgId: orgId(),
    at: ts("at").notNull().defaultNow(),
    actorType: text("actor_type").$type<"USER" | "AGENT" | "SYSTEM" | "INTEGRATION">().notNull(),
    actorId: text("actor_id"),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    summary: text("summary").notNull(),
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>(),
    source: text("source").$type<"WEB" | "MOBILE" | "WHATSAPP" | "API" | "AGENT" | "SEED" | "SYSTEM">().notNull().default("WEB"),
    agentRunId: uuid("agent_run_id"),
    /** Additional entities this event should appear on (e.g. a lot and its PO). */
    relatedIds: uuid("related_ids").array().notNull().default(sql`'{}'::uuid[]`),
  },
  (t) => [
    index("audit_event_entity_idx").on(t.orgId, t.entityType, t.entityId, t.at),
    index("audit_event_org_at_idx").on(t.orgId, t.at),
    index("audit_event_related_idx").using("gin", t.relatedIds),
  ],
);

export const domainEvent = pgTable(
  "domain_event",
  {
    id: id(),
    orgId: orgId(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<"PENDING" | "PROCESSING" | "DONE" | "FAILED">().notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    idempotencyKey: text("idempotency_key"),
    error: text("error"),
    occurredAt: ts("occurred_at").notNull().defaultNow(),
    availableAt: ts("available_at").notNull().defaultNow(),
    processedAt: ts("processed_at"),
  },
  (t) => [index("domain_event_status_idx").on(t.status, t.availableAt), uniqueIndex("domain_event_idem_uq").on(t.orgId, t.idempotencyKey)],
);

// =====================================================================
// Recall
// =====================================================================
export const recallCase = pgTable(
  "recall_case",
  {
    id: id(),
    orgId: orgId(),
    caseNumber: text("case_number").notNull(),
    rootLotId: uuid("root_lot_id")
      .notNull()
      .references(() => catchLot.id),
    reason: text("reason").notNull(),
    severity: text("severity").$type<"PRECAUTIONARY" | "CLASS_II" | "CLASS_I">().notNull().default("PRECAUTIONARY"),
    status: text("status").$type<"OPEN" | "CONTACTS_APPROVED" | "CLOSED">().notNull().default("OPEN"),
    openedBy: text("opened_by").notNull(),
    openedAt: ts("opened_at").notNull().defaultNow(),
    closedAt: ts("closed_at"),
    regulatorNotifiedRef: text("regulator_notified_ref"),
  },
  (t) => [uniqueIndex("recall_case_org_number_uq").on(t.orgId, t.caseNumber)],
);

export const recallAffectedLot = pgTable("recall_affected_lot", {
  id: id(),
  orgId: orgId(),
  recallCaseId: uuid("recall_case_id")
    .notNull()
    .references(() => recallCase.id, { onDelete: "cascade" }),
  lotId: uuid("lot_id")
    .notNull()
    .references(() => catchLot.id),
  relation: text("relation").$type<"ROOT" | "CHILD" | "DESCENDANT">().notNull(),
  quantityOnHandKg: kg("quantity_on_hand_kg").notNull(),
  holdPlaced: boolean("hold_placed").notNull().default(false),
});

export const recallAffectedCustomer = pgTable("recall_affected_customer", {
  id: id(),
  orgId: orgId(),
  recallCaseId: uuid("recall_case_id")
    .notNull()
    .references(() => recallCase.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customer.id),
  quantityKg: kg("quantity_kg").notNull(),
  lotNumbers: text("lot_numbers").array().notNull(),
  salesOrderNumbers: text("sales_order_numbers").array().notNull(),
  contactStatus: text("contact_status").$type<"DRAFT" | "APPROVED" | "CONTACTED" | "CONFIRMED">().notNull().default("DRAFT"),
});

// =====================================================================
// Integrations & notifications
// =====================================================================
export const integrationConnection = pgTable(
  "integration_connection",
  {
    id: id(),
    orgId: orgId(),
    provider: text("provider").notNull(),
    kind: text("kind").notNull(),
    status: text("status").$type<"CONNECTED" | "NOT_CONNECTED" | "MOCK">().notNull(),
    /** Non-secret configuration only. Secrets live in environment variables / a secrets manager. */
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    lastCheckedAt: ts("last_checked_at"),
  },
  (t) => [uniqueIndex("integration_connection_org_provider_uq").on(t.orgId, t.kind)],
);

export const webhookEvent = pgTable(
  "webhook_event",
  {
    id: id(),
    orgId: uuid("org_id").references(() => organization.id),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    signatureValid: boolean("signature_valid").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<"RECEIVED" | "PROCESSED" | "DUPLICATE" | "REJECTED" | "FAILED">().notNull(),
    receivedAt: ts("received_at").notNull().defaultNow(),
    processedAt: ts("processed_at"),
  },
  (t) => [uniqueIndex("webhook_event_provider_ext_uq").on(t.provider, t.externalId)],
);

export const notification = pgTable(
  "notification",
  {
    id: id(),
    orgId: orgId(),
    audience: text("audience").$type<"SUPPLIER" | "BUYER" | "PROCUREMENT" | "OPERATIONS" | "FINANCE" | "COMPLIANCE" | "ALL">().notNull(),
    userId: text("user_id"),
    vendorId: uuid("vendor_id"),
    customerId: uuid("customer_id"),
    channel: text("channel").$type<"IN_APP" | "WHATSAPP" | "SMS" | "EMAIL">().notNull().default("IN_APP"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href"),
    status: text("status").$type<"UNREAD" | "READ" | "QUEUED" | "MOCK_SENT" | "SENT" | "FAILED" | "PENDING_APPROVAL">().notNull().default("UNREAD"),
    createdAt: createdAt(),
    readAt: ts("read_at"),
  },
  (t) => [index("notification_org_idx").on(t.orgId, t.audience, t.createdAt)],
);
