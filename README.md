# PasarCatch AI

**The AI supply operating system for Singapore's seafood trade.**

PasarCatch digitises the part of the seafood chain between *supply becoming available* and *product arriving at the buyer*: catch declarations over WhatsApp, supply-vs-demand for tonight, purchasing with human approval, receiving, allocation of uncertain catch, picking, routing, dispatch, three-way invoice matching — and lot-level traceability from vessel to invoice.

> The AI is not the product because it can chat. It is valuable because it turns messy, fast-changing market information into **structured data → decisions → approved actions → execution → traceability**.

---

## Quick start (local, no paid SaaS needed)

Requirements: Node 20+ (22 recommended), PostgreSQL 14+ (16 tested).

```bash
cp .env.example .env              # set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm install
npm run db:reset                  # drop schema → migrate → seed DEMO data (~15 s)
npm run dev                       # http://localhost:3000
```

No Postgres installed? `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pasarcatch postgres:16`.

### Demo accounts (password `pasarcatch-demo`)

| Email | Role | Use it for |
|---|---|---|
| `procurement@demo.pasarcatch.sg` | Procurement manager (Lim Wei) | Tonight's Market, intake, approvals, allocation |
| `ops@demo.pasarcatch.sg` | Operations (Nur Aisyah) | `/receive` on a phone, picking, routes, dispatch |
| `finance@demo.pasarcatch.sg` | Finance (Priya Raman) | Bills, three-way matching, invoices, InvoiceNow (mock) |
| `owner@demo.pasarcatch.sg` | Owner | Everything, incl. settings, demo clock, 2nd tenant |
| `compliance@demo.pasarcatch.sg` | Admin / compliance | Vendor documents, recall |
| `supplier@demo.pasarcatch.sg` | Supplier (Ah Seng) | The `/supplier` phone app |
| `buyer@demo.pasarcatch.sg` | Buyer (fishmonger) | Own orders |

Everything in the demo workspace is **fictional** and labelled **DEMO DATA**. The demo workspace runs on a labelled **demo clock** starting at 01:10 on tonight's market night so the seeded story and your live actions share one timeline. See [`docs/demo.md`](docs/demo.md) for the 15-step walkthrough of the definition-of-done story.

---

## What's inside

| Area | Highlights |
|---|---|
| **Tonight's Market** | Per-species expected / landed / demand / allocated / available, weighted cost, indicative sell, `SHORT 28 KG` · `BALANCED` · `SURPLUS 41 KG` · `LATE SUPPLY` · `PRICE SPIKE`; species drill-down with lots, buyers, quotes, allocations, 7/30/90-day price history and AI recommendation |
| **Catch intake** | WhatsApp simulator + Cloud API webhook → Catch Intake Agent → draft lots with per-field confidence; only ambiguous fields flagged; species normalisation learns org-specific aliases |
| **Agents (12)** | Catch intake, species normalisation, demand forecast, procurement, RFQ, allocation, surplus clearance, logistics, receiving & quality, vendor performance, AP reconciliation, traceability & recall — every run and action recorded, risk-classified, approval-gated |
| **Approval Inbox** | *AI recommends → human approves → system executes*: approve / modify / reject |
| **Receiving** | Phone-first `/receive`: QR scan or search, weight, temperature, grade, photo, accept/reject — offline queue |
| **Allocation** | Pro-rata, priority, first-confirmed, minimum-guaranteed, margin-max, manual rank; FEFO lot assignment; substitutes suggested, buyer-confirmed |
| **Logistics** | Capacity + time-window route planning, route board, dispatch, proof of delivery |
| **Finance** | Configurable GST, supplier bills with duplicate protection, three-way matching with tolerances, customer invoices, credit notes, InvoiceNow-ready (mock provider) |
| **Traceability** | Lot genealogy (parent → child processing), full chain view, recall mode with draft contact list (never auto-sent) |
| **AI command bar** | `⌘K` — answers only from database-backed tools, always with links to records |

## Tech

Next.js 16 (App Router, React 19, Server Actions) · TypeScript · Tailwind CSS v4 · PostgreSQL + Drizzle ORM · Better Auth · Anthropic API (Claude, structured outputs + tool use) · Vitest · Playwright.

Without `ANTHROPIC_API_KEY` the platform runs honestly in **MOCK mode**: every agent uses its transparent deterministic engine (parser, matcher, forecaster, optimiser) and says so in the UI.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run db:reset` | Drop schema, migrate, seed demo data |
| `npm run db:generate` / `db:migrate` | Drizzle migrations |
| `npm run typecheck` · `npm run lint` | Static checks |
| `npm test` | Unit + integration tests (integration uses `pasarcatch_test` DB) |
| `npm run test:e2e` | Playwright end-to-end (definition-of-done story) |
| `npm run jobs:run` | Drain the domain-event outbox (cron alternative: `POST /api/jobs`) |

## Documentation

- [Product](docs/product.md) · [Architecture](docs/architecture.md) · [Data model](docs/data-model.md) · [Agents](docs/agents.md)
- [Integrations](docs/integrations.md) · [Singapore compliance](docs/singapore-compliance.md) · [Research notes](docs/research-notes.md)
- [Demo script](docs/demo.md) · [Deployment](docs/deployment.md)
