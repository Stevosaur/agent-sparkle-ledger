/**
 * InvoiceNow (Peppol) integration.
 *
 * VERIFIED FACT (IRAS/IMDA, see docs/research-notes.md): businesses transmit via an IMDA-accredited Access
 * Point provider; the Singapore data format is PINT-SG; Singapore UEN-based Peppol IDs use scheme 0195.
 * FUTURE INTEGRATION: replace MockInvoiceNowProvider with an accredited Access Point provider's API.
 * Nothing is transmitted to IRAS or the Peppol network by this mock.
 */
import type { InvoiceNowDocument, InvoiceNowProvider } from "./types";

export function toPintSgLikePayload(doc: InvoiceNowDocument) {
  // A simplified, PINT-SG-shaped JSON view for review. An Access Point provider generates the real UBL XML.
  return {
    customizationId: "urn:peppol:pint:billing-1@sg-1 (indicative)",
    documentType: doc.type === "INVOICE" ? "380" : "381",
    id: doc.number,
    issueDate: doc.issueDate,
    dueDate: doc.dueDate,
    documentCurrencyCode: doc.currency,
    billingReference: doc.precedingInvoiceRef ?? undefined,
    accountingSupplierParty: { endpointId: doc.supplier.peppolId, schemeId: "0195", name: doc.supplier.name, companyId: doc.supplier.uen, taxRegistrationId: doc.supplier.gstRegNo },
    accountingCustomerParty: { endpointId: doc.buyer.peppolId, schemeId: "0195", name: doc.buyer.name },
    invoiceLines: doc.lines.map((l, i) => ({ id: i + 1, name: l.description, quantity: l.quantity, unitCode: l.unitCode, priceAmount: l.unitPrice, lineExtensionAmount: l.lineTotal, taxCategory: l.taxCategory, taxPercent: l.taxPct })),
    legalMonetaryTotal: { taxExclusiveAmount: doc.subtotal, taxAmount: doc.taxTotal, payableAmount: doc.total },
  };
}

class MockInvoiceNowProvider implements InvoiceNowProvider {
  kind = "INVOICENOW";
  provider = "Mock InvoiceNow provider";
  status = "MOCK" as const;
  description = "Builds a PINT-SG-shaped payload for review. Does NOT transmit to the Peppol network or IRAS.";
  note = "FUTURE INTEGRATION: connect an IMDA-accredited Access Point provider.";
  async transmit(doc: InvoiceNowDocument) {
    return { status: "MOCK_TRANSMITTED" as const, messageId: `mock-peppol-${crypto.randomUUID()}`, payload: toPintSgLikePayload(doc) };
  }
}

export const getInvoiceNow = (): InvoiceNowProvider => new MockInvoiceNowProvider();
