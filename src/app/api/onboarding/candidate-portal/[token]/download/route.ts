import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: ct } = await supabaseAdmin
    .from("candidate_tokens")
    .select("id, status")
    .eq("token", token)
    .single();

  if (!ct || ct.status === "expired") {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  const url = new URL(req.url);
  const filePath = url.searchParams.get("file_path");

  if (!filePath) {
    return NextResponse.json({ error: "file_path required" }, { status: 400 });
  }

  const { data: fileData, error } = await supabaseAdmin.storage
    .from("document-templates")
    .download(filePath);

  if (error || !fileData) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const fileName = filePath.split("/").pop() || "document.pdf";

  return new NextResponse(arrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
