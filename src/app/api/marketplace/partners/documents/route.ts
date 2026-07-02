import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";

/**
 * Uploads a partner document (W9, ID, insurance) to the private
 * 'placement-partner-docs' bucket and inserts a documents row.
 */
export async function POST(req: NextRequest) {
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();

  const form = await req.formData();
  const file = form.get("file");
  const type = String(form.get("type") || "other");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  if (!["w9", "id", "insurance", "other"].includes(type)) {
    return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
  const timestamp = Date.now();
  const path = `${user.id}/${type}-${timestamp}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabaseAdmin.storage
    .from("placement-partner-docs")
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: true });

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const { data: urlData } = supabaseAdmin.storage
    .from("placement-partner-docs")
    .getPublicUrl(path);

  const { data: doc, error } = await supabaseAdmin
    .from("placement_partner_documents")
    .insert({
      partner_id: user.id,
      document_type: type,
      file_url: urlData?.publicUrl || null,
      file_name: file.name,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // W9 mirrors to the partner header for quick checks
  if (type === "w9") {
    await supabaseAdmin
      .from("placement_partners")
      .update({ w9_uploaded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", user.id);
  }

  await supabaseAdmin.from("placement_partner_activity").insert({
    partner_id: user.id,
    actor_id: user.id,
    activity_type: "document_uploaded",
    description: `${type.toUpperCase()} uploaded: ${file.name}`,
  });

  return NextResponse.json(doc);
}
