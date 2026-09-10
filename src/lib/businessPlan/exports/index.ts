import type { SectionContext } from "../sections";
import type { PlanRow } from "../store";
import { buildDocx, DOCX_CONTENT_TYPE } from "./docx";
import { buildPlanDocument, exportFilename, type PlanDocument } from "./document";
import { buildPdf, PDF_CONTENT_TYPE } from "./pdf";
import { buildXlsx, XLSX_CONTENT_TYPE } from "./xlsx";

/**
 * Export provider boundary.
 *
 * A provider turns the canonical PlanDocument into bytes for one format.
 * The three file providers below run entirely on the server with no
 * external calls. Google Docs and Google Sheets are deliberately NOT
 * providers yet: the repository's Google OAuth is an admin-only token
 * with spreadsheets and drive.file scopes for internal sheets, and
 * exporting a customer's plan into their own Google account would need a
 * customer-facing OAuth consent flow and scopes this PR does not add.
 * Until that exists, customers upload the .docx/.xlsx files to Google.
 */
export type ExportFormat = "xlsx" | "docx" | "pdf";
export const EXPORT_FORMATS: readonly ExportFormat[] = ["xlsx", "docx", "pdf"];

export interface ExportProvider {
  format: ExportFormat;
  contentType: string;
  render(doc: PlanDocument): Promise<Uint8Array>;
}

export const FILE_PROVIDERS: Record<ExportFormat, ExportProvider> = {
  xlsx: { format: "xlsx", contentType: XLSX_CONTENT_TYPE, render: async (d) => buildXlsx(d) },
  docx: { format: "docx", contentType: DOCX_CONTENT_TYPE, render: async (d) => buildDocx(d) },
  pdf: { format: "pdf", contentType: PDF_CONTENT_TYPE, render: (d) => buildPdf(d) },
};

export function isExportFormat(v: unknown): v is ExportFormat {
  return typeof v === "string" && (EXPORT_FORMATS as readonly string[]).includes(v);
}

export interface RenderedExport {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

export async function renderPlanExport(plan: PlanRow, format: ExportFormat, ctx: SectionContext, now: Date = new Date()): Promise<RenderedExport> {
  const doc = buildPlanDocument(plan, ctx, now);
  const provider = FILE_PROVIDERS[format];
  return { filename: exportFilename(plan, format), contentType: provider.contentType, bytes: await provider.render(doc) };
}

export { buildPlanDocument, exportFilename };
