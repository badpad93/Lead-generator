"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileInput } from "lucide-react";

/**
 * Renders workflow.metadata.source_intake as a labeled key-value list
 * so anyone opening a workflow sees exactly what the customer submitted
 * on the origin form — without clicking back to the source table.
 *
 * Handles nested groups (e.g. coffee's { agreement, application }) by
 * rendering each subsection as its own group inside the panel. Skips
 * empty values entirely.
 *
 * Used by both /sales/workflows/[id] and /account/workflows/[id]. On
 * the customer view: pass `customerSafe` to hide financing background
 * flags and other staff-only fields.
 */
export function SourceIntakePanel({
  intake,
  customerSafe = false,
}: {
  intake: unknown;
  customerSafe?: boolean;
}) {
  const [open, setOpen] = useState(true);

  if (!isNonEmptyObject(intake)) return null;

  const groups = normalizeIntake(intake, customerSafe);
  if (groups.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full p-5 border-b border-gray-100 flex items-center gap-2 text-left hover:bg-gray-50 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-500" />
        )}
        <FileInput className="h-4 w-4 text-gray-500" />
        <h2 className="text-base font-semibold text-gray-900">Source Intake</h2>
        <span className="text-xs text-gray-500 ml-2">— as submitted by customer</span>
      </button>
      {open && (
        <div className="p-5 space-y-5">
          {groups.map((group) => (
            <div key={group.title}>
              {group.title !== "_root" && (
                <h3 className="text-xs uppercase tracking-wide font-semibold text-gray-500 mb-2">
                  {humanize(group.title)}
                </h3>
              )}
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {group.entries.map(({ key, value }) => (
                  <div key={key} className="flex gap-2">
                    <dt className="text-gray-500 shrink-0">{humanize(key)}:</dt>
                    <dd className="text-gray-900 font-medium break-words">{formatValue(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

// Fields that should never render on the customer view — background
// flags on financing applications, internal source ids, etc.
const CUSTOMER_HIDE = new Set([
  "has_verifiable_income", "has_tax_liens", "has_bankruptcy",
  "has_judgments", "has_felony", "has_legal_actions", "has_federal_debt",
  "agreed_provide_docs", "agreed_accurate_info",
  "credit_score_range", "net_worth_range", "annual_income",
  "citizenship_status", "date_of_birth",
  "operator_id", "user_id", "account_id", "created_by",
  "source_agreement", "marketplace_contract_id",
]);

interface Group {
  title: string;
  entries: { key: string; value: unknown }[];
}

function normalizeIntake(intake: unknown, customerSafe: boolean): Group[] {
  if (!isNonEmptyObject(intake)) return [];

  // Split top-level keys into "primitive/simple" (become _root group)
  // and "nested object" (become their own group).
  const rootEntries: { key: string; value: unknown }[] = [];
  const subGroups: Group[] = [];

  for (const [k, v] of Object.entries(intake)) {
    if (customerSafe && CUSTOMER_HIDE.has(k)) continue;
    if (isNonEmptyObject(v) && !Array.isArray(v)) {
      const subEntries = Object.entries(v as Record<string, unknown>)
        .filter(([sk]) => !(customerSafe && CUSTOMER_HIDE.has(sk)))
        .filter(([, sv]) => !isEmpty(sv))
        .map(([sk, sv]) => ({ key: sk, value: sv }));
      if (subEntries.length > 0) subGroups.push({ title: k, entries: subEntries });
    } else if (!isEmpty(v)) {
      rootEntries.push({ key: k, value: v });
    }
  }

  const groups: Group[] = [];
  if (rootEntries.length > 0) groups.push({ title: "_root", entries: rootEntries });
  groups.push(...subGroups);
  return groups;
}

function isNonEmptyObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && Object.keys(v).length > 0;
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (v === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

function humanize(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bZip\b/, "ZIP")
    .replace(/\bLlc\b/, "LLC")
    .replace(/\bId\b/, "ID")
    .replace(/\bUrl\b/, "URL");
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    // ISO timestamp — show date + short time
    try {
      return new Date(v).toLocaleString("en-US", {
        year: "numeric", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit",
      });
    } catch {
      return v;
    }
  }
  return String(v);
}
