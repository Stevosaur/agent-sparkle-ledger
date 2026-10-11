import "server-only";
import { getHdbBlock } from "@/lib/data/hdb";
import { getLandedAddress, getLandedStreet, getLaunches, getProject } from "@/lib/data/private";
import { resolveProperty } from "@/lib/data/resolve";
import type { TxSummary } from "@/lib/data/types";
import type { PropertyRef } from "@/lib/property-ref";
import { absoluteUrl } from "@/lib/seo";
import type { PropertyActivity } from "./alerts-math";

function fromTx(label: string, href: string, tx: TxSummary): PropertyActivity {
  return { label, url: absoluteUrl(href), kind: "sale", month: tx.last, lastPrice: tx.lastPrice, unitsSold: null, totalUnits: null };
}

/**
 * Latest recorded activity for an alertable property: the property's tx.last (HDB block, condo project,
 * landed address or street) or, for a new launch, the latest month in its sales reports.
 * Null when the property is not in the dataset.
 */
export function getPropertyActivity(ref: PropertyRef): PropertyActivity | null {
  const resolved = resolveProperty(ref);
  if (!resolved) return null;
  const { label, href } = resolved;
  switch (ref.kind) {
    case "hdb": {
      const b = getHdbBlock(ref.slug);
      return b ? fromTx(label, href, b.tx) : null;
    }
    case "condo": {
      const p = getProject(ref.slug);
      return p ? fromTx(label, href, p.tx) : null;
    }
    case "landed": {
      const a = getLandedAddress(ref.slug);
      return a ? fromTx(label, href, a.tx) : null;
    }
    case "landed-street": {
      const s = getLandedStreet(ref.slug);
      return s ? fromTx(label, href, s.tx) : null;
    }
    case "launch": {
      const type = resolved.ref.launchType;
      const l = getLaunches().find((x) => x.slug === ref.slug && x.type === type);
      if (!l) return null;
      let month: string | null = null;
      for (const p of l.sales) if (!month || p.month > month) month = p.month;
      return { label, url: absoluteUrl(href), kind: "launch", month, lastPrice: null, unitsSold: l.unitsSold, totalUnits: l.totalUnits };
    }
  }
}
