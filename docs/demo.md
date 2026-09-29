# Demo script

`npm run db:reset && npm run dev`, then sign in as **procurement@demo.pasarcatch.sg** / `pasarcatch-demo`. The in-app **Demo guide** (Settings → Demo Guide, `/demo`) has the same script with links.

## What's seeded

- Fictional wholesaler **Selat Fresh Seafood (DEMO)** at Jurong Fishery Port, 7 users, 15 vendors (5 vessels/foreign fisheries, 4 farms, 3 importers, a JFP wholesaler, a processor, a logistics provider), 10 buyers at public market locations (the businesses are invented), 21 species with Chinese/Malay/local names and aliases, 4 drivers, 3 reefer trucks, licences & documents (one expiring, one expired, one missing).
- ~60 nights of history (≈1,300 lots, ≈550 orders, ≈700 POs, receipts, deliveries, invoices) for forecasts, price trends and scorecards.
- **Last night** — the full overnight story executed through the real services and agents:
  23:15 WhatsApp declarations → 00:10 demand forecast → 00:30 procurement agent (threadfin shortage, batang balanced, prawns surplus) → 00:42 manager approves threadfin PO → 01:05 vessel ETA 01:30→02:45 (and a second late vessel) → 01:30 another boat lands → 02:00–03:20 receiving (Ah Seng 8% under declared; squid at 7.5 °C) → processing of a batang lot into cleaned/filleted child lots → allocation proposals approved → 03:45 picking → 04:15 surplus agent → 04:30 discounted offer approved → 05:00 routes → 05:30 trucks depart → deliveries (one late) → 07:00 supplier invoices, three-way matching (Ah Seng invoice flagged), customer invoices, mock InvoiceNow.
- **Tonight** — in progress to ~01:05; the **demo clock** starts at 01:10: orders in, most catch declared and bought, salmon/seabass/prawns already received with allocation proposals pending, batang short ≈100 kg, threadfin short with Ocean Harvest's 42 kg @ S$11.80 recommended (S$495.60 — waiting in the Approval Inbox), two late vessels, one ambiguous "mackerel" draft.
- A second tenant (Kelong Fresh Trading) to demonstrate isolation — switch via the user menu as `owner@`.

## The 15-step live story (≈10 minutes)

1. **Catch Intake** (`/supply/intake`) — Ah Seng is pre-selected; send *"Tonight 65kg batang, around 600-800g, asking 8.80. Boat reach 1.30."* Watch the extraction: Spanish mackerel (batang), 65 kg, 600–800 g, S$8.80, ETA 01:30, no ambiguous fields, templated reply in the chat.
2. The draft lot appears under **Awaiting confirmation** → **Confirm & buy**.
3. **Tonight's Market** — batang still `SHORT`; open it for suppliers, buyers and the AI recommendation.
4. Back in the simulator choose **Nelayan Jaya Johor** → *"Can give 40kg batang 1-2kg size @ 8.50, reach 2.45"* → **Confirm as offer**.
5. **Approval Inbox** — the Procurement Agent's PO proposal with score explanation → **Approve** (try **Modify** first to see editable qty/price).
6. `⌘K` → *"How much batang are we short tonight?"*
7. **Receiving on a phone** — sign in as `ops@` on a phone (or DevTools device mode) → `/receive` → Ah Seng batang → weight **61.2**, temp **2**, grade **A** → **Accept** (note the seconds counter).
8. **Approval Inbox** — the Allocation Agent's proposal → Approve. Or use **Procurement → Allocations** to compare policies (pro-rata vs priority vs margin) and see substitute suggestions.
9. **Operations → Picking & Packing** → Generate pick list → Pick & pack each order.
10. **Operations → Routes** → Generate routes (departure 05:30) → the route board and schematic map.
11. **Operations → Dispatch** → Dispatch each run; complete a delivery with a POD name.
12. **Procurement → Purchase Orders** → the Ah Seng PO → **Simulate supplier invoice (bill declared weight)**.
13. **Finance → Reconciliation** → the invoice shows `EXCEPTION`: 3.8 kg quantity discrepancy, S$33.44 potential overbilling before tax.
14. **Traceability** → search the last 4 digits of the Ah Seng lot → supplier → receiving → allocation → customers → delivery → invoices, with the full timeline. Try **Recall mode** to see affected customers and the draft (unsent) contact list.
15. Settings → Demo Guide → **Demo clock → 04:15**, then `⌘K` *"What seafood is likely to go unsold today?"* or run the surplus agent from Tonight's Market.

To start over: `npm run db:reset`.

## Supplier's view

Sign in as `supplier@demo.pasarcatch.sg` on a phone: one big **DECLARE CATCH** button → Speak / Type / Take photo → "Is this right?" → Confirm → Done. Internal users can preview it at `/supplier`.
