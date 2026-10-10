# Plotline — Singapore property research

Every Singapore home sale turned into free, indexable pages, calculators and rankings: HDB block pages
built from ~1 million resale records since 1990, condo / landed / new-launch pages from URA data, a
comparable-sales valuation, affordability and mortgage tools, rankings, market insights, an AI assistant
grounded in the same data, and a Plus subscription that gates premium features.

Built from the product spec in [`docs/spec.md`](docs/spec.md). The brand lives in one place
([`src/lib/config/site.ts`](src/lib/config/site.ts)) — rename it there.

## Stack

- **Next.js 16** (App Router, ISR) · React 19 · Tailwind 4 · TypeScript · Recharts · Leaflet (OneMap tiles)
- **Data**: a precomputed JSON snapshot in [`data/`](data) built by the ingestion pipeline in
  [`scripts/ingest/`](scripts/ingest) and refreshed by GitHub Actions (twice weekly). Pages read it at
  render time; no database is needed for the public site.
- **Accounts & user data**: Supabase (auth, watchlist, tracked homes, leads, listings) — optional.
- **Payments**: Stripe Checkout + Billing Portal + webhooks — optional.
- **AI assistant**: Anthropic API with tools over the dataset — optional.

Every integration is optional. Without Supabase the site runs in **preview mode** (no sign-in; every
gated feature unlocked, with a banner). Add the keys and gating switches on automatically.

## Deploy to Vercel

1. **Import the repository**: <https://vercel.com/new> → *Import Git Repository* → `Stevosaur/agent-sparkle-ledger`.
   Framework preset: **Next.js** (auto-detected). No build settings to change.
2. **Production branch**: Vercel deploys `main` to production and every other branch / PR as a preview.
   Merge the Plotline PR into `main`, or set *Settings → Git → Production Branch* to the Plotline branch.
3. **Environment variables** (Settings → Environment Variables) — optional except the contact e-mail, see [`.env.example`](.env.example):

   | Feature | Variables |
   |---|---|
   | **Contact / PDPA (required for production)** | `NEXT_PUBLIC_CONTACT_EMAIL`: the published contact and Data Protection Officer address on /privacy/, /tos/, /about/, /methodology/, the profile page, the public API spec and lead-form fallbacks. When unset, those pages leave the address out (no placeholder is published), which does not meet the PDPA requirement to publish a DPO contact. |
   | Canonical URLs / sitemap | `NEXT_PUBLIC_SITE_URL` (e.g. `https://plotline.sg`) |
   | Accounts | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (then apply [`supabase/migrations`](supabase)) |
   | Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY` (webhook URL: `/api/stripe/webhook/`) |
   | AI assistant | `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`) |
   | Leads | `LEADS_WEBHOOK_URL` (or Supabase above) to receive form requests; `NEXT_PUBLIC_WHATSAPP_NUMBER` and `NEXT_PUBLIC_CONTACT_EMAIL` as direct-contact fallbacks. Without a lead store, forms show the fallbacks up front and do not submit. |
   | Alerts | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET` |

4. Redeploy after changing variables.

## Data pipeline

`npm run ingest` (or the **Ingest data** GitHub Action) downloads and validates:

| Source | Used for | Credentials |
|---|---|---|
| data.gov.sg — HDB resale prices 1990→today (5 datasets), HDB Property Information, HDB rentals, MOE schools, LTA MRT exits | HDB pages, rankings, insights, schools, MRT | none (optional `DATAGOV_API_KEY` raises rate limits) |
| OneMap search (SLA) | HDB block coordinates & postal codes, school locations | `ONEMAP_EMAIL` / `ONEMAP_PASSWORD` strongly recommended (tokenless search is heavily throttled) |
| URA Data Service | Condo, EC & landed transactions (5 years), rentals, developer sales, pipeline | **`URA_ACCESS_KEY`** — free at <https://eservice.ura.gov.sg/maps/api/> |
| MAS APIMG | SORA and compounded SORA | `MAS_API_KEY_ID` (otherwise a dated fallback is shown) |
| Licensed REALIS-style CSV (optional, local only) | unit-level history, landed address pages, profit/loss pairs, stacking plans | `REALIS_CSV_DIR` |

Add the credentials as **GitHub repository secrets** (Settings → Secrets and variables → Actions) with
the same names. The workflow commits the refreshed snapshot (`data/`) and geocode cache
(`ingest-cache/`) back to the branch, which triggers a Vercel redeploy.

Fail-safe: the run aborts without touching `data/` if HDB data fails validation; any optional source
that fails keeps the previous snapshot and is reported in `data/meta.json` (shown on `/methodology/`).

## Development

```bash
npm install
npm run ingest:fixtures                      # synthetic test snapshot in tests/fixtures/data
DATA_DIR=tests/fixtures/data npm run dev     # or just `npm run dev` once data/ exists
npm run check                                # typecheck + lint + unit tests
npm run test:e2e                             # Playwright smoke tests
```

Project conventions for contributors (and coding agents) are in [`CLAUDE.md`](CLAUDE.md). Research notes
behind every data source and rule are in [`docs/research/`](docs/research).

## Licences and attribution

Contains information from data.gov.sg datasets (HDB, MOE, LTA, URA) made available under the
[Singapore Open Data Licence v1.0](https://data.gov.sg/open-data-licence), OneMap (© Singapore Land
Authority) and the URA Data Service. Government agencies do not endorse this site. Figures are computed
from the source data and are indicative only — not financial advice.
