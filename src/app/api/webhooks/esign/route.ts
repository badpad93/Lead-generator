import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { downloadSignedPdf, verifyWebhookSignature } from "@/lib/pandadoc";

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
    }

    await supabaseAdmin
      .from("esign_documents")
      .update(updates)
      .eq("id", esignDoc.id);
  }

  return NextResponse.json({ ok: true });
}
