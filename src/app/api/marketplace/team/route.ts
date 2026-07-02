import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";
import { resolveTeamContextForPartner, generateInviteToken, inviteExpiryDays } from "@/lib/marketplaceTeam";
import { sendTeamInviteEmail } from "@/lib/marketplaceInviteEmail";

/**
 * GET — team roster + pending invites for the caller's company.
 */
export async function GET(req: NextRequest) {
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();

  const ctx = await resolveTeamContextForPartner(user.id);
  if (!ctx) return NextResponse.json({ error: "No company" }, { status: 404 });

  const [{ data: company }, { data: members }, { data: invites }] = await Promise.all([
    supabaseAdmin.from("placement_companies").select("*").eq("id", ctx.companyId).maybeSingle(),
    supabaseAdmin
      .from("placement_team_members")
      .select("*, profile:profile_id(full_name, email)")
      .eq("company_id", ctx.companyId)
      .order("joined_at", { ascending: true }),
    supabaseAdmin
      .from("placement_team_invites")
      .select("*")
      .eq("company_id", ctx.companyId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    company,
    role: ctx.role,
    members: members || [],
    invites: invites || [],
  });
}

/**
 * POST — invite a new team member. Owner/manager only. Sends an email
 * with the accept link.
 */
export async function POST(req: NextRequest) {
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();

  const ctx = await resolveTeamContextForPartner(user.id);
  if (!ctx) return NextResponse.json({ error: "No company" }, { status: 404 });
  if (ctx.role !== "owner" && ctx.role !== "manager") return forbidden("Owner or manager only");

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const role = body.role === "manager" ? "manager" : "agent";
  if (!email || !email.includes("@")) return NextResponse.json({ error: "Valid email required" }, { status: 400 });

  // Managers can only invite agents.
  if (ctx.role === "manager" && role === "manager") {
    return NextResponse.json({ error: "Managers can only invite agents" }, { status: 400 });
  }

  const token = generateInviteToken();
  const expiresAt = inviteExpiryDays();

  const { data: invite, error } = await supabaseAdmin
    .from("placement_team_invites")
    .insert({
      company_id: ctx.companyId,
      email,
      role,
      invited_by: user.id,
      token,
      expires_at: expiresAt,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire-and-forget email send. Failures don't break invite creation.
  const { data: company } = await supabaseAdmin
    .from("placement_companies")
    .select("business_name")
    .eq("id", ctx.companyId)
    .maybeSingle();

  sendTeamInviteEmail({
    to: email,
    inviterName: user.full_name || user.email,
    companyName: company?.business_name || "Your placement partner",
    role,
    token,
  }).catch(() => undefined);

  return NextResponse.json(invite);
}
