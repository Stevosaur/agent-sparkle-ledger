import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/table";
import { T } from "@/components/i18n/t";
import { formatInt, formatMonth, formatPsf, formatSgd } from "@/lib/format";
import { displayAddress, type SaleRow } from "@/lib/private-insights";

const SALE_TYPE_KEYS: Record<SaleRow["typeOfSale"], string> = {
  "New Sale": "private.sales.typeNew",
  "Sub Sale": "private.sales.typeSub",
  Resale: "private.sales.typeResale",
};

function SaleType({ value }: { value: SaleRow["typeOfSale"] }) {
  return <T k={SALE_TYPE_KEYS[value]} fallback={value} />;
}

function Price({ row }: { row: SaleRow }) {
  return (
    <>
      {formatSgd(row.price)}
      {row.units > 1 ? (
        <span className="block text-xs text-muted">
          <T k="private.sales.bulk" fallback="{n} units (bulk)" vars={{ n: row.units }} />
        </span>
      ) : null}
    </>
  );
}

/**
 * Sales table for private property. `variant="condo"` shows floor range (and unit when recorded);
 * `variant="landed"` shows the address (linked to its page when one exists) and land area.
 */
export function SalesTable({ rows, variant, showAddress = true }: { rows: SaleRow[]; variant: "condo" | "landed"; showAddress?: boolean }) {
  const cols: Column<SaleRow>[] = [{ key: "month", header: <T k="private.sales.month" fallback="Month" />, cell: (r) => formatMonth(r.month) }];
  if (variant === "condo") {
    cols.push({
      key: "floor",
      header: <T k="private.sales.floor" fallback="Floor" />,
      cell: (r) => (
        <>
          {r.floorRange === "-" ? "—" : r.floorRange}
          {r.unit ? <span className="block text-xs text-muted">{r.unit}</span> : null}
        </>
      ),
    });
  } else if (showAddress) {
    cols.push({
      key: "address",
      header: <T k="private.sales.address" fallback="Address" />,
      cell: (r) =>
        r.address ? (
          r.addressSlug ? (
            <Link href={`/landed/${r.addressSlug}/`} className="text-brand-700 hover:underline">
              {displayAddress(r.address)}
            </Link>
          ) : (
            displayAddress(r.address)
          )
        ) : (
          <span className="text-muted">
            <T k="private.sales.noAddress" fallback="Not published" />
          </span>
        ),
    });
  }
  if (variant === "landed") {
    cols.push({ key: "type", header: <T k="private.sales.propertyType" fallback="Type" />, cell: (r) => r.propertyType });
  }
  cols.push(
    {
      key: "area",
      header: variant === "landed" ? <T k="private.sales.landArea" fallback="Land area" /> : <T k="private.sales.area" fallback="Area" />,
      align: "right",
      cell: (r) => (
        <>
          {formatInt(r.areaSqft)} sqft
          <span className="block text-xs text-muted">{formatInt(Math.round(r.areaSqm))} sqm</span>
        </>
      ),
    },
    { key: "price", header: <T k="private.sales.price" fallback="Price" />, align: "right", cell: (r) => <Price row={r} /> },
    {
      key: "psf",
      header: variant === "landed" ? <T k="private.sales.landPsf" fallback="Land psf" /> : <T k="private.sales.psf" fallback="PSF" />,
      align: "right",
      cell: (r) => formatPsf(r.psf),
    },
    { key: "saleType", header: <T k="private.sales.saleType" fallback="Sale type" />, cell: (r) => <SaleType value={r.typeOfSale} /> },
  );
  return <DataTable columns={cols} rows={rows} rowKey={(r, i) => `${r.month}-${r.price}-${i}`} empty={<T k="private.sales.none" fallback="No sales recorded." />} />;
}
