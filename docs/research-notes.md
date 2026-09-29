# PasarCatch AI: Singapore Regulatory and Integration Research Notes

Access date for all sources: **2026-09-29**.

## How to read this document

- **VERIFIED FACT**: backed by the cited official source URL, accessed 2026-09-29.
- **PRODUCT ASSUMPTION**: a design decision or interpretation made for PasarCatch AI. It is not a legal requirement.
- **FUTURE INTEGRATION**: something we could build later. It is not in the MVP scope.
- **UNVERIFIED**: we could not confirm this against an official source. Do not build on it without checking first.

> **Method caveat (important).** The research sandbox's egress proxy blocked direct page fetches (HTTP 403 / EGRESS_BLOCKED) to sfa.gov.sg, iras.gov.sg, onemap.gov.sg, data.gov.sg, api-open.data.gov.sg and developers.facebook.com. So every "VERIFIED FACT" below comes from web-search excerpts of the cited official page. The pages were **not** read in full. Before shipping anything that depends on an exact endpoint, date or field list, an engineer should open the cited URL and re-confirm it. Items that came only from third-party sites are marked UNVERIFIED.

---

## 1. SFA: seafood licensing, food safety, recall and traceability

### Import / export / transhipment
- **VERIFIED FACT**: A business needs SFA's **"Licence for Import/Export/Transhipment of Meat and Fish Products"** to import fish products. It must also get a **Cargo Clearance Permit (CCP)** approved by SFA for **every consignment**. Source: https://www.sfa.gov.sg/food-import-export/licence-permit-registration/requirements-for-licence-permit-registration-for-import-export (accessed 2026-09-29)
- **VERIFIED FACT**: "Fish & Fish Products" includes live fish, canned tuna, crabs, prawns, sea cucumbers and squid. Import requirements are set out in the **Wholesome Meat and Fish (Import, Export and Transhipment) Rules**. Source: https://www.sfa.gov.sg/food-import-export/commercial-imports/import-requirements-for-food-food-products (accessed 2026-09-29)
- **VERIFIED FACT**: Fish and fish products that are **not "high-risk" and not under CITES** can be imported from any country or region **without a health certificate**. **High-risk** items (SFA's example is frozen oysters) need health certificates. Only approved countries/regions with a **National Shellfish Sanitation Programme (NSSP)** may export **live oysters** to Singapore. Source: https://www.sfa.gov.sg/food-import-export/commercial-imports/import-requirements-for-food-food-products (accessed 2026-09-29)
- **VERIFIED FACT**: Lower-risk products such as live fish and frozen raw prawns do not need accreditation. They are still **subject to post-import inspection and sample testing**. Tests cover chemical contaminants, drug residues, heavy metals and microbes such as E. coli, Salmonella and Listeria. Source: https://www.sfa.gov.sg/food-import-export/accreditation-of-overseas-farms-establishments/overseas-accreditation-of-food-food-products (accessed 2026-09-29)
- **VERIFIED FACT**: The WMF (Import, Export and Transhipment) Rules require the importer or its representative to present the **cargo clearance permit and health certificate** for the consignment, in duplicate, to the authorised examiner before examination starts. Frozen samples are thawed for examination. Source: https://www.sfa.gov.sg/docs/default-source/legislation/wholesome-meat-and-fish-act/wholesome-meat-and-fish-import_export_and_transhipment-rules.pdf (accessed 2026-09-29)
- **VERIFIED FACT**: For exports, **Export Health Certificates** must be obtained **before** export and cannot be issued after the goods have been exported. Establishments applying must appoint a **Qualified Person (QP)**. The QP must be a full-time employee who has passed **WSQ Food Safety Course Level 3**. Source: https://www.sfa.gov.sg/commercial-exports/application-process-for-export-certificates-for-food (accessed 2026-09-29)
- **VERIFIED FACT**: SFA has published a trade circular on newly regulated HS codes for meat and fish. Source: https://www.sfa.gov.sg/news-publications/circulars-and-notices/circulars/newly-regulated-hs-codes-for-meat-and-fish (accessed 2026-09-29). **UNVERIFIED**: the specific HS codes and the effective date.
- **UNVERIFIED**: Current licence fees and permit fees per consignment for fish. Do not hard-code them.

### Cold stores and processing
- **VERIFIED FACT**: All cold stores for meat and seafood products must be **licensed by SFA** before they may store goods for wholesale distribution, under the Wholesome Meat and Fish Act. The licences are **valid for 1 year**. GoBusiness lists the licence as **"Licence to Operate a Coldstore"**. Sources: https://www.sfa.gov.sg/food-manufacturing-storage/licence-registration/requirements-for-licence-registration-for-food-manufacturing-storage and https://www.gobusiness.gov.sg/browse-all-licences/singapore-food-agency-(sfa)/licence-to-operate-a-coldstore (accessed 2026-09-29)
- **VERIFIED FACT**: Food handlers in food processing establishments, cold stores and slaughterhouses must hold a valid **WSQ Food Safety Course Level 1** certification. Source: same SFA page as above (accessed 2026-09-29)
- **VERIFIED FACT**: SFA publishes "Conditions of Licensing for Meat, Fish and Egg Processing Establishments and Cold Stores", updated on 1 Jan 2026. Source: https://www.sfa.gov.sg/docs/default-source/food-manufacturing-and-storage/conditions-of-licensing-for-meat-fish-and-egg-processing-establishments-and-cold-stores.pdf (accessed 2026-09-29)
- **VERIFIED FACT**: An SFA circular to fishery port tenants reports finding a tenant doing **unlicensed food processing**. It reminds tenants that operating a food establishment without a valid licence is an offence. Source: https://www.sfa.gov.sg/docs/default-source/circulars/trade/2024/sfa-licence-application-jfp-v1_0.pdf (accessed 2026-09-29)

### Fishery ports (Jurong / Senoko)
- **VERIFIED FACT**: SFA operates **Jurong Fishery Port (JFP)**, which started in 1969. It is the hub for receiving and distributing imported seafood and runs 24 hours a day, all year round, **except Monday 2am-6am**. Source: https://www.sfa.gov.sg/wholesale-markets-fishery-ports/fishery-ports/information-on-jurong-fishery-port (accessed 2026-09-29)
- **VERIFIED FACT**: SFA also manages **Senoko Fishery Port (SFP)**. Both ports distribute local and imported seafood in live, chilled and frozen forms. Source: https://www.sfa.gov.sg/contact-us/sfa-fishery-ports-and-wholesale-centre (accessed 2026-09-29)
- **VERIFIED FACT**: Bidders for **JFP market lots** must be ACRA-registered. Tenders are held periodically, and SFA issues and enforces **House Rules for Fishery Ports**. SFA officers routinely inspect higher-risk seafood at JFP and **verify permit declarations**. Sources: https://www.sfa.gov.sg/wholesale-markets-fishery-ports/fishery-ports/information-on-jurong-fishery-port and https://www.sfa.gov.sg/news-publications/circulars-and-notices/circulars/circular---house-rules-at-jurong-fishery-port--jfp (accessed 2026-09-29)
- **VERIFIED FACT**: Since **1 Dec 2024**, SFA's **Tenancy Management e-Services** handle JFP and Marine Aquaculture Centre tenancy applications: addition/alteration, assignment, business change, renewal and termination. Source: https://www.sfa.gov.sg/news-publications/circulars-and-notices/circulars/2024/launch-of-tenancy-management-e-services-for-jurong-fishery-port-and-marine-aquaculture-centre-tenancy-applications (accessed 2026-09-29)
- **VERIFIED FACT**: JFP has a Visitors' Management System (circular dated 11 Sep 2024), and SFA runs a wharf application process for shipping agents and vessel suppliers. Sources: https://www.sfa.gov.sg/news-publications/circulars-and-notices/circulars/2024/circular-to-jfp-tenants-on-visitors--management-system--vms----11-sep-2024 and https://www.sfa.gov.sg/news-publications/circulars-and-notices/circulars/circular-to-shipping-agents---vessel-suppliers---jurong-fishery-port--jfp--wharf-applications (accessed 2026-09-29)
- **UNVERIFIED**: Whether a separate licence called a "fish merchant licence" or "fishery port trader licence" exists. The search found no official licence by either name. Do not use these names in the product.

### Fishing vessels and fish farms
- **VERIFIED FACT**: No fishing vessel may ply at any port in Singapore waters without a valid SFA licence. Inboard fishing vessels **and the fishing gear on board** must be licensed. Operating without a licence is an offence. Sources: https://www.sfa.gov.sg/wholesale-markets-fishery-ports/licence-registration/requirements-for-licence-registration-for-fishing-vessel-gear-personnel and https://www.sfa.gov.sg/docs/default-source/food-farming/fv_licensing-conditions.pdf (accessed 2026-09-29)
- **VERIFIED FACT**: SFA also licenses or registers persons engaged or employed on fishing vessels, and issues an **Entry Permit and Port Clearance / Report of Arrival at SFA Fishery Ports**. SFA publishes a **List of Licensed Fishing Vessels** (PDF). Sources: https://www.sfa.gov.sg/wholesale-markets-fishery-ports/licence-registration/application-process-fees-for-licence-registration-for-fishing-vessel-gear-personnel and https://www.sfa.gov.sg/docs/default-source/wholesale-markets-and-fishery-ports/licenced-fishing-vessel.pdf (accessed 2026-09-29)
- **VERIFIED FACT**: Farms holding a **Fish Culture Farm Licence** must also hold a Fishing Vessel Licence for vessels that service the farm. Source: https://www.sfa.gov.sg/farming/licence-registration/requirements-for-licence-registration-for-farming (accessed 2026-09-29)

### Food Safety and Security Act 2025 (FSSA), recall and traceability
- **VERIFIED FACT**: The FSSA was passed on 8 Jan 2025 and received assent on 3 Feb 2025. It has 17 Parts, 405 sections and 2 Schedules, and is coming into force **in tranches**. **Tranche 1** (defined food / pre-market approval and non-packaged drinking water) took effect on **28 Nov 2025**. Sources: https://www.sfa.gov.sg/legislation/food-safety-and-security-act and https://sso.agc.gov.sg/Act/FSSA2025 (accessed 2026-09-29)
- **VERIFIED FACT**: SFA's policy, as stated in its FSSB consultation response, is that food businesses must keep records to trace incoming ingredients or products ("**one step back**") and outgoing distribution ("**one step forward**"), except for sales to final consumers. The **details are to be prescribed in subsidiary legislation**. Source: https://www.sfa.gov.sg/docs/default-source/public-consultation/summary-of-responses-to-comments-received-from-fssb-public-consultation-and-engagements_081124_.pdf (accessed 2026-09-29)
- **UNVERIFIED**: Whether the FSSA traceability provisions and their subsidiary legislation had **commenced by 2026-09-29**, and the exact record fields and retention period. Today the obligation is confirmed as policy intent only. Treat it as "expected mandatory" until someone checks the SSO commencement notifications.
- **VERIFIED FACT**: All food importers except shell-egg importers must submit a **Food Recall Plan** at their **first licence renewal**, then **once every 2 years** at later renewals. SFA provides a food recall plan template. Sources: https://www.sfa.gov.sg/food-import-export/licence-permit-registration/update-renew-cancel-licence-registration-for-import-export and https://www.sfa.gov.sg/docs/default-source/food-import-and-export/food-recall-plan.pdf (accessed 2026-09-29)
- **VERIFIED FACT**: For export certification, SFA expects a traceability system that links goods to their official documents and monitors inventory, plus a recall plan for export incidents. Source: https://www.sfa.gov.sg/commercial-exports/application-process-for-export-certificates-for-food (accessed 2026-09-29)
- **PRODUCT ASSUMPTION**: PasarCatch will record lot-level one-step-back data (supplier, CCP/permit number, health certificate reference, origin, landing or arrival date) and one-step-forward data (customer, delivery order, quantity, date) for every movement. This supports the Food Recall Plan and future FSSA traceability rules. We treat it as **good practice now and expected-mandatory later**.
- **PRODUCT ASSUMPTION**: The product will not claim to "certify SFA compliance". It only helps licensees keep the records they are responsible for.
- **FUTURE INTEGRATION**: A recall workflow that generates a recall contact list by lot, and matches SFA recall notices to lots in inventory.

---

## 2. Import permits: TradeNet / CCP

- **VERIFIED FACT**: **TradeNet** has been Singapore's national single window for trade documentation since 1989. **All** import, export and transhipment permit applications go through TradeNet. Source: https://www.customs.gov.sg/doing-business/quick-links-for-traders/tradenet/ (accessed 2026-09-29)
- **VERIFIED FACT**: A trader can either (a) **appoint a declaring agent** to apply for permits via TradeNet, or (b) apply itself. Either way, applications go through **TradeNet front-end software from an approved software vendor** or the **Government Front-End Application**. Source: https://www.customs.gov.sg/doing-business/import-operations/import-procedures/obtain-a-customs-import-permit/ (accessed 2026-09-29)
- **VERIFIED FACT**: Before applying for permits, a business must **activate a Customs Account**, which only Key Personnel can do and which costs nothing. It must also set up **Inter-Bank GIRO** with Singapore Customs for duties, taxes and fees; bank approval takes about 3-4 weeks. Source: https://customs.gov.sg/businesses/new-traders-and-registration-services/registration-services/activate-customs-account/ (accessed 2026-09-29)
- **VERIFIED FACT**: There is **no open public API**. A company that wants to offer a TradeNet front-end, including a **system-to-system** solution, must email `Customs_tradenet@customs.gov.sg` with its company name, UEN, proposed solution type, server location and support-team location. Successful applicants then **receive the TradeNet message specifications**. Source: https://customs.gov.sg/businesses/national-single-window/overview/tradenet-solution-providers/ (accessed 2026-09-29)
- **VERIFIED FACT**: For SFA-regulated fish, the CCP must be **approved by SFA** for every consignment (see Section 1).
- **PRODUCT ASSUMPTION**: The MVP will **not** submit permits. Users type in or upload the approved CCP / permit number and the health certificate, and we link them to inbound lots.
- **FUTURE INTEGRATION**: Partner with an approved TradeNet front-end vendor or declaring agent to import permit status. Becoming a front-end provider ourselves is a regulated onboarding process and is not a self-serve API.
- **UNVERIFIED**: Whether the Networked Trade Platform (NTP) offers any third-party API for permit status.

---

## 3. GST

- **VERIFIED FACT**: The GST rate has been **9%** for standard-rated supplies made **on or after 1 Jan 2024** (it was 8% in 2023). Source: https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/gst-rate-change/gst-rate-change-for-business/overview-of-gst-rate-change (accessed 2026-09-29)
- **VERIFIED FACT**: The registration threshold is **taxable turnover above S$1 million**.
  - **Retrospective basis**: if calendar-year turnover exceeded S$1m, the business applies between 1-30 Jan of the following year and is registered from 1 Mar.
  - **Prospective basis**: if turnover is reasonably expected to exceed S$1m in the next 12 months, the business must apply **within 30 days** of that forecast.
  - If the prospective liability arises **on or after 1 Jul 2025**, there is a **2-month grace period** before the business must start charging GST.
  - Source: https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/gst-registration-deregistration/do-i-need-to-register-for-gst (accessed 2026-09-29)
- **VERIFIED FACT**: A **tax invoice** must be issued when the customer is GST-registered, generally **within 30 days of the time of supply**. It must separately state the gross amount payable for each type of supply (standard-rated, zero-rated or exempt) where applicable. Source: https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/basics-of-gst/invoicing-price-display-and-record-keeping/invoicing-customers (accessed 2026-09-29)
- **VERIFIED FACT**: A **simplified tax invoice** is allowed when the total including GST is **S$1,000 or less**. It needs:
  - the supplier's name, address and GST registration number
  - an identifying number, such as an invoice number
  - Source: same IRAS page (accessed 2026-09-29)
- **UNVERIFIED (exact wording)**: The full tax invoice field list. The search excerpt did not show it in full. Our working field list is below and must be checked against the IRAS "Invoicing Customers" page:
  - supplier name, address and GST registration number
  - invoice number and date
  - customer name and address
  - description of goods
  - total amount excluding GST
  - GST rate and GST amount
  - total amount including GST
- **VERIFIED FACT**: Tax invoices issued and received must be kept for **at least 5 years**. Source: https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/basics-of-gst/invoicing-price-display-and-record-keeping/invoicing-customers (accessed 2026-09-29)
- **VERIFIED FACT**: **Credit notes** must reference the original tax invoice, showing its **number and date**. Supporting documents must record the nature of and reason for the adjustment. Output tax and supply value are reduced (GST F5 Box 1 / Box 6) in the **accounting period in which the credit note is issued**, with exceptions for error corrections. Source: https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/gst-rate-change/gst-rate-change-for-business/adjustments-and-concessions-for-gst-rate-change (accessed 2026-09-29)
- **PRODUCT ASSUMPTION**: The GST rate will be stored as dated configuration (`effective_from`), not hard-coded. Fresh unprocessed seafood is treated as **standard-rated** by default. **UNVERIFIED**: whether any seafood supply is zero-rated or exempt, beyond ordinary export zero-rating.

---

## 4. InvoiceNow / Peppol

- **VERIFIED FACT**: **InvoiceNow** is Singapore's nationwide e-invoicing network based on Peppol. IMDA introduced it in 2019, and **IMDA is the Peppol Authority** for Singapore. Sources: https://www.iras.gov.sg/news-events/newsroom/committee-of-supply-2026--extension-of-gst-invoicenow-requirement-to-all-gst-registered-businesses-by-april-2031 and https://peppol.org/learn-more/country-profiles/singapore/ (accessed 2026-09-29)
- **VERIFIED FACT**: The IRAS **GST InvoiceNow Requirement** timeline so far (source: https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/gst-invoicenow-requirement, accessed 2026-09-29):
  - **1 May 2025**: soft launch. Any GST-registered business could voluntarily start sending invoice data to IRAS.
  - **1 Nov 2025**: required for **newly incorporated companies that register for GST voluntarily**.
  - **1 Apr 2026**: required for **all new voluntary GST registrants**. Adopting InvoiceNow is a **condition** of voluntary registration, and IRAS may reject applications that do not meet it.
- **VERIFIED FACT**: At the **Committee of Supply 2026**, the Government announced that the requirement will extend to **all GST-registered businesses** progressively from **Apr 2028 to Apr 2031**. The announcement also included:
  - transitional funding of up to **S$1,000 for SMEs** and up to **S$5,000 for larger businesses**
  - free **InvoiceNow-Ready Solutions for SMEs until Mar 2031**
  - Source: https://www.iras.gov.sg/news-events/newsroom/committee-of-supply-2026--extension-of-gst-invoicenow-requirement-to-all-gst-registered-businesses-by-april-2031 (accessed 2026-09-29)
- **VERIFIED FACT (search excerpt only; confirm on the IRAS or IMDA COS 2026 page)**: Phases by total annual supplies:
  - **1 Apr 2028**: all new compulsory GST registrants, and existing GST-registered businesses with supplies of **S$200k or less**
  - **1 Apr 2029**: existing businesses with supplies of **S$1m or less**
  - **1 Apr 2030**: existing businesses with supplies of **S$4m or less**
  - **1 Apr 2031**: existing businesses with supplies **above S$4m**
  - Sources: IRAS page above; https://www.imda.gov.sg/resources/press-releases-factsheets-and-speeches/factsheets/2026/committee-of-supply-2026 (accessed 2026-09-29)
- **VERIFIED FACT**: To comply, a business registers in the **SG Peppol Directory** with its UEN (through its InvoiceNow-Ready Solution Provider or an **IMDA-accredited Access Point provider**). It then turns on GST InvoiceNow submission or connects its solution to IRAS through the AP. Invoice data must be sent using **InvoiceNow-Ready Solutions via the InvoiceNow network**. Sources: https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/gst-invoicenow-requirement and https://www.imda.gov.sg/how-we-can-help/nationwide-e-invoicing-framework/access-point-providers (accessed 2026-09-29)
- **VERIFIED FACT**: IMDA runs a **Peppol Service Provider Accreditation Scheme** for Access Point providers, and a separate **InvoiceNow-Ready Solution Provider (IRSP)** accreditation for accounting and ERP software. Sources: https://www.imda.gov.sg/how-we-can-help/nationwide-e-invoicing-framework/peppol-service-provider-accreditation-scheme and https://www.imda.gov.sg/how-we-can-help/nationwide-e-invoicing-framework/peppol-ready-accounting-erp-solution-providers (accessed 2026-09-29)
- **VERIFIED FACT**: The data format is **PINT-SG** (Peppol International model for Billing, Singapore). It was launched in Feb 2024 as the upgrade from **Singapore BIS Billing 3.0** and is the base format for the GST InvoiceNow Requirement. The spec is hosted at `https://docs.peppol.eu/poac/sg/pint-sg/`, and that page showed **v1.4.0** at the time of search. Sources: https://docs.peppol.eu/poac/sg/pint-sg/ and https://peppol.org/learn-more/country-profiles/singapore/ (accessed 2026-09-29)
- **VERIFIED FACT**: A Singapore Peppol ID is based on the **UEN** under ICD scheme **0195 (SGUEN)**. The format is `0195:SG<UEN>` (e.g. `0195:SG201912345A`), and "0195:SGUEN" is prefixed when searching the directory. Source: https://peppol.org/learn-more/country-profiles/singapore/ (accessed 2026-09-29). **UNVERIFIED**: the exact "SG" + UEN concatenation, so confirm it with an AP provider.
- **PRODUCT ASSUMPTION**: PasarCatch will **not** act as a Peppol Access Point. It will produce PINT-SG-shaped invoice data and pass it to a partner that is an IMDA-accredited AP / IRSP.
- **FUTURE INTEGRATION**: Get PasarCatch accredited as an **InvoiceNow-Ready Solution**, so SME customers can use the free-solution funding window (to Mar 2031).

---

## 5. PDPA

- **VERIFIED FACT**: The PDPA sets out **data protection obligations**. They include Accountability (with a **designated DPO**), Notification, Consent, Purpose Limitation, Accuracy, Access and Correction, Protection, Retention Limitation, Transfer Limitation and Data Breach Notification. Source: https://www.pdpc.gov.sg/overview-of-pdpa/the-legislation/personal-data-protection-act/data-protection-obligations (accessed 2026-09-29)
- **VERIFIED FACT**: **Business contact information** is excluded from the Data Protection Provisions. This covers a person's name, position or title, business phone, business address, business email, business fax "and any other similar information" not provided solely for personal purposes. Source: https://www.pdpc.gov.sg/-/media/Files/PDPC/PDF-Files/Advisory-Guidelines/AG-on-Key-Concepts/Advisory-Guidelines-on-Key-Concepts-in-the-PDPA-1-Oct-2021.pdf (accessed 2026-09-29)
- **VERIFIED FACT**: A **data intermediary** that processes data on behalf of an organisation, as a SaaS vendor typically does, is subject to three obligations: **Protection**, **Retention Limitation**, and **Data Breach Notification**. Under the last one, it must notify the organisation **without undue delay** once it has credible grounds to believe a breach occurred. The organisation, not the intermediary, decides whether to notify PDPC and affected individuals. Source: https://www.pdpc.gov.sg/the-distinction-between-organisations-and-data-intermediaries-and-why-it-matters (accessed 2026-09-29)
- **VERIFIED FACT**: A breach is **notifiable** if it is likely to cause **significant harm** or affects **500 or more individuals**. The notification timeline:
  - The organisation must assess the breach "reasonably and expeditiously", within **30 calendar days**, and document the steps it took.
  - PDPC must be notified **no later than 3 calendar days** after the breach is determined to be notifiable.
  - Affected individuals must be notified as soon as practicable, at the same time as or after PDPC.
  - Sources: https://www.pdpc.gov.sg/-/media/files/pdpc/pdf-files/other-guides/guide-on-managing-and-notifying-data-breaches-under-the-pdpa-15-mar-2021.pdf and https://www.pdpc.gov.sg/report-data-breach/before-you-report-a-data-breach-3/info (accessed 2026-09-29)
- **VERIFIED FACT**: Under the **NRIC Advisory Guidelines** (effective **1 Sep 2019**), private organisations may collect, use or disclose NRIC numbers or NRIC copies **only if required by law, or if necessary to verify identity to a high degree of accuracy**. Further rules:
  - A physical NRIC may be **retained only if required by law**.
  - Briefly viewing an NRIC without recording anything is not "collection".
  - The same treatment applies to birth certificate numbers, FIN, Work Permit numbers and passport numbers.
  - Sources: https://www.pdpc.gov.sg/guidelines-and-consultation/2020/02/advisory-guidelines-on-the-personal-data-protection-act-for-nric-and-other-national-identification-numbers and https://www.pdpc.gov.sg/nric-faqs (accessed 2026-09-29)
- **PRODUCT ASSUMPTION**: PasarCatch acts as a **data intermediary** for tenant data and as an **organisation** for its own account and billing data.
- **PRODUCT ASSUMPTION**: Tenant contracts will commit PasarCatch to notify customers of a breach **within 24-48h**. This is our own SLA, chosen to satisfy "without undue delay"; it is not a statutory figure.
- **PRODUCT ASSUMPTION**: No NRIC / FIN fields anywhere in the product. That includes driver and delivery-staff records and WhatsApp contacts. Staff are identified by internal ID, name and phone.
- **PRODUCT ASSUMPTION**: Personal (non-business) phone numbers of drivers or hawker customers are personal data. We collect them with notice and consent and set a retention period for them.
- **UNVERIFIED**: Current maximum financial penalty figures. Not needed for the MVP.

---

## 6. OneMap API (SLA)

- **VERIFIED FACT**: OneMap requires a registered account. A token is obtained with **`POST https://www.onemap.gov.sg/api/auth/post/getToken`**, sending a JSON body `{"email": ..., "password": ...}`. The response contains `access_token` and `expiry_timestamp`, and the token is valid for **72 hours** (3 days). It is sent in the **`Authorization`** header on later calls. Sources: https://www.onemap.gov.sg/apidocs/authentication and https://www.onemap.gov.sg/apidocs/docs/tokenmanagement (accessed 2026-09-29). Caveat: the exact path was confirmed from the docs index plus third-party mirrors; the official page itself could not be fetched.
- **VERIFIED FACT**: OneMap has published a "JWT Token Update - RS256 Migration" notice and a "Verifying Search API Token Implementation" page, which indicates that **the Search API now needs a token too**. Sources: https://www.onemap.gov.sg/apidocs/docs/jwttokenupdate and https://www.onemap.gov.sg/apidocs/docs/verifyingsearchapitoken (accessed 2026-09-29). **UNVERIFIED**: the enforcement date and whether unauthenticated search still works. Build as if a token is always required.
- **VERIFIED FACT**: Search / geocode: **`GET https://www.onemap.gov.sg/api/common/elastic/search`** searches addresses, postal codes and buildings. Source: https://www.onemap.gov.sg/apidocs/ (accessed 2026-09-29). **UNVERIFIED (from third parties, not the official page)**: the query parameters `searchVal`, `returnGeom=Y|N`, `getAddrDetails=Y|N` and `pageNum`.
- **VERIFIED FACT**: Reverse geocoding is documented at https://www.onemap.gov.sg/apidocs/reverseGeocode (accessed 2026-09-29). **UNVERIFIED**: its path and parameters.
- **VERIFIED FACT**: Routing: **`GET https://www.onemap.gov.sg/api/public/routingsvc/route`** covers public transport, drive, walk and cycle, and requires authentication. Source: https://www.onemap.gov.sg/apidocs/routing (accessed 2026-09-29). **UNVERIFIED (third-party examples only)**: the parameters, which are believed to be:
  - `start=lat,lng`
  - `end=lat,lng`
  - `routeType=walk|drive|cycle|pt`
  - for `pt` only: `date=MM-DD-YYYY`, `time=HH:MM:SS`, `mode=TRANSIT|BUS|RAIL`, plus optional `maxWalkDistance` and `numItineraries`
- **VERIFIED FACT**: OneMap has an **API Terms of Service**. Rights may be subject to extra limits stated on each API's page, and the base map requires the **OneMap logo and attribution**. Sources: https://www.onemap.gov.sg/legal/apitermsofservice.html and https://www.onemap.gov.sg/legal/termsofuse.html (accessed 2026-09-29). **UNVERIFIED**: numeric rate limits (a figure of "250 calls/min" circulates but was not confirmed).
- **PRODUCT ASSUMPTION**: Refresh the token server-side before it expires (for example, at 70h). Keep OneMap credentials out of the client. Cache geocodes of fixed customer addresses.
- **FUTURE INTEGRATION**: Multi-stop delivery ordering. OneMap routing is point-to-point, so ordering the stops is our own logic.

---

## 7. data.gov.sg real-time weather (NEA)

- **VERIFIED FACT**: The real-time APIs use base URL **`https://api-open.data.gov.sg`**, with v2 paths under `/v2/real-time/api/`. Endpoints of interest:
  - **`GET /v2/real-time/api/two-hr-forecast`**: 2-hour forecast by area, updated about every 30 minutes.
  - **`GET /v2/real-time/api/rainfall`**: station rainfall readings, updated about every 5 minutes according to the dataset page.
  - Sources: https://data.gov.sg/datasets/d_3f9e064e25005b0e42969944ccaf2e7a/view (2-hour forecast) and https://data.gov.sg/datasets/d_6580738cdd7db79374ed3152159fbd69/view (rainfall) (accessed 2026-09-29). Caveat: the exact paths came from the dataset pages as quoted in search results; they were not fetched directly.
- **VERIFIED FACT**: A 24-hour forecast dataset API also exists. Source: https://data.gov.sg/datasets/d_ce2eb1e307bda31993c533285834ef2b/view (accessed 2026-09-29). **UNVERIFIED**: its exact v2 path, believed to be `/v2/real-time/api/twenty-four-hr-forecast`.
- **VERIFIED FACT**: An API key is **optional**. It is sent in the **`x-api-key`** header and gives higher rate limits and priority support.
  - There are **Developer** keys (test and staging, lower limits) and **Production** keys.
  - Rate limits are counted per **10-second window**; going over returns **HTTP 429**.
  - Without a key, the anonymous per-IP limit applies.
  - Rate limit enforcement began on **31 Dec 2025** (after an extended deadline).
  - Sources: https://guide.data.gov.sg/developer-guide/api-overview/api-rate-limits, https://guide.data.gov.sg/developer-guide/api-overview/how-to-use-your-api-key and https://guide.data.gov.sg/whats-new/extended-deadline-upgrade-to-api-keys-by-dec-31-2025 (accessed 2026-09-29)
- **UNVERIFIED**: The exact numeric limits per 10s window, for anonymous use and for each key type.
- **PRODUCT ASSUMPTION**: Use a **Production** API key from a server-side cache that polls the 2-hour forecast every 15-30 minutes. End users never call data.gov.sg directly. We will match forecast "areas" to the delivery zones near JFP (Jurong / western areas).

---

## 8. WhatsApp Business Cloud API (Meta)

- **VERIFIED FACT**: **Webhook verification**: when a webhook endpoint is registered, Meta sends a `GET` with `hub.mode=subscribe`, `hub.verify_token` and `hub.challenge`. The endpoint must check that the verify token matches its configured value, then reply **200 with the `hub.challenge` value** as the body. Source: https://developers.facebook.com/docs/graph-api/webhooks/getting-started/ (accessed 2026-09-29)
- **VERIFIED FACT**: **Payload signature**: Meta signs every event notification with a **SHA256** signature in the **`X-Hub-Signature-256`** header, formatted `sha256=<hex>`. To validate a request:
  1. Compute an HMAC-SHA256 of the **raw request body** using the **App Secret**.
  2. Compare the result with the header value after the `sha256=` prefix.
  - Source: https://developers.facebook.com/docs/graph-api/webhooks/getting-started/ (accessed 2026-09-29)
- **PRODUCT ASSUMPTION** (engineering good practice, not from Meta's text):
  - Compare signatures in constant time.
  - Verify against raw bytes before parsing JSON.
  - Keep the verify token and the App Secret as separate secrets.
- **VERIFIED FACT**: **Send message**: `POST https://graph.facebook.com/<API_VERSION>/<WHATSAPP_BUSINESS_PHONE_NUMBER_ID>/messages`, with header `Authorization: Bearer <ACCESS_TOKEN>` and `Content-Type: application/json`. The body looks like:

  ```json
  {"messaging_product": "whatsapp", "recipient_type": "individual", "to": "<E.164 number>", "type": "<text|template|interactive|...>", "<type>": {...}}
  ```

  Meta recommends including `+` and the country code in `to`. Sources: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages/ and https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api (accessed 2026-09-29)
- **UNVERIFIED**: The **current** Graph API version string. Meta's examples showed `v23.0`, but newer versions may exist as of 2026-09-29. Make the version a config value.
- **UNVERIFIED**: Current rules for the 24-hour customer-service window and template pricing. Check them before designing outbound notifications, such as delivery ETAs, as template messages.
- **PRODUCT ASSUMPTION**: Outbound order confirmations and delivery ETAs use pre-approved **template** messages. Inbound buyer orders arrive by webhook and are parsed into draft purchase orders, which a person must confirm.

---

## Summary of key open items (UNVERIFIED)

1. When the FSSA traceability (one-step-back/forward) provisions commence, and their exact record fields and retention period.
2. The full IRAS tax-invoice field list (confirm on the "Invoicing Customers" page).
3. The COS 2026 InvoiceNow phase thresholds (S$200k / S$1m / S$4m), which came from a search excerpt only.
4. OneMap search, routing and reverse-geocode query parameters, and numeric rate limits.
5. The numeric rate limits for data.gov.sg keys, and the exact path of the 24-hour forecast endpoint.
6. The current Meta Graph API version.
7. Whether a named "fish merchant" or fishery-port trader licence exists (none was found).
