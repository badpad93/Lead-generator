import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, docId } = await params;

  if (!isElevatedRole(user.role)) {
    const { data: candidate } = await supabaseAdmin.from("candidates").select("assigned_to").eq("id", id).single();
    if (!candidate || candidate.assigned_to !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: doc } = await supabaseAdmin
    .from("candidate_documents")
    .select("file_url")
    .eq("id", docId)
    .eq("candidate_id", id)
    .single();

  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const storagePath = doc.file_url?.replace(/^.*\/sales-documents\//, "") || "";
  if (storagePath) {
    await supabaseAdmin.storage.from("sales-documents").remove([storagePath]);
  }

  const { error } = await supabaseAdmin.from("candidate_documents").delete().eq("id", docId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
