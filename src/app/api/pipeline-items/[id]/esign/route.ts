import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";
import {
  createDocumentFromTemplate,
  sendDocument,
  getDocumentStatus,
} from "@/lib/pandadoc";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: itemId } = await params;

  const url = new URL(req.url);
  const stepId = url.searchParams.get("step_id");

  let query = supabaseAdmin
    .from("esign_documents")
    .select("*")
    .eq("pipeline_item_id", itemId)
    .order("created_at", { ascending: false });

  if (stepId) query = query.eq("step_id", stepId);

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { id: itemId } = await params;
  const body = await req.json();

  const {
    step_id,
    template_id,
    document_name,
    recipient_email,
    recipient_name,
    fields,
    send_immediately,
  } = body;

  if (!step_id || !recipient_email || !document_name) {
    return NextResponse.json(
      { error: "step_id, document_name, and recipient_email required" },
      { status: 400 }
    );
  }

  try {
    let externalDocId: string | null = null;
    let status = "draft";

    if (template_id && process.env.PANDADOC_API_KEY) {
      const doc = await createDocumentFromTemplate({
        templateId: template_id,
        documentName: document_name,
        recipientEmail: recipient_email,
        recipientName: recipient_name || "",
        fields,
      });
      externalDocId = doc.id;
      status = "draft";

      if (send_immediately) {
        await new Promise((r) => setTimeout(r, 3000));
        await sendDocument(doc.id);
        status = "sent";
      }
    }

    const { data, error } = await supabaseAdmin
      .from("esign_documents")
      .insert({
        pipeline_item_id: itemId,
        step_id,
        provider: "pandadoc",
        external_document_id: externalDocId,
        template_id: template_id || null,
        document_name,
        recipient_email,
        recipient_name: recipient_name || null,
        status,
        sent_at: status === "sent" ? new Date().toISOString() : null,
      })
      .select("*")
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { id: itemId } = await params;
  const body = await req.json();
  const { esign_id, action } = body;

  if (!esign_id || !action) {
    return NextResponse.json(
      { error: "esign_id and action required" },
      { status: 400 }
    );
  }

  const { data: esignDoc } = await supabaseAdmin
    .from("esign_documents")
    .select("*")
    .eq("id", esign_id)
    .eq("pipeline_item_id", itemId)
    .single();

  if (!esignDoc) {
    return NextResponse.json(
      { error: "E-sign document not found" },
      { status: 404 }
    );
  }

  if (action === "send" && esignDoc.external_document_id) {
    try {
      await sendDocument(esignDoc.external_document_id);
      await supabaseAdmin
        .from("esign_documents")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", esign_id);
      return NextResponse.json({ ok: true, status: "sent" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Send failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (action === "check_status" && esignDoc.external_document_id) {
    try {
      const status = await getDocumentStatus(esignDoc.external_document_id);
      const mappedStatus = mapPandaDocStatus(status.status);
      await supabaseAdmin
        .from("esign_documents")
        .update({
          status: mappedStatus,
          updated_at: new Date().toISOString(),
          ...(mappedStatus === "completed"
            ? { completed_at: new Date().toISOString() }
            : {}),
        })
        .eq("id", esign_id);
      return NextResponse.json({ ok: true, status: mappedStatus });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Status check failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (action === "mark_completed") {
    await supabaseAdmin
      .from("esign_documents")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", esign_id);
    return NextResponse.json({ ok: true, status: "completed" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

function mapPandaDocStatus(pdStatus: string): string {
  const map: Record<string, string> = {
    "document.draft": "draft",
    "document.sent": "sent",
    "document.viewed": "viewed",
    "document.waiting_approval": "waiting_approval",
    "document.completed": "completed",
    "document.declined": "declined",
    "document.voided": "voided",
    "document.expired": "expired",
    draft: "draft",
    sent: "sent",
    viewed: "viewed",
    completed: "completed",
    declined: "declined",
    voided: "voided",
  };
  return map[pdStatus] || pdStatus;
}
