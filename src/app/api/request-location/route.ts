import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendLocationRequestConfirmation } from "@/lib/intakeEmail";
import { createInvoice, sendInvoiceEmail, getInvoice } from "@/lib/quickbooks";

import { APEX_ADMIN_NOTIFY } from "@/lib/adminNotifyRecipients";

// Every location services request goes to the standing admin list
// (james/anthony/bryan) plus louis, who runs the location team's
// intake triage.
const TO_EMAILS = [...APEX_ADMIN_NOTIFY, "louis.cirino@apexaivending.com"];
const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";
// Deposit is $100 PER LOCATION requested — not a flat $100 total.
// A 10-location request pays $1,000 up front; a single-location
// request pays $100.
const DEPOSIT_CENTS_PER_LOCATION = 10000;

// Allowlist for machine_type. Kept in sync with the /request-location
// page selector and with the sales_leads_machine_type_check CHECK
// constraint (migration 152).
const MACHINE_TYPES = ["Combo", "AI", "Water", "Coffee", "ATM"] as const;
type MachineType = (typeof MACHINE_TYPES)[number];
function isMachineType(v: unknown): v is MachineType {
  return typeof v === "string" && (MACHINE_TYPES as readonly string[]).includes(v);
}

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 500) : "";
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const business_name = clean(body.business_name);
  const contact_name = clean(body.contact_name);
  const phone = clean(body.phone);
  const email = clean(body.email);
  const address = clean(body.address);
  const state = clean(body.state);
  const machine_count_raw = body.machine_count;
  const machine_type_raw = body.machine_type;

  const rawZips = Array.isArray(body.zip_codes) ? body.zip_codes : body.zip_code ? [body.zip_code] : [];
  const zip_codes: string[] = rawZips.map((z: unknown) => (typeof z === "string" ? z.trim() : "")).filter(Boolean);
  const zip_code = zip_codes.join(", ");

  if (
    !business_name ||
    !contact_name ||
    !phone ||
    !email ||
    !address ||
    !state ||
    zip_codes.length === 0 ||
    machine_count_raw === undefined ||
    machine_count_raw === null ||
    machine_count_raw === ""
  ) {
    return NextResponse.json(
      { error: "All fields are required" },
      { status: 400 }
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const machine_count = Number(machine_count_raw);
  if (!Number.isFinite(machine_count) || machine_count < 1) {
    return NextResponse.json(
      { error: "Machine count must be a positive number" },
      { status: 400 }
    );
  }

  if (!isMachineType(machine_type_raw)) {
    return NextResponse.json(
      { error: `Machine type must be one of: ${MACHINE_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  const machine_type: MachineType = machine_type_raw;

  const depositCents = machine_count * DEPOSIT_CENTS_PER_LOCATION;
  const depositDollars = depositCents / 100;

  const ref = clean(body.ref);
  let referringRep: string | null = null;
  let referringRepName: string | null = null;
  if (ref) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", ref)
      .single();
    if (profile && (profile.role === "sales" || profile.role === "admin" || profile.role === "director_of_sales" || profile.role === "market_leader")) {
      referringRep = profile.id;
      referringRepName = profile.full_name;
    }
  }

  // Auto-assign to the sales rep with the lightest active-workflow
  // load when the customer didn't come in through a specific
  // referral. Tie-break skips the last-assigned rep for this order
  // type so intake distributes evenly instead of hammering one rep.
  // Falls back to null (unassigned) when there are no eligible reps.
  let autoAssignedRep: string | null = null;
  let autoAssignedRepName: string | null = null;
  if (!referringRep) {
    try {
      const { pickLeastLoadedSalesRep } = await import("@/lib/salesAutoAssign");
      const pick = await pickLeastLoadedSalesRep({ orderType: "location_services" });
      if (pick) {
        autoAssignedRep = pick.userId;
        autoAssignedRepName = pick.fullName;
        console.log(
          `[request-location] auto-assigned to ${pick.email} (${pick.userId}): ${pick.reason}`,
        );
      }
    } catch (assignErr) {
      console.error("[request-location] auto-assign failed:", assignErr);
    }
  }
  const ownerRep = referringRep ?? autoAssignedRep;
  const ownerRepName = referringRepName ?? autoAssignedRepName;

  // Duplicate-business guard intentionally removed — operators
  // routinely place multiple, separate location-services requests
  // (different addresses, different ZIP sets, different machine
  // counts, or a repeat purchase for the same business). Every
  // submission spawns its own sales_lead row and its own workflow;
  // findOrCreateSalesAccount below still dedups the sales_accounts
  // row so the account view stays consolidated.

  const leadRow: Record<string, unknown> = {
    business_name,
    contact_name,
    phone,
    email,
    address,
    zip_code,
    state,
    machine_count,
    status: "new",
    source: referringRep ? "request-location-referral" : "request-location",
    notes: `Location services request — ${machine_count} ${machine_type} machine(s) requested for ZIP(s) ${zip_code} in ${state}${referringRepName ? ` (referred by ${referringRepName})` : autoAssignedRepName ? ` (auto-assigned to ${autoAssignedRepName})` : ""}`,
    // created_by stays honest — only set to the rep when the intake
    // came from THEIR referral link. Auto-assigned rows leave
    // created_by null; ownership lives on assigned_to.
    created_by: referringRep,
    assigned_to: ownerRep,
  };

  // Try with deposit + machine_type columns (deposit_* needs migration
  // 081, machine_type needs migration 152). Failures on either column
  // fall back to smaller insert shapes so an old DB still accepts the
  // request instead of a hard 500.
  let { data: lead, error: dbError } = await supabaseAdmin.from("sales_leads").insert({
    ...leadRow,
    deposit_status: "pending",
    deposit_amount_cents: depositCents,
    machine_type,
  }).select("id").single();

  // Fallback: machine_type column missing (migration 152 not run).
  if (dbError && dbError.message?.includes("machine_type")) {
    console.warn("[request-location] machine_type column missing, inserting without it");
    const retry = await supabaseAdmin.from("sales_leads").insert({
      ...leadRow,
      deposit_status: "pending",
      deposit_amount_cents: depositCents,
    }).select("id").single();
    lead = retry.data;
    dbError = retry.error;
  }

  // Fallback if deposit columns don't exist yet
  if (dbError && dbError.message?.includes("deposit_")) {
    console.warn("[request-location] deposit columns missing, inserting without them");
    const fallback = await supabaseAdmin.from("sales_leads").insert(leadRow).select("id").single();
    lead = fallback.data;
    dbError = fallback.error;
  }

  if (dbError || !lead) {
    console.error("[request-location] db error", dbError);
    return NextResponse.json(
      { error: "Failed to save request" },
      { status: 500 }
    );
  }

  // Dedup-guarded — same customer requesting location services twice
  // no longer forks a second account.
  let accountId: string | null = null;
  try {
    const { findOrCreateSalesAccount } = await import("@/lib/salesAccountResolver");
    const account = await findOrCreateSalesAccount({
      business_name,
      contact_name,
      phone,
      email,
      address,
      notes: `Auto-created from location services request — ${machine_count} machine(s), ZIP(s) ${zip_code}, ${state}`,
      assigned_to: ownerRep,
      created_by: referringRep,
    });
    accountId = account?.id ?? null;
  } catch (accountError) {
    console.error("[request-location] account creation error", accountError);
  }

  // Create the sales_orders row NOW so the request shows up in the
  // Orders queue immediately (document_type='order', order_type=
  // 'location_services'). It starts as payment_status='unpaid' —
  // nothing has been paid at this point, only the QB invoice has
  // been sent. The QB invoice.paid webhook (see webhooks/quickbooks
  // + workflows/paymentSync) flips it to 'paid' when the deposit
  // clears, at which point the location_services workflow is
  // auto-spawned (see spawnLocationServicesWorkflowFromPaidOrder).
  //
  // Pricing: $100 deposit per location + $500 placement fee per
  // location — so total per location is $600 and totals scale
  // linearly with count.
  let orderId: string | null = null;
  const totalValueDollars = (depositCents + machine_count * 50000) / 100;
  if (accountId) {
    try {
      const { data: order, error: orderErr } = await supabaseAdmin
        .from("sales_orders")
        .insert({
          account_id: accountId,
          lead_id: lead.id,
          // created_by stays honest — null for non-referral intake.
          // assigned_rep_id gets the referrer OR the auto-picked
          // lightest-load rep so the row shows up in someone's
          // Orders queue immediately.
          created_by: referringRep,
          assigned_rep_id: ownerRep,
          document_type: "order",
          order_type: "location_services",
          order_status: "sent",
          status: "sent",
          total_value: totalValueDollars,
          deposit_amount: depositDollars,
          deposit_paid: false,
          remaining_balance: totalValueDollars - depositDollars,
          // 'unpaid' at intake — nothing has been paid yet. The QB
          // invoice.paid webhook flips this to 'paid' when the
          // deposit clears and spawns the workflow at that point.
          payment_status: "unpaid",
          invoice_status: "sent",
          agreement_status: "not_sent",
          fulfillment_status: "pending",
          next_required_action: "Awaiting deposit payment",
          recipient_email: email,
          notes: `Location services request — ${machine_count} ${machine_type} location${machine_count > 1 ? "s" : ""} in ${state} (ZIP ${zip_code}). Address: ${address}. $100 deposit + $500 placement fee per location.`,
        })
        .select("id")
        .single();

      if (orderErr) {
        console.error("[request-location] sales_orders insert failed:", orderErr);
      } else if (order) {
        orderId = order.id;
        const { error: itemErr } = await supabaseAdmin
          .from("order_items")
          .insert({
            order_id: order.id,
            service_name: `Location Services — ${machine_count} ${machine_type} location${machine_count > 1 ? "s" : ""}`,
            price: totalValueDollars,
            notes: `${machine_count} ${machine_type} location(s) in ${state} (ZIP ${zip_code}). $100 deposit + $500 placement fee per location.`,
          });
        if (itemErr) {
          console.error("[request-location] order_items insert failed:", itemErr);
        }
      }
    } catch (orderCatch) {
      console.error("[request-location] order creation exception:", orderCatch);
    }
  }

  // Create QB invoice for the deposit ($100 per location).
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";
  try {
    const invoice = await createInvoice({
      customerEmail: email,
      customerName: contact_name,
      customerPhone: phone,
      lineItems: [
        {
          description: `Location Services Deposit — ${business_name} (${machine_count} ${machine_type} location${machine_count > 1 ? "s" : ""} in ${state}, $100 per location)`,
          amount: depositDollars,
        },
      ],
      memo: `Location services deposit for ${business_name} — ${machine_count} ${machine_type} location(s) at $100 each`,
      metadata: {
        type: "location_services_deposit",
        lead_id: lead.id,
        order_id: orderId ?? "",
      },
    });

    try {
      await supabaseAdmin
        .from("sales_leads")
        .update({ qb_invoice_id: invoice.Id })
        .eq("id", lead.id);
    } catch {
      // column may not exist if migration 081 hasn't run
    }

    // Stash the QB invoice id on the sales_orders row too, so when
    // QB fires an invoice.paid webhook the sync path can match the
    // order and roll payment status through to the workflow.
    if (orderId) {
      try {
        await supabaseAdmin
          .from("sales_orders")
          .update({ qb_invoice_id: invoice.Id })
          .eq("id", orderId);
      } catch (invLinkErr) {
        console.error("[request-location] sales_orders qb_invoice_id link failed:", invLinkErr);
      }
    }

    await sendInvoiceEmail(invoice.Id, email);

    const fullInvoice = await getInvoice(invoice.Id);

    // Send admin notification email
    sendAdminNotification({
      business_name, contact_name, phone, email, address, state, zip_code, machine_count, machine_type,
      depositDollars,
    }).catch((e) => console.error("[request-location] email error", e));

    sendLocationRequestConfirmation({ to: email, name: contact_name })
      .catch((e) => console.error("[request-location] confirmation email error", e));

    // Workflow spawn intentionally removed from this route. We no
    // longer create a location_services workflow at intake — the
    // spawn is deferred until the QuickBooks invoice actually
    // clears. See src/lib/workflows/paymentSync.ts
    // (syncWorkflowFromSalesOrderPaid + the location_services
    // spawn helper) — when the QB webhook lands, the sales_order
    // is matched, and if it's a location_services order with no
    // workflow yet, one is created in the paid state and the
    // marketplace bridge fires. Rationale: keeps the workflows
    // queue clean of speculative requests where the deposit was
    // never paid.

    if (fullInvoice.InvoiceLink) {
      return NextResponse.json({ url: fullInvoice.InvoiceLink });
    }

    return NextResponse.json({
      url: `${siteUrl}/request-location?deposited=true`,
      invoiceSent: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payment error";
    console.error("[request-location] QB invoice error:", message);

    // Delete the lead since payment is required
    await supabaseAdmin
      .from("sales_leads")
      .delete()
      .eq("id", lead.id);

    return NextResponse.json(
      { error: "Unable to process deposit payment. Please try again or call (888) 851-1462 for assistance." },
      { status: 500 }
    );
  }
}

async function sendAdminNotification(params: {
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  state: string;
  zip_code: string;
  machine_count: number;
  machine_type: string;
  depositDollars: number;
}) {
  const { business_name, contact_name, phone, email, address, state, zip_code, machine_count, machine_type, depositDollars } = params;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="color:#16a34a;margin:0 0 16px;">New Location Services Request</h2>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin-bottom:16px;">
        <p style="margin:0;color:#166534;font-size:14px;font-weight:600;">$${depositDollars.toFixed(2)} Deposit Pending (${machine_count} location${machine_count > 1 ? "s" : ""} × $100)</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#6b7280;">Business Name</td><td style="padding:6px 0;color:#111827;font-weight:600;">${business_name}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Contact Name</td><td style="padding:6px 0;color:#111827;">${contact_name}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Phone</td><td style="padding:6px 0;color:#111827;">${phone}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Email</td><td style="padding:6px 0;color:#111827;">${email}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Address</td><td style="padding:6px 0;color:#111827;">${address}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">State</td><td style="padding:6px 0;color:#111827;">${state}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">ZIP Code(s)</td><td style="padding:6px 0;color:#111827;">${zip_code}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Machines Requested</td><td style="padding:6px 0;color:#111827;font-weight:600;">${machine_count}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Machine Type</td><td style="padding:6px 0;color:#111827;font-weight:600;">${machine_type}</td></tr>
      </table>
    </div>
  `;
  await resend.emails.send({
    from: FROM_EMAIL,
    to: TO_EMAILS,
    subject: `New Location Services Request – ${business_name} ($${depositDollars.toFixed(2)} Deposit, ${machine_count} location${machine_count > 1 ? "s" : ""})`,
    html,
  });
}
