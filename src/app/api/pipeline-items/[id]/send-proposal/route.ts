import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";
import { createDocumentFromTemplate, sendDocument } from "@/lib/pandadoc";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { id: itemId } = await params;

  const { data: item } = await supabaseAdmin
    .from("pipeline_items")
    .select("*, sales_accounts(id, business_name, contact_name, email), pipelines(id, name)")
    .eq("id", itemId)
    .single();

  if (!item) {
    return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
  }
  if (!item.location_id) {
    return NextResponse.json({ error: "No location linked to this pipeline item" }, { status: 422 });
  }
  if (!item.current_step_id) {
    return NextResponse.json({ error: "No current step" }, { status: 422 });
  }

  const { data: step } = await supabaseAdmin
    .from("pipeline_steps")
    .select("*")
    .eq("id", item.current_step_id)
    .single();

  if (!step?.pandadoc_preliminary_template_id) {
    return NextResponse.json(
      { error: "Step has no preliminary PandaDoc template configured" },
      { status: 422 }
    );
  }

  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("id", item.location_id)
    .single();

  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const recipientEmail = item.sales_accounts?.email;
  const recipientName = item.sales_accounts?.contact_name || item.sales_accounts?.business_name || item.name;

  if (!recipientEmail) {
    return NextResponse.json(
      { error: "Linked account has no email — cannot send proposal" },
      { status: 422 }
    );
  }

  try {
    const fields: Record<string, string> = {
      industry: location.industry || "",
      zip: location.zip || "",
      employee_count: String(location.employee_count || ""),
      traffic_count: String(location.traffic_count || ""),
      customer_name: recipientName,
      customer_email: recipientEmail,
      business_name: item.sales_accounts?.business_name || "",
    };

    if (step.payment_amount) {
      fields.payment_amount = String(step.payment_amount);
    }

    const doc = await createDocumentFromTemplate({
      templateId: step.pandadoc_preliminary_template_id,
      documentName: `Location Proposal — ${item.name}`,
      recipientEmail,
      recipientName,
      fields,
    });

    // Wait for PandaDoc to process the document before sending
    await new Promise((r) => setTimeout(r, 3000));
    await sendDocument(doc.id, "Please review this location placement proposal.");

    // Create esign_documents record
    await supabaseAdmin.from("esign_documents").insert({
      pipeline_item_id: itemId,
      step_id: item.current_step_id,
      provider: "pandadoc",
      external_document_id: doc.id,
      template_id: step.pandadoc_preliminary_template_id,
      document_name: `Location Proposal — ${item.name}`,
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      status: "sent",
      sent_at: new Date().toISOString(),
      metadata: { type: "preliminary_proposal", location_id: item.location_id },
    });

    // Create pending payment record if payment is required via PandaDoc+Stripe
    if (step.requires_payment && step.payment_provider === "pandadoc_stripe" && step.payment_amount) {
      await supabaseAdmin.from("pipeline_payments").insert({
        pipeline_item_id: itemId,
        step_id: item.current_step_id,
        provider: "stripe",
        amount: step.payment_amount,
        currency: "USD",
        description: step.payment_description || `Proposal payment — ${item.name}`,
        status: "pending",
        metadata: { via: "pandadoc_stripe", pandadoc_document_id: doc.id },
      });
    }

    // Update proposal status
    await supabaseAdmin
      .from("pipeline_items")
      .update({ proposal_status: "proposal_sent", updated_at: new Date().toISOString() })
      .eq("id", itemId);

    return NextResponse.json({
      ok: true,
      pandadoc_document_id: doc.id,
      proposal_status: "proposal_sent",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
