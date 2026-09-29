# Deployment

PasarCatch is a standard Next.js 16 Node application with PostgreSQL. Any container platform works (Fly.io, Render, Railway, AWS ECS/App Runner, GCP Cloud Run + Cloud SQL, Azure Container Apps). For Singapore data residency, choose an `ap-southeast-1` / `asia-southeast1` region for both app and database.

## Environment

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres 14+; use TLS (`?sslmode=require`) in production |
| `BETTER_AUTH_SECRET` | yes | ≥32 random bytes (`openssl rand -base64 32`); rotate by invalidating sessions |
| `BETTER_AUTH_URL`, `APP_URL` | yes | Public HTTPS origin |
| `JOBS_SECRET` | yes | Bearer token for `POST /api/jobs` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | optional | Enables LLM extraction/explanations/command bar; default model `claude-opus-5-5` |
| `WHATSAPP_*` | optional | See [integrations.md](integrations.md); set `organization.features.whatsappPhoneNumberId` for routing |
| `ONEMAP_EMAIL`, `ONEMAP_PASSWORD` | optional | OneMap routing |
| `WEATHER_ENABLED`, `DATAGOV_API_KEY` | optional | Weather context |
| `STORAGE_DIR` | optional | Local disk path; replace `LocalDiskStorage` with an object-storage adapter for multi-instance deployments |
| `DB_POOL_MAX`, `LOG_LEVEL` | optional | Tuning |

Store secrets in the platform's secret manager, never in the image or client bundle (nothing in `src/app` reads secrets on the client).

## Build & release

```bash
npm ci
npm run typecheck && npm run lint && npm test
npm run build
npm run db:migrate          # run once per release, before switching traffic
npm start                   # PORT 3000
```

Do **not** run `db:seed`/`db:reset` in production (reset refuses when `NODE_ENV=production`). Create the first organisation and owner through a one-off admin script or SQL, or adapt `src/lib/demo/seed.ts` reference-data steps.

## Background processing

Domain events are processed inline after user actions and webhooks, but schedule a drain as a safety net:

```bash
curl -X POST -H "Authorization: Bearer $JOBS_SECRET" https://<host>/api/jobs   # every minute
```

Scheduled agents (forecast ~00:10, procurement sweep, surplus ~04:15) can be triggered by the same scheduler calling small authenticated endpoints or via `tsx` scripts; the outbox is designed to be replaced by Temporal/Inngest/SQS as volume grows.

## Operations checklist

- Postgres backups with point-in-time recovery; test restores. Invoices and audit events must be retained ≥5 years (GST).
- Health check: `GET /api/health`.
- Logs are structured JSON with PII redaction; ship to your log platform.
- Rate limiting is in-process — put a shared limiter (Redis) or edge WAF in front when running multiple instances.
- Put the app behind HTTPS only; cookies are `secure` in production.
- WhatsApp webhook must be publicly reachable over HTTPS; verify token + app secret configured.
- PWA: `/sw.js` caches static assets and an offline page; the receiving screen keeps an offline queue in local storage.

## Scaling notes

Market and dashboard queries aggregate per night and species in SQL and are indexed on `(org_id, market_date)`. For large tenants consider materialised views for price history and scorecards, read replicas for reports, and moving the outbox to a queue.
