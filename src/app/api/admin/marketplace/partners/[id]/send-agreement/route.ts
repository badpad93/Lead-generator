import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { getOrStartAgreement } from "@/lib/placementAgreements";

/**
 * POST /api/admin/marketplace/partners/[id]/send-agreement
 *
 * Emails the placement partner a link to the Placement Provider Agreement
 * sign page and lazily creates the user_agreements row against the active
 * template so their status is trackable in the admin queue.
 *
 * Idempotent — repeated calls just re-send the email.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: partnerId } = await params;

  // Confirm the target is a placement partner and grab their email.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", partnerId)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  if (profile.role !== "placement_partner" && profile.role !== "admin") {
    return NextResponse.json({ error: "Target user is not a placement partner" }, { status: 400 });
  }
  if (!profile.email) return NextResponse.json({ error: "Partner has no email on file" }, { status: 400 });

  // Lazily create the user_agreements row (so status becomes visible in the
  // admin queue even before the PP hits the sign page).
  const start = await getOrStartAgreement(partnerId, "placement_provider");
  if (!start) return NextResponse.json({ error: "No active PPA template" }, { status: 500 });

  // Fire the email.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com";
  const signUrl = `${appUrl}/placement/agreement`;
  const from = process.env.FROM_EMAIL || "receipts@bytebitevending.com";

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from,
      to: profile.email,
      subject: "Action required: sign your Placement Provider Agreement",
      html: `
        <div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px">
          <h1 style="color:#16a34a;font-size:22px;margin:0 0 12px">Vending Connector</h1>
          <p style="font-size:14px;color:#374151;line-height:1.6">Hi ${escapeHtml(profile.full_name || "there")},</p>
          <p style="font-size:14px;color:#374151;line-height:1.6">
            To keep your Placement Provider account active, please review and sign the current
            <strong>Placement Provider Agreement</strong>.
          </p>
          <p style="font-size:14px;color:#374151;line-height:1.6">
            Once you sign, Vending Connector will countersign and email you a fully executed copy.
          </p>
          <p style="margin:24px 0">
            <a href="${signUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Review &amp; sign the agreement →</a>
          </p>
          <p style="font-size:12px;color:#6b7280;line-height:1.6">
            If the button doesn&apos;t work, paste this link into your browser:<br/>
            <span style="font-family:monospace">${signUrl}</span>
          </p>
          <p style="font-size:12px;color:#6b7280;margin-top:20px">
            Questions? Reply to this email.
          </p>
        </div>
      `,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Email failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, agreement_id: start.agreement.id, status: start.agreement.status });
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
