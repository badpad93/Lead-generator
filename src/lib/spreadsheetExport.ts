/**
 * Spreadsheet export — client-side .xlsx generation.
 *
 * Produces a real Excel file that opens cleanly in Excel (no Import
 * Wizard) and Google Sheets (via File → Import). Column types are
 * preserved: dates render as dates, numbers as numbers, text as text.
 *
 * READ-ONLY guarantee: caller passes rows already loaded on the page
 * (respecting active filters); helper writes a file to the browser's
 * download folder; nothing round-trips to the server; no possibility
 * of data mutation.
 */

export interface Column<T> {
  header: string;
  /** Extract the raw value from a row. */
  value: (row: T) => string | number | boolean | Date | null | undefined;
  /** Optional explicit column type. Inferred from data when omitted. */
  type?: "String" | "Number" | "Date" | "Boolean";
  /** Optional column width in Excel character units. */
  width?: number;
}

type CellType = "String" | "Number" | "Date" | "Boolean";

function inferType<T>(column: Column<T>, rows: T[]): CellType {
  if (column.type) return column.type;
  let allDate = true, allNumber = true, allBool = true, anyValue = false;
  for (const row of rows) {
    const v = column.value(row);
    if (v == null || (typeof v === "string" && v.trim() === "")) continue;
    anyValue = true;
    if (!(v instanceof Date)) allDate = false;
    if (typeof v !== "number") allNumber = false;
    if (typeof v !== "boolean") allBool = false;
  }
  if (!anyValue) return "String";
  if (allDate) return "Date";
  if (allNumber) return "Number";
  if (allBool) return "Boolean";
  return "String";
}

function normalizeValue(v: unknown): string | number | boolean | Date | null {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v;
  return String(v);
}

/**
 * Export rows to a downloadable .xlsx file. Function name kept as
 * exportRowsToCsv for backward compatibility with existing callers —
 * it produces an .xlsx now, not a CSV.
 *
 * Throws with a visible alert on failure so users don't stare at a
 * button that seems to do nothing when something goes wrong upstream
 * (bad data shape, missing browser API, etc).
 */
export async function exportRowsToCsv<T>(args: {
  filename: string;
  rows: T[];
  columns: Column<T>[];
}): Promise<void> {
  try {
    const stamp = new Date().toISOString().slice(0, 10);
    const base = args.filename.replace(/\.(csv|xlsx)$/i, "");
    const fileName = `${base}_${stamp}.xlsx`;

    if (args.rows.length === 0) {
      alert("No rows to export with current filters.");
      return;
    }

    // Dynamic import — client-only lib; keep out of the SSR bundle.
    const writeXlsxFile = (await import("write-excel-file/browser")).default;

    // Pre-compute type per column so every cell in that column gets
    // the same Excel type constructor.
    const typeCtorFor: Record<CellType, StringConstructor | NumberConstructor | DateConstructor | BooleanConstructor> = {
      String,
      Number,
      Date,
      Boolean,
    };

    // v4 column shape:
    //   { header, cell: (row) => ({ value, type }), width? }
    // NOT the v3 shape (`column`, `value: fn`) — v3 syntax silently
    // produces an empty spreadsheet with no error.
    const columns = args.columns.map((c) => {
      const t = inferType(c, args.rows);
      const TypeCtor = typeCtorFor[t];
      return {
        header: c.header,
        width: c.width,
        cell: (row: T) => {
          const v = normalizeValue(c.value(row));
          if (v == null) return { value: null };
          return { value: v, type: TypeCtor };
        },
      };
    });

    // v4 API: writeXlsxFile(objects, { columns }).toFile(fileName)
    // The library handles the browser download automatically.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = writeXlsxFile(args.rows as any, { columns: columns as any });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (result as any).toFile(fileName);
  } catch (err) {
    // Fail loud rather than silent — a swallowed export bug is worse
    // than a scary popup.
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[exportRowsToCsv] failed:", err);
    alert(`Export failed: ${message}`);
  }
}
