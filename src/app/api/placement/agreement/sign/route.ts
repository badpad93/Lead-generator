import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";
import { signAsProvider, getOrStartAgreement } from "@/lib/placementAgreements";

/**
 * POST /api/placement/agreement/sign
 * Body: { typed_name, consent_esign, agreement_id? }
 *
 * Records the provider's signature and flips the agreement to
 * provider_signed_pending_company_countersign. Notifies admins so they
 * know to countersign.
 */
export async function POST(req: NextRequest) {
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();

  const body = await req.json().catch(() => ({}));
  const typedName = String(body.typed_name || "").trim();
  const consentEsign = !!body.consent_esign;

  if (!typedName) return NextResponse.json({ error: "Typed legal name is required" }, { status: 400 });
  if (!consentEsign) return NextResponse.json({ error: "You must consent to conduct business electronically" }, { status: 400 });

  // Look up (or start) the caller's agreement against the active template.
  const start = await getOrStartAgreement(user.id, "placement_provider");
  if (!start) return NextResponse.json({ error: "No active placement provider agreement template" }, { status: 500 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const ua = req.headers.get("user-agent") || null;

  try {
    const updated = await signAsProvider({
      agreementId: start.agreement.id,
      actingUserId: user.id,
      typedName,
      consentEsign,
      emailSnapshot: user.email,
      ipAddress: ip,
      userAgent: ua,
    });

    // Fire-and-forget admin notification.
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const adminInbox = process.env.PPA_ADMIN_INBOX || process.env.COFFEE_ADMIN_EMAIL || "james@apexaivending.com";
      const from = process.env.FROM_EMAIL || "receipts@bytebitevending.com";
      await resend.emails.send({
        from,
        to: adminInbox,
        subject: `PPA signed by ${user.business_name || user.full_name} — countersign needed`,
        html: `
          <p>${escapeHtml(user.full_name || user.email)} signed the Placement Provider Agreement.</p>
          <p><strong>Business:</strong> ${escapeHtml(user.business_name || "—")}</p>
          <p><strong>Email:</strong> ${escapeHtml(user.email)}</p>
          <p><strong>Signed at:</strong> ${escapeHtml(updated.provider_signed_at || "")}</p>
          <p><strong>Typed name:</strong> ${escapeHtml(typedName)}</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com"}/admin/marketplace/agreements">Open the admin countersign queue →</a></p>
        `,
      });
    } catch (e) {
      console.error("[ppa.sign] admin notification failed:", e);
    }

    return NextResponse.json({ ok: true, agreement: updated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sign failed" }, { status: 400 });
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
