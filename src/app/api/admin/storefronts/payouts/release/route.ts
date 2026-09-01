import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  markCommissionsScheduled,
  markCommissionsPaid,
} from "@/lib/storefront/commissions";
import { findOrCreateVendor, createBill } from "@/lib/quickbooks";
import { resolveTenantById } from "@/lib/storefront/tenants";

/**
 * Admin: bundle every payable commission row for a tenant into a
 * QBO Bill (Vendor = the operator) and mark them 'scheduled'. Then
 * the QB Bill Pay run happens outside — a separate webhook (or the
 * admin marking paid here) transitions rows to 'paid'.
 *
 * POST { tenant_id }        — payable -> scheduled + QB Bill
 * POST { tenant_id, mark_paid_qb_bill_payment_id: "..." }
 *                            — scheduled -> paid
 */
export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    tenant_id?: string;
    mark_paid_qb_bill_payment_id?: string;
  };
  if (!body.tenant_id) {
    return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
  }
  const tenant = await resolveTenantById(body.tenant_id);
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  // Mark-paid branch: caller has a QB Bill Payment id from QB Bill Pay
  // and wants to close out scheduled rows.
  if (body.mark_paid_qb_bill_payment_id) {
    const { data: scheduled } = await supabaseAdmin
      .from("storefront_commission_ledger")
      .select("id")
      .eq("tenant_id", body.tenant_id)
      .eq("status", "scheduled");
    const rowIds = ((scheduled ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (rowIds.length === 0) {
      return NextResponse.json({ ok: true, paid_rows: 0 });
    }
    await markCommissionsPaid({
      rowIds,
      qbBillPaymentId: body.mark_paid_qb_bill_payment_id,
      actorId: adminId,
      tenantId: body.tenant_id,
    });
    return NextResponse.json({ ok: true, paid_rows: rowIds.length });
  }

  // Schedule branch: payable -> scheduled + create a QB Bill.
  const { data: payable } = await supabaseAdmin
    .from("storefront_commission_ledger")
    .select("id, commission_amount, coffee_order_id, coffee_order_item_id")
    .eq("tenant_id", body.tenant_id)
    .eq("status", "payable");
  const rows = (payable ?? []) as Array<{
    id: string;
    commission_amount: number;
    coffee_order_id: string;
    coffee_order_item_id: string;
  }>;
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, scheduled_rows: 0 });
  }

  // Find/create vendor, create bill.
  const vendor = await findOrCreateVendor({
    displayName: tenant.legal_name,
    email: tenant.primary_contact_email ?? undefined,
    phone: tenant.primary_contact_phone ?? undefined,
    notes: `Storefront tenant ${tenant.slug}`,
  });
  const total = rows.reduce((acc, r) => acc + Number(r.commission_amount), 0);
  const bill = await createBill({
    vendorId: vendor.Id,
    lineItems: [
      {
        description: `Storefront commission payout — ${tenant.display_name} (${rows.length} lines, batch by admin)`,
        amount: Number(total.toFixed(2)),
      },
    ],
    privateNote: `storefront_payout tenant:${tenant.slug} rows:${rows.length}`,
  });
  await markCommissionsScheduled({
    rowIds: rows.map((r) => r.id),
    qbBillId: bill.Id,
    actorId: adminId,
    tenantId: body.tenant_id,
  });
  return NextResponse.json({ ok: true, scheduled_rows: rows.length, qb_bill_id: bill.Id });
}
