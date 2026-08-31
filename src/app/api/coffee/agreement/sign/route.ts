import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { signAsProvider, getOrStartAgreement, getActiveTemplate } from "@/lib/placementAgreements";
import { generateCoffeeAgreementPdf } from "@/lib/pdf/coffeeAgreementPdf";

/**
 * POST /api/coffee/agreement/sign
 *
 * Body: {
 *   typed_name,                       // required — legal name
 *   consent_esign,                    // required true
 *   customer_name,                    // legal name / business
 *   customer_address,                 // full address
 *   num_machines,                     // integer >= 1
 *   authorized_representative_name,   // signer's printed name
 *   authorized_representative_title,  // signer's title
 *   ack_exclusive_supply,             // required true
 *   ack_minimum_purchase,             // required true
 *   ack_installation_maintenance      // required true
 * }
 *
 * Coffee-specific fields land on user_agreements.metadata so we can render
 * them into the executed HTML doc at countersign time and audit exactly
 * what the customer agreed to.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  const typedName = String(body.typed_name || "").trim();
  const consentEsign = !!body.consent_esign;
  const customerName = String(body.customer_name || "").trim();
  const customerAddress = String(body.customer_address || "").trim();
  const numMachinesRaw = Number(body.num_machines);
  const authRepName = String(body.authorized_representative_name || "").trim();
  const authRepTitle = String(body.authorized_representative_title || "").trim();
  const ackSupply = !!body.ack_exclusive_supply;
  const ackMin = !!body.ack_minimum_purchase;
  const ackInstall = !!body.ack_installation_maintenance;

  if (!typedName) return NextResponse.json({ error: "Typed legal name is required" }, { status: 400 });
  if (!consentEsign) return NextResponse.json({ error: "You must consent to conduct business electronically" }, { status: 400 });
  if (!customerName) return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
  if (!customerAddress) return NextResponse.json({ error: "Customer address is required" }, { status: 400 });
  if (!Number.isFinite(numMachinesRaw) || numMachinesRaw < 1) {
    return NextResponse.json({ error: "Number of machines must be at least 1" }, { status: 400 });
  }
  if (!authRepName) return NextResponse.json({ error: "Authorized representative name is required" }, { status: 400 });
  if (!authRepTitle) return NextResponse.json({ error: "Authorized representative title is required" }, { status: 400 });
  if (!ackSupply || !ackMin || !ackInstall) {
    return NextResponse.json({ error: "You must acknowledge all three requirements" }, { status: 400 });
  }

  const start = await getOrStartAgreement(userId, "coffee_supply");
  if (!start) {
    return NextResponse.json({ error: "No active coffee supply agreement template" }, { status: 500 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const ua = req.headers.get("user-agent") || null;

  const numMachines = Math.floor(numMachinesRaw);
  const coffeeMetadata = {
    customer_name: customerName,
    customer_address: customerAddress,
    num_machines: numMachines,
    authorized_representative_name: authRepName,
    authorized_representative_title: authRepTitle,
    ack_exclusive_supply: true,
    ack_minimum_purchase: true,
    ack_installation_maintenance: true,
  };

  // Merge coffee-specific data onto metadata BEFORE flipping the signature
  // status. Sign-as-provider then locks the row into pending-countersign.
  await supabaseAdmin
    .from("user_agreements")
    .update({ metadata: coffeeMetadata })
    .eq("id", start.agreement.id);

  try {
    const updated = await signAsProvider({
      agreementId: start.agreement.id,
      actingUserId: userId,
      typedName,
      consentEsign,
      emailSnapshot: profile.email,
      ipAddress: ip,
      userAgent: ua,
    });

    // Signing the coffee supply agreement is now sufficient to unlock the
    // coffee shop + checkout — no admin countersign is required for the
    // operator to start ordering. Countersign still runs (see the admin
    // queue) and produces the fully-executed PDF for records, but it is
    // no longer a prerequisite for placing an order.
    //
    // Best-effort — if the profile update fails, the signature record is
    // still saved and admin can fall back to toggling coffee_access_enabled
    // manually from the Users tab.
    try {
      await supabaseAdmin
        .from("profiles")
        .update({
          coffee_access_enabled: true,
          coffee_agreement_signed: true,
        })
        .eq("id", userId);
    } catch (e) {
      console.error("[coffee.agreement.sign] profile grant failed:", e);
    }

    // Generate a customer-signed PDF (countersign fields left null — the
    // fully-executed PDF with Apex countersignature is produced later by
    // the countersign endpoint). We attach this to BOTH the admin
    // notification and the customer's confirmation so the customer walks
    // away with an immediate copy of what they just signed. Non-fatal —
    // signing itself has already succeeded.
    let signedPdfBytes: Uint8Array | null = null;
    try {
      const template = await getActiveTemplate("coffee_supply");
      if (template) {
        signedPdfBytes = await generateCoffeeAgreementPdf({
          template_content_html: template.content_html,
          template_title: template.title,
          template_version: template.version,
          template_effective_date: template.effective_date,
          agreement_id: updated.id,
          metadata: {
            customer_name: customerName,
            customer_address: customerAddress,
            num_machines: numMachines,
            authorized_representative_name: authRepName,
            authorized_representative_title: authRepTitle,
            ack_exclusive_supply: true,
            ack_minimum_purchase: true,
            ack_installation_maintenance: true,
          },
          signature: {
            provider_typed_name: typedName,
            provider_email: profile.email,
            provider_signed_at_iso: updated.provider_signed_at ?? new Date().toISOString(),
            provider_ip: ip,
            provider_consent_esign: true,
            countersigner_name: null,
            countersigner_email: null,
            countersigner_at_iso: null,
          },
        });
      }
    } catch (pdfErr) {
      console.error("[coffee.agreement.sign] PDF gen failed:", pdfErr);
    }

    const resendClient = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.FROM_EMAIL || "receipts@bytebitevending.com";
    const pdfAttachment = signedPdfBytes
      ? [{
          filename: `Coffee-Supply-Agreement-${customerName.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`,
          content: Buffer.from(signedPdfBytes).toString("base64"),
        }]
      : undefined;

    // Customer confirmation — the on-file email receives a copy of the
    // signed agreement immediately.
    if (profile.email) {
      try {
        await resendClient.emails.send({
          from,
          to: profile.email,
          subject: `Thanks for signing your Coffee Supply Agreement`,
          html: `
            <p>Thank you for signing the Coffee Supply Agreement — we are looking forward to serving you.</p>
            <p>Please see the attached copy of the signed agreement and keep this for your records. You can start placing coffee orders right away; Apex AI Vending will countersign and send the fully-executed copy shortly.</p>
            <p style="margin-top:16px"><strong>Customer:</strong> ${escapeHtml(customerName)}<br />
               <strong>Address on file:</strong> ${escapeHtml(customerAddress)}<br />
               <strong>Number of machines:</strong> ${numMachines}<br />
               <strong>Authorized representative:</strong> ${escapeHtml(authRepName)} (${escapeHtml(authRepTitle)})<br />
               <strong>Signed at:</strong> ${escapeHtml(updated.provider_signed_at || "")}</p>
            <p><a href="${process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com"}/coffee" style="display:inline-block;background:#16a34a;color:#ffffff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Start ordering</a></p>
            <p style="margin-top:24px">Thanks!<br />Vending Connector</p>
          `,
          attachments: pdfAttachment,
        });
      } catch (e) {
        console.error("[coffee.agreement.sign] customer notification failed:", e);
      }
    }

    // Admin notification — same PDF attached so admin has the signed
    // record in the inbox before countersigning.
    try {
      const adminInbox = process.env.COFFEE_ADMIN_EMAIL || "james@apexaivending.com";
      await resendClient.emails.send({
        from,
        to: adminInbox,
        subject: `Coffee Supply Agreement signed by ${customerName} — countersign needed`,
        html: `
          <p>${escapeHtml(profile.full_name || profile.email)} signed the Equipment Loan &amp; Beverage Supply Agreement.</p>
          <p><strong>Customer:</strong> ${escapeHtml(customerName)}</p>
          <p><strong>Address:</strong> ${escapeHtml(customerAddress)}</p>
          <p><strong>Number of machines:</strong> ${numMachines}</p>
          <p><strong>Authorized rep:</strong> ${escapeHtml(authRepName)} (${escapeHtml(authRepTitle)})</p>
          <p><strong>Signed at:</strong> ${escapeHtml(updated.provider_signed_at || "")}</p>
          <p><strong>Typed name:</strong> ${escapeHtml(typedName)}</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com"}/admin/coffee/agreements">Open the coffee agreements queue →</a></p>
        `,
        attachments: pdfAttachment,
      });
    } catch (e) {
      console.error("[coffee.agreement.sign] admin notification failed:", e);
    }

    return NextResponse.json({ ok: true, agreement: updated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sign failed" }, { status: 400 });
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
