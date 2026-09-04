"use client";

import { ScrollText } from "lucide-react";

/**
 * Source-order context panels for the agreement editor — ported from
 * the retired order-scoped editor when agreements consolidated onto
 * the /sales/agreements rails.
 *
 *   1. Line-item snapshot: every order_items row captured verbatim at
 *      agreement creation. The legacy scalar columns (machine_quantity,
 *      equipment_subtotal, freight_*) are computed from these lines —
 *      this table is the authoritative record of what the agreement
 *      was generated from.
 *   2. Coffee-supply gate: surfaces the Equipment Loan & Beverage
 *      Supply Agreement requirement when the source order includes a
 *      real coffee_program (brewer) line, with the SPECIFIC template
 *      version snapshot the customer signs for.
 *
 * All fields are nullable — standalone/placement agreements and rows
 * created before migration 176 render nothing here.
 */

export interface SnapshotLine {
  item_type: string | null;
  service_name: string | null;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  discount_percent: number | null;
  total_price: number | null;
  deposit_required: boolean | null;
  location_deposit_amount: number | null;
  location_service_price: number | null;
  product_id: string | null;
}

export interface CoffeeSupplySnapshot {
  template_id: string;
  agreement_type: string;
  version: number;
  title: string;
  content_html: string;
  content_hash: string | null;
  effective_date: string | null;
  captured_at: string;
}

export default function SourceOrderPanels({
  lineItems,
  coffeeSupplyRequired,
  coffeeSupplySnapshot,
}: {
  lineItems: SnapshotLine[] | null | undefined;
  coffeeSupplyRequired: boolean | null | undefined;
  coffeeSupplySnapshot: CoffeeSupplySnapshot | null | undefined;
}) {
  return (
    <>
      {lineItems && lineItems.length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Source-order line items ({lineItems.length})
            </h3>
            <span className="text-xs text-gray-500">
              Snapshot from the order at agreement creation. Legacy scalar
              columns are computed from these lines.
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 uppercase tracking-wide">
                  <th className="py-2 text-left font-medium">Type</th>
                  <th className="py-2 text-left font-medium">Item</th>
                  <th className="py-2 text-right font-medium">Qty</th>
                  <th className="py-2 text-right font-medium">Unit</th>
                  <th className="py-2 text-right font-medium">Discount</th>
                  <th className="py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((line, idx) => (
                  <tr key={idx} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 pr-4 text-gray-500 font-mono text-[10px] uppercase">
                      {line.item_type ?? "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="text-gray-900">{line.service_name ?? "—"}</div>
                      {line.description ? (
                        <div className="text-[10px] text-gray-500 truncate max-w-xs">
                          {line.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4 text-right text-gray-700">
                      {line.quantity ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-right text-gray-700">
                      {line.unit_price != null
                        ? `$${Number(line.unit_price).toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right text-gray-700">
                      {line.discount_percent != null && line.discount_percent > 0
                        ? `${line.discount_percent}%`
                        : "—"}
                    </td>
                    <td className="py-2 text-right text-gray-900 font-medium">
                      {line.total_price != null
                        ? `$${Number(line.total_price).toFixed(2)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {coffeeSupplyRequired && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <ScrollText className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-900">
                Includes Equipment Loan &amp; Beverage Supply Agreement
              </h3>
              <p className="text-xs text-amber-800 mt-1">
                This order contains a coffee brewer line item. The customer&apos;s
                signature on this purchase agreement covers the terms of the
                Equipment Loan &amp; Beverage Supply Agreement shown below.
                {coffeeSupplySnapshot ? (
                  <>
                    {" "}
                    Version <strong>{coffeeSupplySnapshot.version}</strong>{" "}
                    (effective {coffeeSupplySnapshot.effective_date ?? "—"}),
                    captured{" "}
                    {new Date(coffeeSupplySnapshot.captured_at).toLocaleDateString()}
                    .
                  </>
                ) : (
                  <>
                    {" "}
                    <span className="font-semibold text-red-700">
                      No active coffee_supply template was found at creation
                      time — the supply agreement text could not be snapshot.
                      Admin action required.
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
          {coffeeSupplySnapshot ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-amber-900 hover:underline">
                Show full agreement text
              </summary>
              <div
                className="mt-3 rounded border border-amber-200 bg-white p-4 text-xs text-gray-800 max-h-96 overflow-y-auto prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: coffeeSupplySnapshot.content_html }}
              />
            </details>
          ) : null}
        </div>
      )}
    </>
  );
}
