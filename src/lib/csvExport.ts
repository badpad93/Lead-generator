/**
 * CSV export — client-side. Takes a list of rows + column definitions
 * and downloads a CSV file. Zero external dependencies. Excel opens
 * CSV directly, so the downloaded file works both as a Google Sheets
 * import and as an email attachment for team members.
 *
 * Deliberately client-side and READ-ONLY — no server round-trip means
 * no chance of accidental data mutation from a report action. The
 * caller passes rows already loaded on the page (respecting any
 * active filters), so the report matches what the user sees.
 */

export interface Column<T> {
  header: string;
  /** Extract the raw value from a row. Return primitive, Date, or null. */
  value: (row: T) => string | number | boolean | Date | null | undefined;
}

/**
 * Escape a single field per RFC 4180: wrap in double quotes if it
 * contains a quote, comma, or newline; escape embedded quotes by
 * doubling them.
 */
function escapeField(v: unknown): string {
  if (v == null) return "";
  let s: string;
  if (v instanceof Date) {
    s = isNaN(v.getTime()) ? "" : v.toISOString();
  } else if (typeof v === "boolean") {
    s = v ? "true" : "false";
  } else {
    s = String(v);
  }
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build a CSV string from rows + column defs. Prepends a BOM so Excel
 * opens UTF-8 with the correct encoding out of the box (otherwise
 * accented characters + emoji show as mojibake on Windows Excel).
 */
export function buildCsv<T>(rows: T[], columns: Column<T>[]): string {
  const header = columns.map((c) => escapeField(c.header)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => escapeField(c.value(row))).join(","),
  );
  return "﻿" + [header, ...body].join("\r\n");
}

/**
 * Trigger a browser download of the given CSV. Fires and returns
 * immediately; the download prompt is native.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}

/**
 * Convenience: build + download in one call. Includes an ISO-date
 * stamp in the filename so multiple exports don't overwrite each
 * other in the downloads folder.
 */
export function exportRowsToCsv<T>(args: {
  filename: string;
  rows: T[];
  columns: Column<T>[];
}): void {
  const csv = buildCsv(args.rows, args.columns);
  const stamp = new Date().toISOString().slice(0, 10);
  const name = args.filename.replace(/\.csv$/i, "");
  downloadCsv(`${name}_${stamp}.csv`, csv);
}
