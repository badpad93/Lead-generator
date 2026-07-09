import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { signAsProvider, getOrStartAgreement } from "@/lib/placementAgreements";

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

    // Notify admin so they know to countersign.
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const adminInbox = process.env.COFFEE_ADMIN_EMAIL || "james@apexaivending.com";
      const from = process.env.FROM_EMAIL || "receipts@bytebitevending.com";
      await resend.emails.send({
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
