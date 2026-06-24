import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";

const REQUIRED_INITIALS = [
  "section_3",
  "section_4",
  "section_5",
  "section_6",
  "section_7",
  "section_8",
  "schedule_a",
  "schedule_b",
  "schedule_c",
];

const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";
const ALWAYS_CC = [
  "james@apexaivending.com",
  "katrina.cacdac@apexaivending.com",
];

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

/* ------------------------------------------------------------------ */
/*  POST — Submit operator signature (public, token-based auth)       */
/* ------------------------------------------------------------------ */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Look up agreement
  const { data: agreement, error: agErr } = await supabaseAdmin
    .from("purchase_agreements")
    .select("*")
    .eq("sign_token", token)
    .single();

  if (agErr || !agreement) {
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  }

  if (["cancelled", "expired", "signed"].includes(agreement.agreement_status)) {
    return NextResponse.json(
      { error: "This agreement cannot be signed" },
      { status: 400 },
    );
  }

  // Validate all 9 required initials exist
  const { count: initialsCount } = await supabaseAdmin
    .from("agreement_initials")
    .select("*", { count: "exact", head: true })
    .eq("agreement_id", agreement.id)
    .eq("signer_type", "operator")
    .in("section_key", REQUIRED_INITIALS);

  if ((initialsCount || 0) < REQUIRED_INITIALS.length) {
    return NextResponse.json(
      {
        error: `All ${REQUIRED_INITIALS.length} sections must be initialed before signing. ${initialsCount || 0} of ${REQUIRED_INITIALS.length} completed.`,
      },
      { status: 400 },
    );
  }

  const body = await req.json();
  const { signer_name, signer_company, signer_title, signature_data, signature_type } = body;

  // Validate required fields
  if (!signer_name || typeof signer_name !== "string" || signer_name.trim() === "") {
    return NextResponse.json({ error: "signer_name is required" }, { status: 400 });
  }
  if (!signature_data || typeof signature_data !== "string" || signature_data.trim() === "") {
    return NextResponse.json({ error: "signature_data is required" }, { status: 400 });
  }

  // Get IP address
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;

  // Insert signature record
  const { data: signature, error: sigErr } = await supabaseAdmin
    .from("agreement_signatures")
    .insert({
      agreement_id: agreement.id,
      signer_type: "operator",
      signer_name: signer_name.trim(),
      signer_company: signer_company?.trim() || agreement.operator_company_name || null,
      signer_title: signer_title?.trim() || agreement.operator_title || null,
      signer_email: agreement.operator_email || null,
      signature_data: signature_data.trim(),
      signature_type: signature_type || "typed",
      ip_address: ip,
    })
    .select("*")
    .single();

  if (sigErr) {
    return NextResponse.json({ error: sigErr.message }, { status: 500 });
  }

  // Determine new status
  const isFullySigned = !!agreement.apex_signed_at;
  const newStatus = isFullySigned ? "signed" : "partially_signed";

  // Update agreement
  await supabaseAdmin
    .from("purchase_agreements")
    .update({
      agreement_status: newStatus,
      operator_signed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", agreement.id);

  // Sync status back to the sales order if linked
  if (agreement.order_id) {
    await supabaseAdmin
      .from("sales_orders")
      .update({
        agreement_status: newStatus === "signed" ? "signed" : "partially_signed",
      })
      .eq("id", agreement.order_id);
  }

  // Log activity
  await supabaseAdmin.from("agreement_activity_log").insert({
    agreement_id: agreement.id,
    activity_type: "operator_signed",
    description: `Operator signed by ${signer_name}${signer_title ? `, ${signer_title}` : ""}${isFullySigned ? " — Agreement fully executed" : ""}`,
  });

  // Send notification email to Apex representative and CC addresses
  if (process.env.RESEND_API_KEY) {
    try {
      const notifyTo: string[] = [];
      if (agreement.apex_representative_email) {
        notifyTo.push(agreement.apex_representative_email);
      }
      for (const addr of ALWAYS_CC) {
        if (!notifyTo.includes(addr)) notifyTo.push(addr);
      }

      if (notifyTo.length > 0) {
        const crmUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com"}/sales/orders/${agreement.order_id}/agreement?aid=${agreement.id}`;

        await getResend().emails.send({
          from: FROM_EMAIL,
          to: notifyTo,
          subject: `Agreement Signed — ${agreement.operator_company_name || "Operator"}`,
          html: `
<p><strong>${agreement.operator_legal_name || signer_name}</strong> (${agreement.operator_company_name}) has signed the VendEra AI Machine Purchase Agreement.</p>
<ul>
  <li><strong>Signer:</strong> ${signer_name}</li>
  <li><strong>Company:</strong> ${signer_company || agreement.operator_company_name || "—"}</li>
  <li><strong>Title:</strong> ${signer_title || "—"}</li>
  <li><strong>Machine${agreement.machine_quantity > 1 ? "s" : ""}:</strong> ${agreement.machine_quantity}x ${agreement.machine_model}</li>
  <li><strong>Total:</strong> $${Number(agreement.total_due_prior_to_procurement || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</li>
  <li><strong>Status:</strong> ${isFullySigned ? "Fully Executed" : "Awaiting Apex Countersignature"}</li>
</ul>
<p><a href="${crmUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;">View Agreement in CRM</a></p>
<p style="font-size:13px;color:#6b7280;margin-top:24px;">Apex AI Vending &bull; vendingconnector.com</p>
          `.trim(),
        });
      }
    } catch {
      // Notification is best-effort — failure should not block signing
    }
  }

  return NextResponse.json({
    ok: true,
    signature,
    agreement_status: newStatus,
    fully_executed: isFullySigned,
  });
}
