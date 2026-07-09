import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { countersignAsAdmin, getUserAgreement, getActiveTemplate, renderExecutedHtml, persistExecutedDocument } from "@/lib/placementAgreements";

/**
 * POST /api/admin/marketplace/agreements/[id]/countersign
 * Body: { }
 *
 * Countersigns the agreement, uploads the executed HTML doc to the
 * user-agreements storage bucket, and emails the provider the fully
 * executed copy.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: admin } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email")
    .eq("id", adminId)
    .maybeSingle();
  if (!admin) return NextResponse.json({ error: "Admin profile missing" }, { status: 500 });

  try {
    const updated = await countersignAsAdmin({
      agreementId: id,
      adminUserId: adminId,
      adminNameSnapshot: admin.full_name || "Vending Connector Admin",
      adminEmailSnapshot: admin.email || "",
    });

    // Render + persist the executed document. Uses the agreement's own type
    // (placement_provider, coffee_supply, …) so the countersign flow works
    // for every template kind.
    const template = await getActiveTemplate(updated.agreement_type);
    if (template) {
      const html = renderExecutedHtml({ template, agreement: updated });
      await persistExecutedDocument(updated, html);

      // Email the provider a copy.
      try {
        const providerAgreement = await getUserAgreement(updated.user_id, updated.agreement_type);
        const recipient = providerAgreement?.provider_email_snapshot;
        if (recipient) {
          const resend = new Resend(process.env.RESEND_API_KEY);
          const from = process.env.FROM_EMAIL || "receipts@bytebitevending.com";
          await resend.emails.send({
            from,
            to: recipient,
            subject: `${template.title} — fully executed`,
            html: `<p>Your ${template.title} has been fully executed by Vending Connector. A copy is attached below.</p>${html}`,
          });
        }
      } catch (e) {
        console.error("[agreement.countersign] provider email failed:", e);
      }
    }

    return NextResponse.json({ ok: true, agreement: updated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Countersign failed" }, { status: 400 });
  }
}
