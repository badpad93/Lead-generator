import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: employeeId } = await params;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const ext = file.name.split(".").pop() || "bin";
  const storagePath = `team/${employeeId}/${Date.now()}_${file.name}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabaseAdmin.storage
    .from("sales-documents")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const { data: signedData } = await supabaseAdmin.storage
    .from("sales-documents")
    .createSignedUrl(storagePath, 60 * 60 * 24);

  const { data: doc, error: docErr } = await supabaseAdmin
    .from("employee_documents")
    .insert({
      employee_id: employeeId,
      file_name: file.name,
      file_type: ext,
      file_url: storagePath,
    })
    .select("*")
    .single();

  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 });

  return NextResponse.json({
    ...doc,
    signed_url: signedData?.signedUrl || "",
  }, { status: 201 });
}
