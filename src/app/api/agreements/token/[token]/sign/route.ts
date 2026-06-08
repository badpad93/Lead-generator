import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendAgreementSignedNotification } from "@/lib/agreementEmail";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json();
  const { signature_name } = body;

  if (!signature_name || typeof signature_name !== "string" || signature_name.trim().length < 2) {
    return NextResponse.json({ error: "Please type your full name to sign" }, { status: 400 });
  }

  const { data: agreement } = await supabaseAdmin
    .from("agreement_tokens")
    .select("id, status, pipeline_item_id, recipient_name, recipient_email, pricing_price")
    .eq("token", token)
    .single();

  if (!agreement) {
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  }

  if (agreement.status === "paid") {
    return NextResponse.json({ error: "Agreement already paid" }, { status: 400 });
  }

  if (agreement.status === "signed") {
    return NextResponse.json({ ok: true, status: "signed" });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const signedAt = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("agreement_tokens")
    .update({
      status: "signed",
      signature_name: signature_name.trim(),
      signature_ip: ip,
      signed_at: signedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", agreement.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update esign_documents for gating
  await supabaseAdmin
    .from("esign_documents")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("external_document_id", agreement.id);

  // Update pipeline item to reflect signed (not paid) status
  if (agreement.pipeline_item_id) {
    await supabaseAdmin
      .from("pipeline_items")
      .update({ proposal_status: "signed", updated_at: new Date().toISOString() })
      .eq("id", agreement.pipeline_item_id)
      .neq("proposal_status", "paid");
  }

  // Get business name for the notification
  let businessName = "";
  if (agreement.pipeline_item_id) {
    const { data: pItem } = await supabaseAdmin
      .from("pipeline_items")
      .select("name, sales_accounts(business_name)")
      .eq("id", agreement.pipeline_item_id)
      .single();
    const acct = pItem?.sales_accounts as unknown as { business_name: string } | null;
    businessName = acct?.business_name || pItem?.name || "";
  }

  // Notify admin that agreement was signed
  try {
    await sendAgreementSignedNotification({
      type: "sales",
      signatureName: signature_name.trim(),
      recipientName: agreement.recipient_name || signature_name.trim(),
      recipientEmail: agreement.recipient_email || "",
      businessName,
      signedAt,
      pipelineItemId: agreement.pipeline_item_id,
      price: agreement.pricing_price ? Number(agreement.pricing_price) : null,
    });
  } catch (emailErr) {
    console.error("[agreement-sign] Failed to send admin notification:", emailErr);
  }

  return NextResponse.json({ ok: true, status: "signed" });
}
