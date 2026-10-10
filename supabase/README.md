# Supabase setup

Accounts, watchlists, tracked homes, alerts, saved calculations, leads and owner listings live in Supabase.
Everything is optional: without the Supabase variables the site runs in preview mode (no sign-in, every
feature unlocked) and the account pages say that accounts aren't enabled.

## 1. Create the project and set the keys

Create a project at <https://supabase.com/dashboard>, then copy from *Project Settings → API Keys*:

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_...`), or the legacy `anon` key | public; RLS protects the data |
| `SUPABASE_SECRET_KEY` | Secret key (`sb_secret_...`), or the legacy `service_role` key | **server only**: Stripe webhook, Telegram linking, cron, leads |

Set them in Vercel (*Settings → Environment Variables*) and in `.env.local` for local development.
Once both public variables are set, gating switches to `enforce` automatically (override with
`GATING_MODE=open|enforce`).

## 2. Apply the migration

`migrations/0001_init.sql` creates every table with row level security. It is idempotent, so it is safe
to run again after edits.

**Dashboard:** *SQL Editor → New query*, paste the file, *Run*.

**CLI:**

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push            # applies supabase/migrations/*.sql
```

What it creates:

| Table | Who can read | Who can write |
|---|---|---|
| `profiles` | the user (own row) | trigger on sign-up; users may edit `display_name` only. Telegram columns: server key only |
| `subscriptions` | the user (own row) | server key only (Stripe checkout + webhook) |
| `watchlist`, `tracked_homes`, `saved_calculations`, `alerts` | the user (own rows) | the user (own rows) |
| `leads` | nobody but the server key | server key only |
| `home_listings` | anyone (`status = 'active'`), owners (all their own) | owners (own rows) |

A trigger (`on_auth_user_created`) creates the `profiles` row for every new user, and the migration
backfills profiles for users that already exist.

## 3. Auth URL configuration

*Authentication → URL Configuration*:

- **Site URL:** your production URL, e.g. `https://plotline.sg`
- **Redirect URLs** (add each):
  - `https://plotline.sg/auth/callback/`
  - `http://localhost:3000/auth/callback/` (local development)
  - `https://*-<your-vercel-team>.vercel.app/auth/callback/` (Vercel preview deployments, optional)

The trailing slash matters: the site uses `trailingSlash: true`, and the login form sends
`<origin>/auth/callback/?next=<path>` as the redirect. A redirect URL that is not allow-listed makes
Supabase fall back to the Site URL, and sign-in appears to do nothing.

**Email (magic link):** *Authentication → Sign In / Providers → Email* must be enabled. The default
"Magic Link" template works as is (`{{ .ConfirmationURL }}` returns to `/auth/callback/?code=...`).
If you customise the template to link straight to the site, use
`{{ .SiteURL }}/auth/callback/?token_hash={{ .TokenHash }}&type=email&next=/profile/`; the callback
handles both forms. Configure a custom SMTP server (*Authentication → Emails → SMTP Settings*) before
launch: Supabase's built-in sender is rate-limited and meant for testing.

Magic links use PKCE, so they must be opened in the same browser that requested them.

## 4. Optional: Google sign-in

1. In Google Cloud Console create an OAuth client (type *Web application*). Authorised redirect URI:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`.
2. In Supabase, *Authentication → Sign In / Providers → Google*: enable it and paste the client ID and secret.
3. Set `NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED=true` in Vercel to show the "Continue with Google" button.

## 5. Stripe (Plus subscriptions)

1. Create a product with two recurring prices in SGD (monthly and yearly). Set `STRIPE_PRICE_MONTHLY`,
   `STRIPE_PRICE_YEARLY` and `STRIPE_SECRET_KEY`. Keep `NEXT_PUBLIC_PLUS_MONTHLY_PRICE` /
   `NEXT_PUBLIC_PLUS_YEARLY_PRICE` / `NEXT_PUBLIC_PLUS_TRIAL_DAYS` in sync with them (they are what
   `/plus/` displays; the trial length is applied at checkout).
2. *Developers → Webhooks → Add endpoint*: `https://plotline.sg/api/stripe/webhook/` (**with** the trailing
   slash; Stripe does not follow redirects). Events: `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
   Put the signing secret in `STRIPE_WEBHOOK_SECRET`.
3. *Settings → Billing → Customer portal*: enable it, allow cancelling (at period end) and updating
   payment methods. `/profile/` opens it through `POST /api/stripe/portal/`.

The free trial is only offered to accounts that have never had a subscription or trial.

## 6. Telegram alerts (Plus)

1. Create a bot with [@BotFather](https://t.me/BotFather) (`/newbot`). Set `TELEGRAM_BOT_TOKEN` and
   `TELEGRAM_BOT_USERNAME` (without `@`).
2. Pick a random `TELEGRAM_WEBHOOK_SECRET` (letters, digits, `_` and `-`) and register the webhook:

   ```bash
   curl -sS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -d url="https://plotline.sg/api/telegram/webhook/" \
     -d secret_token="$TELEGRAM_WEBHOOK_SECRET" \
     -d allowed_updates='["message"]'
   ```

3. Set `CRON_SECRET` (any long random string). `vercel.json` runs `GET /api/cron/alerts/` daily at
   01:00 UTC (09:00 in Singapore), and Vercel sends `Authorization: Bearer $CRON_SECRET`. To run it by hand:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://plotline.sg/api/cron/alerts/`.

Users link Telegram from `/profile/` ("Link Telegram" opens `https://t.me/<bot>?start=<one-time code>`);
`/stop` in the chat unlinks it. An alert fires when the property's latest recorded month (HDB block,
condo, landed address or street) or a launch's latest sales report is newer than the month the alert
last saw. Alerts of users whose Plus has lapsed, or who haven't linked Telegram, wait without being
consumed. Email delivery is reserved in the schema but not implemented.

## Account API reference

| Method | Path | Gate | Purpose |
|---|---|---|---|
| GET / POST / DELETE | `/api/watchlist/` | signed in (`watchlist`) | `GET ?ref=` → `{watching}`; `GET` → `{items}`; `POST {ref,label}`; `DELETE {ref}` |
| GET / POST / PATCH / DELETE | `/api/tracked/` | signed in (`tracking.basic`); more than the free limit needs `tracking.unlimited` | tracked homes with estimated value series |
| GET / POST / PATCH / DELETE | `/api/alerts/` | `alerts` (Plus); DELETE: signed in | new-sale / new-launch alerts |
| GET / POST / DELETE | `/api/telegram/link/` | signed in | link status, one-time deep link, unlink |
| POST | `/api/telegram/webhook/` | `X-Telegram-Bot-Api-Secret-Token` | bot updates (`/start <code>`, `/stop`) |
| POST | `/api/stripe/checkout/` | signed in | `{interval: "month"|"year"}` → Checkout URL |
| POST | `/api/stripe/portal/` | signed in | Billing Portal URL |
| POST | `/api/stripe/webhook/` | Stripe signature | mirrors subscriptions |
| GET | `/api/cron/alerts/` | `Authorization: Bearer $CRON_SECRET` | daily alert delivery |

Every account API responds with `Cache-Control: private, no-store`, returns `503 {"error":"accounts_disabled"}`
when Supabase is not configured, `401 sign_in_required` when signed out and `402 plus_required` when the
feature needs Plus.
