import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { processImport } from "@/lib/inventory/bulkImport";

/**
 * POST /api/admin/inventory/import
 *
 * Multipart body: { file: CSV, mode: "preview" | "commit" }
 * Preview validates and returns the row-level breakdown without
 * writing anything. Commit runs each valid row through the ledger's
 * postPhysicalCount() so every count becomes an auditable physical_
 * counts + count_adjustment pair.
 *
 * Expected CSV columns (headers row 1, case-insensitive):
 *   sku_code, warehouse_code, counted_qty, notes (optional)
 */

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const file = form.get("file");
  const modeRaw = form.get("mode");
  const mode = modeRaw === "commit" ? "commit" : "preview";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "file is empty" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `file exceeds ${MAX_BYTES / 1024 / 1024}MB` }, { status: 413 });
  }

  const text = await file.text();
  try {
    const result = await processImport(text, mode, adminId);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "import failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
