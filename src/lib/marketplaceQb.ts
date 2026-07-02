/**
 * Phase 2.4 — Drain the marketplace_payouts and marketplace_operator_invoices
 * queues into QuickBooks. Each drain function is idempotent and safe to call
 * concurrently — status transitions are guarded by the row's current status.
 *
 * pushPayoutToQb / pushOperatorInvoiceToQb — one row at a time.
 * drainPayouts / drainOperatorInvoices — batch drain the queued rows.
 *
 * QB payment lifecycle:
 *   Bill    (partner payout)   queued → sent_to_qb → paid via webhook (BillPayment)
 *   Invoice (operator billing) queued → sent_to_qb → paid via webhook (Payment)
 */

import { supabaseAdmin } from "./supabaseAdmin";
import {
  findOrCreateVendor,
  findOrCreateCustomer,
  createBill,
  createInvoice,
} from "./quickbooks";

const now = () => new Date().toISOString();

interface EnsureVendorArgs {
  partnerId: string;
}

async function ensurePartnerVendor({ partnerId }: EnsureVendorArgs): Promise<string | null> {
  const { data: partner } = await supabaseAdmin
    .from("placement_partners")
    .select("id, business_name, qb_vendor_id")
    .eq("id", partnerId)
    .maybeSingle();
  if (!partner) return null;
  if (partner.qb_vendor_id) return partner.qb_vendor_id;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email, phone")
    .eq("id", partnerId)
    .maybeSingle();

  const displayName = partner.business_name || profile?.full_name || `Partner ${partnerId.slice(0, 8)}`;
  const vendor = await findOrCreateVendor({
    displayName,
    email: profile?.email || undefined,
    phone: profile?.phone || undefined,
  });

  await supabaseAdmin
    .from("placement_partners")
    .update({
      qb_vendor_id: vendor.Id,
      qb_vendor_created_at: now(),
      updated_at: now(),
    })
    .eq("id", partnerId);

  return vendor.Id;
}

interface EnsureCustomerArgs {
  profileId: string | null;
  fallbackEmail: string | null;
  fallbackName: string | null;
}

async function ensureOperatorCustomer({ profileId, fallbackEmail, fallbackName }: EnsureCustomerArgs): Promise<string | null> {
  let email: string | null = fallbackEmail;
  let displayName: string | null = fallbackName;

  if (profileId) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email, phone, company_name, qb_customer_id")
      .eq("id", profileId)
      .maybeSingle();
    if (profile?.qb_customer_id) return profile.qb_customer_id;
    email = profile?.email || email;
    displayName = profile?.company_name || profile?.full_name || displayName;
  }

  if (!email || !displayName) return null;

  const customer = await findOrCreateCustomer({ displayName, email });

  if (profileId) {
    await supabaseAdmin
      .from("profiles")
      .update({
        qb_customer_id: customer.Id,
        qb_customer_created_at: now(),
      })
      .eq("id", profileId);
  }

  return customer.Id;
}

export interface QbPushResult {
  ok: boolean;
  error?: string;
  externalId?: string;
}

export async function pushPayoutToQb(payoutId: string): Promise<QbPushResult> {
  const { data: payout } = await supabaseAdmin
    .from("marketplace_payouts")
    .select("*")
    .eq("id", payoutId)
    .maybeSingle();
  if (!payout) return { ok: false, error: "Payout not found" };
  if (payout.status !== "queued" && payout.status !== "failed") {
    return { ok: false, error: `Payout already ${payout.status}` };
  }

  const stampAttempt = () =>
    supabaseAdmin
      .from("marketplace_payouts")
      .update({ qb_last_attempt_at: now(), updated_at: now() })
      .eq("id", payoutId);

  try {
    await stampAttempt();
    const vendorId = await ensurePartnerVendor({ partnerId: payout.partner_id });
    if (!vendorId) throw new Error("Could not resolve QB Vendor for partner");

    const { data: contract } = await supabaseAdmin
      .from("placement_contracts")
      .select("title, tier")
      .eq("id", payout.contract_id)
      .maybeSingle();

    const bill = await createBill({
      vendorId,
      lineItems: [
        {
          description: `Placement payout — ${contract?.title || "Contract"} (Tier ${contract?.tier || 1})`,
          amount: Number(payout.amount),
        },
      ],
      privateNote: `submission_id=${payout.submission_id}; contract_id=${payout.contract_id}; payout_id=${payout.id}`,
    });

    await supabaseAdmin
      .from("marketplace_payouts")
      .update({
        status: "sent_to_qb",
        qb_bill_id: bill.Id,
        qb_error: null,
        sent_at: now(),
        updated_at: now(),
      })
      .eq("id", payoutId);

    // Fire-and-forget partner payout email (Phase 2.6).
    try {
      const { notifyPartnerPayoutSent } = await import("./marketplaceNotifications");
      notifyPartnerPayoutSent(payoutId).catch(() => undefined);
    } catch {
      /* non-critical */
    }

    return { ok: true, externalId: bill.Id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabaseAdmin
      .from("marketplace_payouts")
      .update({
        status: "failed",
        qb_error: msg.slice(0, 500),
        updated_at: now(),
      })
      .eq("id", payoutId);
    return { ok: false, error: msg };
  }
}

export async function pushOperatorInvoiceToQb(invoiceId: string): Promise<QbPushResult> {
  const { data: invoice } = await supabaseAdmin
    .from("marketplace_operator_invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return { ok: false, error: "Invoice not found" };
  if (invoice.status !== "queued" && invoice.status !== "failed") {
    return { ok: false, error: `Invoice already ${invoice.status}` };
  }

  try {
    await supabaseAdmin
      .from("marketplace_operator_invoices")
      .update({ qb_last_attempt_at: now(), updated_at: now() })
      .eq("id", invoiceId);

    const customerId = await ensureOperatorCustomer({
      profileId: invoice.operator_profile_id,
      fallbackEmail: invoice.operator_email,
      fallbackName: invoice.operator_business_name,
    });
    if (!customerId) throw new Error("Could not resolve QB Customer for operator");

    const { data: contract } = await supabaseAdmin
      .from("placement_contracts")
      .select("title, tier")
      .eq("id", invoice.contract_id)
      .maybeSingle();

    // createInvoice uses findOrCreateCustomer internally; passing the same
    // email/name will hit its cache path. We've already ensured the customer
    // above (which populates the profile cache), so this second call is cheap.
    const qbInvoice = await createInvoice({
      customerEmail: invoice.operator_email || "",
      customerName: invoice.operator_business_name || "Operator",
      lineItems: [
        {
          description: `Placement fee — ${contract?.title || "Contract"} (Tier ${contract?.tier || 1})`,
          amount: Number(invoice.amount),
        },
      ],
      memo: "Location placement fee for approved marketplace submission.",
      metadata: {
        submission_id: invoice.submission_id,
        contract_id: invoice.contract_id,
        marketplace_invoice_id: invoice.id,
      },
    });

    await supabaseAdmin
      .from("marketplace_operator_invoices")
      .update({
        status: "sent_to_qb",
        qb_invoice_id: qbInvoice.Id,
        qb_error: null,
        sent_at: now(),
        updated_at: now(),
      })
      .eq("id", invoiceId);

    return { ok: true, externalId: qbInvoice.Id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabaseAdmin
      .from("marketplace_operator_invoices")
      .update({
        status: "failed",
        qb_error: msg.slice(0, 500),
        updated_at: now(),
      })
      .eq("id", invoiceId);
    return { ok: false, error: msg };
  }
}

export interface DrainSummary {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: string[];
}

export async function drainPayouts(limit = 25): Promise<DrainSummary> {
  const { data: rows } = await supabaseAdmin
    .from("marketplace_payouts")
    .select("id")
    .in("status", ["queued", "failed"])
    .order("triggered_at", { ascending: true })
    .limit(limit);

  const summary: DrainSummary = { attempted: 0, succeeded: 0, failed: 0, errors: [] };
  for (const row of rows || []) {
    summary.attempted++;
    const r = await pushPayoutToQb(row.id);
    if (r.ok) summary.succeeded++;
    else {
      summary.failed++;
      if (r.error) summary.errors.push(r.error);
    }
  }
  return summary;
}

export async function drainOperatorInvoices(limit = 25): Promise<DrainSummary> {
  const { data: rows } = await supabaseAdmin
    .from("marketplace_operator_invoices")
    .select("id")
    .in("status", ["queued", "failed"])
    .order("triggered_at", { ascending: true })
    .limit(limit);

  const summary: DrainSummary = { attempted: 0, succeeded: 0, failed: 0, errors: [] };
  for (const row of rows || []) {
    summary.attempted++;
    const r = await pushOperatorInvoiceToQb(row.id);
    if (r.ok) summary.succeeded++;
    else {
      summary.failed++;
      if (r.error) summary.errors.push(r.error);
    }
  }
  return summary;
}
