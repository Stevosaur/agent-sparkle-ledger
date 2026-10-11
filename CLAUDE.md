# Plotline — engineering guide

Singapore property research site (spec: `docs/spec.md`). Next.js 16 App Router + React 19 + Tailwind 4 + TypeScript, deployed on Vercel.

## Next.js 16

This is newer than most training data. Before using an API you are unsure about, read the matching guide in
`node_modules/next/dist/docs/01-app/` (e.g. `02-guides/incremental-static-regeneration.md`, `01-getting-started/15-route-handlers.md`, `01-getting-started/16-proxy.md` — middleware is now `src/proxy.ts`).
- `params` and `searchParams` are Promises: `const { slug } = await params`.
- `cookies()` / `headers()` are async.
- `next lint` no longer exists: run `npx eslint <paths>`.

## Commands

- `npx tsc --noEmit` — typecheck (whole project; only fix errors in files you own)
- `npx eslint <your paths>` — lint
- `npx vitest run <your test files>` — unit tests (vitest sets DATA_DIR=tests/fixtures/data)
- `npm run ingest:fixtures` — regenerate the synthetic fixture snapshot
- `DATA_DIR=tests/fixtures/data npx next dev -p <port>` — dev server against fixtures (pick a unique port)
- Do NOT run `next build` while other agents are working in this tree; do not add npm dependencies.

## Layout

- `src/lib/data/` — server-only data layer over the JSON snapshot in `data/` (contract: `types.ts`). Import from `@/lib/data/...` only in server components, route handlers and server utilities — never in `"use client"` files (client code may import `@/lib/data/types` and `@/lib/data/months` only).
- `scripts/ingest/` — pipeline that produces the snapshot (`build.ts` is the single writer). `scripts/fixtures/generate.ts` — synthetic fixtures through the same builder.
- `src/lib/calc/` — pure calculators (stamp duty, loans, affordability, lease, valuation, returns, supply/demand, sun path, walk-away price, en-bloc). Rules live in `rules.ts` with sources.
- `src/lib/auth/` — env-driven integrations (`config.ts`), feature gating (`entitlements.ts`), `getViewer()`, `requireFeature()` / `requireUser()` for route handlers, client `useViewer()` / `useFeature()`.
- `src/lib/i18n/` — EN/中文. Use `<T k="ns.key" fallback="English" />` (client component, fine inside server components) or `useT()` in client components. Add keys ONLY to your feature's namespace file in `src/lib/i18n/messages/<ns>.ts`, both `en` and `zh`.
- `src/components/ui/` — Button/ButtonLink, Card/CardHeader/CardBody, Badge, Input/Select/Textarea/Field, Stat/StatGrid, Section/PageContainer/PageHeader, Notice/EmptyState, DataTable, Tabs, Breadcrumbs (emits JSON-LD), JsonLd.
- `src/components/charts/` — `TimeSeriesChart` (month-index x axis, line + scatter series), `SimpleBarChart`. Props are serializable (`yFormat: "sgd" | "sgdCompact" | "psf" | "pct" | "pctRaw" | "int" | "rent"`).
- `src/components/property/whats-next.tsx` — the "What's next" row every property page ends with.
- `src/components/gating/` — `GatedPanel`, `PlusBadge`, `useGatedJson`.
- `src/components/search/search-box.tsx` — search combobox (`onSelect` to use as a picker).
- Shared components implemented by specific work packages: `components/ai/ask-panel.tsx` (AskPanel), `components/map/mini-map.tsx` (MiniMap), `components/leads/lead-form.tsx` (LeadForm). Keep their exported prop types stable.
- `src/lib/format.ts` (formatSgd, formatSgdCompact, formatPsf, formatPct, formatMonth, formatLeaseMonths, formatDistance, formatArea, sqmToSqft), `src/lib/slug.ts` (slug rules + `titleCase`), `src/lib/seo.ts` (`pageMetadata`), `src/lib/property-ref.ts` (`PropertyRef`, `propertyHref`, `parsePropertyRef`), `src/lib/data/resolve.ts` (`resolveProperty`, `resolveSlug`), `src/lib/stats-math.ts`, `src/lib/geo-math.ts`, `src/lib/config/site.ts` (brand — never hard-code the product name; use `site.name` / `site.plusName`).

## Conventions

- `trailingSlash: true`: every internal href and fetch URL ends in `/` before any query string (`/api/search/?q=x`, `/hdb/blk-1-x/`).
- Property pages (and other data pages) are ISR: `export const revalidate = 86400;` plus `generateStaticParams` returning a small set (or `[]`) so the rest render on demand; call `notFound()` for unknown slugs. Don't read cookies/headers in these pages.
- Every page exports metadata via `pageMetadata({ title, description, path })` (or `generateMetadata`) and renders `Breadcrumbs` where it sits below the home page.
- Gating: free content renders on the server. Gated content is a client component inside `<GatedPanel feature="...">` that fetches from a route handler guarded by `requireFeature("...")` (`src/app/api/gated/...`). Never pass gated data from a server component into a client component.
- Never invent data. When a dataset is missing (e.g. no URA key, no unit-level data), render an honest empty state that says what source is needed. Label estimates as estimates and show methodology/source lines.
- Money: `formatSgd`; areas: sqm with sqft; dates: `formatMonth`. Use `titleCase()` for upper-case government names.
- Accessibility: semantic headings (one h1 per page), labelled form fields, `aria-label` on icon-only buttons, charts get `ariaLabel`.
- Mobile first: pages must work at 360px width; the bottom tab bar covers the last 64px on mobile (layout already pads the footer).
