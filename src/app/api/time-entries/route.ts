import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";

const CLOCK_ROLES = ["admin", "sales", "market_leader", "director_of_sales"];

async function getUserRole(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return data?.role ?? null;
}

/** GET /api/time-entries — list time entries (own or all for admin) */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = await getUserRole(userId);
  const isAdmin = role === "admin";
  const params = req.nextUrl.searchParams;

  const targetUserId = params.get("user_id");
  const from = params.get("from");
  const to = params.get("to");
  const page = Math.max(0, parseInt(params.get("page") || "0"));
  const pageSize = 50;

  let query = supabaseAdmin
    .from("time_entries")
    .select("*, profiles!user_id(id, full_name, role)", { count: "exact" });

  if (isAdmin && targetUserId) {
    query = query.eq("user_id", targetUserId);
  } else if (isAdmin) {
    // Admin sees all
  } else if (CLOCK_ROLES.includes(role || "")) {
    query = query.eq("user_id", userId);
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (from) query = query.gte("clock_in", from);
  if (to) query = query.lte("clock_in", to);

  const offset = page * pageSize;
  const { data, error, count } = await query
    .order("clock_in", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data || [], total: count || 0 });
}

/** POST /api/time-entries — clock in (creates a new open entry) */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = await getUserRole(userId);
  if (!CLOCK_ROLES.includes(role || "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check if already clocked in
  const { data: open } = await supabaseAdmin
    .from("time_entries")
    .select("id")
    .eq("user_id", userId)
    .is("clock_out", null)
    .limit(1);

  if (open && open.length > 0) {
    return NextResponse.json(
      { error: "Already clocked in", entry_id: open[0].id },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({}));

  const insertData: Record<string, unknown> = {
    user_id: userId,
    notes: body.notes || null,
  };
  if (role) insertData.role = role;

  const { data, error } = await supabaseAdmin
    .from("time_entries")
    .insert(insertData)
    .select("*")
    .single();

  if (error) {
    // If role column doesn't exist, retry without it
    if (error.message.includes("role")) {
      const { data: retryData, error: retryError } = await supabaseAdmin
        .from("time_entries")
        .insert({ user_id: userId, notes: body.notes || null })
        .select("*")
        .single();
      if (retryError) {
        return NextResponse.json({ error: retryError.message }, { status: 500 });
      }
      return NextResponse.json({ entry: retryData }, { status: 201 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entry: data }, { status: 201 });
}

/** PATCH /api/time-entries — clock out or edit an entry */
export async function PATCH(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = await getUserRole(userId);
  const isAdmin = role === "admin";

  const body = await req.json();
  const { entry_id, clock_out, clock_in, notes } = body;

  if (!entry_id) {
    return NextResponse.json({ error: "entry_id required" }, { status: 400 });
  }

  // Fetch the entry
  const { data: entry } = await supabaseAdmin
    .from("time_entries")
    .select("*")
    .eq("id", entry_id)
    .single();

  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  // Only owner or admin can edit
  if (entry.user_id !== userId && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};

  if (clock_out !== undefined) updates.clock_out = clock_out;
  if (clock_in !== undefined && isAdmin) updates.clock_in = clock_in;
  if (notes !== undefined) updates.notes = notes;

  if (isAdmin && entry.user_id !== userId) {
    updates.admin_edited = true;
    updates.edited_by = userId;
  }

  const { data, error } = await supabaseAdmin
    .from("time_entries")
    .update(updates)
    .eq("id", entry_id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entry: data });
}

/** PUT /api/time-entries — admin: create entry for any user */
export async function PUT(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = await getUserRole(userId);
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { target_user_id, clock_in, clock_out, notes } = body;

  if (!target_user_id || !clock_in || !clock_out) {
    return NextResponse.json(
      { error: "target_user_id, clock_in, and clock_out are required" },
      { status: 400 }
    );
  }

  const targetRole = await getUserRole(target_user_id);

  const { data, error } = await supabaseAdmin
    .from("time_entries")
    .insert({
      user_id: target_user_id,
      role: targetRole,
      clock_in,
      clock_out,
      notes: notes || null,
      admin_edited: true,
      edited_by: userId,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entry: data }, { status: 201 });
}

/** DELETE /api/time-entries — admin only delete */
export async function DELETE(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = await getUserRole(userId);
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { entry_id } = await req.json();
  if (!entry_id) {
    return NextResponse.json({ error: "entry_id required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("time_entries")
    .delete()
    .eq("id", entry_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
