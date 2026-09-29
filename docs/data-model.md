# Data model

Source of truth: [`src/lib/db/schema.ts`](../src/lib/db/schema.ts) (Drizzle), migrations in [`drizzle/`](../drizzle).

## Conventions

- Every tenant table has `org_id → organization.id` (cascade) and is always filtered by it.
- Weights `numeric(12,3)` kg · unit prices `numeric(12,4)` · money `numeric(14,2)`. **No floats for money** — arithmetic uses `decimal.js` (`src/lib/domain/decimal.ts`), GST rounds half-up to cents.
- `timestamptz` in UTC; `market_date` (`date`) identifies the trading night.
- Document numbers come from `sequence_counter` (atomic upsert per org/key): `LOT-JFP-20260929-0048`, `PO-00042`, `GRN-00017`, `SO-00123`, `INV-00088`, `CN-00003`, `RUN-0007`, `RFQ-0002`, `RC-0001`.

## Entities by area

| Area | Tables |
|---|---|
| Tenancy & access | `organization` (plan, features, GST config, settings), `role`, `membership` (role, optional vendor/customer link), `user`/`session`/`account`/`verification` (Better Auth), `sequence_counter`, `automation_rule` |
| Vendors | `vendor` (type: FISHING_VESSEL · AQUACULTURE_FARM · FOREIGN_FISHERY · IMPORTER · WHOLESALER · PROCESSOR · LOGISTICS_PROVIDER), `vendor_contact`, `vendor_document`, `vendor_licence`, `vendor_species_capability`, `vessel`, `farm` |
| Species | `species` (canonical, Chinese, Malay, local names, scientific, category, size range, yield, storage, freshness, substitutes, markup), `species_alias` (normalised unique per org; source SEED/LEARNED/ADMIN; use count) |
| Customers | `customer` (type, priority tier, geo, delivery window, credit terms, Peppol ID), `warehouse_location` |
| Messaging | `message` (channel, direction, vendor/customer, body, transcription, status, agent run), `message_attachment` |
| **Catch lots** | `catch_lot` (see below), `catch_lot_photo`, `catch_lot_document`, `lot_transformation` |
| RFQ & quotes | `rfq` (target/max price kept internal), `quote`, `quote_line` |
| Demand | `standing_order`, `demand_forecast`, `demand_forecast_line` (components, explanation, override + who/why) |
| Purchasing | `purchase_order`, `purchase_order_line` (always → lot), `goods_receipt`, `goods_receipt_line` (declared/received/accepted/rejected, reason, temp, grade, lateness) |
| Sales & allocation | `sales_order`, `sales_order_line` (requested/allocated/picked/delivered, substitution link), `allocation` (lot ⇄ order line, policy, agent run), `inventory_movement` (signed ledger with available-after) |
| Fulfilment | `pick_list`, `pick_list_line`, `shipment`, `shipment_stop` (windows, planned/actual, POD), `shipment_order`, `driver`, `vehicle` |
| Quality | `temperature_reading` (MANUAL/PROBE/IOT_FUTURE, exception flag), `quality_inspection` |
| Finance | `supplier_invoice` (+`match_status`, `match_result`, payment status, unique per vendor+number), `supplier_invoice_line`, `customer_invoice` (INVOICE/CREDIT_NOTE, GST rate snapshot, Peppol status), `customer_invoice_line` (lot reference), `payment` |
| AI & control | `agent_run`, `agent_action`, `approval` (risk class, payload, decision, modifications, dedupe key), `ops_exception` (deduped), `audit_event` (actor type, source, before/after, related ids), `domain_event` (outbox) |
| Recall | `recall_case`, `recall_affected_lot`, `recall_affected_customer` (DRAFT → APPROVED → CONTACTED) |
| Integrations | `integration_connection` (non-secret config), `webhook_event` (unique provider+external id), `notification` |

## CatchLot

```
identity      id, lot_number (unique per org), market_date, confirmation (DRAFT|CONFIRMED)
origin        vendor_id, vessel_id, farm_id, source_country, source_location, landing_location,
              catch_date, harvest_date, catch_method, farm_method, compliance{ccpRef, healthCertRef, …, mode: MANUAL}
timing        original_eta, expected_arrival_at, landing_time, received_time
species       species_id, supplier_species_name, canonical_species_name, local_name, scientific_name
quantities    quantity_declared_kg, quantity_received_kg, quantity_rejected_kg,
              quantity_available_kg, quantity_allocated_kg, piece_count, average_weight_kg
size/quality  size_min_kg, size_max_kg, size_grade, quality_grade (A|B|C|REJECT), temperature_at_receiving_c,
              processing_state (WHOLE|GUTTED|CLEANED|FILLETED|PORTIONED|LIVE|FROZEN), fresh_or_frozen
commercial    asking_price_per_kg, agreed_cost_per_kg, currency, purchase_order_line_id
AI intake     intake_message_id, intake_confidence, field_confidence{species,quantity,size,price,eta}, ambiguous_fields[]
status        EXPECTED → LANDED → (RECEIVED/INSPECTED) → AVAILABLE → PARTIALLY_ALLOCATED → ALLOCATED → DISPATCHED → CLOSED | REJECTED
genealogy     parent_lot_id, root_lot_id (+ lot_transformation rows incl. WASTE)
```

Invariant: `available + allocated + dispatched + transformed-out + waste + rejected = received` — maintained by services and recorded in `inventory_movement`.

### Genealogy example

`LOT-…-0003` (100 kg batang) → `-A` 40 kg whole, `-B` 30 kg cleaned, `-C` 20 kg fillets, 10 kg waste. Each child has `parent_lot_id = 0003`, `root_lot_id = 0003`; recall of 0003 finds every child and every customer who received any of them.

## Key indexes

`catch_lot(org_id, market_date)`, `(org_id, status)`, `(org_id, species_id, market_date)`, `(org_id, vendor_id)`, `parent_lot_id`, `root_lot_id` · `sales_order(org_id, market_date)` · `purchase_order(org_id, market_date)` · `allocation(lot_id)`, `(sales_order_line_id)` · `audit_event(org_id, entity_type, entity_id, at)` + GIN `related_ids` · `domain_event(status, available_at)` · `approval(org_id, status, requested_at)` · unique dedupe keys on approvals, exceptions, invoices, webhook events.

## Moat data (per organisation)

Receiving records (declared vs received, grade, temp, lateness) → per-vendor **and per-species** scorecards; PO/SO lines → price history; forecasts + actuals → accuracy; transformations → yields and waste; stops → delivery performance; substitutions → substitution behaviour. Never shared across tenants.
