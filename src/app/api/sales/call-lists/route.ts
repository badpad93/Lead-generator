import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isCrmAdmin } from "@/lib/salesAuth";

/** GET /api/sales/call-lists?category=locations|operators */
export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const category = new URL(req.url).searchParams.get("category");

  let query = supabaseAdmin
    .from("sales_call_lists")
    .select("*")
    .order("created_at", { ascending: false });

  if (category) query = query.eq("category", category);

  // Sales reps only see lists assigned to them (or unassigned).
  // Admins see everything.
  if (!isCrmAdmin(user)) {
    query = query.or(`assigned_to.eq.${user.id},assigned_to.is.null`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Hydrate assignee names
  const lists = data || [];
  const ids = Array.from(new Set(lists.map((l) => l.assigned_to).filter(Boolean))) as string[];
  let nameById: Record<string, { full_name: string | null; email: string | null }> = {};
  if (ids.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    nameById = Object.fromEntries((profiles || []).map((p) => [p.id, { full_name: p.full_name, email: p.email }]));
  }
  const hydrated = lists.map((l) => ({
    ...l,
    assigned_profile: l.assigned_to ? nameById[l.assigned_to] || null : null,
  }));
  return NextResponse.json(hydrated);
}

/** POST /api/sales/call-lists — admin only */
export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user || !isCrmAdmin(user)) {
    return NextResponse.json({ error: "Only admins can create call lists" }, { status: 403 });
  }

  const body = await req.json();
  const { title, description, category, sheet_url, file_url, file_name, assigned_to } = body;
  if (!title || !category) {
    return NextResponse.json({ error: "title and category required" }, { status: 400 });
  }
  if (category !== "locations" && category !== "operators") {
    return NextResponse.json({ error: "invalid category" }, { status: 400 });
  }
  if (!sheet_url && !file_url) {
    return NextResponse.json({ error: "sheet_url or file_url required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("sales_call_lists")
    .insert({
      title,
      description: description || null,
      category,
      sheet_url: sheet_url || null,
      file_url: file_url || null,
      file_name: file_name || null,
      assigned_to: assigned_to || null,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
