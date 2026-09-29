/**
 * Role-based access control. Least privilege: each role gets only the permissions its job needs.
 */
export const PERMISSIONS = [
  "market.view",
  "supply.view", "supply.write", "lots.confirm",
  "demand.view", "demand.write",
  "procurement.view", "procurement.write", "po.approve",
  "vendors.view", "vendors.write",
  "orders.view", "orders.write",
  "ops.view", "ops.receive", "ops.dispatch",
  "trace.view", "recall.manage",
  "finance.view", "finance.write", "finance.approve",
  "ai.view", "approvals.decide",
  "reports.view",
  "settings.manage", "species.manage",
  "supplier.portal",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS].filter((p) => p !== "supplier.portal") as Permission[];

export const ROLES: Record<string, { name: string; description: string; permissions: Permission[] }> = {
  OWNER: { name: "Owner", description: "Full access including settings and automation rules", permissions: ALL },
  ADMIN: { name: "Administrator / Compliance", description: "Settings, species master, vendor documentation, recall", permissions: ALL },
  PROCUREMENT: {
    name: "Procurement manager",
    description: "Supply board, demand, allocations, POs, RFQs, approvals",
    permissions: ["market.view", "supply.view", "supply.write", "lots.confirm", "demand.view", "demand.write", "procurement.view", "procurement.write", "po.approve", "vendors.view", "vendors.write", "orders.view", "orders.write", "ops.view", "trace.view", "ai.view", "approvals.decide", "reports.view", "finance.view"],
  },
  OPERATIONS: {
    name: "Operations / dispatcher",
    description: "Receiving, picking, packing, dispatch, routes",
    permissions: ["market.view", "supply.view", "supply.write", "lots.confirm", "orders.view", "ops.view", "ops.receive", "ops.dispatch", "trace.view", "vendors.view", "ai.view", "reports.view"],
  },
  FINANCE: {
    name: "Finance",
    description: "Bills, invoices, three-way matching, payments",
    permissions: ["market.view", "procurement.view", "vendors.view", "orders.view", "finance.view", "finance.write", "finance.approve", "trace.view", "ai.view", "approvals.decide", "reports.view"],
  },
  BUYER: { name: "Buyer (fishmonger)", description: "Own orders and tonight's availability", permissions: ["market.view", "orders.view", "demand.view"] },
  SUPPLIER: { name: "Supplier", description: "Declare catch, see confirmed buyers and instructions", permissions: ["supplier.portal"] },
  VIEWER: { name: "Viewer", description: "Read-only", permissions: ["market.view", "supply.view", "demand.view", "procurement.view", "vendors.view", "orders.view", "ops.view", "trace.view", "reports.view"] },
};

export function can(roleKey: string, p: Permission): boolean {
  return ROLES[roleKey]?.permissions.includes(p) ?? false;
}
