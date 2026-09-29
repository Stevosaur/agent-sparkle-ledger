# Architecture

```
            ┌───────────── Browser (desktop · phone PWA) ─────────────┐
            │ Server Components (read)   Client islands (interaction) │
            └──────────────┬───────────────────────┬──────────────────┘
                           │ Server Actions (zod,  │ Route handlers
                           │ RBAC, CSRF-checked)   │ /api/webhooks/whatsapp, /api/upload,
                           ▼                       ▼ /api/files, /api/jobs, /api/health
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ src/lib/services   transactional domain services (tenant-scoped, audited)│
 │ src/lib/agents     12 agents + runtime (AgentRun / AgentAction / Approval)│
 │ src/lib/domain     pure engines: parser, matcher, allocation, forecast,  │
 │                    procurement scoring, matching, metrics, routing, risk  │
 │ src/lib/events     transactional outbox + dispatcher (SKIP LOCKED)        │
 │ src/lib/integrations  AI · Messaging · Routing · Weather · InvoiceNow ·   │
 │                    GovernmentPermit · Accounting · Payment · Storage      │
 └───────────────┬──────────────────────────────────────────────────────────┘
                 ▼
          PostgreSQL (Drizzle ORM, numeric money/weights, timestamptz UTC)
```

## Layers

| Layer | Rule |
|---|---|
| `src/lib/domain` | Pure TypeScript, no I/O. Exhaustively unit-tested. Money via `decimal.js`; allocation in integer 10 g units. |
| `src/lib/services` | All writes. Every function takes a `Ctx` (`orgId`, actor human/agent/system, source, clock) and filters by `org_id`. Critical operations run in one transaction with `SELECT … FOR UPDATE` row locks. |
| `src/lib/agents` | Orchestrate services and engines; the **only** place the AI provider is called (via `getAI()`). No model calls in React components. |
| `src/lib/integrations` | Interfaces + mock/real implementations chosen by environment. |
| `src/app` | Server Components read via services/queries; Server Actions (`src/app/actions`) validate with zod, check RBAC via `requireActionCtx(permission)`, call services, drain events. |

## Transactions & invariants

| Operation | Guarantees |
|---|---|
| `receiveLot` | lot row lock; can't receive twice; rejected ≤ received; GRN + GRN line + inspection + temperature + ledger + PO line + lot in one transaction |
| `commitAllocation` | locks lots and order lines in id order (deadlock-safe); refuses if any lot's available < requested (`OVER_ALLOCATION`) or line would exceed open quantity; ledger entries; order statuses |
| `transformLot` | outputs + waste ≤ available (`NEGATIVE_INVENTORY`); child lots with `parent_lot_id`/`root_lot_id`; balanced movements |
| `createPurchaseOrder` | lot row lock; a lot can be purchased once (`DOUBLE_PURCHASE`); every PO line is tied to a traceable lot (created on the fly for quote/manual lines) |
| `dispatchShipment` | allocated kg leave inventory; lots close when empty; never negative |
| `recordSupplierInvoice` | unique `(org, vendor, invoice_number)` — duplicate imports rejected |
| WhatsApp webhook | HMAC signature check, unique `(provider, external_id)` idempotency key |

## Events

Services write domain events to the `domain_event` outbox **in the same transaction** as the state change. `processPending()` claims events with `FOR UPDATE SKIP LOCKED`, runs handlers, retries with exponential backoff (5 attempts), then marks `FAILED`. Handlers (`src/lib/events/handlers.ts`) wire agents to events:

| Event | Reaction |
|---|---|
| `CATCH_DECLARED`, `QUOTE_RECEIVED`, `DEMAND_UPDATED` | Procurement Agent re-evaluates the species (debounced) |
| `VESSEL_ETA_UPDATED` | Late-vessel exception (per vessel/night) + procurement re-check |
| `LOT_RECEIVED` | Receiving & Quality Agent (variance/temperature) → Allocation Agent proposal |
| `INVOICE_RECEIVED` | AP Reconciliation Agent (three-way match) |
| `SHIPMENT_DISPATCHED` | Buyer notifications |

Server actions drain events inline (bounded) so the next render already shows agent output; `POST /api/jobs` (bearer `JOBS_SECRET`) or `npm run jobs:run` drains in production cron. The outbox can be replaced by Temporal/Inngest/SQS without touching services.

## Time

UTC in the database; Asia/Singapore (UTC+8, no DST) in the UI. A **market night** is keyed by the SGT date on which trading starts; clock times before noon belong to the following morning (`atMarketTime`). After 07:00 SGT the "current" market night is the coming one. DEMO workspaces run on a labelled demo clock (`settings.demoClockOffsetMs`), which only moves forward.

## Security

- **Auth**: Better Auth (email/password, scrypt hashing, httpOnly session cookies, built-in origin checks and auth rate limiting). `src/proxy.ts` bounces unauthenticated requests; real checks happen server-side in every page/action.
- **Tenancy**: `org_id` on every tenant table; active org from an httpOnly cookie validated against membership; integration tests assert isolation.
- **RBAC**: least-privilege roles (`src/lib/auth/rbac.ts`); approvals additionally check risk class (FINANCIAL needs `finance.approve`, COMPLIANCE needs `recall.manage`).
- **Input**: zod on every action; parameterised SQL only (drizzle `sql` template); uploads allow-listed by magic bytes, size-capped, random keys, served only to the owning org.
- **Webhooks**: `X-Hub-Signature-256` HMAC with timing-safe compare; idempotency keys; rate limiting.
- **Secrets**: environment only, never sent to the client, never logged. Structured JSON logs redact phone/email/body/token-like keys.
- **Headers**: `nosniff`, `X-Frame-Options: DENY`, strict referrer policy, restricted permissions policy.
- **PDPA**: no NRIC/passport fields exist; contact data is business contact information; see `docs/singapore-compliance.md`.

## Performance

Server-rendered operational screens with SQL aggregation (market view is one query), indexes on `(org_id, market_date)`, `(org_id, status)`, species/vendor keys and audit lookups (`GIN` on `related_ids`). Client bundles are islands only (charts, command bar, forms). Live screens refresh via `router.refresh()` while visible.

## Observability

`agent_run` (agent, trigger, provider/model, status, tool-call summary, output, approval status, latency, tokens, error) and `agent_action` (risk class, explanation, proposal, confidence, affected records, execution status). No raw prompts or chain-of-thought are stored. `audit_event` records every change with actor type, source and before/after.
