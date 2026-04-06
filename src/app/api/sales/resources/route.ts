import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/** GET /api/sales/resources — any sales/admin user can list */
export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const category = new URL(req.url).searchParams.get("category");
  let query = supabaseAdmin
    .from("sales_resources")
    .select("*")
    .order("created_at", { ascending: false });
  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

/** POST /api/sales/resources — admin only */
export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Only admins can upload resources" }, { status: 403 });
  }

  const body = await req.json();
  const { title, description, category, file_url, file_name, file_size } = body;
  if (!title || !file_url) {
    return NextResponse.json({ error: "title and file_url required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("sales_resources")
    .insert({
      title,
      description: description || null,
      category: category || "other",
      file_url,
      file_name: file_name || null,
      file_size: file_size || null,
      uploaded_by: user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

/** DELETE /api/sales/resources?id=<id> — admin only */
export async function DELETE(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Only admins can delete resources" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabaseAdmin.from("sales_resources").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
