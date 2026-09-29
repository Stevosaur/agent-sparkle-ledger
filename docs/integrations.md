# Integrations

Every external dependency sits behind an interface in `src/lib/integrations/types.ts`. Settings → Integrations shows each one as **CONNECTED**, **NOT CONNECTED** or **MOCK MODE** — a mock is never shown as connected.

| Interface | Implementations | Enable with | Status without config |
|---|---|---|---|
| `AIProvider` | `AnthropicProvider` (structured outputs, tool loop) · `HeuristicProvider` | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | MOCK — deterministic engines |
| `MessagingProvider` (WhatsApp) | `WhatsAppCloudProvider` · `WhatsAppSimulatorProvider` | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, optional `WHATSAPP_GRAPH_VERSION` | MOCK — messages recorded as `MOCK_SENT` |
| `MessagingProvider` (SMS, email) | stubs | — | MOCK |
| `RoutingProvider` | `OneMapProvider` · `StraightLineProvider` | `ONEMAP_EMAIL`, `ONEMAP_PASSWORD` | MOCK — haversine × 1.35 at 38 km/h |
| `WeatherProvider` | `DataGovWeather` · `NoWeather` | `WEATHER_ENABLED=true`, optional `DATAGOV_API_KEY` | NOT CONNECTED (never critical) |
| `InvoiceNowProvider` | `MockInvoiceNowProvider` | FUTURE — accredited Access Point | MOCK — builds PINT-SG-shaped payload, transmits nothing |
| `GovernmentPermitProvider` | `ManualPermitProvider` | — | NOT CONNECTED — MANUAL reference entry |
| `AccountingProvider` | `MockAccounting` (CSV journal) | FUTURE — Xero/QuickBooks | MOCK |
| `PaymentProvider` | `MockPayments` | FUTURE | MOCK — records only, no funds move |
| `StorageProvider` | `LocalDiskStorage` | `STORAGE_DIR` (swap for S3/GCS) | local disk |

## WhatsApp Business Cloud API

- **Webhook**: `GET/POST /api/webhooks/whatsapp`. GET answers Meta's verification handshake (`hub.mode=subscribe`, `hub.verify_token`, echo `hub.challenge`). POST validates `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the app secret, timing-safe), rate-limits, deduplicates on message id (`webhook_event` unique key), resolves the organisation by `organization.features.whatsappPhoneNumberId`, matches the sender to a vendor by WhatsApp number, and passes the text to the Catch Intake Agent. It always returns 200 for valid signatures so Meta doesn't retry recorded events.
- **Send**: `POST https://graph.facebook.com/<version>/<PHONE_NUMBER_ID>/messages` with a bearer token. Outbound messages are EXTERNAL_COMMUNICATION and need approval unless the organisation enabled templated automation for that action.
- **Voice notes / images**: P1. The adapter records attachments (`message_attachment`); server-side transcription/vision would plug into `AIProvider`. Today the supplier app uses in-browser speech recognition.
- Replacing the simulator = set the four env vars and configure the webhook URL in Meta; no code changes.

## OneMap (SLA)

Token from `POST https://www.onemap.gov.sg/api/auth/post/getToken` (email/password, ~72 h), cached in-process; routing via `GET https://www.onemap.gov.sg/api/public/routingsvc/route?start=lat,lng&end=lat,lng&routeType=drive` with the token in `Authorization`. Parameter names are marked UNVERIFIED in the research notes, so every call falls back to the straight-line estimate on any error and the route board labels estimated legs. Respect OneMap's API terms and attribution requirements if maps are displayed.

## data.gov.sg weather

`GET https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast` (optional `x-api-key`). Used only as context (ETA/demand); 4 s timeout; failures return `null`.

## InvoiceNow / Peppol (FUTURE INTEGRATION)

PasarCatch stores InvoiceNow-ready data (UEN-based Peppol IDs `0195:…`, GST category per line, credit-note references to the original invoice number/date, GST rate snapshot). `MockInvoiceNowProvider.transmit()` builds a PINT-SG-*shaped* JSON view and returns `MOCK_TRANSMITTED`; **nothing is sent to the Peppol network or IRAS**.

To go live, implement `InvoiceNowProvider` against an **IMDA-accredited Access Point** provider's API: map `InvoiceNowDocument` to the provider's UBL/PINT-SG submission, store the provider message id in `customer_invoice.peppol_message_id`, and poll/receive delivery status into `peppol_status` (`QUEUED` → `DELIVERED`/`FAILED`). Inbound supplier e-invoices from the same AP would call `recordSupplierInvoice` with `source: "PEPPOL"` and flow into three-way matching unchanged.

## Government systems — MANUAL / FUTURE INTEGRATION

There is **no** direct integration with SFA, TradeNet, GoBusiness or Singapore Customs. TradeNet has no open public API (solution providers apply to Singapore Customs for message specifications). Licence numbers, CCP/TradeNet permit references, health certificates and catch certificates are entered and uploaded manually; `ManualPermitProvider.checkReference` performs format checks only and says so.
