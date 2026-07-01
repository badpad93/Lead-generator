import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const now = new Date().toISOString();
  const verify = body.action === "verify";
  const { data: doc, error } = await supabaseAdmin
    .from("placement_partner_documents")
    .update({
      verified_at: verify ? now : null,
      verified_by: verify ? adminId : null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("placement_partner_activity").insert({
    partner_id: doc.partner_id,
    actor_id: adminId,
    activity_type: verify ? "document_verified" : "document_unverified",
    description: `${doc.document_type.toUpperCase()} — ${doc.file_name || "document"}`,
  });

  return NextResponse.json(doc);
}
