# Singapore compliance

This page states what PasarCatch does, what it assumes, and what it does **not** do. It relies on [research-notes.md](research-notes.md) (sources accessed 2026-09-29). **Important caveat:** those notes were compiled from search excerpts of official pages because the research environment could not open the pages directly — re-confirm any exact date, field or endpoint against the cited source before relying on it. PasarCatch is operational software, not legal advice.

Labels: **VERIFIED FACT** (official source, see research notes) · **PRODUCT ASSUMPTION** (our design choice) · **FUTURE INTEGRATION** (not built / not connected).

## Licensing & documents (SFA)

| Topic | Status | What PasarCatch does |
|---|---|---|
| Importers need SFA's *Licence for Import/Export/Transhipment of Meat and Fish Products*, and an SFA-approved **Cargo Clearance Permit (CCP)** per consignment | VERIFIED FACT | `vendor_licence` / `vendor_document` records with number, issuer, validity, expiry status; per-lot `compliance.ccpRef` and `catch_lot_document` references. Entered manually, marked `MANUAL`. |
| Health certificates required for **high-risk** fish products (e.g. frozen oysters); low-risk non-CITES fish may be imported without one; imports subject to inspection/sampling | VERIFIED FACT | Health-certificate references per vendor document and per lot. PasarCatch does not decide which products need one. |
| Fishing vessels (and gear) at Singapore ports need an SFA licence; fish farms hold a Fish Culture Farm Licence | VERIFIED FACT | Vessel/farm registry with licence numbers; expiry tracked on Vendors → Documentation. |
| Cold stores for meat and seafood must be SFA-licensed (licence to operate a coldstore, 1-year validity) | VERIFIED FACT | `warehouse_location.cold_store_licence_no`. |
| JFP operates 24h except Monday 02:00–06:00 | VERIFIED FACT | PRODUCT ASSUMPTION: the dispatch cut-off and market night are configurable; no port schedule is enforced. |
| Food Recall Plan required for importers at licence renewal (every 2 years) | VERIFIED FACT | Recall mode produces the traceability evidence (affected lots, quantities, customers, contacts) that a recall plan relies on. It does not file anything with SFA. |
| FSSA 2025 policy intent: records for "one step back, one step forward"; details in subsidiary legislation, in force by tranches | VERIFIED FACT (policy); UNVERIFIED (current in-force status of traceability provisions) | Lot genealogy + receipts + allocations + deliveries implement one-step-back/one-step-forward records per lot. PRODUCT ASSUMPTION: this meets the intent; verify against the subsidiary legislation when published. |
| Direct API to SFA / GoBusiness | Not available | **FUTURE INTEGRATION** — none exists in PasarCatch. No government status is ever shown as "verified". |

## Import permits (TradeNet / Customs)

- **VERIFIED FACT:** all permits go through TradeNet, via a declaring agent, approved front-end software or the Government Front-End Application; there is **no open public API** — solution providers apply to Singapore Customs for message specifications.
- **What we do:** store CCP / TradeNet permit reference numbers (format check only via `GovernmentPermitProvider`, clearly labelled MANUAL). **FUTURE INTEGRATION:** a declaring-agent or approved front-end partnership.

## GST & invoicing (IRAS)

| Topic | Status | Implementation |
|---|---|---|
| GST rate 9% from 1 Jan 2024 | VERIFIED FACT | `organization.gst_rate_pct` (default 9.00), configurable; snapshot stored on each invoice. |
| Registration threshold S$1m taxable turnover | VERIFIED FACT | `organization.gst_registered` and `vendor.gst_registered` flags drive whether GST is charged / expected. |
| Tax invoice within 30 days; credit notes reference the original invoice number & date; keep records 5 years | VERIFIED FACT | Customer invoices issued on delivery; credit notes store `credit_note_for_id` and show the original number/date; nothing is hard-deleted (retention policy is a deployment responsibility). |
| Rounding | PRODUCT ASSUMPTION | Line totals and GST rounded half-up to cents with exact decimal arithmetic. |

## InvoiceNow (Peppol)

- **VERIFIED FACT:** InvoiceNow is Singapore's Peppol-based network (IMDA is the Peppol Authority); businesses transmit through an **IMDA-accredited Access Point** / InvoiceNow-Ready Solution; the format is **PINT-SG**; Singapore Peppol IDs use scheme **0195** with the UEN. The IRAS **GST InvoiceNow Requirement** applies to new voluntary GST registrants (phased from Nov 2025 / Apr 2026) and was announced to extend to all GST-registered businesses between Apr 2028 and Apr 2031 (phase thresholds to be confirmed on the IRAS page).
- **What we do:** InvoiceNow-ready data model and a **MockInvoiceNowProvider** that builds a PINT-SG-shaped payload for review and marks invoices `MOCK_TRANSMITTED`. **Nothing is transmitted to IRAS or the Peppol network.** See [integrations.md](integrations.md) for replacing it with an accredited Access Point.

## PDPA

| Obligation | How PasarCatch addresses it |
|---|---|
| Collect only what's needed (NRIC Advisory Guidelines: NRIC only if required by law or for high-accuracy identity verification — VERIFIED FACT) | The schema has **no NRIC/passport fields**. Supplier/buyer contacts are business contact information (VERIFIED FACT: excluded from the Data Protection Provisions). |
| Protection | Tenant isolation, RBAC/least privilege, server-side validation, secrets in env only, httpOnly sessions, upload restrictions, security headers, rate limiting. |
| Retention limitation | PRODUCT ASSUMPTION: operators configure retention; audit and invoice records are needed ≥5 years for GST. |
| Breach notification (data intermediary must notify the customer organisation without undue delay; organisation assesses within 30 days, notifies PDPC within 3 days if notifiable — VERIFIED FACT) | Operational runbook item for the deploying organisation; structured logs with PII redaction support investigation. |
| Logging | JSON logs redact phone, email, message bodies, tokens and credentials. Agent runs store references and summaries, not raw prompts. |

## What PasarCatch never claims

- That any licence, permit or certificate is valid according to a government system.
- That an invoice has been submitted to IRAS or delivered over Peppol (until a real Access Point is connected).
- That the species taxonomy is legally authoritative (it is an operational mapping; admins can correct it).
- That customers have been notified in a recall unless an approved message was actually sent.
