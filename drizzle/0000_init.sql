CREATE TYPE "public"."allocation_policy" AS ENUM('PRO_RATA', 'PRIORITY', 'FIRST_CONFIRMED', 'MINIMUM_GUARANTEED', 'MARGIN_MAX', 'MANUAL_RANK');--> statement-breakpoint
CREATE TYPE "public"."lot_status" AS ENUM('EXPECTED', 'LANDED', 'RECEIVED', 'INSPECTED', 'AVAILABLE', 'PARTIALLY_ALLOCATED', 'ALLOCATED', 'DISPATCHED', 'CLOSED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('UNMATCHED', 'MATCHED', 'MATCH_WITHIN_TOLERANCE', 'EXCEPTION', 'APPROVED_EXCEPTION');--> statement-breakpoint
CREATE TYPE "public"."processing_state" AS ENUM('WHOLE', 'GUTTED', 'CLEANED', 'FILLETED', 'PORTIONED', 'LIVE', 'FROZEN');--> statement-breakpoint
CREATE TYPE "public"."rejection_reason" AS ENUM('WRONG_SPECIES', 'WRONG_SIZE', 'UNDERWEIGHT', 'POOR_QUALITY', 'TEMPERATURE', 'DAMAGED', 'LATE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."risk_class" AS ENUM('READ_ONLY', 'LOW_RISK_WRITE', 'COMMERCIAL_COMMITMENT', 'FINANCIAL', 'EXTERNAL_COMMUNICATION', 'COMPLIANCE');--> statement-breakpoint
CREATE TYPE "public"."vendor_type" AS ENUM('FISHING_VESSEL', 'AQUACULTURE_FARM', 'FOREIGN_FISHERY', 'IMPORTER', 'WHOLESALER', 'PROCESSOR', 'LOGISTICS_PROVIDER');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_action" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"risk_class" "risk_class" NOT NULL,
	"title" text NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"explanation" text NOT NULL,
	"proposed_action" jsonb NOT NULL,
	"confidence" numeric(4, 3),
	"affected_records" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requires_approval" boolean NOT NULL,
	"execution_status" text NOT NULL,
	"execution_result" jsonb,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agent" text NOT NULL,
	"trigger" text NOT NULL,
	"trigger_event_id" uuid,
	"input_ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"summary" text,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"output" jsonb,
	"approval_status" text DEFAULT 'NOT_REQUIRED' NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer
);
--> statement-breakpoint
CREATE TABLE "allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"sales_order_line_id" uuid NOT NULL,
	"quantity_kg" numeric(12, 3) NOT NULL,
	"status" text DEFAULT 'CONFIRMED' NOT NULL,
	"policy" "allocation_policy" NOT NULL,
	"agent_run_id" uuid,
	"confirmed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agent_action_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"risk_class" "risk_class" NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"modifications" jsonb,
	"dedupe_key" text
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"source" text DEFAULT 'WEB' NOT NULL,
	"agent_run_id" uuid,
	"related_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"risk_class" "risk_class" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catch_lot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lot_number" text NOT NULL,
	"market_date" date NOT NULL,
	"confirmation" text DEFAULT 'CONFIRMED' NOT NULL,
	"vendor_id" uuid,
	"vessel_id" uuid,
	"farm_id" uuid,
	"parent_lot_id" uuid,
	"root_lot_id" uuid,
	"source_country" text,
	"source_location" text,
	"landing_location" text,
	"catch_date" date,
	"harvest_date" date,
	"original_eta" timestamp with time zone,
	"expected_arrival_at" timestamp with time zone,
	"landing_time" timestamp with time zone,
	"received_time" timestamp with time zone,
	"species_id" uuid,
	"supplier_species_name" text,
	"canonical_species_name" text,
	"local_name" text,
	"scientific_name" text,
	"quantity_declared_kg" numeric(12, 3) DEFAULT '0' NOT NULL,
	"quantity_received_kg" numeric(12, 3),
	"quantity_available_kg" numeric(12, 3) DEFAULT '0' NOT NULL,
	"quantity_allocated_kg" numeric(12, 3) DEFAULT '0' NOT NULL,
	"quantity_rejected_kg" numeric(12, 3) DEFAULT '0' NOT NULL,
	"piece_count" integer,
	"average_weight_kg" numeric(12, 3),
	"size_min_kg" numeric(12, 3),
	"size_max_kg" numeric(12, 3),
	"size_grade" text,
	"quality_grade" text,
	"processing_state" "processing_state" DEFAULT 'WHOLE' NOT NULL,
	"temperature_at_receiving_c" numeric(5, 1),
	"fresh_or_frozen" text DEFAULT 'FRESH' NOT NULL,
	"asking_price_per_kg" numeric(12, 4),
	"agreed_cost_per_kg" numeric(12, 4),
	"currency" text DEFAULT 'SGD' NOT NULL,
	"catch_method" text,
	"farm_method" text,
	"compliance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "lot_status" DEFAULT 'EXPECTED' NOT NULL,
	"location_id" uuid,
	"intake_message_id" uuid,
	"intake_confidence" numeric(4, 3),
	"field_confidence" jsonb,
	"ambiguous_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"purchase_order_line_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catch_lot_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"reference_no" text,
	"file_key" text,
	"integration_mode" text DEFAULT 'MANUAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catch_lot_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"file_key" text NOT NULL,
	"caption" text,
	"stage" text NOT NULL,
	"taken_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"priority_tier" integer DEFAULT 2 NOT NULL,
	"address" text,
	"postal_code" text,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"delivery_window_start" text,
	"delivery_window_end" text,
	"credit_terms_days" integer DEFAULT 14 NOT NULL,
	"gst_registered" boolean DEFAULT false NOT NULL,
	"peppol_id" text,
	"contact_name" text,
	"phone" text,
	"email" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" text DEFAULT 'INVOICE' NOT NULL,
	"invoice_number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"sales_order_id" uuid,
	"credit_note_for_id" uuid,
	"invoice_date" date NOT NULL,
	"due_date" date,
	"currency" text DEFAULT 'SGD' NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"gst_rate_pct" numeric(5, 2) NOT NULL,
	"gst_amount" numeric(14, 2) NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"peppol_status" text DEFAULT 'NOT_SENT' NOT NULL,
	"peppol_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_invoice_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_invoice_id" uuid NOT NULL,
	"sales_order_line_id" uuid,
	"lot_id" uuid,
	"species_id" uuid,
	"description" text NOT NULL,
	"quantity_kg" numeric(12, 3) NOT NULL,
	"unit_price" numeric(12, 4) NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	"gst_code" text DEFAULT 'SR' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demand_forecast" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"market_date" date NOT NULL,
	"method" text NOT NULL,
	"agent_run_id" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demand_forecast_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"forecast_id" uuid NOT NULL,
	"customer_id" uuid,
	"species_id" uuid NOT NULL,
	"forecast_kg" numeric(12, 3) NOT NULL,
	"low_kg" numeric(12, 3) NOT NULL,
	"high_kg" numeric(12, 3) NOT NULL,
	"components" jsonb NOT NULL,
	"explanation" text NOT NULL,
	"override_kg" numeric(12, 3),
	"override_by" text,
	"override_reason" text
);
--> statement-breakpoint
CREATE TABLE "domain_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text,
	"error" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "driver" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"licence_class" text,
	"shift_start" text,
	"shift_end" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"farm_type" text NOT NULL,
	"location" text,
	"country" text DEFAULT 'SG' NOT NULL,
	"licence_no" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goods_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"grn_number" text NOT NULL,
	"purchase_order_id" uuid,
	"vendor_id" uuid NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"received_by" text,
	"location_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"goods_receipt_id" uuid NOT NULL,
	"purchase_order_line_id" uuid,
	"lot_id" uuid NOT NULL,
	"declared_kg" numeric(12, 3) NOT NULL,
	"received_kg" numeric(12, 3) NOT NULL,
	"accepted_kg" numeric(12, 3) NOT NULL,
	"rejected_kg" numeric(12, 3) DEFAULT '0' NOT NULL,
	"rejection_reason" "rejection_reason",
	"temperature_c" numeric(5, 1),
	"quality_grade" text,
	"expected_at" timestamp with time zone,
	"arrived_late_minutes" integer
);
--> statement-breakpoint
CREATE TABLE "integration_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_checked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inventory_movement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"type" text NOT NULL,
	"quantity_kg" numeric(12, 3) NOT NULL,
	"available_after_kg" numeric(12, 3) NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"location_id" uuid,
	"actor" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lot_transformation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"parent_lot_id" uuid NOT NULL,
	"child_lot_id" uuid,
	"transformation_type" text NOT NULL,
	"input_kg" numeric(12, 3) NOT NULL,
	"output_kg" numeric(12, 3) NOT NULL,
	"location_id" uuid,
	"performed_by" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role_key" text NOT NULL,
	"vendor_id" uuid,
	"customer_id" uuid,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"direction" text NOT NULL,
	"vendor_id" uuid,
	"customer_id" uuid,
	"from_handle" text,
	"to_handle" text,
	"body" text NOT NULL,
	"transcription" text,
	"external_id" text,
	"status" text NOT NULL,
	"agent_run_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"audience" text NOT NULL,
	"user_id" text,
	"vendor_id" uuid,
	"customer_id" uuid,
	"channel" text DEFAULT 'IN_APP' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"href" text,
	"status" text DEFAULT 'UNREAD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ops_exception" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"href" text,
	"dedupe_key" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"resolution_note" text
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"site_code" text DEFAULT 'JFP' NOT NULL,
	"plan" text DEFAULT 'GROWTH' NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"uen" text,
	"gst_registered" boolean DEFAULT true NOT NULL,
	"gst_reg_no" text,
	"gst_rate_pct" numeric(5, 2) DEFAULT '9.00' NOT NULL,
	"base_currency" text DEFAULT 'SGD' NOT NULL,
	"timezone" text DEFAULT 'Asia/Singapore' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"supplier_invoice_id" uuid,
	"customer_invoice_id" uuid,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'SGD' NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"provider" text DEFAULT 'MANUAL' NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pick_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"pick_list_number" text NOT NULL,
	"market_date" date NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"assigned_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pick_list_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"pick_list_id" uuid NOT NULL,
	"allocation_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"sales_order_line_id" uuid NOT NULL,
	"quantity_kg" numeric(12, 3) NOT NULL,
	"picked_kg" numeric(12, 3),
	"status" text DEFAULT 'PENDING' NOT NULL,
	"picked_at" timestamp with time zone,
	"packed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "purchase_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"po_number" text NOT NULL,
	"vendor_id" uuid NOT NULL,
	"market_date" date NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"expected_at" timestamp with time zone,
	"currency" text DEFAULT 'SGD' NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"gst_rate_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"gst_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"approval_id" uuid,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"species_id" uuid NOT NULL,
	"lot_id" uuid,
	"quantity_kg" numeric(12, 3) NOT NULL,
	"price_per_kg" numeric(12, 4) NOT NULL,
	"received_kg" numeric(12, 3) DEFAULT '0' NOT NULL,
	"size_min_kg" numeric(12, 3),
	"size_max_kg" numeric(12, 3),
	"line_total" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quality_inspection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"goods_receipt_line_id" uuid,
	"inspected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"inspector" text,
	"grade" text NOT NULL,
	"temperature_c" numeric(5, 1),
	"size_check" text,
	"freshness_notes" text,
	"rejected_kg" numeric(12, 3) DEFAULT '0' NOT NULL,
	"rejection_reason" "rejection_reason",
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "quote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"rfq_id" uuid,
	"vendor_id" uuid NOT NULL,
	"market_date" date NOT NULL,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"eta_at" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"message_id" uuid,
	"lot_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_in_minutes" integer
);
--> statement-breakpoint
CREATE TABLE "quote_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"species_id" uuid NOT NULL,
	"quantity_kg" numeric(12, 3) NOT NULL,
	"price_per_kg" numeric(12, 4) NOT NULL,
	"size_min_kg" numeric(12, 3),
	"size_max_kg" numeric(12, 3),
	"quality_grade" text
);
--> statement-breakpoint
CREATE TABLE "recall_affected_customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"recall_case_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"quantity_kg" numeric(12, 3) NOT NULL,
	"lot_numbers" text[] NOT NULL,
	"sales_order_numbers" text[] NOT NULL,
	"contact_status" text DEFAULT 'DRAFT' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recall_affected_lot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"recall_case_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"relation" text NOT NULL,
	"quantity_on_hand_kg" numeric(12, 3) NOT NULL,
	"hold_placed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recall_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"case_number" text NOT NULL,
	"root_lot_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"severity" text DEFAULT 'PRECAUTIONARY' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"opened_by" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"regulator_notified_ref" text
);
--> statement-breakpoint
CREATE TABLE "rfq" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"rfq_number" text NOT NULL,
	"market_date" date NOT NULL,
	"species_id" uuid NOT NULL,
	"quantity_kg" numeric(12, 3) NOT NULL,
	"size_min_kg" numeric(12, 3),
	"size_max_kg" numeric(12, 3),
	"deliver_by" timestamp with time zone,
	"target_price_per_kg" numeric(12, 4),
	"max_price_per_kg" numeric(12, 4),
	"min_quantity_kg" numeric(12, 3),
	"max_quantity_kg" numeric(12, 3),
	"negotiation_enabled" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"vendor_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"so_number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"market_date" date NOT NULL,
	"status" text DEFAULT 'CONFIRMED' NOT NULL,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"requested_delivery_by" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_order_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sales_order_id" uuid NOT NULL,
	"species_id" uuid NOT NULL,
	"requested_kg" numeric(12, 3) NOT NULL,
	"allocated_kg" numeric(12, 3) DEFAULT '0' NOT NULL,
	"picked_kg" numeric(12, 3) DEFAULT '0' NOT NULL,
	"delivered_kg" numeric(12, 3) DEFAULT '0' NOT NULL,
	"price_per_kg" numeric(12, 4) NOT NULL,
	"size_min_kg" numeric(12, 3),
	"size_max_kg" numeric(12, 3),
	"substitute_for_line_id" uuid,
	"substitution_status" text
);
--> statement-breakpoint
CREATE TABLE "sequence_counter" (
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sequence_counter_org_id_key_pk" PRIMARY KEY("org_id","key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "shipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"shipment_number" text NOT NULL,
	"market_date" date NOT NULL,
	"vehicle_id" uuid,
	"driver_id" uuid,
	"status" text DEFAULT 'PLANNED' NOT NULL,
	"planned_departure_at" timestamp with time zone,
	"actual_departure_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"total_kg" numeric(12, 3) DEFAULT '0' NOT NULL,
	"distance_km" numeric(8, 1),
	"duration_min" integer,
	"routing_provider" text,
	"agent_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"stop_id" uuid NOT NULL,
	"sales_order_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_stop" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"customer_id" uuid NOT NULL,
	"address" text,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"window_start" timestamp with time zone,
	"window_end" timestamp with time zone,
	"planned_arrival_at" timestamp with time zone,
	"actual_arrival_at" timestamp with time zone,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"load_kg" numeric(12, 3) DEFAULT '0' NOT NULL,
	"pod_name" text,
	"pod_file_key" text,
	"pod_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "species" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"canonical_name" text NOT NULL,
	"chinese_name" text,
	"malay_name" text,
	"local_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"scientific_name" text,
	"category" text NOT NULL,
	"typical_size_min_kg" numeric(12, 3),
	"typical_size_max_kg" numeric(12, 3),
	"typical_yield_pct" numeric(5, 2),
	"storage" text DEFAULT 'CHILLED' NOT NULL,
	"freshness_hours" integer DEFAULT 48 NOT NULL,
	"substitute_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"indicative_markup_pct" numeric(5, 2) DEFAULT '22.00' NOT NULL,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "species_alias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"species_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"normalised" text NOT NULL,
	"language" text DEFAULT 'EN' NOT NULL,
	"source" text DEFAULT 'SEED' NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"confirmed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standing_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"species_id" uuid NOT NULL,
	"days_of_week" integer[] NOT NULL,
	"quantity_kg" numeric(12, 3) NOT NULL,
	"size_min_kg" numeric(12, 3),
	"size_max_kg" numeric(12, 3),
	"agreed_price_per_kg" numeric(12, 4),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"purchase_order_id" uuid,
	"invoice_number" text NOT NULL,
	"invoice_date" date NOT NULL,
	"due_date" date,
	"currency" text DEFAULT 'SGD' NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"gst_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"file_key" text,
	"match_status" "match_status" DEFAULT 'UNMATCHED' NOT NULL,
	"match_result" jsonb,
	"payment_status" text DEFAULT 'UNPAID' NOT NULL,
	"approved_by" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_invoice_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"supplier_invoice_id" uuid NOT NULL,
	"purchase_order_line_id" uuid,
	"species_id" uuid,
	"description" text NOT NULL,
	"quantity_kg" numeric(12, 3) NOT NULL,
	"unit_price" numeric(12, 4) NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	"gst_code" text DEFAULT 'SR' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "temperature_reading" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lot_id" uuid,
	"vehicle_id" uuid,
	"shipment_id" uuid,
	"location_id" uuid,
	"reading_c" numeric(5, 1) NOT NULL,
	"threshold_max_c" numeric(5, 1),
	"is_exception" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vehicle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"plate" text NOT NULL,
	"capacity_kg" numeric(12, 3) NOT NULL,
	"refrigerated" boolean DEFAULT true NOT NULL,
	"temp_min_c" numeric(5, 1),
	"temp_max_c" numeric(5, 1),
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "vendor_type" NOT NULL,
	"country" text DEFAULT 'SG' NOT NULL,
	"region" text,
	"address" text,
	"gst_registered" boolean DEFAULT false NOT NULL,
	"gst_reg_no" text,
	"uen" text,
	"payment_terms_days" integer DEFAULT 7 NOT NULL,
	"preferred_channel" text DEFAULT 'WHATSAPP' NOT NULL,
	"whatsapp_number" text,
	"relationship_tier" text DEFAULT 'STANDARD' NOT NULL,
	"min_order_kg" numeric(12, 3),
	"distance_km" numeric(8, 1),
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"phone" text,
	"email" text,
	"whatsapp" text,
	"preferred_language" text DEFAULT 'en',
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"title" text NOT NULL,
	"reference_no" text,
	"file_key" text,
	"issued_at" date,
	"expires_at" date,
	"status" text DEFAULT 'PENDING_REVIEW' NOT NULL,
	"integration_mode" text DEFAULT 'MANUAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_licence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"licence_type" text NOT NULL,
	"licence_no" text NOT NULL,
	"issuer" text NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"verification_mode" text DEFAULT 'MANUAL' NOT NULL,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_species_capability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"species_id" uuid NOT NULL,
	"typical_kg_per_night" numeric(12, 3),
	"size_min_kg" numeric(12, 3),
	"size_max_kg" numeric(12, 3),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vessel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"registration_no" text,
	"licence_no" text,
	"home_port" text,
	"flag_country" text DEFAULT 'SG' NOT NULL,
	"gear_type" text,
	"capacity_kg" numeric(12, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_location" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"temp_min_c" numeric(5, 1),
	"temp_max_c" numeric(5, 1),
	"address" text,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"cold_store_licence_no" text
);
--> statement-breakpoint
CREATE TABLE "webhook_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"signature_valid" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action" ADD CONSTRAINT "agent_action_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action" ADD CONSTRAINT "agent_action_agent_run_id_agent_run_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation" ADD CONSTRAINT "allocation_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation" ADD CONSTRAINT "allocation_lot_id_catch_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."catch_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation" ADD CONSTRAINT "allocation_sales_order_line_id_sales_order_line_id_fk" FOREIGN KEY ("sales_order_line_id") REFERENCES "public"."sales_order_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_agent_action_id_agent_action_id_fk" FOREIGN KEY ("agent_action_id") REFERENCES "public"."agent_action"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rule" ADD CONSTRAINT "automation_rule_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catch_lot" ADD CONSTRAINT "catch_lot_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catch_lot" ADD CONSTRAINT "catch_lot_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catch_lot" ADD CONSTRAINT "catch_lot_vessel_id_vessel_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catch_lot" ADD CONSTRAINT "catch_lot_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catch_lot" ADD CONSTRAINT "catch_lot_parent_lot_id_catch_lot_id_fk" FOREIGN KEY ("parent_lot_id") REFERENCES "public"."catch_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catch_lot" ADD CONSTRAINT "catch_lot_root_lot_id_catch_lot_id_fk" FOREIGN KEY ("root_lot_id") REFERENCES "public"."catch_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catch_lot" ADD CONSTRAINT "catch_lot_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catch_lot" ADD CONSTRAINT "catch_lot_location_id_warehouse_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."warehouse_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catch_lot" ADD CONSTRAINT "catch_lot_intake_message_id_message_id_fk" FOREIGN KEY ("intake_message_id") REFERENCES "public"."message"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catch_lot_document" ADD CONSTRAINT "catch_lot_document_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catch_lot_document" ADD CONSTRAINT "catch_lot_document_lot_id_catch_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."catch_lot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catch_lot_photo" ADD CONSTRAINT "catch_lot_photo_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catch_lot_photo" ADD CONSTRAINT "catch_lot_photo_lot_id_catch_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."catch_lot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoice" ADD CONSTRAINT "customer_invoice_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoice" ADD CONSTRAINT "customer_invoice_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoice" ADD CONSTRAINT "customer_invoice_sales_order_id_sales_order_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoice" ADD CONSTRAINT "customer_invoice_credit_note_for_id_customer_invoice_id_fk" FOREIGN KEY ("credit_note_for_id") REFERENCES "public"."customer_invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoice_line" ADD CONSTRAINT "customer_invoice_line_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoice_line" ADD CONSTRAINT "customer_invoice_line_customer_invoice_id_customer_invoice_id_fk" FOREIGN KEY ("customer_invoice_id") REFERENCES "public"."customer_invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoice_line" ADD CONSTRAINT "customer_invoice_line_sales_order_line_id_sales_order_line_id_fk" FOREIGN KEY ("sales_order_line_id") REFERENCES "public"."sales_order_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoice_line" ADD CONSTRAINT "customer_invoice_line_lot_id_catch_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."catch_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoice_line" ADD CONSTRAINT "customer_invoice_line_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_forecast" ADD CONSTRAINT "demand_forecast_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_forecast_line" ADD CONSTRAINT "demand_forecast_line_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_forecast_line" ADD CONSTRAINT "demand_forecast_line_forecast_id_demand_forecast_id_fk" FOREIGN KEY ("forecast_id") REFERENCES "public"."demand_forecast"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_forecast_line" ADD CONSTRAINT "demand_forecast_line_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_forecast_line" ADD CONSTRAINT "demand_forecast_line_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_event" ADD CONSTRAINT "domain_event_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver" ADD CONSTRAINT "driver_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm" ADD CONSTRAINT "farm_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm" ADD CONSTRAINT "farm_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_purchase_order_id_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_location_id_warehouse_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."warehouse_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_goods_receipt_id_goods_receipt_id_fk" FOREIGN KEY ("goods_receipt_id") REFERENCES "public"."goods_receipt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_purchase_order_line_id_purchase_order_line_id_fk" FOREIGN KEY ("purchase_order_line_id") REFERENCES "public"."purchase_order_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_lot_id_catch_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."catch_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connection" ADD CONSTRAINT "integration_connection_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_lot_id_catch_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."catch_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_location_id_warehouse_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."warehouse_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_transformation" ADD CONSTRAINT "lot_transformation_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_transformation" ADD CONSTRAINT "lot_transformation_parent_lot_id_catch_lot_id_fk" FOREIGN KEY ("parent_lot_id") REFERENCES "public"."catch_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_transformation" ADD CONSTRAINT "lot_transformation_child_lot_id_catch_lot_id_fk" FOREIGN KEY ("child_lot_id") REFERENCES "public"."catch_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_transformation" ADD CONSTRAINT "lot_transformation_location_id_warehouse_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."warehouse_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_role_key_role_key_fk" FOREIGN KEY ("role_key") REFERENCES "public"."role"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachment" ADD CONSTRAINT "message_attachment_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachment" ADD CONSTRAINT "message_attachment_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_exception" ADD CONSTRAINT "ops_exception_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_supplier_invoice_id_supplier_invoice_id_fk" FOREIGN KEY ("supplier_invoice_id") REFERENCES "public"."supplier_invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_customer_invoice_id_customer_invoice_id_fk" FOREIGN KEY ("customer_invoice_id") REFERENCES "public"."customer_invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_list" ADD CONSTRAINT "pick_list_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_list_line" ADD CONSTRAINT "pick_list_line_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_list_line" ADD CONSTRAINT "pick_list_line_pick_list_id_pick_list_id_fk" FOREIGN KEY ("pick_list_id") REFERENCES "public"."pick_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_list_line" ADD CONSTRAINT "pick_list_line_allocation_id_allocation_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."allocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_list_line" ADD CONSTRAINT "pick_list_line_lot_id_catch_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."catch_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_list_line" ADD CONSTRAINT "pick_list_line_sales_order_line_id_sales_order_line_id_fk" FOREIGN KEY ("sales_order_line_id") REFERENCES "public"."sales_order_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_purchase_order_id_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_lot_id_catch_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."catch_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspection" ADD CONSTRAINT "quality_inspection_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspection" ADD CONSTRAINT "quality_inspection_lot_id_catch_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."catch_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspection" ADD CONSTRAINT "quality_inspection_goods_receipt_line_id_goods_receipt_line_id_fk" FOREIGN KEY ("goods_receipt_line_id") REFERENCES "public"."goods_receipt_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_rfq_id_rfq_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfq"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_lot_id_catch_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."catch_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_affected_customer" ADD CONSTRAINT "recall_affected_customer_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_affected_customer" ADD CONSTRAINT "recall_affected_customer_recall_case_id_recall_case_id_fk" FOREIGN KEY ("recall_case_id") REFERENCES "public"."recall_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_affected_customer" ADD CONSTRAINT "recall_affected_customer_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_affected_lot" ADD CONSTRAINT "recall_affected_lot_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_affected_lot" ADD CONSTRAINT "recall_affected_lot_recall_case_id_recall_case_id_fk" FOREIGN KEY ("recall_case_id") REFERENCES "public"."recall_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_affected_lot" ADD CONSTRAINT "recall_affected_lot_lot_id_catch_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."catch_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_case" ADD CONSTRAINT "recall_case_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_case" ADD CONSTRAINT "recall_case_root_lot_id_catch_lot_id_fk" FOREIGN KEY ("root_lot_id") REFERENCES "public"."catch_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq" ADD CONSTRAINT "rfq_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq" ADD CONSTRAINT "rfq_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_line" ADD CONSTRAINT "sales_order_line_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_line" ADD CONSTRAINT "sales_order_line_sales_order_id_sales_order_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_line" ADD CONSTRAINT "sales_order_line_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_line" ADD CONSTRAINT "sales_order_line_substitute_for_line_id_sales_order_line_id_fk" FOREIGN KEY ("substitute_for_line_id") REFERENCES "public"."sales_order_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_counter" ADD CONSTRAINT "sequence_counter_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_driver_id_driver_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."driver"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_order" ADD CONSTRAINT "shipment_order_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_order" ADD CONSTRAINT "shipment_order_shipment_id_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_order" ADD CONSTRAINT "shipment_order_stop_id_shipment_stop_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."shipment_stop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_order" ADD CONSTRAINT "shipment_order_sales_order_id_sales_order_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_stop" ADD CONSTRAINT "shipment_stop_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_stop" ADD CONSTRAINT "shipment_stop_shipment_id_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_stop" ADD CONSTRAINT "shipment_stop_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species" ADD CONSTRAINT "species_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_alias" ADD CONSTRAINT "species_alias_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_alias" ADD CONSTRAINT "species_alias_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standing_order" ADD CONSTRAINT "standing_order_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standing_order" ADD CONSTRAINT "standing_order_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standing_order" ADD CONSTRAINT "standing_order_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoice" ADD CONSTRAINT "supplier_invoice_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoice" ADD CONSTRAINT "supplier_invoice_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoice" ADD CONSTRAINT "supplier_invoice_purchase_order_id_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoice_line" ADD CONSTRAINT "supplier_invoice_line_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoice_line" ADD CONSTRAINT "supplier_invoice_line_supplier_invoice_id_supplier_invoice_id_fk" FOREIGN KEY ("supplier_invoice_id") REFERENCES "public"."supplier_invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoice_line" ADD CONSTRAINT "supplier_invoice_line_purchase_order_line_id_purchase_order_line_id_fk" FOREIGN KEY ("purchase_order_line_id") REFERENCES "public"."purchase_order_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoice_line" ADD CONSTRAINT "supplier_invoice_line_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temperature_reading" ADD CONSTRAINT "temperature_reading_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temperature_reading" ADD CONSTRAINT "temperature_reading_lot_id_catch_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."catch_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temperature_reading" ADD CONSTRAINT "temperature_reading_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temperature_reading" ADD CONSTRAINT "temperature_reading_shipment_id_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temperature_reading" ADD CONSTRAINT "temperature_reading_location_id_warehouse_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."warehouse_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor" ADD CONSTRAINT "vendor_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_contact" ADD CONSTRAINT "vendor_contact_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_contact" ADD CONSTRAINT "vendor_contact_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_document" ADD CONSTRAINT "vendor_document_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_document" ADD CONSTRAINT "vendor_document_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_licence" ADD CONSTRAINT "vendor_licence_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_licence" ADD CONSTRAINT "vendor_licence_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_species_capability" ADD CONSTRAINT "vendor_species_capability_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_species_capability" ADD CONSTRAINT "vendor_species_capability_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_species_capability" ADD CONSTRAINT "vendor_species_capability_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vessel" ADD CONSTRAINT "vessel_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vessel" ADD CONSTRAINT "vessel_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_location" ADD CONSTRAINT "warehouse_location_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_event" ADD CONSTRAINT "webhook_event_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_action_run_idx" ON "agent_action" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "agent_action_org_status_idx" ON "agent_action" USING btree ("org_id","execution_status");--> statement-breakpoint
CREATE INDEX "agent_run_org_started_idx" ON "agent_run" USING btree ("org_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_run_org_agent_idx" ON "agent_run" USING btree ("org_id","agent");--> statement-breakpoint
CREATE INDEX "allocation_lot_idx" ON "allocation" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "allocation_sol_idx" ON "allocation" USING btree ("sales_order_line_id");--> statement-breakpoint
CREATE INDEX "allocation_org_idx" ON "allocation" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "approval_org_status_idx" ON "approval" USING btree ("org_id","status","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_dedupe_uq" ON "approval" USING btree ("org_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "audit_event_entity_idx" ON "audit_event" USING btree ("org_id","entity_type","entity_id","at");--> statement-breakpoint
CREATE INDEX "audit_event_org_at_idx" ON "audit_event" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "audit_event_related_idx" ON "audit_event" USING gin ("related_ids");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_rule_org_key_uq" ON "automation_rule" USING btree ("org_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "catch_lot_org_number_uq" ON "catch_lot" USING btree ("org_id","lot_number");--> statement-breakpoint
CREATE INDEX "catch_lot_org_market_idx" ON "catch_lot" USING btree ("org_id","market_date");--> statement-breakpoint
CREATE INDEX "catch_lot_org_status_idx" ON "catch_lot" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "catch_lot_species_idx" ON "catch_lot" USING btree ("org_id","species_id","market_date");--> statement-breakpoint
CREATE INDEX "catch_lot_vendor_idx" ON "catch_lot" USING btree ("org_id","vendor_id");--> statement-breakpoint
CREATE INDEX "catch_lot_parent_idx" ON "catch_lot" USING btree ("parent_lot_id");--> statement-breakpoint
CREATE INDEX "catch_lot_root_idx" ON "catch_lot" USING btree ("root_lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_org_code_uq" ON "customer" USING btree ("org_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_invoice_org_number_uq" ON "customer_invoice" USING btree ("org_id","invoice_number");--> statement-breakpoint
CREATE INDEX "customer_invoice_so_idx" ON "customer_invoice" USING btree ("sales_order_id");--> statement-breakpoint
CREATE INDEX "cil_invoice_idx" ON "customer_invoice_line" USING btree ("customer_invoice_id");--> statement-breakpoint
CREATE INDEX "cil_lot_idx" ON "customer_invoice_line" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "demand_forecast_org_market_idx" ON "demand_forecast" USING btree ("org_id","market_date");--> statement-breakpoint
CREATE INDEX "dfl_forecast_idx" ON "demand_forecast_line" USING btree ("forecast_id");--> statement-breakpoint
CREATE INDEX "dfl_species_idx" ON "demand_forecast_line" USING btree ("org_id","species_id");--> statement-breakpoint
CREATE INDEX "domain_event_status_idx" ON "domain_event" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_event_idem_uq" ON "domain_event" USING btree ("org_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "farm_vendor_idx" ON "farm" USING btree ("vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goods_receipt_org_number_uq" ON "goods_receipt" USING btree ("org_id","grn_number");--> statement-breakpoint
CREATE INDEX "goods_receipt_po_idx" ON "goods_receipt" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "grl_receipt_idx" ON "goods_receipt_line" USING btree ("goods_receipt_id");--> statement-breakpoint
CREATE INDEX "grl_lot_idx" ON "goods_receipt_line" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "grl_pol_idx" ON "goods_receipt_line" USING btree ("purchase_order_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connection_org_provider_uq" ON "integration_connection" USING btree ("org_id","kind");--> statement-breakpoint
CREATE INDEX "inventory_movement_lot_idx" ON "inventory_movement" USING btree ("lot_id","at");--> statement-breakpoint
CREATE INDEX "inventory_movement_org_idx" ON "inventory_movement" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "lot_transformation_parent_idx" ON "lot_transformation" USING btree ("parent_lot_id");--> statement-breakpoint
CREATE INDEX "lot_transformation_child_idx" ON "lot_transformation" USING btree ("child_lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_org_user_uq" ON "membership" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "membership" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_org_at_idx" ON "message" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "message_vendor_idx" ON "message" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "notification_org_idx" ON "notification" USING btree ("org_id","audience","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ops_exception_dedupe_uq" ON "ops_exception" USING btree ("org_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "ops_exception_org_status_idx" ON "ops_exception" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "payment_org_idx" ON "payment" USING btree ("org_id","paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pick_list_org_number_uq" ON "pick_list" USING btree ("org_id","pick_list_number");--> statement-breakpoint
CREATE INDEX "pick_list_line_list_idx" ON "pick_list_line" USING btree ("pick_list_id");--> statement-breakpoint
CREATE INDEX "pick_list_line_alloc_idx" ON "pick_list_line" USING btree ("allocation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_org_number_uq" ON "purchase_order" USING btree ("org_id","po_number");--> statement-breakpoint
CREATE INDEX "purchase_order_org_market_idx" ON "purchase_order" USING btree ("org_id","market_date");--> statement-breakpoint
CREATE INDEX "purchase_order_vendor_idx" ON "purchase_order" USING btree ("org_id","vendor_id");--> statement-breakpoint
CREATE INDEX "pol_po_idx" ON "purchase_order_line" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "pol_lot_idx" ON "purchase_order_line" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "pol_species_idx" ON "purchase_order_line" USING btree ("org_id","species_id");--> statement-breakpoint
CREATE INDEX "quality_inspection_lot_idx" ON "quality_inspection" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "quote_org_market_idx" ON "quote" USING btree ("org_id","market_date");--> statement-breakpoint
CREATE INDEX "quote_vendor_idx" ON "quote" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "quote_line_species_idx" ON "quote_line" USING btree ("org_id","species_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recall_case_org_number_uq" ON "recall_case" USING btree ("org_id","case_number");--> statement-breakpoint
CREATE UNIQUE INDEX "rfq_org_number_uq" ON "rfq" USING btree ("org_id","rfq_number");--> statement-breakpoint
CREATE INDEX "rfq_org_market_idx" ON "rfq" USING btree ("org_id","market_date");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_order_org_number_uq" ON "sales_order" USING btree ("org_id","so_number");--> statement-breakpoint
CREATE INDEX "sales_order_org_market_idx" ON "sales_order" USING btree ("org_id","market_date");--> statement-breakpoint
CREATE INDEX "sales_order_customer_idx" ON "sales_order" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE INDEX "sol_so_idx" ON "sales_order_line" USING btree ("sales_order_id");--> statement-breakpoint
CREATE INDEX "sol_species_idx" ON "sales_order_line" USING btree ("org_id","species_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_org_number_uq" ON "shipment" USING btree ("org_id","shipment_number");--> statement-breakpoint
CREATE INDEX "shipment_org_market_idx" ON "shipment" USING btree ("org_id","market_date");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_order_so_uq" ON "shipment_order" USING btree ("sales_order_id","shipment_id");--> statement-breakpoint
CREATE INDEX "shipment_order_shipment_idx" ON "shipment_order" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "shipment_stop_shipment_idx" ON "shipment_stop" USING btree ("shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "species_org_code_uq" ON "species" USING btree ("org_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "species_alias_org_norm_uq" ON "species_alias" USING btree ("org_id","normalised");--> statement-breakpoint
CREATE INDEX "species_alias_species_idx" ON "species_alias" USING btree ("species_id");--> statement-breakpoint
CREATE INDEX "standing_order_org_idx" ON "standing_order" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_invoice_dedupe_uq" ON "supplier_invoice" USING btree ("org_id","vendor_id","invoice_number");--> statement-breakpoint
CREATE INDEX "supplier_invoice_po_idx" ON "supplier_invoice" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "supplier_invoice_status_idx" ON "supplier_invoice" USING btree ("org_id","match_status");--> statement-breakpoint
CREATE INDEX "sil_invoice_idx" ON "supplier_invoice_line" USING btree ("supplier_invoice_id");--> statement-breakpoint
CREATE INDEX "temperature_reading_lot_idx" ON "temperature_reading" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "temperature_reading_org_idx" ON "temperature_reading" USING btree ("org_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_org_code_uq" ON "vendor" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "vendor_org_type_idx" ON "vendor" USING btree ("org_id","type");--> statement-breakpoint
CREATE INDEX "vendor_org_whatsapp_idx" ON "vendor" USING btree ("org_id","whatsapp_number");--> statement-breakpoint
CREATE INDEX "vendor_contact_vendor_idx" ON "vendor_contact" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_document_vendor_idx" ON "vendor_document" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_document_expiry_idx" ON "vendor_document" USING btree ("org_id","expires_at");--> statement-breakpoint
CREATE INDEX "vendor_licence_vendor_idx" ON "vendor_licence" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_licence_expiry_idx" ON "vendor_licence" USING btree ("org_id","valid_to");--> statement-breakpoint
CREATE UNIQUE INDEX "vsc_vendor_species_uq" ON "vendor_species_capability" USING btree ("vendor_id","species_id");--> statement-breakpoint
CREATE INDEX "vessel_vendor_idx" ON "vessel" USING btree ("vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_location_org_code_uq" ON "warehouse_location" USING btree ("org_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_event_provider_ext_uq" ON "webhook_event" USING btree ("provider","external_id");