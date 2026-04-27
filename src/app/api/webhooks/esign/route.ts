import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  createDocumentFromTemplate,
  downloadSignedPdf,
  sendDocument,
  verifyWebhookSignature,
} from "@/lib/pandadoc";
import { checkStepGating } from "@/lib/stepGating";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature =
    req.headers.get("x-pandadoc-signature") || "";

  if (
    process.env.PANDADOC_WEBHOOK_SECRET &&
    !verifyWebhookSignature(rawBody, signature)
  ) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  let payload: { event: string; data: Record<string, unknown> }[];
  try {
    payload = JSON.parse(rawBody);
    if (!Array.isArray(payload)) payload = [JSON.parse(rawBody)];
  } catch {
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400 }
    );
  }

  for (const event of payload) {
    const eventType = event.event || (event as Record<string, unknown>).event_type;
    const data = event.data || event;

    const externalDocId =
      (data.id as string) ||
      (data.document_id as string) ||
      ((data as Record<string, unknown>).uuid as string);

    if (!externalDocId) continue;

    const { data: esignDoc } = await supabaseAdmin
      .from("esign_documents")
      .select("*")
      .eq("external_document_id", externalDocId)
      .maybeSingle();

    if (!esignDoc) continue;

    const statusMap: Record<string, string> = {
      "document_state_changed.document.sent": "sent",
      "document_state_changed.document.viewed": "viewed",
      "document_state_changed.document.completed": "completed",
      "document_state_changed.document.declined": "declined",
      "document_state_changed.document.voided": "voided",
      "document_state_changed.document.expired": "expired",
      document_completed: "completed",
      document_sent: "sent",
      document_viewed: "viewed",
      document_declined: "declined",
    };

    const newStatus = statusMap[eventType as string];
    if (!newStatus) continue;

    const updates: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === "completed") {
      updates.completed_at = new Date().toISOString();

      // Download signed PDF and store in Supabase
      try {
        const pdfBuffer = await downloadSignedPdf(externalDocId);
        const storagePath = `pipeline-docs/${esignDoc.pipeline_item_id}/signed_${Date.now()}_${esignDoc.document_name.replace(/\s+/g, "_")}.pdf`;

        await supabaseAdmin.storage
          .from("sales-documents")
          .upload(storagePath, pdfBuffer, {
            contentType: "application/pdf",
            upsert: false,
          });

        updates.signed_pdf_url = storagePath;

        // Also create a pipeline_item_document record if there's a matching step_document
        const { data: stepDocs } = await supabaseAdmin
          .from("step_documents")
          .select("id")
          .eq("step_id", esignDoc.step_id)
          .limit(1);

        if (stepDocs && stepDocs.length > 0) {
          const { data: existing } = await supabaseAdmin
            .from("pipeline_item_documents")
            .select("id")
            .eq("pipeline_item_id", esignDoc.pipeline_item_id)
            .eq("step_document_id", stepDocs[0].id)
            .maybeSingle();

          if (existing) {
            await supabaseAdmin
              .from("pipeline_item_documents")
              .update({
                file_url: storagePath,
                file_name: `${esignDoc.document_name} (signed).pdf`,
                completed: true,
                uploaded_at: new Date().toISOString(),
              })
              .eq("id", existing.id);
          } else {
            await supabaseAdmin
              .from("pipeline_item_documents")
              .insert({
                pipeline_item_id: esignDoc.pipeline_item_id,
                step_document_id: stepDocs[0].id,
                file_url: storagePath,
                file_name: `${esignDoc.document_name} (signed).pdf`,
                completed: true,
              });
          }
        }
      } catch {
        // PDF download failure shouldn't block status update
      }

      // Phase 2: If this is a preliminary proposal with PandaDoc+Stripe payment,
      // handle location reveal and full document generation
      const metadata = esignDoc.metadata as Record<string, unknown> | null;
      if (metadata?.type === "preliminary_proposal" && metadata?.location_id) {
        await handleProposalPaymentCompletion(
          esignDoc,
          metadata.location_id as string
        );
      }
    }

    await supabaseAdmin
      .from("esign_documents")
      .update(updates)
      .eq("id", esignDoc.id);
  }

  return NextResponse.json({ ok: true });
}

async function handleProposalPaymentCompletion(
  esignDoc: Record<string, unknown>,
  locationId: string
) {
  const itemId = esignDoc.pipeline_item_id as string;
  const stepId = esignDoc.step_id as string;

  // Mark the pipeline payment as completed
  await supabaseAdmin
    .from("pipeline_payments")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("pipeline_item_id", itemId)
    .eq("step_id", stepId)
    .eq("status", "pending");

  // Reveal the location
  await supabaseAdmin
    .from("locations")
    .update({
      is_revealed: true,
      revealed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", locationId);

  // Fetch step for full template ID
  const { data: step } = await supabaseAdmin
    .from("pipeline_steps")
    .select("*")
    .eq("id", stepId)
    .single();

  if (!step?.pandadoc_full_template_id) {
    // No full template configured — just update status
    await supabaseAdmin
      .from("pipeline_items")
      .update({
        proposal_status: "paid",
        updated_at: new Date().toISOString(),
      })
      .eq("id", itemId);
    return;
  }

  // Fetch full location data + pipeline item for recipient info
  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("id", locationId)
    .single();

  const { data: item } = await supabaseAdmin
    .from("pipeline_items")
    .select("*, sales_accounts(id, business_name, contact_name, email, phone)")
    .eq("id", itemId)
    .single();

  if (!location || !item) return;

  const recipientEmail = item.sales_accounts?.email;
  const recipientName =
    item.sales_accounts?.contact_name ||
    item.sales_accounts?.business_name ||
    item.name;

  if (!recipientEmail) return;

  try {
    // Generate full PandaDoc document with all location details
    const fields: Record<string, string> = {
      industry: location.industry || "",
      zip: location.zip || "",
      employee_count: String(location.employee_count || ""),
      traffic_count: String(location.traffic_count || ""),
      machine_type: location.machine_type || "",
      machines_requested: String(location.machines_requested || ""),
      location_name: location.location_name || "",
      address: location.address || "",
      phone: location.phone || "",
      decision_maker_name: location.decision_maker_name || "",
      decision_maker_email: location.decision_maker_email || "",
      customer_name: recipientName,
      customer_email: recipientEmail,
      customer_phone: item.sales_accounts?.phone || "",
      business_name: item.sales_accounts?.business_name || "",
    };

    const fullPrice = step.payment_amount ? Number(step.payment_amount) : null;
    if (fullPrice) {
      fields.payment_amount = String(fullPrice);
    }

    const pricingTables = fullPrice
      ? [
          {
            name: "Quote 1",
            data_merge: true,
            options: { currency: "USD", discount: { type: "absolute", value: 0 } },
            sections: [
              {
                title: "",
                default: true,
                rows: [
                  {
                    options: { optional: false, optional_selected: true, qty_editable: false },
                    data: {
                      name: "Location Placement",
                      description: location.machine_type
                        ? `${location.machine_type} — ${location.machines_requested || 1} machine(s)`
                        : `${location.machines_requested || 1} machine(s)`,
                      price: fullPrice,
                      qty: 1,
                    },
                  },
                ],
              },
            ],
          },
        ]
      : undefined;

    const doc = await createDocumentFromTemplate({
      templateId: step.pandadoc_full_template_id,
      documentName: `Full Location Details — ${item.name}`,
      recipientEmail,
      recipientName,
      fields,
      pricing_tables: pricingTables,
    });

    await new Promise((r) => setTimeout(r, 3000));
    await sendDocument(doc.id, "Your payment has been received. Here are the full location details.");

    // Record the full document
    await supabaseAdmin.from("esign_documents").insert({
      pipeline_item_id: itemId,
      step_id: stepId,
      provider: "pandadoc",
      external_document_id: doc.id,
      template_id: step.pandadoc_full_template_id,
      document_name: `Full Location Details — ${item.name}`,
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      status: "sent",
      sent_at: new Date().toISOString(),
      metadata: { type: "full_proposal", location_id: locationId },
    });
  } catch {
    // Full doc send failure shouldn't block payment processing
  }

  // Update proposal status
  await supabaseAdmin
    .from("pipeline_items")
    .update({
      proposal_status: "paid",
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  // Auto-advance if all step requirements are met and no admin approval needed
  if (!step.requires_admin_approval) {
    const gating = await checkStepGating(itemId, stepId);
    if (gating.canAdvance) {
      const { data: steps } = await supabaseAdmin
        .from("pipeline_steps")
        .select("id")
        .eq("pipeline_id", item.pipeline_id)
        .order("order_index");

      if (steps) {
        const currentIdx = steps.findIndex((s) => s.id === stepId);
        if (currentIdx === steps.length - 1) {
          await supabaseAdmin
            .from("pipeline_items")
            .update({
              status: "won",
              updated_at: new Date().toISOString(),
            })
            .eq("id", itemId);
        } else if (currentIdx >= 0 && currentIdx < steps.length - 1) {
          await supabaseAdmin
            .from("pipeline_items")
            .update({
              current_step_id: steps[currentIdx + 1].id,
              updated_at: new Date().toISOString(),
            })
            .eq("id", itemId);
        }
      }
    }
  }
}
