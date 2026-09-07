import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { isCheckoutReady, loadActiveCatalog, PAYABLE_KINDS } from "@/lib/commerce/catalog";

export const dynamic = "force-dynamic";

/**
 * Admin diagnostic: which active, checkoutable catalog rows are not yet
 * ready for a QuickBooks invoice (missing Item mapping or undecided tax
 * treatment). Reports keys and names only — no accounting identifiers,
 * account numbers, or item costs — and is never reachable by customers.
 */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const catalog = await loadActiveCatalog();
  const payable = catalog.filter((c) => PAYABLE_KINDS.has(c.commerce_kind));
  const rows = payable.map((c) => {
    const { ready, missing } = isCheckoutReady(c);
    return { catalog_key: c.catalog_key, name: c.name, commerce_kind: c.commerce_kind, ready, missing };
  });
  return NextResponse.json({
    total_payable: rows.length,
    ready: rows.filter((r) => r.ready).length,
    not_ready: rows.filter((r) => !r.ready),
    note: "Set qb_item_id to the QuickBooks Item id and tax_treatment to qbo_automated or exempt on each row; Vinnie checkout stays blocked for any payable line that is not ready.",
  });
}
