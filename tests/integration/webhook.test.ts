import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyMetaSignature } from "@/lib/integrations/messaging";
import { validateUpload } from "@/lib/integrations/storage";
import { toPintSgLikePayload } from "@/lib/integrations/invoicenow";
import { getPermits } from "@/lib/integrations/other";

describe("integration adapters", () => {
  it("validates Meta X-Hub-Signature-256 and rejects tampering", () => {
    const body = JSON.stringify({ entry: [] });
    const sig = "sha256=" + createHmac("sha256", "app-secret").update(body).digest("hex");
    expect(verifyMetaSignature(body, sig, "app-secret")).toBe(true);
    expect(verifyMetaSignature(body + " ", sig, "app-secret")).toBe(false);
    expect(verifyMetaSignature(body, sig, "other-secret")).toBe(false);
    expect(verifyMetaSignature(body, null, "app-secret")).toBe(false);
  });

  it("only accepts allow-listed uploads verified by magic bytes", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0]);
    expect(validateUpload(png, "image/png").ok).toBe(true);
    const html = new TextEncoder().encode("<html><script>alert(1)</script>");
    expect(validateUpload(html, "image/png").ok).toBe(false);
  });

  it("builds a PINT-SG-shaped payload without claiming transmission", () => {
    const p = toPintSgLikePayload({ type: "INVOICE", number: "INV-1", issueDate: "2026-09-30", dueDate: null, currency: "SGD", supplier: { name: "S", uen: "X", gstRegNo: null, peppolId: "0195:SGX" }, buyer: { name: "B", peppolId: null }, lines: [], subtotal: "10.00", taxTotal: "0.90", total: "10.90" });
    expect(p.documentType).toBe("380");
    expect(p.accountingSupplierParty.schemeId).toBe("0195");
  });

  it("government permit references are manual only", () => {
    const r = getPermits().checkReference("CCP", "DEMO-CCP-0001");
    expect(r.mode).toBe("MANUAL");
    expect(r.message).toMatch(/NOT been verified/);
  });
});
