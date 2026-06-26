import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCoffeeUser, forbiddenResponse } from "@/lib/coffeeAuth";
import { generateProposalPdf } from "@/lib/generateProposalPdf";
import { Resend } from "resend";

const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCoffeeUser(req);
  if (!user?.coffee_access_enabled) return forbiddenResponse();

  const { id } = await params;

  const { data: proposal, error } = await supabaseAdmin
    .from("coffee_pricing_proposals")
    .select("*, coffee_pricing_proposal_items(*)")
    .eq("id", id)
    .eq("operator_id", user.id)
    .single();

  if (error || !proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!proposal.client_email) {
    return NextResponse.json({ error: "Client email is required to send proposal" }, { status: 400 });
  }

  const items = proposal.coffee_pricing_proposal_items || [];
  if (items.length === 0) {
    return NextResponse.json({ error: "Proposal has no items" }, { status: 400 });
  }

  const baseUrl = req.nextUrl.origin;
  const proposalUrl = `${baseUrl}/coffee/proposals/${proposal.share_token}`;

  try {
    const pdfBytes = await generateProposalPdf(proposal, items);

    const pdfBuffer = Buffer.from(pdfBytes);

    const bucketPath = `proposals/${id}/proposal-${proposal.proposal_number}.pdf`;
    await supabaseAdmin.storage
      .from("sales-documents")
      .upload(bucketPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    const companyName = proposal.company_name || "Your Vending Partner";
    const itemRows = items
      .map(
        (item: { product_name: string; quantity: number; retail_price: number; retail_subtotal: number }) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #111827;">${item.product_name}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #374151; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #374151; text-align: right;">$${Number(item.retail_price).toFixed(2)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #374151; text-align: right;">$${Number(item.retail_subtotal).toFixed(2)}</td>
        </tr>`
      )
      .join("");

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #16a34a; font-size: 24px; margin: 0;">${companyName}</h1>
          <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0;">Coffee Service Proposal</p>
        </div>

        <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <p style="margin: 0 0 16px; font-size: 14px; color: #374151;">
            Hello${proposal.client_name ? ` ${proposal.client_name}` : ""},
          </p>
          <p style="margin: 0 0 16px; font-size: 14px; color: #374151; line-height: 1.6;">
            Please find below your customized coffee service pricing proposal from <strong>${companyName}</strong>.
          </p>

          <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 16px;">
            <thead>
              <tr style="background: #e5e7eb;">
                <th style="padding: 8px 12px; text-align: left; color: #374151;">Product</th>
                <th style="padding: 8px 12px; text-align: center; color: #374151;">Qty</th>
                <th style="padding: 8px 12px; text-align: right; color: #374151;">Unit Price</th>
                <th style="padding: 8px 12px; text-align: right; color: #374151;">Total</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>

          <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 16px;">
            <tr style="border-top: 1px solid #e5e7eb;">
              <td style="padding: 8px 0 0; color: #111827; font-weight: 700;">Total</td>
              <td style="padding: 8px 0 0; text-align: right; color: #16a34a; font-weight: 700; font-size: 18px;">$${Number(proposal.total_retail).toFixed(2)}</td>
            </tr>
          </table>

          ${proposal.notes ? `<p style="margin: 16px 0 0; font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 12px;"><strong>Notes:</strong> ${proposal.notes}</p>` : ""}
        </div>

        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${proposalUrl}" style="display: inline-block; background: #16a34a; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">View Full Proposal</a>
        </div>

        ${proposal.valid_until ? `<p style="font-size: 12px; color: #9ca3af; text-align: center;">This proposal is valid until ${new Date(proposal.valid_until).toLocaleDateString()}</p>` : ""}

        <p style="font-size: 13px; color: #6b7280; text-align: center;">
          Questions? Contact us at
          <a href="mailto:${proposal.company_email || ""}" style="color: #16a34a;">${proposal.company_email || ""}</a>
          ${proposal.company_phone ? `or call <a href="tel:${proposal.company_phone}" style="color: #16a34a;">${proposal.company_phone}</a>` : ""}
        </p>
      </div>
    `;

    await getResend().emails.send({
      from: FROM_EMAIL,
      to: proposal.client_email,
      replyTo: proposal.company_email || undefined,
      subject: `Coffee Service Proposal from ${companyName} — ${proposal.proposal_number}`,
      html,
      attachments: [
        {
          filename: `Proposal-${proposal.proposal_number}.pdf`,
          content: pdfBuffer.toString("base64"),
        },
      ],
    });

    await supabaseAdmin
      .from("coffee_pricing_proposals")
      .update({ status: "sent", updated_at: new Date().toISOString() })
      .eq("id", id);

    await supabaseAdmin.from("coffee_pricing_proposal_activity_log").insert({
      proposal_id: id,
      action: "sent",
      actor_id: user.id,
      actor_name: user.full_name,
      details: { sent_to: proposal.client_email },
    });

    return NextResponse.json({ success: true, proposal_url: proposalUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
