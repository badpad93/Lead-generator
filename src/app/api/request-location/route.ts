import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendLocationRequestConfirmation } from "@/lib/intakeEmail";

const TO_EMAIL = "james@apexaivending.com";
const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";

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
  const zip_code = clean(body.zip_code);
  const machine_count_raw = body.machine_count;

  if (
    !business_name ||
    !contact_name ||
    !phone ||
    !email ||
    !address ||
    !zip_code ||
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

  // Optional referring sales rep — validate they actually have a sales/admin role
  // so commissions and results dashboards attribute the lead correctly.
  const ref = clean(body.ref);
  let referringRep: string | null = null;
  let referringRepName: string | null = null;
  if (ref) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", ref)
      .single();
    if (profile && (profile.role === "sales" || profile.role === "admin")) {
      referringRep = profile.id;
      referringRepName = profile.full_name;
    }
  }

  const { data: lead, error: dbError } = await supabaseAdmin.from("sales_leads").insert({
    business_name,
    contact_name,
    phone,
    email,
    address,
    zip_code,
    machine_count,
    status: "new",
    source: referringRep ? "request-location-referral" : "request-location",
    notes: `Location services request — ${machine_count} machine(s) requested for ZIP ${zip_code}${referringRepName ? ` (referred by ${referringRepName})` : ""}`,
    created_by: referringRep,
    assigned_to: referringRep,
  }).select("id").single();

  if (dbError) {
    console.error("[request-location] db error", dbError);
    return NextResponse.json(
      { error: "Failed to save request" },
      { status: 500 }
    );
  }

  const { error: accountError } = await supabaseAdmin.from("sales_accounts").insert({
    business_name,
    contact_name,
    phone,
    email,
    address,
    notes: `Auto-created from location services request — ${machine_count} machine(s), ZIP ${zip_code}`,
    assigned_to: referringRep,
    created_by: referringRep,
  });

  if (accountError) {
    console.error("[request-location] account creation error", accountError);
  }

  // Fire email — log but do not fail the request if email errors.
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color:#16a34a;margin:0 0 16px;">New Location Services Request</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 0;color:#6b7280;">Business Name</td><td style="padding:6px 0;color:#111827;font-weight:600;">${business_name}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Contact Name</td><td style="padding:6px 0;color:#111827;">${contact_name}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Phone</td><td style="padding:6px 0;color:#111827;">${phone}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Email</td><td style="padding:6px 0;color:#111827;">${email}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Address</td><td style="padding:6px 0;color:#111827;">${address}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">ZIP Code</td><td style="padding:6px 0;color:#111827;">${zip_code}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Machines Requested</td><td style="padding:6px 0;color:#111827;font-weight:600;">${machine_count}</td></tr>
        </table>
      </div>
    `;
    await resend.emails.send({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      subject: `New Location Services Request – ${business_name}`,
      html,
    });
  } catch (e) {
    console.error("[request-location] email error", e);
  }

  sendLocationRequestConfirmation({
    to: email,
    name: contact_name,
  }).catch((e) => console.error("[request-location] confirmation email error", e));

  return NextResponse.json({ ok: true });
}
