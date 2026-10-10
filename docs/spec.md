# haio.sg — Site Teardown & Build Spec

Oct 11, 2026 · @Steven

## Executive summary

haio.sg is a Singapore property research "super-app" that turns 1,672,107 government-recorded home sales into free SEO pages, calculators and rankings, then upsells a S$49/month or S$499/year tier called haio+ ([valuation page](https://haio.sg/valuation/), [haio+](https://haio.sg/haio-plus/)). It is a Next.js site behind Cloudflare, with Supabase for login, database and file storage ([privacy policy](https://haio.sg/privacy/)).

It serves HDB upgraders, condo buyers and investors, landed buyers, and owners tracking their home's value. Every page answers a buyer's question: what is it worth, what did it sell for, can I afford it, will it grow, and who will buy it from me later.

Revenue comes from four places: haio+ subscriptions through Stripe, mortgage leads passed to Cashew, home-service bookings through Nimbus Homes, and WhatsApp or email enquiries on new launches and listings.

**What drives it, in one line each**

- **Transactions:** URA private-property caveats, HDB resale records and REALIS unit-level records: 610,135 condo, 983,016 HDB and 78,956 landed sales.
- **Geography:** OneMap for geocoding and school boundaries, LTA for MRT, bus and transit schedules, OpenStreetMap, and the URA Master Plan via data.gov.sg.
- **Rates and rules:** MAS SORA, the HDB loan rate, Cashew's bank packages, IRAS stamp duties, MAS loan limits and Bala's Table for lease decay.
- **Curated data:** developer price lists and brochures, Government Land Sales tenders, en-bloc history, BCA CONQUAS bands, MOE ballot data and listings.
- **Derived models:** a comparable-sales valuation, same-unit repeat-sale returns, MOP-based demand vs supply, en-bloc tiers, rental yields and a unit-price model for new launches.

The hardest part to copy is the private-property history. The free URA API returns only the last five years and no unit numbers, so haio's exact-unit records back to 1995 point to a REALIS licence or an equivalent paid source.

**Build brief for the agent.** Build a Next.js (App Router) + Postgres/PostGIS app that ingests the sources in *Data sources* on a schedule and resolves every sale to a canonical project, block and unit. Precompute the metrics in *Data model and calculations*, and render one indexable page per condo project, HDB block, landed address, landed street and new launch. Add Supabase auth, a Stripe paywall that gates by feature, an AI assistant grounded in the same tables, and lead forms for mortgages, services and enquiries.

## Site map and page inventory

The site has about 25 route types: five programmatic page families (condo, HDB block, landed address, landed street, new launch) carry the SEO, and the tools sit on top of them. Property, news and launch pages are server-rendered with their data in the HTML; the map, valuation, compare and account pages render client-side.

| Route | What it shows | Access |
| --- | --- | --- |
| `/` | Search bar, 8 tool tiles, three quick tasks (value, analyse, what can I buy), new-launch carousel by type, mortgage-rate snapshot | Free |
| `/valuation/` | Estimate for any HDB, condo or landed address; deep links such as `?type=condo&project=THE+HILLFORD` | Free account for the estimate; PDF report on haio+ |
| `/property-analysis/` | Search box that routes to a property page | Free |
| `/condo/<slug>/` | Project page: details, sun path, price chart, sales and rents, unit mix, profit and loss pairs, en-bloc tier, amenities, commute, stacking plan | Latest 10 sales free; context needs a free account; demand vs supply on haio+ |
| `/hdb/blk-<block>-<street>/` | Block page: details, upcoming MRT, sales with lease left, MOP note, competing supply, rental demand, nearby blocks | Same gating as condo |
| `/landed/<number>-<street>/` | Address page: lot size, tenure, sales by property, street, nearby and district, estate context, rebuild cost, planning permissions | Same gating as condo |
| `/landed-street/<street>/` | Every address on one street with sales and estimates | Free |
| `/new-launch/<type>/<slug>/` | Launch facts, units sold, from-price, walk-away price tool, enquiry, link to the dossier | Free |
| `/listings/?type=` | New-launch catalogue for condo, landed, upcoming, commercial, industrial; CCR/RCR/OCR and area filters | Free |
| `/homes/`, `/homes/<id>/`, `/homes/fit/` | Sale and rental listings with a fair-value range, AI Q&A and lister WhatsApp; "fit" ranks homes by distance to your places | Free; exit audience on haio+ |
| `/haios-list/` | Ranked lists: yield, price growth, newest, cheapest, demand vs supply, en-bloc, completions | Top 3 free; full ranking and filters on haio+ |
| `/insights/`, `/trendmaker/` | 20+ market modules and a custom trend-line builder | Full detail on haio+ |
| `/affordability/` | Budget or income-based buying power, then the districts and projects that fit | Free; saving needs sign-in |
| `/mortgage-rates/` | SORA, HDB rate, best bank packages, refinance saver, adviser form | Free; package compare and AI top 3 on haio+ |
| `/supply-demand/<slug>/` | HDB-upgrader pool vs competing private supply by year within a radius | haio+ |
| `/compare/?ids=`, `/compare-units/?a=&b=` | Side-by-side projects, or any two properties | Free |
| `/news/`, `/news/<slug>/` | Market explainers and nine-section launch dossiers with chart export | Some articles haio+ |
| `/map/` | New launches, government land-sale sites, new landed listings, upcoming MRT | Free |
| `/services/` | Nimbus Homes booking (cleaning, moving, disinfection), prefilled by postal code | Free |
| `/my-property/`, `/profile/` | Tracked homes and their value over time; account, plan, Telegram alerts | Free account; unlimited tracking on haio+ |
| `/haio-plus/` | Plans, feature previews, Stripe checkout | Public |
| `/docs/`, `/openapi.json` | Free read-only public API | Public |
| `/spot/` | Coming soon: point the camera at a building to name it | Not live |
| `/methodology/`, `/haio-research/`, `/about/`, `/privacy/`, `/tos/` | Trust and legal pages | Public |

Slugs come from the official project or address name: URA's "PEOPLE'S PK COMPLEX" becomes `/condo/peoples-pk-complex/` and "13 HAIG LANE" becomes `/landed/13-haig-ln/`, so street suffixes are abbreviated.

Users arrive through search or the home-page quick tasks and land on a property page. Every property page ends in a "What's next" row (watchlist, compare, supply and demand, home services, copy link), and each gated section offers a free sign-up, then the 7-day haio+ trial. A bottom tab bar (Home, Map, Spot, My Property, Profile) and an EN/中文 toggle appear site-wide, and the Android and iOS apps display this same website inside the app.

Sources: [home](https://haio.sg/), [condo page](https://haio.sg/condo/the-hillford/), [HDB page](https://haio.sg/hdb/blk-872a-tampines-st-86/), [landed page](https://haio.sg/landed/13-haig-ln/), [listings](https://haio.sg/listings/?type=condo), [haio+](https://haio.sg/haio-plus/), [privacy policy](https://haio.sg/privacy/).
