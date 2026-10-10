"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Building, Building2, Home, X } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { SearchBox } from "@/components/search/search-box";
import { useViewer } from "@/lib/auth/viewer-context";
import { useT } from "@/lib/i18n/provider";
import { HDB_FLAT_TYPES, type SearchEntry, type SearchKind } from "@/lib/data/types";
import { titleCase } from "@/lib/slug";
import { normalizeSgPhone } from "@/lib/leads/validate";
import { placeRefFromSearch } from "@/lib/homes/fit";
import { HDB_TYPICAL_BEDROOMS, LISTING_LIMITS as L } from "@/lib/homes/constants";
import type { ListingInputField } from "@/lib/homes/listing-schema";
import type { ListingKind, ListingType } from "@/lib/homes/types";
import { cn } from "@/lib/cn";

type Field = ListingInputField | "confirm";
type Errors = Partial<Record<Field, string>>;

interface Picked {
  ref: string;
  kind: ListingKind;
  label: string;
  sub: string;
}

/** Stable reference: SearchBox re-queries when `kinds` changes. */
const LISTING_SEARCH_KINDS: SearchKind[] = ["hdb", "condo", "landed"];

const KIND_ICON: Record<ListingKind, typeof Building> = { hdb: Building, condo: Building2, landed: Home };

const ERROR_COPY: Record<Field, [string, string]> = {
  listingType: ["homes.new.err.type", "Choose sell or rent out."],
  ref: ["homes.new.err.ref", "Choose the property from the search results."],
  title: ["homes.new.err.title", "Give a title of 5 to 120 characters."],
  description: ["homes.new.err.description", "Keep the description under 4,000 characters."],
  askingPrice: ["homes.new.err.price", "Enter a sale price between S$50,000 and S$100,000,000."],
  flatType: ["homes.new.err.flatType", "Choose the HDB flat type."],
  areaSqm: ["homes.new.err.area", "Enter the area in square metres (10 to 10,000)."],
  floorLevel: ["homes.new.err.floor", "Enter a floor from 1 to 80."],
  bedrooms: ["homes.new.err.rooms", "Enter a number from 0 to 20."],
  bathrooms: ["homes.new.err.rooms", "Enter a number from 0 to 20."],
  contactName: ["homes.new.err.contactName", "Keep the name under 80 characters."],
  whatsapp: ["homes.new.err.whatsapp", "Enter a Singapore number: 8 digits starting with 3, 6, 8 or 9."],
  confirm: ["homes.new.err.confirm", "Please confirm before publishing."],
};

const ORDER: Field[] = ["listingType", "ref", "flatType", "title", "askingPrice", "areaSqm", "floorLevel", "bedrooms", "bathrooms", "description", "contactName", "whatsapp", "confirm"];

function intOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

function suggestTitle(p: Picked | null, flatType: string, type: ListingType): string {
  if (!p) return "";
  if (p.kind === "hdb" && flatType) return `${titleCase(flatType)} flat ${type === "rent" ? "for rent " : ""}at ${p.label}`;
  return `${type === "rent" ? "Home for rent" : "Home for sale"} at ${p.label}`;
}

/** Create-listing form (POST /api/homes/). Signed-in users only; the API enforces it too. */
export function NewListingForm() {
  const t = useT();
  const router = useRouter();
  const uid = useId();
  const id = (f: string) => `${uid}-${f}`;
  const { viewer, loading } = useViewer();

  const [listingType, setListingType] = useState<ListingType>("sale");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [flatType, setFlatType] = useState("");
  const [unitType, setUnitType] = useState("");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [price, setPrice] = useState("");
  const [area, setArea] = useState("");
  const [floor, setFloor] = useState("");
  const [beds, setBeds] = useState("");
  const [baths, setBaths] = useState("");
  const [description, setDescription] = useState("");
  const [contactName, setContactName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "disabled" | "signin" | "rate_limited">("idle");

  if (loading) return <div className="h-96 animate-pulse rounded-xl bg-canvas" aria-busy="true" />;
  if (viewer && !viewer.integrations.auth) {
    return (
      <Notice tone="warn" title={t("homes.new.noAuthTitle", "Listing is not available on this deployment")}>
        {t("homes.new.noAuthBody", "Creating a listing needs an account, and accounts (Supabase) are not connected on this deployment yet.")}
      </Notice>
    );
  }
  if (!viewer?.signedIn) {
    return (
      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="font-semibold text-ink">{t("homes.new.signInTitle", "Sign in to list your home")}</div>
          <p className="max-w-md text-sm text-muted">{t("homes.new.signInBody", "Listings are free. Sign in or create a free account so you can manage and close your listing later.")}</p>
          <Link href={`/login/?next=${encodeURIComponent("/homes/new/")}`} className={buttonClass("primary")}>
            {t("nav.signIn", "Sign in")}
          </Link>
        </CardBody>
      </Card>
    );
  }

  const effectiveTitle = titleTouched ? title : suggestTitle(picked, flatType, listingType);
  const isHdb = picked?.kind === "hdb";
  const isLanded = picked?.kind === "landed";

  function clear(field: Field) {
    if (errors[field]) {
      setErrors((e) => {
        const n = { ...e };
        delete n[field];
        return n;
      });
    }
  }

  function errorText(field: Field): string | null {
    if (!errors[field]) return null;
    if (field === "askingPrice" && listingType === "rent") return t("homes.new.err.rent", "Enter a monthly rent between S$300 and S$100,000.");
    if (field === "ref" && errors.ref === "unknown") return t("homes.new.err.refUnknown", "We could not find that property. Choose it again from the search results.");
    if (field === "areaSqm" && errors.areaSqm === "required") return t("homes.new.err.areaRequired", "Floor area is needed for condos so we can show a fair-value range.");
    const [k, fb] = ERROR_COPY[field];
    return t(k, fb);
  }

  function err(field: Field): ReactNode {
    const text = errorText(field);
    return text ? (
      <p id={id(`${field}-error`)} className="text-xs font-medium text-down">
        {text}
      </p>
    ) : null;
  }

  function a11y(field: Field) {
    return { "aria-invalid": errors[field] ? true : undefined, "aria-describedby": errors[field] ? id(`${field}-error`) : undefined } as const;
  }

  function validate(): Errors {
    const e: Errors = {};
    if (!picked) e.ref = "required";
    if (isHdb && !flatType) e.flatType = "required";
    const tt = effectiveTitle.trim();
    if (tt.length < 5 || tt.length > L.title) e.title = "invalid";
    const p = Number(price.replace(/[,\s]/g, ""));
    const [minP, maxP] = listingType === "sale" ? [L.minSalePrice, L.maxSalePrice] : [L.minRent, L.maxRent];
    if (!Number.isFinite(p) || p < minP || p > maxP) e.askingPrice = "out_of_range";
    const a = intOrNull(area);
    if (a == null ? picked?.kind === "condo" : Number.isNaN(a) || a < L.minAreaSqm || a > L.maxAreaSqm) e.areaSqm = a == null ? "required" : "out_of_range";
    const fl = intOrNull(floor);
    if (fl != null && (!Number.isInteger(fl) || fl < 1 || fl > L.maxFloor)) e.floorLevel = "out_of_range";
    for (const [v, f] of [
      [beds, "bedrooms"],
      [baths, "bathrooms"],
    ] as const) {
      const n = intOrNull(v);
      if (n != null && (!Number.isInteger(n) || n < 0 || n > L.maxRooms)) e[f] = "out_of_range";
    }
    if (description.length > L.description) e.description = "too_long";
    if (contactName.length > L.contactName) e.contactName = "too_long";
    if (whatsapp.trim() && !normalizeSgPhone(whatsapp)) e.whatsapp = "invalid";
    if (!confirm) e.confirm = "required";
    return e;
  }

  function focusFirst(e: Errors) {
    const first = ORDER.find((f) => e[f]);
    if (first) document.getElementById(id(first))?.focus();
  }

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (status === "submitting") return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return focusFirst(e);
    setStatus("submitting");
    try {
      const res = await fetch("/api/homes/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          listingType,
          ref: picked!.ref,
          title: effectiveTitle.trim(),
          description: description.trim() || undefined,
          askingPrice: Number(price.replace(/[,\s]/g, "")),
          flatType: isHdb ? flatType : unitType.trim() || undefined,
          areaSqm: area.trim() || undefined,
          floorLevel: isLanded ? undefined : floor.trim() || undefined,
          bedrooms: beds.trim() || undefined,
          bathrooms: baths.trim() || undefined,
          contactName: contactName.trim() || undefined,
          whatsapp: whatsapp.trim() || undefined,
        }),
      });
      const body = (await res.json().catch(() => null)) as { id?: string; fields?: Errors } | null;
      if (res.status === 201 && body?.id) {
        router.push(`/homes/${body.id}/`);
        return;
      }
      if (res.status === 400 && body?.fields) {
        setErrors(body.fields);
        setStatus("idle");
        focusFirst(body.fields);
        return;
      }
      setStatus(res.status === 401 ? "signin" : res.status === 503 ? "disabled" : res.status === 429 ? "rate_limited" : "error");
    } catch {
      setStatus("error");
    }
  }

  const PickedIcon = picked ? KIND_ICON[picked.kind] : Building;

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardBody className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">{t("homes.new.typeLegend", "I want to")}</legend>
            <div className="flex flex-wrap gap-2" id={id("listingType")} tabIndex={-1}>
              {(["sale", "rent"] as const).map((v) => (
                <label key={v} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", listingType === v ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line bg-surface text-ink")}>
                  <input type="radio" name="listingType" value={v} checked={listingType === v} onChange={() => setListingType(v)} className="accent-brand-700" />
                  {v === "sale" ? t("homes.new.sell", "Sell") : t("homes.new.rentOut", "Rent out")}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <span id={id("ref-label")} className="block text-sm font-medium text-ink">
              {t("homes.new.property", "Property")}
            </span>
            {picked ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas px-3 py-2" id={id("ref")} tabIndex={-1} aria-labelledby={id("ref-label")}>
                <span className="flex min-w-0 items-center gap-2">
                  <PickedIcon className="size-4 shrink-0 text-brand-700" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{picked.label}</span>
                    <span className="block truncate text-xs text-muted">{picked.sub}</span>
                  </span>
                </span>
                <button type="button" onClick={() => setPicked(null)} className={buttonClass("ghost", "sm")} aria-label={t("homes.new.changeProperty", "Change property")}>
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ) : (
              <div id={id("ref")} tabIndex={-1}>
                <SearchBox
                  kinds={LISTING_SEARCH_KINDS}
                  placeholder={t("homes.new.propertyPlaceholder", "Search your block, condo or landed address")}
                  onSelect={(entry: SearchEntry) => {
                    const ref = placeRefFromSearch(entry);
                    const kind = ref?.split(":")[0] as ListingKind | undefined;
                    if (ref && (kind === "hdb" || kind === "condo" || kind === "landed")) {
                      setPicked({ ref, kind, label: entry.label, sub: entry.sub });
                      clear("ref");
                    }
                  }}
                />
              </div>
            )}
            <p className="text-xs text-muted">{t("homes.new.propertyHint", "Pick the exact HDB block, condo or landed address; postal codes work too.")}</p>
            {err("ref")}
          </div>

          {isHdb ? (
            <div className="space-y-1.5">
              <label htmlFor={id("flatType")} className="block text-sm font-medium text-ink">
                {t("homes.new.flatType", "HDB flat type")}
              </label>
              <Select
                id={id("flatType")}
                value={flatType}
                onChange={(e) => {
                  setFlatType(e.target.value);
                  clear("flatType");
                  if (!beds && HDB_TYPICAL_BEDROOMS[e.target.value] != null) setBeds(String(HDB_TYPICAL_BEDROOMS[e.target.value]));
                }}
                {...a11y("flatType")}
              >
                <option value="">{t("homes.new.chooseFlatType", "Choose flat type")}</option>
                {HDB_FLAT_TYPES.map((ft) => (
                  <option key={ft} value={ft}>
                    {titleCase(ft)}
                  </option>
                ))}
              </Select>
              {err("flatType")}
            </div>
          ) : picked ? (
            <div className="space-y-1.5">
              <label htmlFor={id("unitType")} className="block text-sm font-medium text-ink">
                {t("homes.new.unitType", "Unit type (optional)")}
              </label>
              <Input id={id("unitType")} value={unitType} maxLength={40} placeholder={t("homes.new.unitTypePlaceholder", "e.g. 2-bedroom + study, penthouse, corner terrace")} onChange={(e) => setUnitType(e.target.value)} />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor={id("title")} className="block text-sm font-medium text-ink">
              {t("homes.new.title", "Listing title")}
            </label>
            <Input
              id={id("title")}
              value={effectiveTitle}
              maxLength={L.title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
                clear("title");
              }}
              {...a11y("title")}
            />
            {err("title")}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor={id("askingPrice")} className="block text-sm font-medium text-ink">
                {listingType === "sale" ? t("homes.new.price", "Asking price (S$)") : t("homes.new.rent", "Monthly rent (S$)")}
              </label>
              <Input
                id={id("askingPrice")}
                inputMode="numeric"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value.replace(/[^\d,]/g, ""));
                  clear("askingPrice");
                }}
                {...a11y("askingPrice")}
              />
              {err("askingPrice")}
            </div>
            <div className="space-y-1.5">
              <label htmlFor={id("areaSqm")} className="block text-sm font-medium text-ink">
                {isLanded ? t("homes.new.landArea", "Land area (sqm)") : t("homes.new.area", "Floor area (sqm)")}
                {picked?.kind === "condo" ? null : <span className="font-normal text-muted"> {t("homes.new.optional", "(optional)")}</span>}
              </label>
              <Input
                id={id("areaSqm")}
                inputMode="decimal"
                value={area}
                onChange={(e) => {
                  setArea(e.target.value.replace(/[^\d.]/g, ""));
                  clear("areaSqm");
                }}
                {...a11y("areaSqm")}
              />
              {err("areaSqm")}
            </div>
          </div>

          <div className={cn("grid gap-4", isLanded ? "grid-cols-2" : "grid-cols-3")}>
            {isLanded ? null : (
              <div className="space-y-1.5">
                <label htmlFor={id("floorLevel")} className="block text-sm font-medium text-ink">
                  {t("homes.new.floor", "Floor")}
                </label>
                <Input id={id("floorLevel")} inputMode="numeric" value={floor} onChange={(e) => (setFloor(e.target.value.replace(/\D/g, "")), clear("floorLevel"))} {...a11y("floorLevel")} />
                {err("floorLevel")}
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor={id("bedrooms")} className="block text-sm font-medium text-ink">
                {t("homes.new.beds", "Bedrooms")}
              </label>
              <Input id={id("bedrooms")} inputMode="numeric" value={beds} onChange={(e) => (setBeds(e.target.value.replace(/\D/g, "")), clear("bedrooms"))} {...a11y("bedrooms")} />
              {err("bedrooms")}
            </div>
            <div className="space-y-1.5">
              <label htmlFor={id("bathrooms")} className="block text-sm font-medium text-ink">
                {t("homes.new.baths", "Bathrooms")}
              </label>
              <Input id={id("bathrooms")} inputMode="numeric" value={baths} onChange={(e) => (setBaths(e.target.value.replace(/\D/g, "")), clear("bathrooms"))} {...a11y("bathrooms")} />
              {err("bathrooms")}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={id("description")} className="block text-sm font-medium text-ink">
              {t("homes.new.description", "Description (optional)")}
            </label>
            <Textarea id={id("description")} rows={6} maxLength={L.description} value={description} onChange={(e) => (setDescription(e.target.value), clear("description"))} {...a11y("description")} />
            <p className="tabular text-right text-xs text-muted">
              {description.length}/{L.description}
            </p>
            {err("description")}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor={id("contactName")} className="block text-sm font-medium text-ink">
                {t("homes.new.contactName", "Contact name (optional)")}
              </label>
              <Input id={id("contactName")} autoComplete="name" maxLength={L.contactName} value={contactName} onChange={(e) => (setContactName(e.target.value), clear("contactName"))} {...a11y("contactName")} />
              {err("contactName")}
            </div>
            <div className="space-y-1.5">
              <label htmlFor={id("whatsapp")} className="block text-sm font-medium text-ink">
                {t("homes.new.whatsapp", "WhatsApp number (optional)")}
              </label>
              <Input id={id("whatsapp")} type="tel" inputMode="tel" autoComplete="tel" placeholder="9123 4567" value={whatsapp} onChange={(e) => (setWhatsapp(e.target.value), clear("whatsapp"))} {...a11y("whatsapp")} />
              {err("whatsapp")}
            </div>
          </div>
          <p className="text-xs text-muted">{t("homes.new.contactHint", "Your contact name and WhatsApp number are shown on the listing so people can message you. Without a WhatsApp number, enquiries reach you through us.")}</p>
          <div className="space-y-1.5">
            <div className="flex items-start gap-3">
              <input id={id("confirm")} type="checkbox" checked={confirm} onChange={(e) => (setConfirm(e.target.checked), clear("confirm"))} className="mt-0.5 size-4 shrink-0 accent-brand-700" {...a11y("confirm")} />
              <label htmlFor={id("confirm")} className="text-sm text-ink">
                {t("homes.new.confirm", "I am the owner, or authorised by the owner, and the details are accurate. I understand the listing is public until I close it.")}
              </label>
            </div>
            {err("confirm")}
          </div>

          {status === "signin" ? (
            <Notice tone="warn">{t("homes.new.sessionExpired", "Your session has expired. Sign in again and resubmit.")}</Notice>
          ) : status === "disabled" ? (
            <Notice tone="warn">{t("homes.new.disabled", "Listings are not connected on this deployment, so the listing was not saved.")}</Notice>
          ) : status === "rate_limited" ? (
            <Notice tone="warn">{t("homes.new.rateLimited", "You have created many listings today. Please try again tomorrow.")}</Notice>
          ) : status === "error" ? (
            <p role="alert" className="text-sm font-medium text-down">
              {t("homes.new.error", "We could not save your listing. Please try again.")}
            </p>
          ) : null}
          {Object.keys(errors).length ? (
            <p role="alert" className="text-sm font-medium text-down">
              {t("homes.lead.fixErrors", "Please fix the highlighted fields.")}
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={status === "submitting"} className="w-full sm:w-auto">
            {status === "submitting" ? t("homes.new.publishing", "Publishing…") : t("homes.new.publish", "Publish listing")}
          </Button>
        </CardBody>
      </Card>
    </form>
  );
}
