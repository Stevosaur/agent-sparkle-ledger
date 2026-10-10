/**
 * Brand and product configuration. Rename the product here (name, plus tier, domain) — nothing else
 * in the codebase hard-codes the brand.
 */
export const site = {
  name: "Plotline",
  plusName: "Plotline+",
  tagline: "Every Singapore home sale, turned into answers.",
  description:
    "Free Singapore property research: HDB resale, condo and landed transaction records, valuations, affordability and mortgage calculators, rankings and market insights.",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")).replace(/\/$/, ""),
  locale: "en-SG",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "hello@example.com",
  /** WhatsApp number in international format without "+", e.g. 6591234567. Empty disables WhatsApp links. */
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "",
  plus: {
    monthlyPrice: Number(process.env.NEXT_PUBLIC_PLUS_MONTHLY_PRICE ?? 49),
    yearlyPrice: Number(process.env.NEXT_PUBLIC_PLUS_YEARLY_PRICE ?? 499),
    currency: "SGD",
    trialDays: Number(process.env.NEXT_PUBLIC_PLUS_TRIAL_DAYS ?? 7),
  },
  /** free accounts can track this many homes on /my-property/ */
  freeTrackedHomes: 1,
} as const;

export type NavItem = { href: string; labelKey: string; label: string };

export const primaryNav: NavItem[] = [
  { href: "/valuation/", labelKey: "nav.valuation", label: "Valuation" },
  { href: "/listings/", labelKey: "nav.newLaunches", label: "New launches" },
  { href: "/lists/", labelKey: "nav.lists", label: "Rankings" },
  { href: "/insights/", labelKey: "nav.insights", label: "Insights" },
  { href: "/affordability/", labelKey: "nav.affordability", label: "Affordability" },
  { href: "/mortgage-rates/", labelKey: "nav.mortgage", label: "Mortgage rates" },
  { href: "/news/", labelKey: "nav.news", label: "News" },
];

export const bottomTabs: NavItem[] = [
  { href: "/", labelKey: "tabs.home", label: "Home" },
  { href: "/map/", labelKey: "tabs.map", label: "Map" },
  { href: "/spot/", labelKey: "tabs.spot", label: "Spot" },
  { href: "/my-property/", labelKey: "tabs.myProperty", label: "My Property" },
  { href: "/profile/", labelKey: "tabs.profile", label: "Profile" },
];

/** The eight tool tiles on the home page. */
export const toolTiles: { href: string; labelKey: string; label: string; descKey: string; desc: string; icon: string }[] = [
  { href: "/valuation/", labelKey: "tools.valuation", label: "Valuation", descKey: "tools.valuationDesc", desc: "What is my home worth?", icon: "Gauge" },
  { href: "/property-analysis/", labelKey: "tools.analysis", label: "Property analysis", descKey: "tools.analysisDesc", desc: "Sales, rents and context for any address", icon: "Search" },
  { href: "/affordability/", labelKey: "tools.affordability", label: "Affordability", descKey: "tools.affordabilityDesc", desc: "What can I buy?", icon: "Wallet" },
  { href: "/mortgage-rates/", labelKey: "tools.mortgage", label: "Mortgage rates", descKey: "tools.mortgageDesc", desc: "SORA, HDB rate and repayments", icon: "Percent" },
  { href: "/lists/", labelKey: "tools.lists", label: "Rankings", descKey: "tools.listsDesc", desc: "Top yields, growth and value", icon: "Trophy" },
  { href: "/compare/", labelKey: "tools.compare", label: "Compare", descKey: "tools.compareDesc", desc: "Side-by-side properties", icon: "Columns2" },
  { href: "/map/", labelKey: "tools.map", label: "Map", descKey: "tools.mapDesc", desc: "Launches and MRT lines", icon: "Map" },
  { href: "/insights/", labelKey: "tools.insights", label: "Insights", descKey: "tools.insightsDesc", desc: "Market trends and trend builder", icon: "LineChart" },
];
