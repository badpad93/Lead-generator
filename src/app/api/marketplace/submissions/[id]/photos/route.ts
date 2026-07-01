import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();
  const { id } = await params;

  // Ownership check
  const { data: submission } = await supabaseAdmin
    .from("placement_submissions")
    .select("id, partner_id, admin_status")
    .eq("id", id)
    .maybeSingle();
  if (!submission || submission.partner_id !== user.id) return forbidden();
  if (submission.admin_status === "approved" || submission.admin_status === "rejected") {
    return NextResponse.json({ error: "Cannot modify a reviewed submission" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const caption = String(form.get("caption") || "");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const timestamp = Date.now();
  const path = `${id}/${timestamp}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabaseAdmin.storage
    .from("placement-submissions")
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: true });
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const { data: urlData } = supabaseAdmin.storage
    .from("placement-submissions")
    .getPublicUrl(path);

  const { data: photo, error } = await supabaseAdmin
    .from("placement_submission_photos")
    .insert({
      submission_id: id,
      file_url: urlData?.publicUrl || null,
      file_name: file.name,
      caption: caption || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(photo);
}
