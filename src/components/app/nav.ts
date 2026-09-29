import type { Permission } from "@/lib/auth/rbac";

export type NavItem = { href: string; label: string; perm?: Permission };
export type NavGroup = { label: string; icon: string; perm?: Permission; items: NavItem[] };

export const NAV: NavGroup[] = [
  { label: "Dashboard", icon: "LayoutDashboard", items: [{ href: "/dashboard", label: "Dashboard" }] },
  { label: "Tonight's Market", icon: "Activity", perm: "market.view", items: [{ href: "/market", label: "Tonight's Market" }] },
  {
    label: "Supply", icon: "Ship", perm: "supply.view",
    items: [
      { href: "/supply/expected", label: "Expected Catch" },
      { href: "/supply/lots", label: "Available Lots" },
      { href: "/supply/intake", label: "Catch Intake", perm: "supply.write" },
      { href: "/supply/inventory", label: "Inventory" },
    ],
  },
  {
    label: "Demand", icon: "ShoppingBasket", perm: "demand.view",
    items: [
      { href: "/demand/requirements", label: "Buyer Requirements" },
      { href: "/demand/forecast", label: "Forecast" },
      { href: "/demand/standing-orders", label: "Standing Orders" },
    ],
  },
  {
    label: "Procurement", icon: "Scale", perm: "procurement.view",
    items: [
      { href: "/procurement/recommendations", label: "Recommendations" },
      { href: "/procurement/rfqs", label: "RFQs" },
      { href: "/procurement/purchase-orders", label: "Purchase Orders" },
      { href: "/procurement/allocations", label: "Allocations" },
    ],
  },
  {
    label: "Vendors", icon: "Anchor", perm: "vendors.view",
    items: [
      { href: "/vendors", label: "Directory" },
      { href: "/vendors/performance", label: "Performance" },
      { href: "/vendors/documents", label: "Documentation" },
    ],
  },
  { label: "Orders", icon: "ClipboardList", perm: "orders.view", items: [{ href: "/orders", label: "Orders" }] },
  {
    label: "Operations", icon: "Truck", perm: "ops.view",
    items: [
      { href: "/operations/receiving", label: "Receiving" },
      { href: "/operations/picking", label: "Picking & Packing" },
      { href: "/operations/dispatch", label: "Dispatch" },
      { href: "/operations/routes", label: "Routes" },
    ],
  },
  {
    label: "Traceability", icon: "GitBranch", perm: "trace.view",
    items: [
      { href: "/trace", label: "Lot Explorer" },
      { href: "/trace/recall", label: "Recall" },
    ],
  },
  {
    label: "Finance", icon: "Receipt", perm: "finance.view",
    items: [
      { href: "/finance/bills", label: "Bills" },
      { href: "/finance/invoices", label: "Invoices" },
      { href: "/finance/reconciliation", label: "Reconciliation" },
    ],
  },
  {
    label: "AI Operations", icon: "Sparkles", perm: "ai.view",
    items: [
      { href: "/ai/activity", label: "Agent Activity" },
      { href: "/ai/approvals", label: "Approvals" },
      { href: "/ai/exceptions", label: "Exceptions" },
    ],
  },
  { label: "Reports", icon: "BarChart3", perm: "reports.view", items: [{ href: "/reports", label: "Reports" }] },
  {
    label: "Settings", icon: "Settings",
    items: [
      { href: "/settings", label: "Organisation", perm: "settings.manage" },
      { href: "/settings/species", label: "Species Master" },
      { href: "/settings/integrations", label: "Integrations" },
      { href: "/settings/automation", label: "Automation Rules" },
      { href: "/demo", label: "Demo Guide" },
    ],
  },
];
