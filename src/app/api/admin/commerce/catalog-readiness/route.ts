import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { buildReadinessReport, loadKeyedCatalog } from "@/lib/commerce/catalogReadiness";
import { vinnieQuickBooksGate } from "@/lib/commerce/quickbooksAdapter";

export const dynamic = "force-dynamic";

/**
 * Administrator readiness report for all twelve approved catalog records:
 * key, actual vs approved price, active state, behavior, agreement,
 * freight relationship, QuickBooks mapping and tax treatment presence,
 * and the ready/not-ready reason. Never reachable by customers; reads
 * Supabase only.
 */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const report = buildReadinessReport(await loadKeyedCatalog());
  const gate = vinnieQuickBooksGate();
  return NextResponse.json({ ...report, quickbooks_lookup: { available: gate.allowed, reason: gate.reason } });
}
