import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildMachineAgreement,
  MACHINE_AGREEMENT_VERSION,
} from "@/lib/machineAgreementText";
import {
  deriveBundleType,
  formatCents,
  LOCATION_SERVICES_MAX_CENTS,
  LOCATION_SERVICES_MIN_CENTS,
  type PurchaseType,
} from "@/lib/machineTypes";

const TO_EMAIL = "james@apexaivending.com";
const FROM_EMAIL =
  process.env.FROM_EMAIL || "receipts@bytebitevending.com";

function clean(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function cleanBool(v: unknown): boolean {
  return v === true || v === "true";
}

/**
 * POST /api/machine-orders
 *
 * Public endpoint — the /machines/[id] configurator submits here.
 * We do NOT require auth so anonymous buyers can place orders; Apex
 * reviews each order manually in the admin dashboard before taking
 * payment or shipping equipment.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ---------------------------------------------------------------
  // Validate customer fields
  // ---------------------------------------------------------------
  const customer_name = clean(body.customer_name, 200);
  const customer_email = clean(body.customer_email, 200);
  const customer_phone = clean(body.customer_phone, 50);
  const company_name = clean(body.company_name, 200);
  const billing_address = clean(body.billing_address, 500);
  const billing_city = clean(body.billing_city, 100);
  const billing_state = clean(body.billing_state, 50);
  const billing_zip = clean(body.billing_zip, 20);

  if (!customer_name || !customer_email) {
    return NextResponse.json(
      { error: "Customer name and email are required" },
      { status: 400 }
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  // ---------------------------------------------------------------
  // Validate machine selection
  // ---------------------------------------------------------------
  const machine_id = clean(body.machine_id, 100);
  const quantityRaw = Number(body.quantity);
  const quantity =
    Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.floor(quantityRaw) : 0;

  if (!machine_id || quantity < 1) {
    return NextResponse.json(
      { error: "Machine and quantity are required" },
      { status: 400 }
    );
  }
  if (quantity > 100) {
    return NextResponse.json(
      { error: "Please contact us directly for orders over 100 machines." },
      { status: 400 }
    );
  }

  // Look up the machine to snapshot price + name (do NOT trust client)
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      machine_id
    );
  const { data: machineRows, error: machineErr } = await (isUuid
    ? supabaseAdmin.from("machines").select("*").eq("id", machine_id).limit(1)
    : supabaseAdmin
        .from("machines")
        .select("*")
        .eq("slug", machine_id)
        .limit(1));

  if (machineErr) {
    console.error("[machine-orders] machine lookup error", machineErr);
    return NextResponse.json(
      { error: "Failed to look up machine" },
      { status: 500 }
    );
  }
  const machine = machineRows?.[0];
  if (!machine || !machine.active) {
    return NextResponse.json(
      { error: "Machine not found or unavailable" },
      { status: 404 }
    );
  }

  // ---------------------------------------------------------------
  // Purchase type + bundle flags
  // ---------------------------------------------------------------
  const purchase_type_raw = clean(body.purchase_type, 20);
  const purchase_type: PurchaseType =
    purchase_type_raw === "finance" ? "finance" : "cash";
  const financing_requested = purchase_type === "finance";
  const location_services_selected = cleanBool(
    body.location_services_selected
  );

  const unit_price_cents: number = machine.price_cents;
  const subtotal_cents = unit_price_cents * quantity;

  const estimated_monthly_cents = financing_requested
    ? machine.finance_estimate_monthly_cents ?? null
    : null;
  const monthly_for_order =
    estimated_monthly_cents != null ? estimated_monthly_cents * quantity : null;

  const bundle_type = deriveBundleType(
    financing_requested,
    location_services_selected
  );

  // ---------------------------------------------------------------
  // Acceptance + referral + metadata
  // ---------------------------------------------------------------
  const accepted_terms = cleanBool(body.accepted_terms);
  if (!accepted_terms) {
    return NextResponse.json(
      { error: "You must accept the order terms to continue" },
      { status: 400 }
    );
  }

  let referring_rep_id: string | null = null;
  let referring_rep_name: string | null = null;
  const ref = clean(body.ref, 100);
  if (ref) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", ref)
      .single();
    if (profile && (profile.role === "sales" || profile.role === "admin")) {
      referring_rep_id = profile.id;
      referring_rep_name = profile.full_name;
    }
  }

  const ip_address =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const user_agent = req.headers.get("user-agent") || null;

  // ---------------------------------------------------------------
  // Generate agreement snapshot
  // ---------------------------------------------------------------
  const agreement_text = buildMachineAgreement({
    customerName: customer_name,
    companyName: company_name || null,
    machineName: machine.name,
    quantity,
    unitPriceCents: unit_price_cents,
    subtotalCents: subtotal_cents,
    purchaseType: purchase_type,
    financingRequested: financing_requested,
    estimatedMonthlyCents: monthly_for_order,
    financingTermYears: machine.finance_term_years ?? 10,
    financingRateLabel: machine.finance_rate_label ?? "8–14% APR",
    locationServicesSelected: location_services_selected,
    locationServicesMinCents: LOCATION_SERVICES_MIN_CENTS,
    locationServicesMaxCents: LOCATION_SERVICES_MAX_CENTS,
  });

  // ---------------------------------------------------------------
  // Insert the order
  // ---------------------------------------------------------------
  const { data: orderRow, error: insertErr } = await supabaseAdmin
    .from("machine_orders")
    .insert({
      customer_name,
      customer_email,
      customer_phone: customer_phone || null,
      company_name: company_name || null,
      billing_address: billing_address || null,
      billing_city: billing_city || null,
      billing_state: billing_state || null,
      billing_zip: billing_zip || null,

      machine_id: machine.id,
      machine_name: machine.name,
      machine_slug: machine.slug,
      quantity,
      unit_price_cents,
      subtotal_cents,

      purchase_type,
      financing_requested,
      estimated_monthly_cents: monthly_for_order,

      location_services_selected,
      location_services_quote_min_cents: location_services_selected
        ? LOCATION_SERVICES_MIN_CENTS
        : null,
      location_services_quote_max_cents: location_services_selected
        ? LOCATION_SERVICES_MAX_CENTS
        : null,

      bundle_type,

      agreement_version: MACHINE_AGREEMENT_VERSION,
      agreement_text,
      accepted_terms: true,

      referring_rep_id,
      referring_rep_name,

      status: "pending_review",
      source: "machines-configurator",
      ip_address,
      user_agent,
    })
    .select("id")
    .single();

  if (insertErr || !orderRow) {
    console.error("[machine-orders] insert error", insertErr);
    return NextResponse.json(
      { error: "Failed to save order" },
      { status: 500 }
    );
  }

  // ---------------------------------------------------------------
  // If financing requested, create the child financing_requests row
  // ---------------------------------------------------------------
  if (financing_requested) {
    const { error: finErr } = await supabaseAdmin
      .from("financing_requests")
      .insert({
        order_id: orderRow.id,
        estimated_amount_cents: subtotal_cents,
        term_years: machine.finance_term_years ?? 10,
        rate_range: machine.finance_rate_label ?? "8–14% APR",
        estimated_monthly_cents: monthly_for_order ?? 0,
        quantity,
        status: "pending",
      });
    if (finErr) {
      console.error("[machine-orders] financing insert error", finErr);
      // Do not fail the whole request — the order is already saved and
      // admin can add financing details manually if needed.
    }
  }

  // ---------------------------------------------------------------
  // Notify Apex via Resend (best-effort)
  // ---------------------------------------------------------------
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    const row = (label: string, value: string) =>
      `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap;">${label}</td><td style="padding:6px 0;color:#111827;font-weight:600;">${value}</td></tr>`;

    const financingLine = financing_requested
      ? row(
          "Financing",
          `${formatCents(monthly_for_order ?? 0)}/mo × ${
            machine.finance_term_years ?? 10
          } yrs (${machine.finance_rate_label ?? "8–14% APR"})`
        )
      : row("Payment", "Cash / wire / ACH");

    const locationLine = location_services_selected
      ? row(
          "Location Services",
          `Requested (${formatCents(LOCATION_SERVICES_MIN_CENTS)}–${formatCents(
            LOCATION_SERVICES_MAX_CENTS
          )})`
        )
      : row("Location Services", "Not requested");

    const referralLine = referring_rep_name
      ? row("Referred By", referring_rep_name)
      : "";

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#16a34a;margin:0 0 4px;">New Machine Order</h2>
        <p style="color:#6b7280;margin:0 0 20px;font-size:13px;">
          Bundle: <strong>${bundle_type.replace(/_/g, " ")}</strong> · Status: Pending Review
        </p>

        <h3 style="font-size:15px;margin:0 0 8px;color:#111827;">Order</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
          ${row("Machine", machine.name)}
          ${row("Quantity", String(quantity))}
          ${row("Unit Price", formatCents(unit_price_cents))}
          ${row("Subtotal", formatCents(subtotal_cents))}
          ${financingLine}
          ${locationLine}
        </table>

        <h3 style="font-size:15px;margin:0 0 8px;color:#111827;">Customer</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
          ${row("Name", customer_name)}
          ${row("Email", customer_email)}
          ${customer_phone ? row("Phone", customer_phone) : ""}
          ${company_name ? row("Company", company_name) : ""}
          ${
            billing_address
              ? row(
                  "Billing Address",
                  [billing_address, billing_city, billing_state, billing_zip]
                    .filter(Boolean)
                    .join(", ")
                )
              : ""
          }
          ${referralLine}
        </table>

        <p style="font-size:12px;color:#6b7280;margin:0;">
          Order ID: <code>${orderRow.id}</code><br/>
          Review and approve in the Admin Panel → Machine Orders tab.
        </p>
      </div>
    `;

    await resend.emails.send({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      subject: `New Machine Order — ${machine.name} × ${quantity} (${customer_name})`,
      html,
    });
  } catch (e) {
    console.error("[machine-orders] email error", e);
  }

  return NextResponse.json({ ok: true, id: orderRow.id }, { status: 201 });
}
