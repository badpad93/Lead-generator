"use client";

import { Fragment, type ReactNode } from "react";
import {
  buildAgreement,
  type ClauseBlock,
  type ClauseTableKey,
  type ClauseValues,
  type NumberedClause,
} from "@/lib/agreements/clauses";
import { initialsKeyFor, type AgreementSectionId } from "@/lib/agreements/sections";

/**
 * Renders the machine-purchase agreement's numbered sections and
 * schedules from the single canonical content source
 * (src/lib/agreements/clauses.ts). Both the customer signing page and
 * the CRM preview use this, so the substantive language they show is
 * identical to each other and to the executed PDF — none of them author
 * contract terms.
 *
 * Presentation-only concerns stay with the caller: the preamble/parties
 * block, the signature block, and — via `renderInitials` — how an
 * initials-required clause captures or displays initials (an interactive
 * field on the signing page, a static placeholder in the preview).
 */

export interface SnapshotLineLike {
  service_name?: string | null;
  description?: string | null;
  category?: string;
  quantity?: number | null;
  unit_price?: number | null;
  discount_percent?: number | null;
  total_price?: number | null;
  deferred?: boolean | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  equipment: "Equipment",
  location_services: "Location Services",
  coffee: "Coffee Program",
  freight: "Shipping & Freight",
  financing: "Financing",
  other: "Other",
};

function money(n: unknown): string {
  const v = Number(n);
  return `$${(Number.isFinite(v) ? v : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/* ---- data tables (same values everywhere; styling is presentational) ---- */

function InfoGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
            <p className="font-semibold text-gray-900">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineItemsTable({ lines, values }: { lines: SnapshotLineLike[]; values: ClauseValues }) {
  if (lines.length === 0) {
    return (
      <InfoGrid
        rows={[
          ["Machine Model", values.model],
          ["Quantity", String(values.qty)],
          ["Unit Price", values.unitPrice],
        ]}
      />
    );
  }
  return (
    <div className="mt-3 rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-gray-700">Item</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-700">Category</th>
              <th className="text-center px-3 py-2 font-semibold text-gray-700">Qty</th>
              <th className="text-right px-3 py-2 font-semibold text-gray-700">Unit Price</th>
              <th className="text-right px-3 py-2 font-semibold text-gray-700">Disc</th>
              <th className="text-right px-3 py-2 font-semibold text-gray-700">Line Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-gray-800">
                  {l.service_name || "Item"}
                  {l.description ? <span className="block text-xs text-gray-400">{l.description}</span> : null}
                  {l.deferred ? (
                    <span className="block text-xs text-gray-400 italic">
                      Invoiced on fulfillment — not included in the amount due prior to procurement
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-gray-500">{CATEGORY_LABEL[l.category ?? "other"] ?? "Other"}</td>
                <td className="px-3 py-2 text-center text-gray-700">{l.quantity ?? 1}</td>
                <td className="px-3 py-2 text-right text-gray-700">{money(l.unit_price)}</td>
                <td className="px-3 py-2 text-right text-gray-500">
                  {Number(l.discount_percent) > 0 ? `${Number(l.discount_percent)}%` : "—"}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-gray-900">{money(l.total_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClauseTable({
  table,
  values,
  lines,
}: {
  table: ClauseTableKey;
  values: ClauseValues;
  lines: SnapshotLineLike[];
}) {
  switch (table) {
    case "equipment":
      return (
        <InfoGrid
          rows={[
            ["Model", values.model],
            ["Quantity", String(values.qty)],
            ["Unit Price", values.unitPrice],
            ["Equipment Subtotal", values.subtotal],
          ]}
        />
      );
    case "freight": {
      const rows: Array<[string, string]> = [
        ["Freight Rate", `${values.freightPerMachine} / machine`],
        [`Total Freight (${values.qty} machine${values.qty !== 1 ? "s" : ""})`, values.freightTotal],
      ];
      if (values.hasStorageFee) {
        rows.push(["Storage Fee", `${values.storageFee} / machine / month`]);
        rows.push([
          "Free Storage Period",
          `${values.freeStorageMonths} month${values.freeStorageMonths !== 1 ? "s" : ""}`,
        ]);
      }
      return <InfoGrid rows={rows} />;
    }
    case "location":
      return (
        <InfoGrid
          rows={[
            ["Locations Purchased", String(values.locations)],
            ["Fee Per Secured Location", values.locationFee],
            ["Maximum Service Value", values.maxLocationValue],
          ]}
        />
      );
    case "storage":
      return (
        <InfoGrid
          rows={[
            ["Storage Fee", `${values.storageFee} / machine / month`],
            [
              "Free Storage Period",
              `${values.freeStorageMonths} month${values.freeStorageMonths !== 1 ? "s" : ""}`,
            ],
          ]}
        />
      );
    case "payment":
      return (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between">
            <span className="font-medium text-green-900">Total Due Prior to Procurement</span>
            <span className="text-2xl font-bold text-green-700">{values.totalDue}</span>
          </div>
          {values.depositOnly && (
            <p className="mt-2 text-xs text-green-700 italic">
              + {values.locationBalance} Location Services balance due upon fulfillment of secured locations
            </p>
          )}
        </div>
      );
    case "line_items":
      return <LineItemsTable lines={lines} values={values} />;
    default:
      return null;
  }
}

function Blocks({
  blocks,
  values,
  lines,
}: {
  blocks: ClauseBlock[];
  values: ClauseValues;
  lines: SnapshotLineLike[];
}) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === "table") {
          return <ClauseTable key={i} table={b.table} values={values} lines={lines} />;
        }
        return (
          <p key={i} className={`${i === 0 ? "" : "mt-3"}${b.caps ? " uppercase" : ""}`}>
            {b.label ? <strong>{b.label}</strong> : null}
            {b.label ? " " : null}
            {b.text}
          </p>
        );
      })}
    </>
  );
}

export interface AgreementBodyProps {
  /** The purchase_agreements row (or a form/preview shim with the same
   *  column names). Drives inclusion, numbering and clause values. */
  source: Record<string, unknown>;
  /** The order line-item snapshot for Schedule A (defaults to
   *  source.line_items_snapshot). */
  lines?: SnapshotLineLike[];
  /** Render the initials UI for a clause that requires it, given its
   *  stored initials key. Signing page returns an interactive field;
   *  preview returns a static placeholder; omit to render nothing. */
  renderInitials?: (initialsKey: string) => ReactNode;
}

function clauseInitialsKey(c: NumberedClause): string | undefined {
  if (c.isSchedule) return c.initialsKey;
  return c.sectionId ? initialsKeyFor(c.sectionId as AgreementSectionId) : undefined;
}

export default function AgreementBody({ source, lines, renderInitials }: AgreementBodyProps) {
  const built = buildAgreement(source);
  let snapshotLines: SnapshotLineLike[] = [];
  if (Array.isArray(lines)) {
    snapshotLines = lines;
  } else if (Array.isArray(source.line_items_snapshot)) {
    snapshotLines = source.line_items_snapshot as SnapshotLineLike[];
  }

  const renderClause = (c: NumberedClause) => {
    const key = clauseInitialsKey(c);
    return (
      <div key={c.id} className={c.isSchedule ? "mt-8" : ""}>
        {c.isSchedule ? (
          <h2 className="text-xl font-bold text-gray-900 mb-1">{c.title}</h2>
        ) : (
          <div className="border-b border-gray-100 pb-1 pt-4">
            <h2 className="text-lg font-bold text-gray-900">
              Section {c.displayNumber} &mdash; {c.title}
            </h2>
          </div>
        )}
        {c.requiresInitials && (
          <p className="text-xs font-medium text-green-600 uppercase tracking-wider mt-0.5 mb-2">
            Requires Initials
          </p>
        )}
        <div className={c.isSchedule ? "" : "mt-2"}>
          <Blocks blocks={c.blocks} values={built.values} lines={snapshotLines} />
        </div>
        {c.requiresInitials && key && renderInitials ? (
          <Fragment>{renderInitials(key)}</Fragment>
        ) : null}
      </div>
    );
  };

  return (
    <>
      {built.sections.map(renderClause)}
      {built.schedules.map(renderClause)}
    </>
  );
}
