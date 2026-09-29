# Product

## The problem

Singapore imports most of its seafood and trades it overnight. A merchant at Jurong Fishery Port (JFP) buys before final supply is known: boats are late, weights come in under declaration, species names differ by supplier and language, prices move within hours, and everything is negotiated on calls, WhatsApp texts, voice notes and photos. By 06:00 the fish must be allocated, picked, packed and on trucks to wet markets, hawkers, restaurants and hotels.

The job is not "inventory management". It is **deciding under uncertainty, fast, with an audit trail**.

## Who uses it

| Persona | What they need tonight | Where in PasarCatch |
|---|---|---|
| Fishmonger / buyer | What's arriving, at what price, am I overbuying, what can substitute | Tonight's Market, Buyer Requirements, Forecast |
| Fisherman / farm / supplier | Declare catch in seconds, get confirmation and instructions | `/supplier` (speak / type / photo), WhatsApp |
| Procurement manager | Supply vs demand, offers, approvals, allocations, supplier performance | Market, Recommendations, Approval Inbox, Allocations, Vendors |
| Operations / dispatcher | Arrivals, receiving, picking, routes, dispatch, temperature exceptions | `/receive`, Operations, Routes |
| Finance | PO ⇄ GRN ⇄ invoice, GST, AP/AR, InvoiceNow-ready data | Finance → Bills, Invoices, Reconciliation |
| Admin / compliance | Licences, documents, origin, recall | Vendors → Documentation, Traceability, Recall |

## Design principles

1. **WhatsApp is the input layer**, not something to replace. Suppliers keep messaging the way they do; the Catch Intake Agent does the structuring.
2. **The CatchLot is the core object.** Every kilogram enters as a lot (`LOT-JFP-YYYYMMDD-NNNN`) with origin, species, weights, grade, temperature, cost, status and genealogy.
3. **AI recommends, humans approve, the system executes.** Commercial, financial, compliance and outbound actions stop in the Approval Inbox by default.
4. **Explainable, not magical.** Forecasts are rolling averages with trend, wastage and standing orders; procurement scores are decomposed; vendor metrics are never collapsed into one opaque score.
5. **Built for 02:00 at the port.** Dark-first, large tap targets, numeric keypads, one-hand phone flows, offline tolerance, PWA.
6. **Honest integrations.** Mocks are labelled MOCK; there is no pretend SFA/TradeNet/IRAS connectivity.

## The core story (definition of done)

1. A supplier sends *"Tonight 65kg batang, around 600-800g, asking 8.80. Boat reach 1.30."*
2. The Catch Intake Agent creates a draft lot (Spanish mackerel, 65 kg, 600–800 g, S$8.80, ETA 01:30).
3. The procurement manager confirms & buys → it appears on Tonight's Market.
4. Demand still exceeds supply → the Procurement Agent flags the shortage.
5. A second supplier offers more; the agent scores offers and recommends a PO.
6. The manager approves → PO executed and audited.
7. The fish arrives; `/receive` records actual weight (e.g. 61.2 kg), temperature, grade.
8. The Allocation Agent distributes supply between buyers (policy-driven, FEFO).
9. Orders are picked & packed; the Logistics Agent produces delivery runs; trucks dispatch.
10. The supplier invoice arrives; the AP agent's three-way match flags billing on declared rather than received weight.
11. Searching the lot number shows the complete chain: supplier → receiving → processing → allocation → customer → delivery → invoice.

## MVP scope

**P0 (built):** authentication, multi-tenant organisations & RBAC, vendor management, species master & alias learning, catch intake (simulator + webhook), catch lots & genealogy, Tonight's Market, purchase orders, receiving, allocations, sales orders, picking/packing, route planning & dispatch board, supplier scorecards, three-way invoice matching, customer invoices & credit notes, AI command bar, agent activity, approval inbox, exceptions, traceability, recall, reports, integration settings, demo scenario.

**P1 (adapters ready, not live):** real WhatsApp credentials (webhook implemented), server-side voice-note transcription (browser speech input works today), OCR of invoices, OneMap routing (adapter implemented; needs credentials), accredited InvoiceNow Access Point, accounting connectors, ML forecasting.

**P2 (not started):** buyer marketplace, dynamic pricing, cross-border supplier portal, sustainability scoring, IoT temperature sensors (schema supports `IOT_FUTURE` readings), computer-vision grading.

## Business model readiness

`organization.plan` (`STARTER | GROWTH | PRO | ENTERPRISE`) and `organization.features` exist so billing can be added without schema changes. No subscription billing is implemented.

## The moat

Every night adds to the intelligence layer: which suppliers reliably deliver which species (per-species scorecards), true landed prices, size and quality distributions, buyer demand patterns, shortage and substitution behaviour, processing yields and waste, delivery performance. **Tenant isolation is mandatory** — one organisation's commercial data is never shown to another; every table carries `org_id` and every service query is tenant-scoped (integration-tested).
