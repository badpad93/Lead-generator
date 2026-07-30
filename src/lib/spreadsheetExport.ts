/**
 * Spreadsheet export — client-side. Produces a real .xlsx file that
 * opens cleanly in Excel and Google Sheets with the right column
 * types (dates are dates, numbers are numbers, text is text) — no
 * "Import Wizard" popup, no locale weirdness.
 *
 * READ-ONLY guarantee: caller passes rows already loaded on the page
 * (respecting any active filters), the helper writes a file to the
 * browser's download folder, and nothing round-trips to the server.
 * No possibility of data mutation.
 */

export interface Column<T> {
  header: string;
  /** Extract the value from a row. Return primitive, Date, or null. */
  value: (row: T) => string | number | boolean | Date | null | undefined;
  /** Optional explicit column type — inferred from data if omitted. */
  type?: "String" | "Number" | "Date" | "Boolean";
  /** Optional column width in Excel character units. */
  width?: number;
}

/**
 * Normalize a raw value into something write-excel-file's Cell type
 * accepts. Empty strings and null both become null (blank cell) so
 * Excel doesn't show `""` in every empty slot.
 */
function normalizeValue(v: unknown): string | number | boolean | Date | null {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v;
  return String(v);
}

/**
 * Infer a column's type from its data. If every non-null value is a
 * Date, mark the column as Date so Excel formats it as a date. Same
 * for numbers and booleans. Mixed types fall through to String.
 */
function inferType(
  column: Column<unknown>,
  rows: unknown[],
): "String" | "Number" | "Date" | "Boolean" {
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

/**
 * Export rows as an .xlsx file. Function name kept as
 * exportRowsToCsv for backward compatibility with existing callers —
 * it produces an .xlsx file now, not a CSV.
 */
export async function exportRowsToCsv<T>(args: {
  filename: string;
  rows: T[];
  columns: Column<T>[];
}): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10);
  const base = args.filename.replace(/\.(csv|xlsx)$/i, "");
  const fileName = `${base}_${stamp}.xlsx`;

  // Dynamic import — the library touches browser-only APIs (Blob,
  // URL.createObjectURL); keep it out of the SSR bundle. Only loaded
  // when the user clicks Export Report.
  const writeXlsxFile = (await import("write-excel-file/browser")).default;

  // Build the schema in v4 shape: each column has { header, cell,
  // width } where `cell` returns either a primitive or a
  // {value, type} object. Wrapping the value in {value, type} tells
  // Excel to treat empty cells as blank instead of stringifying null.
  const columns = args.columns.map((c) => {
    const t = inferType(c as Column<unknown>, args.rows);
    const TypeCtor = ({ String, Number, Date, Boolean } as const)[t];
    return {
      column: c.header,
      type: TypeCtor,
      width: c.width,
      // v4 signature: cell(row, rowIndex) → Cell
      value: (row: T) => normalizeValue(c.value(row)),
    };
  });

  // v4 returns { toBlob, toFile }; call toFile with the desired name.
  // The type overload on the browser export is `SheetData` — the
  // `Object[] + { columns }` overload lives on the universal export
  // but the browser one accepts the same shape at runtime. Cast
  // through unknown to satisfy TS without a runtime change.
  await (
    writeXlsxFile(args.rows as unknown as never, {
      columns: columns as unknown as never,
    }) as unknown as { toFile: (n: string) => Promise<void> }
  ).toFile(fileName);
}
