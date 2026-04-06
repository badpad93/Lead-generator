import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/** POST /api/sales/documents — register a document after uploading to storage */
export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { account_id, order_id, file_url, file_name, type } = body;
  if (!file_url) {
    return NextResponse.json({ error: "file_url required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("sales_documents")
    .insert({
      account_id: account_id || null,
      order_id: order_id || null,
      file_url,
      file_name: file_name || null,
      type: type || "contract",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

/** DELETE /api/sales/documents?id=<id> */
export async function DELETE(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabaseAdmin.from("sales_documents").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
