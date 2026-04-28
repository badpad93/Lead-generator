import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
    .select("id, status")
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

  const { error } = await supabaseAdmin
    .from("agreement_tokens")
    .update({
      status: "signed",
      signature_name: signature_name.trim(),
      signature_ip: ip,
      signed_at: new Date().toISOString(),
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

  return NextResponse.json({ ok: true, status: "signed" });
}
