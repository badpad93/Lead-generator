import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";
import { resolveTeamContextForPartner } from "@/lib/marketplaceTeam";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();
  const { id } = await params;

  const ctx = await resolveTeamContextForPartner(user.id);
  if (!ctx || ctx.role !== "owner") return forbidden("Owner only");

  const body = await req.json().catch(() => ({}));
  const role = body.role;
  if (!["manager", "agent"].includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const { data: member } = await supabaseAdmin
    .from("placement_team_members")
    .select("id, role, company_id")
    .eq("id", id)
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (member.role === "owner") return NextResponse.json({ error: "Cannot change owner role" }, { status: 400 });

  await supabaseAdmin
    .from("placement_team_members")
    .update({ role })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();
  const { id } = await params;

  const ctx = await resolveTeamContextForPartner(user.id);
  if (!ctx) return forbidden();

  const { data: member } = await supabaseAdmin
    .from("placement_team_members")
    .select("id, role, company_id, profile_id")
    .eq("id", id)
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (member.role === "owner") return NextResponse.json({ error: "Cannot remove owner" }, { status: 400 });

  // Owners can remove anyone; managers can remove agents.
  if (ctx.role === "agent") return forbidden();
  if (ctx.role === "manager" && member.role === "manager") return forbidden("Managers cannot remove managers");

  await supabaseAdmin
    .from("placement_team_members")
    .update({ active: false })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
