/**
 * Government permits, accounting and payment adapters.
 *
 * IMPORTANT: PasarCatch has NO direct integration with SFA, TradeNet, GoBusiness or Singapore Customs.
 * VERIFIED FACT (Singapore Customs, see docs/research-notes.md): permits are submitted via TradeNet through a
 * declaring agent / approved front-end software; there is no open public API. References are therefore
 * entered manually and stored with integrationMode = MANUAL.
 */
import type { AccountingProvider, GovernmentPermitProvider, PaymentProvider } from "./types";

class ManualPermitProvider implements GovernmentPermitProvider {
  kind = "GOVERNMENT_PERMITS";
  provider = "Manual reference entry";
  status = "NOT_CONNECTED" as const;
  description = "SFA licences, CCP/TradeNet permit numbers and health certificates are entered and uploaded manually.";
  note = "MANUAL / FUTURE INTEGRATION — no government system is queried.";
  checkReference(kind: "CCP" | "TRADENET" | "SFA_LICENCE" | "HEALTH_CERT" | "CATCH_CERT", ref: string) {
    const r = ref.trim();
    const formatOk = r.length >= 5 && r.length <= 40 && /^[A-Za-z0-9/-]+$/.test(r);
    return {
      mode: "MANUAL" as const,
      formatOk,
      message: formatOk
        ? `${kind} reference recorded. Format looks plausible; validity has NOT been verified with any government system.`
        : `${kind} reference format looks unusual — please double-check against the source document.`,
    };
  }
}

class MockAccounting implements AccountingProvider {
  kind = "ACCOUNTING";
  provider = "CSV journal export";
  status = "MOCK" as const;
  description = "Exports journals as CSV. Xero/QuickBooks connectors are future integrations.";
  async exportJournal(entries: { date: string; account: string; debit: string; credit: string; memo: string }[]) {
    const csv = ["date,account,debit,credit,memo", ...entries.map((e) => [e.date, e.account, e.debit, e.credit, `"${e.memo.replace(/"/g, "'")}"`].join(","))].join("\n");
    return { status: "MOCK_EXPORTED" as const, csv };
  }
}

class MockPayments implements PaymentProvider {
  kind = "PAYMENTS";
  provider = "Manual payment recording";
  status = "MOCK" as const;
  description = "Payments (PayNow/GIRO/bank transfer) are recorded manually; no funds move.";
  async recordPayout(p: { reference: string }) {
    return { status: "MOCK_RECORDED" as const, reference: p.reference };
  }
}

export const getPermits = (): GovernmentPermitProvider => new ManualPermitProvider();
export const getAccounting = (): AccountingProvider => new MockAccounting();
export const getPayments = (): PaymentProvider => new MockPayments();
