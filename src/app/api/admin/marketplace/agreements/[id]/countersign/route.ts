import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { countersignAsAdmin, getUserAgreement, getActiveTemplate, renderExecutedHtml, persistExecutedDocument } from "@/lib/placementAgreements";
import { generateCoffeeAgreementPdf } from "@/lib/pdf/coffeeAgreementPdf";

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

      // Coffee-only: also generate a proper PDF copy and drop it next
      // to the HTML in the user-agreements bucket so it can be
      // downloaded from the customer's account. Non-fatal — countersign
      // itself has already succeeded whether or not the PDF renders.
      if (updated.agreement_type === "coffee_supply") {
        try {
          const meta = (updated.metadata ?? {}) as Record<string, unknown>;
          const pdfBytes = await generateCoffeeAgreementPdf({
            template_content_html: template.content_html,
            template_title: template.title,
            template_version: template.version,
            template_effective_date: template.effective_date,
            agreement_id: updated.id,
            metadata: {
              customer_name: typeof meta.customer_name === "string" ? meta.customer_name : null,
              customer_address: typeof meta.customer_address === "string" ? meta.customer_address : null,
              num_machines: typeof meta.num_machines === "number" ? meta.num_machines : null,
              authorized_representative_name: typeof meta.authorized_representative_name === "string" ? meta.authorized_representative_name : null,
              authorized_representative_title: typeof meta.authorized_representative_title === "string" ? meta.authorized_representative_title : null,
              ack_exclusive_supply: !!meta.ack_exclusive_supply,
              ack_minimum_purchase: !!meta.ack_minimum_purchase,
              ack_installation_maintenance: !!meta.ack_installation_maintenance,
            },
            signature: {
              provider_typed_name: updated.provider_typed_name ?? "",
              provider_email: updated.provider_email_snapshot ?? null,
              provider_signed_at_iso: updated.provider_signed_at ?? "",
              provider_ip: updated.provider_ip_address ?? null,
              provider_consent_esign: !!updated.provider_consent_esign,
              countersigner_name: updated.countersigner_name_snapshot ?? null,
              countersigner_email: updated.countersigner_email_snapshot ?? null,
              countersigner_at_iso: updated.countersigned_at ?? null,
            },
          });
          // Path convention: swap .html → .pdf on the executed HTML
          // path so both live side-by-side. The customer download
          // endpoint derives the PDF path from countersigned_document_path.
          const htmlPath = updated.countersigned_document_path ?? "";
          const pdfPath = htmlPath && htmlPath.endsWith(".html")
            ? `${htmlPath.slice(0, -".html".length)}.pdf`
            : `coffee-supply/${updated.user_id}/${updated.agreement_version}/${updated.id}.pdf`;
          const { error: pdfErr } = await supabaseAdmin.storage
            .from("user-agreements")
            .upload(pdfPath, new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" }), {
              upsert: true,
              contentType: "application/pdf",
            });
          if (pdfErr) {
            console.error("[agreement.countersign] coffee PDF upload failed:", pdfErr.message);
          }
        } catch (pdfExc) {
          console.error("[agreement.countersign] coffee PDF gen failed:", pdfExc);
        }
      }

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

    // Spawn workflows for coffee_supply agreements. placement_provider
    // agreements are not fulfillment workflows (the PP program has its
    // own tracking).
    if (updated.agreement_type === "coffee_supply") {
      try {
        const { spawnFromCoffeeAgreement } = await import("@/lib/workflows/hooks");
        await spawnFromCoffeeAgreement(updated.id);
      } catch (e) {
        console.error("[agreement.countersign] workflow spawn failed:", e);
      }
    }

    return NextResponse.json({ ok: true, agreement: updated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Countersign failed" }, { status: 400 });
  }
}
