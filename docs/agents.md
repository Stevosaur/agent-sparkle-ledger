# Agents

Twelve specialised agents — not one chatbot. Each run is an `agent_run`; each proposal an `agent_action` with **input, concise explanation, proposed action, confidence, affected records, approval requirement and execution status**. We store operational explanations only — never private chain-of-thought — and avoid persisting raw prompts.

## Safety architecture

| Risk class | Default | Examples |
|---|---|---|
| `READ_ONLY` | automatic | answer a query, trace a lot, compute a scorecard |
| `LOW_RISK_WRITE` | automatic (reversible, audited) | draft lot, map alias, forecast, propose allocation, plan routes, raise exception, record quote |
| `COMMERCIAL_COMMITMENT` | **approval** | create PO, confirm allocation, apply discount, accept quote, confirm substitution |
| `FINANCIAL` | **always approval** | approve invoice exception, approve payment, credit note |
| `EXTERNAL_COMMUNICATION` | approval unless templated automation enabled | supplier ack, RFQ, flash offer, buyer confirmation |
| `COMPLIANCE` | **always approval** | recall contacts, lot hold |

Policy lives in `src/lib/domain/risk.ts` (`requiresApproval`) and is unit-tested. Automation rules (`automation_rule`) can relax only `EXTERNAL_COMMUNICATION` (templated actions listed explicitly) and a value-capped `AUTO_PO_UNDER_LIMIT`; financial and compliance actions can never be automated (the settings action refuses). The demo org enables templated supplier acknowledgements only.

Approvals are **deduplicated** (`dedupe_key`) and **superseded** when a newer recommendation for the same species/night replaces them, so a manager never approves a stale plan. Commit paths re-validate under row locks anyway.

## The agents

| # | Agent | Trigger | Engine (MOCK mode) | LLM role (when `ANTHROPIC_API_KEY` set) | Output |
|---|---|---|---|---|---|
| 1 | **Catch Intake** | WhatsApp webhook, simulator, supplier app | `parseCatchMessage` — prices first (so 8.80 is never a time), ETA (am/pm, "reach 1.30", "3点到", "sampai 2.15"), sizes (g ranges, kg each), quantities (kg, kati), species n-grams, vendor by sender number/name, conditions ("if take all") | Structured output (JSON schema) extraction; result re-validated by the species matcher | Draft lots with per-field confidence and ambiguous fields; templated "Detected… Confirm?" reply |
| 2 | **Species Normalisation** | inside intake; human confirmation | Jaro-Winkler + exact/compact/CJK/token rules; generic names ("mackerel") return alternatives and need confirmation | — | Canonical match, confidence, alternatives; learns org aliases on confirmation |
| 3 | **Demand Forecast** | 00:10 schedule / user | Last 4 same-weekday avg (fallback weekday-factored 28-day), damped ±10 % 14-day trend, wastage trim, standing-order floor, 80 % interval | Rewrites the explanation in plain language using only the supplied numbers | Buyer × species lines + species roll-ups; overridable |
| 4 | **Procurement** | catch/quote/demand/ETA events, schedule, user | `balanceStatus` (±5 % or 3 kg) + `recommendPurchases`: weighted score of price, reliability (fill rate), quality (grade A share), freshness, ETA slack vs cut-off, relationship; estimated supply discounted by fill rate; MOQ | — | Shortage exceptions, PO proposals (approval) |
| 5 | **RFQ / Negotiation** | user | Parses supplier replies into quotes; flags prices above max | — | RFQ send (approval), quotes. Target/max prices never disclosed. Negotiation automation disabled by default. |
| 6 | **Allocation** | `LOT_RECEIVED`, user, command bar | `allocate()` — 6 policies in exact 10 g units, FEFO lot assignment, substitute suggestions from species substitutes | — | Allocation proposal (approval) |
| 7 | **Surplus Clearance** | 04:15 schedule / user | `assessSurplus` — at-risk kg vs open demand and minutes to cut-off; discount scales with urgency, clamped to `max(cost, list × (1 − max discount))` | — | Surplus alerts, discount + flash offer (approval) |
| 8 | **Logistics** | user (≈05:00) | Capacity-balanced sweep + time-window nearest neighbour; distances from RoutingProvider | — | Delivery runs with stop order, ETAs, load, distance |
| 9 | **Receiving & Quality** | `LOT_RECEIVED` | Variance vs declared, temperature vs threshold, lateness | — | Weight/temperature exceptions; feeds scorecards |
| 10 | **Vendor Performance** | on read | `computeVendorMetrics` / `metricsBySpecies` | — | 13 separate metrics per vendor and per species |
| 11 | **AP Reconciliation** | `INVOICE_RECEIVED` | `threeWayMatch` with tolerances (qty %, price %, S$), line arithmetic, GST check | — | MATCHED / MATCH_WITHIN_TOLERANCE / EXCEPTION (+ approval) |
| 12 | **Traceability & Recall** | user, command bar | Recursive CTE genealogy, allocations → orders → stops → invoices | — | Chain view, recall case, draft contacts (approval to send) |
| — | **AI Command Bar** | `⌘K` | Deterministic intent router over the same tools | Claude tool-use loop (auto tool choice) over DB tools | Answer + record links; tools used are listed |

## Command bar tools

`market_snapshot`, `species_position`, `cheapest_suppliers`, `price_trend`, `late_deliveries`, `surplus_risk`, `invoice_exceptions`, `trace_lot`, `allocate_species` (proposal only), `pending_approvals`, `search_records`. The system prompt forbids numbers not returned by tools and claims of execution not confirmed by a tool.

## Model configuration

`ANTHROPIC_MODEL` (default `claude-opus-5-5`). Calls use `output_config.effort: "low"` for extraction/explanations, JSON-schema structured outputs for extraction, and a bounded manual tool loop (6 turns). Refusals and API errors fall back to deterministic behaviour and are recorded on the run. Token usage is stored per run.
