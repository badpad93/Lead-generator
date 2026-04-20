import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let query = supabaseAdmin
    .from("sales_markets")
    .select("*, market_members(user_id), market_leaders(user_id)")
    .order("name");

  // Market leaders only see markets they lead
  if (user.role === "market_leader") {
    const { data: leaderOf } = await supabaseAdmin
      .from("market_leaders")
      .select("market_id")
      .eq("user_id", user.id);
    const marketIds = (leaderOf || []).map((m) => m.market_id);
    if (marketIds.length === 0) return NextResponse.json([]);
    query = query.in("id", marketIds);
  } else if (!isElevatedRole(user.role)) {
    return NextResponse.json([]);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, member_ids, leader_ids } = body;
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const { data: market, error } = await supabaseAdmin
    .from("sales_markets")
    .insert({ name, description: description || null, created_by: user.id })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (member_ids?.length) {
    const members = member_ids.map((uid: string) => ({ market_id: market.id, user_id: uid }));
    await supabaseAdmin.from("market_members").insert(members);
  }

  if (leader_ids?.length) {
    const leaders = leader_ids.map((uid: string) => ({ market_id: market.id, user_id: uid }));
    await supabaseAdmin.from("market_leaders").insert(leaders);
  }

  return NextResponse.json(market, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id, name, description, member_ids, leader_ids } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;

  const { error } = await supabaseAdmin.from("sales_markets").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync members if provided
  if (member_ids !== undefined) {
    await supabaseAdmin.from("market_members").delete().eq("market_id", id);
    if (member_ids.length) {
      const members = member_ids.map((uid: string) => ({ market_id: id, user_id: uid }));
      await supabaseAdmin.from("market_members").insert(members);
    }
  }

  // Sync leaders if provided
  if (leader_ids !== undefined) {
    await supabaseAdmin.from("market_leaders").delete().eq("market_id", id);
    if (leader_ids.length) {
      const leaders = leader_ids.map((uid: string) => ({ market_id: id, user_id: uid }));
      await supabaseAdmin.from("market_leaders").insert(leaders);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabaseAdmin.from("sales_markets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
