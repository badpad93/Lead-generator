/**
 * Spreadsheet export — client-side XLSX with CSV fallback.
 *
 * Tries to produce a real .xlsx via `write-excel-file/browser`. If that
 * path fails for ANY reason (bundler quirk, popup blocker, unhandled
 * lib exception), we fall through to a plain CSV built with a manual
 * Blob + anchor-click download. CSV opens cleanly in Excel (with UTF-8
 * BOM) and Google Sheets (File → Import), so the button always
 * produces a downloadable report — no silent failures.
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
 * Simple RFC-4180 CSV escape: wrap in quotes if the value contains
 * comma / quote / newline; double any embedded quotes.
 */
function csvEscape(v: string | number | boolean | Date | null): string {
  if (v == null) return "";
  let s: string;
  if (v instanceof Date) {
    s = v.toISOString().slice(0, 10);
  } else {
    s = String(v);
  }
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Fallback: build a UTF-8 CSV Blob and trigger a download via a
 * temporary anchor. Prepends BOM so Excel opens UTF-8 correctly.
 * Runs entirely synchronously — no dynamic imports, no browser APIs
 * beyond Blob/URL/anchor, all of which are universally available.
 */
function downloadAsCsv<T>(fileNameBase: string, rows: T[], columns: Column<T>[]): void {
  const headerLine = columns.map((c) => csvEscape(c.header)).join(",");
  const dataLines = rows.map((row) =>
    columns.map((c) => csvEscape(normalizeValue(c.value(row)))).join(",")
  );
  const csv = "﻿" + [headerLine, ...dataLines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = `${fileNameBase}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    if (a.parentNode) a.parentNode.removeChild(a);
  }, 100);
}

/**
 * Export rows to a downloadable spreadsheet. Function name kept as
 * exportRowsToCsv for backward compatibility with existing callers.
 * Tries .xlsx first, falls back to .csv so a click NEVER produces
 * nothing.
 */
export async function exportRowsToCsv<T>(args: {
  filename: string;
  rows: T[];
  columns: Column<T>[];
}): Promise<void> {
  console.log("[export] click received, rows=", args.rows.length);

  if (args.rows.length === 0) {
    alert("No rows to export with current filters.");
    return;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${args.filename.replace(/\.(csv|xlsx)$/i, "")}_${stamp}`;

  // Try XLSX path first.
  try {
    console.log("[export] attempting xlsx via write-excel-file/browser");
    const mod = await import("write-excel-file/browser");
    const writeXlsxFile = mod.default;

    const typeCtorFor: Record<CellType, StringConstructor | NumberConstructor | DateConstructor | BooleanConstructor> = {
      String,
      Number,
      Date,
      Boolean,
    };

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = writeXlsxFile(args.rows as any, { columns: columns as any });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (result as any).toFile(`${base}.xlsx`);
    console.log("[export] xlsx download triggered");
    return;
  } catch (err) {
    // Log and fall through to CSV so the user still gets a file.
    console.warn("[export] xlsx path failed, falling back to CSV:", err);
  }

  // Fallback: plain CSV.
  try {
    downloadAsCsv(base, args.rows, args.columns);
    console.log("[export] csv download triggered");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[export] csv fallback also failed:", err);
    alert(`Export failed: ${message}`);
  }
}
