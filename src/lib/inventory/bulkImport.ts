/**
 * Bulk import of physical counts from CSV.
 *
 * Two modes: "preview" returns the parsed + validated rows without
 * writing anything; "commit" runs each valid row through the Phase 1
 * ledger (postPhysicalCount) inside its own try/catch so a single
 * bad row doesn't sink the whole batch.
 *
 * Expected CSV columns (headers on row 1, case-insensitive):
 *   sku_code         required
 *   warehouse_code   required
 *   counted_qty      required, numeric ≥ 0
 *   notes            optional
 *
 * Excel isn't parsed directly — Excel users do File → Save As → CSV
 * and upload that. Adding native .xlsx would only bring a heavy
 * dependency for a workflow every admin already knows.
 */

import { supabaseAdmin } from "../supabaseAdmin";
import { postPhysicalCount } from "./ledger";

export interface ParsedRow {
  line_number: number;      // 1-based, matches source file
  sku_code: string;
  warehouse_code: string;
  counted_qty: number;
  notes: string | null;
}

export interface RowError {
  line_number: number;
  raw: Record<string, string>;
  errors: string[];
}

export interface PreviewResult {
  mode: "preview";
  total_rows: number;
  valid_count: number;
  invalid_rows: RowError[];
  valid_sample: ParsedRow[];  // up to 20 for UI preview
}

export interface CommitResult {
  mode: "commit";
  total_rows: number;
  saved_count: number;
  failed_rows: RowError[];
  invalid_rows: RowError[];
}

// ─── CSV parser ────────────────────────────────────────────────────

/**
 * Minimal CSV parser. Handles quoted values (with commas and escaped
 * quotes) and \r\n line endings. No external dependency.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      // Terminate the row on \n, skip lone \r or consume \r\n.
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      // Skip fully empty rows.
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  // Trailing row without a final newline.
  row.push(cell);
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

// ─── Validation ────────────────────────────────────────────────────

interface ValidationLookups {
  skuCodeToId: Map<string, string>;
  warehouseCodeToId: Map<string, string>;
}

async function loadLookups(): Promise<ValidationLookups> {
  const [{ data: skus }, { data: whs }] = await Promise.all([
    supabaseAdmin.from("inventory_skus").select("id, sku_code").eq("active", true),
    supabaseAdmin.from("warehouses").select("id, code").eq("active", true),
  ]);
  const skuMap = new Map<string, string>();
  for (const s of (skus ?? []) as Array<{ id: string; sku_code: string }>) {
    skuMap.set(s.sku_code.trim().toLowerCase(), s.id);
  }
  const whMap = new Map<string, string>();
  for (const w of (whs ?? []) as Array<{ id: string; code: string | null }>) {
    if (w.code) whMap.set(w.code.trim().toLowerCase(), w.id);
  }
  return { skuCodeToId: skuMap, warehouseCodeToId: whMap };
}

function validateRow(
  raw: Record<string, string>,
  lineNumber: number,
  lookups: ValidationLookups,
): { ok: true; parsed: ParsedRow } | { ok: false; error: RowError } {
  const errors: string[] = [];
  const sku = (raw.sku_code ?? "").trim();
  const warehouse = (raw.warehouse_code ?? "").trim();
  const qtyStr = (raw.counted_qty ?? "").trim();
  const notes = (raw.notes ?? "").trim() || null;

  if (!sku) errors.push("sku_code is required");
  else if (!lookups.skuCodeToId.has(sku.toLowerCase())) {
    errors.push(`unknown sku_code: ${sku}`);
  }
  if (!warehouse) errors.push("warehouse_code is required");
  else if (!lookups.warehouseCodeToId.has(warehouse.toLowerCase())) {
    errors.push(`unknown warehouse_code: ${warehouse}`);
  }
  if (!qtyStr) errors.push("counted_qty is required");
  const qty = Number(qtyStr);
  if (qtyStr && !Number.isFinite(qty)) errors.push(`counted_qty is not a number: ${qtyStr}`);
  if (Number.isFinite(qty) && qty < 0) errors.push(`counted_qty cannot be negative: ${qty}`);

  if (errors.length > 0) {
    return { ok: false, error: { line_number: lineNumber, raw, errors } };
  }
  return {
    ok: true,
    parsed: {
      line_number: lineNumber,
      sku_code: sku,
      warehouse_code: warehouse,
      counted_qty: qty,
      notes,
    },
  };
}

// ─── Public entry points ───────────────────────────────────────────

export async function processImport(
  csvText: string,
  mode: "preview" | "commit",
  actorId: string | null,
): Promise<PreviewResult | CommitResult> {
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    throw new Error("empty CSV");
  }
  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((h) => h.trim().toLowerCase());

  // Required columns present?
  const required = ["sku_code", "warehouse_code", "counted_qty"];
  const missing = required.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(", ")}`);
  }

  const lookups = await loadLookups();
  const parsed: ParsedRow[] = [];
  const invalid: RowError[] = [];
  const seenPairs = new Set<string>();

  dataRows.forEach((cols, idx) => {
    const raw: Record<string, string> = {};
    headers.forEach((h, colIdx) => {
      raw[h] = cols[colIdx] ?? "";
    });
    const result = validateRow(raw, idx + 2, lookups); // +2: header is line 1, first data is line 2

    if (!result.ok) {
      invalid.push(result.error);
      return;
    }

    // Duplicate SKU+warehouse check within the same file.
    const key = `${result.parsed.sku_code.toLowerCase()}::${result.parsed.warehouse_code.toLowerCase()}`;
    if (seenPairs.has(key)) {
      invalid.push({
        line_number: result.parsed.line_number,
        raw,
        errors: ["duplicate (sku_code, warehouse_code) within file"],
      });
      return;
    }
    seenPairs.add(key);
    parsed.push(result.parsed);
  });

  if (mode === "preview") {
    return {
      mode: "preview",
      total_rows: dataRows.length,
      valid_count: parsed.length,
      invalid_rows: invalid,
      valid_sample: parsed.slice(0, 20),
    };
  }

  // Commit: run every valid row through the ledger.
  const failed: RowError[] = [];
  let saved = 0;
  for (const row of parsed) {
    const skuId = lookups.skuCodeToId.get(row.sku_code.toLowerCase())!;
    const warehouseId = lookups.warehouseCodeToId.get(row.warehouse_code.toLowerCase())!;
    try {
      await postPhysicalCount({
        skuId,
        warehouseId,
        countedQty: row.counted_qty,
        countedBy: actorId,
        notes: row.notes ?? "Bulk import",
      });
      saved += 1;
    } catch (e) {
      failed.push({
        line_number: row.line_number,
        raw: {
          sku_code: row.sku_code,
          warehouse_code: row.warehouse_code,
          counted_qty: String(row.counted_qty),
          notes: row.notes ?? "",
        },
        errors: [e instanceof Error ? e.message : "unknown error"],
      });
    }
  }

  return {
    mode: "commit",
    total_rows: dataRows.length,
    saved_count: saved,
    failed_rows: failed,
    invalid_rows: invalid,
  };
}
