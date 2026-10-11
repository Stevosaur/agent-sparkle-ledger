import type { PropertyKind } from "@/lib/property-ref";
import type { AlertChannel, AlertKind } from "./refs";

/** JSON shapes returned by the account route handlers (client-safe: types only). */

export interface WatchlistItem {
  ref: string;
  /** current name from the dataset, or the label saved with the item when the property is no longer listed */
  label: string;
  /** property page, or null when the property is no longer in the dataset */
  href: string | null;
  createdAt: string;
}

export interface WatchlistResponse {
  items: WatchlistItem[];
  max: number;
}

export type EstimateMethod = "block-flat-type-median" | "town-flat-type-median" | "project-median-psf" | "street-median-psf";

export type EstimateUnavailableReason =
  /** the property is no longer in the dataset */
  | "not-found"
  /** no private transactions are loaded on this deployment (URA key missing) */
  | "no-private-data"
  /** no recorded sales to base an estimate on */
  | "no-sales"
  /** a floor area is needed (condo / landed) */
  | "needs-area"
  /** an HDB flat type is needed */
  | "needs-flat-type"
  /**
   * beyond the account's tracked-homes limit (e.g. a lapsed Plus subscriber keeping more homes than a free
   * account may track): the estimate is withheld until the account has "tracking.unlimited" again
   */
  | "over-limit"
  | "unsupported";

export interface EstimatePoint {
  /** month index (months since 1990-01) of the middle month of the quarter */
  x: number;
  /** estimated value, SGD */
  y: number;
  /** number of sales the quarter's median is based on */
  n: number;
}

export interface HomeGain {
  amount: number;
  /** fraction, e.g. 0.12 = +12% */
  pct: number;
  /** compound annual growth since the purchase month (fraction), null when held < 12 months or month unknown */
  annualised: number | null;
}

export type HomeEstimate =
  | {
      status: "ok";
      method: EstimateMethod;
      /** flat type (HDB) the medians are for */
      flatType: string | null;
      /** area (sqm) the psf medians are multiplied by (condo / landed) */
      areaSqm: number | null;
      /** quarterly series, oldest first */
      series: EstimatePoint[];
      latest: { value: number; monthIndex: number; quarter: string; sales: number };
      gain: HomeGain | null;
    }
  | { status: "unavailable"; reason: EstimateUnavailableReason };

export interface TrackedHomeView {
  id: number;
  ref: string;
  kind: PropertyKind;
  label: string;
  href: string | null;
  flatType: string | null;
  areaSqm: number | null;
  floor: number | null;
  purchasePrice: number | null;
  purchaseMonth: string | null;
  createdAt: string;
  estimate: HomeEstimate;
}

export interface TrackedLimitInfo {
  /** how many homes this account may track */
  max: number;
  used: number;
  /** true when the account has "tracking.unlimited" */
  unlimited: boolean;
  /** homes a free account can track */
  freeLimit: number;
}

export interface TrackedListResponse {
  items: TrackedHomeView[];
  limit: TrackedLimitInfo;
}

export interface AlertView {
  id: number;
  ref: string;
  label: string;
  href: string | null;
  kind: AlertKind;
  channel: AlertChannel;
  active: boolean;
  lastCheckedMonth: string | null;
  createdAt: string;
}

export interface TelegramStatus {
  /** bot token + username configured on this deployment */
  configured: boolean;
  linked: boolean;
}

export interface AlertsListResponse {
  items: AlertView[];
  max: number;
  telegram: TelegramStatus;
}
